import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';

const { poolMock, loggerMock, configMock } = vi.hoisted(() => ({
  poolMock: { connect: vi.fn() },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  configMock: {
    twilioAuthToken: 'test-auth-token',
    publicApiUrl: 'https://demo.example.test'
  }
}));

vi.mock('../src/config/db.js', () => ({ pool: poolMock }));
vi.mock('../src/config/logger.js', () => ({ logger: loggerMock }));
vi.mock('../src/config/env.js', () => ({ config: configMock }));

import { twilioWebhookRouter } from '../src/modules/integrations/sms-provider/webhook.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/api', twilioWebhookRouter);

const callbackUrl = 'https://demo.example.test/api/webhooks/twilio/status';

function signatureFor(params) {
  const canonical = Object.keys(params).sort().map((key) => `${key}${params[key] ?? ''}`).join('');
  return crypto.createHmac('sha1', configMock.twilioAuthToken)
    .update(callbackUrl + canonical)
    .digest('base64');
}

function makeClient(queryImplementation) {
  const client = {
    query: vi.fn(queryImplementation),
    release: vi.fn()
  };
  poolMock.connect.mockResolvedValue(client);
  return client;
}

async function postCallback(params, signature = signatureFor(params)) {
  return request(app)
    .post('/api/webhooks/twilio/status')
    .set('X-Twilio-Signature', signature)
    .type('form')
    .send(params);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Twilio status callback lifecycle', () => {
  it('records a valid delivered callback and updates the reminder in one transaction', async () => {
    const client = makeClient()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ reminder_id: 'reminder-1', status: 'delivered', attempt: 1 }],
        rowCount: 1
      }) // update delivery
      .mockResolvedValueOnce({ rows: [{ is_latest: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update reminder
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const params = { MessageSid: 'SM-delivered-1', MessageStatus: 'delivered', To: '+15005550006' };
    const response = await postCallback(params);

    expect(response.status).toBe(204);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE reminders SET status = 'delivered'"),
      ['reminder-1']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('schedules a retry with backoff when an early attempt fails', async () => {
    const client = makeClient()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ reminder_id: 'reminder-2', status: 'failed', attempt: 1 }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [{ is_latest: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // queue retry
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const params = { MessageSid: 'SM-failed-1', MessageStatus: 'undelivered', ErrorCode: '30003' };
    const response = await postCallback(params);

    expect(response.status).toBe(204);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'queued'"),
      ['reminder-2', '15']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not reprocess duplicate terminal callbacks or duplicate escalation tasks', async () => {
    let deliveryUpdateCount = 0;
    const client = makeClient(async (sql) => {
      const query = String(sql).trim();
      if (query === 'BEGIN' || query === 'COMMIT') return { rows: [], rowCount: 0 };
      if (query.startsWith('UPDATE reminder_deliveries')) {
        deliveryUpdateCount++;
        if (deliveryUpdateCount === 1) {
          return { rows: [{ reminder_id: 'reminder-3', status: 'failed', attempt: 3 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 }; // terminal status means duplicate is a no-op
      }
      if (query.startsWith('SELECT NOT EXISTS')) return { rows: [{ is_latest: true }], rowCount: 1 };
      if (query.startsWith('UPDATE reminders')) return { rows: [], rowCount: 1 };
      if (query.startsWith('UPDATE patient_contacts')) return { rows: [], rowCount: 1 };
      if (query.startsWith('INSERT INTO tasks')) return { rows: [], rowCount: 0 };
      throw new Error(`Unexpected query in test: ${query}`);
    });

    const params = { MessageSid: 'SM-failed-final', MessageStatus: 'failed', ErrorCode: '30003' };
    expect((await postCallback(params)).status).toBe(204);
    expect((await postCallback(params)).status).toBe(204);

    const taskInserts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO tasks'));
    expect(taskInserts).toHaveLength(1);
    expect(String(taskInserts[0][0])).toContain('NOT EXISTS');
    expect(client.query.mock.calls.filter(([sql]) => String(sql).trim() === 'COMMIT')).toHaveLength(2);
  });

  it('does not let a callback from an older attempt change the current reminder', async () => {
    const client = makeClient()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ reminder_id: 'reminder-4', status: 'failed', attempt: 1 }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [{ is_latest: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

    const params = { MessageSid: 'SM-old-attempt', MessageStatus: 'failed', ErrorCode: '30003' };
    const response = await postCallback(params);

    expect(response.status).toBe(204);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE reminders'),
      expect.anything()
    );
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tasks'),
      expect.anything()
    );
  });

  it('rejects invalid signatures before touching the database', async () => {
    const params = { MessageSid: 'SM-forged', MessageStatus: 'delivered' };
    const response = await postCallback(params, 'invalid-signature');

    expect(response.status).toBe(403);
    expect(poolMock.connect).not.toHaveBeenCalled();
  });

  it('rolls back processing errors so Twilio can safely retry the callback', async () => {
    const client = makeClient()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockRejectedValueOnce(new Error('database unavailable')) // update delivery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

    const params = { MessageSid: 'SM-db-error', MessageStatus: 'delivered' };
    const response = await postCallback(params);

    expect(response.status).toBe(500);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(loggerMock.error.mock.calls)).not.toContain('database unavailable');
  });
});
