import crypto from 'crypto';
import { Router } from 'express';
import { pool } from '../../../config/db.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';

export const twilioWebhookRouter = Router();

const CALLBACK_PATH = '/api/webhooks/twilio/status';

export function isValidTwilioSignature({ authToken, signature, url, params }) {
  if (!authToken || !signature || !url || !params || typeof params !== 'object') return false;

  const canonicalParams = Object.keys(params).sort().map((key) => {
    const value = params[key];
    return Array.isArray(value)
      ? value.map((item) => `${key}${item}`).join('')
      : `${key}${value ?? ''}`;
  }).join('');
  const expected = crypto.createHmac('sha1', authToken).update(url + canonicalParams).digest('base64');

  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function normalizeTwilioStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'delivered':
    case 'read':
      return 'delivered';
    case 'failed':
    case 'undelivered':
      return 'failed';
    case 'accepted':
    case 'queued':
    case 'sending':
    case 'sent':
      return 'sent';
    default:
      return null;
  }
}

twilioWebhookRouter.post('/webhooks/twilio/status', async (req, res) => {
  const authToken = config.twilioAuthToken;
  const publicApiUrl = config.publicApiUrl.replace(/\/$/, '');
  if (!authToken || !publicApiUrl) {
    return res.status(503).json({ error: 'Twilio status callbacks are not configured' });
  }

  const callbackUrl = `${publicApiUrl}${CALLBACK_PATH}`;
  const signature = req.get('X-Twilio-Signature');
  if (!isValidTwilioSignature({
    authToken,
    signature,
    url: callbackUrl,
    params: req.body
  })) {
    logger.warn({ route: CALLBACK_PATH }, 'Rejected Twilio callback with invalid signature');
    return res.status(403).json({ error: 'Invalid webhook signature' });
  }

  const providerMessageId = req.body?.MessageSid;
  const status = normalizeTwilioStatus(req.body?.MessageStatus);
  if (!providerMessageId || !status) {
    return res.status(400).json({ error: 'Invalid Twilio status callback' });
  }

  const errorCode = req.body?.ErrorCode ? `TWILIO_${String(req.body.ErrorCode).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 40)}` : null;
  try {
    const update = await pool.query(
      `UPDATE reminder_deliveries
          SET status = CASE
                WHEN status IN ('delivered', 'failed', 'suppressed') THEN status
                ELSE $2::delivery_status
              END,
              error_code = CASE
                WHEN status IN ('delivered', 'failed', 'suppressed') THEN error_code
                WHEN $2 = 'failed' THEN COALESCE($3, error_code)
                ELSE error_code
              END,
              delivered_at = CASE
                WHEN status = 'delivered' OR (status NOT IN ('failed', 'suppressed') AND $2 = 'delivered') THEN COALESCE(delivered_at, NOW())
                ELSE delivered_at
              END
        WHERE provider_message_id = $1
        RETURNING reminder_id, status, attempt`,
      [providerMessageId, status, errorCode]
    );

    for (const row of update.rows) {
      const latestAttempt = await pool.query(
        `SELECT NOT EXISTS (
           SELECT 1 FROM reminder_deliveries
            WHERE reminder_id = $1 AND attempt > $2
         ) AS is_latest`,
        [row.reminder_id, row.attempt]
      );
      if (!latestAttempt.rows?.[0]?.is_latest) continue;

      if (row.status === 'delivered') {
        await pool.query(
          `UPDATE reminders SET status = 'delivered' WHERE id = $1`,
          [row.reminder_id]
        );
      } else if (row.status === 'failed') {
        if (Number(row.attempt) < 3) {
          await pool.query(
            `UPDATE reminders
                SET status = 'queued',
                    scheduled_for = NOW() + ($2 || ' minutes')::interval
              WHERE id = $1 AND status <> 'delivered'`,
            [row.reminder_id, String(15 * Number(row.attempt))]
          );
        } else {
          await pool.query(
            `UPDATE reminders SET status = 'failed' WHERE id = $1 AND status <> 'delivered'`,
            [row.reminder_id]
          );
          await pool.query(
            `UPDATE patient_contacts pc
                SET valid = FALSE, last_failure_at = NOW()
               FROM reminders r
              WHERE r.id = $1 AND pc.patient_id = r.patient_id AND pc.type = (
                SELECT channel FROM reminder_deliveries WHERE provider_message_id = $2
              )`,
            [row.reminder_id, providerMessageId]
          );
          await pool.query(
            `INSERT INTO tasks (
               plan_id, patient_id, department_id, type, title, status,
               priority_score, priority_reasons, source
             )
             SELECT r.plan_id, r.patient_id, p.department_id, 'resolve_failed_delivery',
                    'Reminder could not be delivered: verify contact details', 'todo',
                    25, '[{"rule":"failed_delivery","points":25}]'::jsonb, 'system'
               FROM reminders r
               JOIN follow_up_plans p ON p.id = r.plan_id
              WHERE r.id = $1
                AND NOT EXISTS (
                  SELECT 1 FROM tasks t
                   WHERE t.plan_id = r.plan_id AND t.patient_id = r.patient_id
                     AND t.type = 'resolve_failed_delivery' AND t.status <> 'completed'
                )`,
            [row.reminder_id]
          );
        }
      }
    }

    // Acknowledge valid callbacks even when the message is not in this database;
    // Twilio retries callbacks that are not acknowledged with a 2xx response.
    res.status(204).end();
  } catch (err) {
    logger.error({ errorName: err.name }, 'Failed to process Twilio status callback');
    res.status(500).json({ error: 'Unable to process status callback' });
  }
});
