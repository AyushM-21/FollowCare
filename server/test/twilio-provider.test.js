import { afterEach, describe, expect, it, vi } from 'vitest';

const { poolMock, loggerMock, configMock } = vi.hoisted(() => ({
  poolMock: { query: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  configMock: {
    notifyProvider: 'twilio',
    failRate: 0,
    twilioAccountSid: 'AC' + 'a'.repeat(32),
    twilioAuthToken: 'test-auth-token',
    twilioFromNumber: '+15005550006',
    twilioWhatsappFrom: 'whatsapp:+14155238886',
    publicApiUrl: 'https://demo.example.test'
  }
}));

vi.mock('../src/config/db.js', () => ({ pool: poolMock }));
vi.mock('../src/config/logger.js', () => ({ logger: loggerMock }));
vi.mock('../src/config/env.js', () => ({ config: configMock }));

import { TwilioNotificationProvider } from '../src/modules/integrations/sms-provider/index.js';
import { isValidTwilioSignature } from '../src/modules/integrations/sms-provider/webhook.js';
import crypto from 'crypto';

function fetchImplNotCalled(provider) { return provider.fetchImpl.mock.calls.length === 0; }

afterEach(() => {
  vi.clearAllMocks();
});

describe('Twilio notification provider', () => {
  it('sends a generic SMS and records provider acceptance as sent, not delivered', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM' + 'b'.repeat(32), status: 'queued' })
    });
    const provider = new TwilioNotificationProvider({ fetchImpl });

    const result = await provider.send({
      reminderId: '00000000-0000-4000-8000-000000000001',
      to: '+919812345678',
      channel: 'sms',
      templateKey: 'window_reminder',
      language: 'en'
    });

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBe('SM' + 'b'.repeat(32));
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain('/Messages.json');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toMatch(/^Basic /);
    const form = new URLSearchParams(options.body);
    expect(form.get('To')).toBe('+919812345678');
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('You have a follow-up reminder from your care team. Please contact your clinic if you need assistance.');
    expect(form.get('Body')).not.toMatch(/diagnos|department|doctor|patient name/i);
    expect(form.get('StatusCallback')).toBe('https://demo.example.test/api/webhooks/twilio/status');
    expect(poolMock.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reminder_deliveries'),
      expect.arrayContaining(['sent', null])
    );
  });

  it('returns a bounded failure code when Twilio rejects a message', async () => {
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 21614, message: 'message contains sensitive destination data' })
    });
    const provider = new TwilioNotificationProvider({ fetchImpl });
    const result = await provider.send({
      reminderId: '00000000-0000-4000-8000-000000000002',
      to: '+919812345678',
      channel: 'sms',
      templateKey: 'window_reminder'
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('TWILIO_21614');
    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain('sensitive destination data');
  });

  it('requires sender configuration and never silently falls back to mock', async () => {
    const provider = new TwilioNotificationProvider({
      accountSid: 'ACtest',
      authToken: 'token',
      fromNumber: '',
      fetchImpl: vi.fn()
    });
    poolMock.query.mockResolvedValue({ rowCount: 1, rows: [] });
    const result = await provider.send({ to: '+919812345678', channel: 'sms' });
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('TWILIO_SMS_SENDER_NOT_CONFIGURED');
    expect(fetchImplNotCalled(provider)).toBe(true);
  });
});

describe('Twilio callback signature validation', () => {
  it('accepts a valid signature and rejects a modified body', () => {
    const authToken = 'test-auth-token';
    const url = 'https://demo.example.test/api/webhooks/twilio/status';
    const params = { MessageSid: 'SM123', MessageStatus: 'delivered', To: '+919812345678' };
    const canonical = Object.keys(params).sort().map((key) => key + params[key]).join('');
    const signature = crypto.createHmac('sha1', authToken).update(url + canonical).digest('base64');

    expect(isValidTwilioSignature({ authToken, signature, url, params })).toBe(true);
    expect(isValidTwilioSignature({
      authToken,
      signature,
      url,
      params: { ...params, MessageStatus: 'failed' }
    })).toBe(false);
  });
});
