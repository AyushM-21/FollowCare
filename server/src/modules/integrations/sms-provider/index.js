import crypto from 'crypto';
import { pool } from '../../../config/db.js';
import { logger } from '../../../config/logger.js';
import { config } from '../../../config/env.js';

const GENERIC_REMINDER_BODY = 'You have a follow-up reminder from your care team. Please contact your clinic if you need assistance.';

async function recordDelivery({ reminderId, channel, providerMessageId, status, errorCode = null }) {
  if (!reminderId) return;
  try {
    const attemptResult = await pool.query(
      `SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt
         FROM reminder_deliveries WHERE reminder_id = $1`,
      [reminderId]
    );
    const attempt = Number(attemptResult.rows?.[0]?.attempt || 1);
    await pool.query(
      `INSERT INTO reminder_deliveries (
        reminder_id, channel, provider_message_id, status, attempt, error_code, sent_at, delivered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)`,
      [reminderId, channel, providerMessageId, status, attempt, errorCode, status === 'delivered' ? new Date() : null]
    );
  } catch (err) {
    logger.error({ errorName: err.name }, 'Failed to record reminder delivery');
    throw err;
  }
}

export class MockNotificationProvider {
  constructor(options = {}) {
    this.failRate = options.failRate ?? config.failRate ?? 0.0;
  }

  async send({ reminderId, to, channel, templateKey, language = 'en', vars = {} }) {
    const providerMessageId = `mock_msg_${crypto.randomUUID()}`;
    logger.info({ channel, templateKey, language, reminderId, providerMessageId }, 'MockNotificationProvider: simulated notification');

    const isExplicitFail = to && (to.includes('0000') || to.endsWith('999'));
    const isRandomFail = Math.random() < this.failRate;
    const status = isExplicitFail || isRandomFail ? 'failed' : 'delivered';
    const errorCode = status === 'failed' ? 'ERR_DESTINATION_UNREACHABLE' : null;

    if (status === 'failed') {
      logger.warn({ providerMessageId, reminderId, errorCode }, 'MockNotificationProvider: simulated delivery failure');
    }
    await recordDelivery({ reminderId, channel, providerMessageId, status, errorCode });
    return { providerMessageId, status, errorCode };
  }

  parseWebhook(payload) {
    return {
      providerMessageId: payload.providerMessageId,
      status: payload.status || 'delivered',
      errorCode: payload.errorCode || null
    };
  }
}

export class TwilioNotificationProvider {
  constructor(options = {}) {
    this.accountSid = options.accountSid ?? config.twilioAccountSid;
    this.authToken = options.authToken ?? config.twilioAuthToken;
    this.fromNumber = options.fromNumber ?? config.twilioFromNumber;
    this.whatsappFrom = options.whatsappFrom ?? config.twilioWhatsappFrom;
    this.publicApiUrl = options.publicApiUrl ?? config.publicApiUrl;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async send({ reminderId, to, channel, templateKey, language = 'en' }) {
    if (!this.accountSid || !this.authToken) {
      throw new Error('Twilio is selected but TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing');
    }
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('This Node.js runtime does not provide fetch; use Node.js 20 or newer');
    }
    if (!['sms', 'whatsapp'].includes(channel)) {
      const errorCode = 'TWILIO_UNSUPPORTED_CHANNEL';
      await recordDelivery({ reminderId, channel, providerMessageId: null, status: 'failed', errorCode });
      return { providerMessageId: null, status: 'failed', errorCode };
    }

    const rawFrom = channel === 'whatsapp' ? this.whatsappFrom : this.fromNumber;
    if (!rawFrom) {
      const errorCode = channel === 'whatsapp'
        ? 'TWILIO_WHATSAPP_SENDER_NOT_CONFIGURED'
        : 'TWILIO_SMS_SENDER_NOT_CONFIGURED';
      await recordDelivery({ reminderId, channel, providerMessageId: null, status: 'failed', errorCode });
      return { providerMessageId: null, status: 'failed', errorCode };
    }
    const toAddress = channel === 'whatsapp' ? `whatsapp:${to.replace(/^whatsapp:/, '')}` : to;
    const fromAddress = channel === 'whatsapp' ? `whatsapp:${rawFrom.replace(/^whatsapp:/, '')}` : rawFrom;
    const body = GENERIC_REMINDER_BODY;
    const form = new URLSearchParams({ To: toAddress, From: fromAddress, Body: body });
    if (this.publicApiUrl) {
      form.set('StatusCallback', `${this.publicApiUrl.replace(/\/$/, '')}/api/webhooks/twilio/status`);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15000)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorCode = payload.code ? `TWILIO_${payload.code}` : 'TWILIO_REQUEST_FAILED';
      logger.warn({ channel, templateKey, reminderId, errorCode, httpStatus: response.status }, 'Twilio rejected reminder delivery');
      const providerMessageId = payload.sid || null;
      await recordDelivery({ reminderId, channel, providerMessageId, status: 'failed', errorCode });
      return { providerMessageId, status: 'failed', errorCode };
    }

    const providerMessageId = payload.sid;
    if (!providerMessageId) {
      logger.error({ channel, reminderId }, 'Twilio response omitted message identifier');
      await recordDelivery({ reminderId, channel, providerMessageId: null, status: 'failed', errorCode: 'TWILIO_INVALID_RESPONSE' });
      return { providerMessageId: null, status: 'failed', errorCode: 'TWILIO_INVALID_RESPONSE' };
    }

    // The API response means accepted/queued, not necessarily delivered. A signed status
    // callback updates the delivery record when Twilio reports a final delivery status.
    await recordDelivery({ reminderId, channel, providerMessageId, status: 'sent' });
    logger.info({ channel, reminderId, providerMessageId, providerStatus: payload.status || 'accepted' }, 'Twilio accepted reminder');
    return { providerMessageId, status: 'sent', errorCode: null };
  }
}

export function createNotificationProvider() {
  if (config.notifyProvider === 'mock') return new MockNotificationProvider();
  if (config.notifyProvider === 'twilio') {
    if (!config.twilioAccountSid || !config.twilioAuthToken) {
      throw new Error('NOTIFY_PROVIDER=twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }
    if (!config.twilioFromNumber && !config.twilioWhatsappFrom) {
      throw new Error('NOTIFY_PROVIDER=twilio requires at least one configured Twilio sender');
    }
    return new TwilioNotificationProvider();
  }
  throw new Error(`Unsupported NOTIFY_PROVIDER: ${config.notifyProvider}`);
}

export const notificationProvider = createNotificationProvider();
