import pino from 'pino';
import { config } from './env.js';

// PHI and Sensitive Key Redaction list per ARCHITECTURE.md Section 11
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'password',
  'password_hash',
  'token',
  'token_hash',
  'mfa_secret',
  'mfa_secret_enc',
  'phone',
  'primary_phone_enc',
  'email',
  'email_enc',
  'full_name',
  'full_name_enc',
  'address_enc',
  'notes',
  'body_enc',
  'reason_note',
  'reason_note_enc',
  'original_text',
  'approved_text'
];

export const logger = pino({
  level: config.nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: {
    paths: REDACT_PATHS,
    censor: '[PHI_REDACTED]'
  },
  base: {
    service: 'followcare-api'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
