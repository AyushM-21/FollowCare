import crypto from 'crypto';
import { pool } from '../../../config/db.js';
import { logger } from '../../../config/logger.js';
import { config } from '../../../config/env.js';

export class MockNotificationProvider {
  constructor(options = {}) {
    this.failRate = options.failRate ?? config.failRate ?? 0.0;
  }

  async send({ reminderId, to, channel, templateKey, language = 'en', vars = {} }) {
    const providerMessageId = `mock_msg_${crypto.randomUUID()}`;
    logger.info(
      { channel, templateKey, language, reminderId, providerMessageId },
      'MockNotificationProvider: Sending simulated notification'
    );

    // Special test numbers for simulating failures/invalid contacts
    const isExplicitFail = to && (to.includes('0000') || to.endsWith('999'));
    const isRandomFail = Math.random() < this.failRate;

    let status = 'delivered';
    let errorCode = null;

    if (isExplicitFail || isRandomFail) {
      status = 'failed';
      errorCode = 'ERR_DESTINATION_UNREACHABLE';
      logger.warn({ providerMessageId, reminderId, errorCode }, 'MockNotificationProvider: Simulated delivery failure');
    }

    if (reminderId) {
      try {
        await pool.query(
          `INSERT INTO reminder_deliveries (
            reminder_id, channel, provider_message_id, status, error_code, sent_at, delivered_at
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
          [
            reminderId,
            channel,
            providerMessageId,
            status,
            errorCode,
            status === 'delivered' ? new Date() : null
          ]
        );
      } catch (err) {
        logger.error({ err: err.message }, 'Failed to record reminder delivery');
      }
    }

    return {
      providerMessageId,
      status,
      errorCode
    };
  }

  parseWebhook(payload) {
    return {
      providerMessageId: payload.providerMessageId,
      status: payload.status || 'delivered',
      errorCode: payload.errorCode || null
    };
  }
}

export const notificationProvider = new MockNotificationProvider();
