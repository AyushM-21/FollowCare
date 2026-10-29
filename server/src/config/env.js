import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load server/.env regardless of process current working directory
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.trim() === '') {
  throw new Error('Security Error: SESSION_SECRET is required but not set in server/.env');
}

const phiEncKey = process.env.PHI_ENC_KEY;
if (!phiEncKey || phiEncKey.trim() === '') {
  throw new Error('Security Error: PHI_ENC_KEY is required but not set in server/.env');
}

// Ensure PHI_ENC_KEY is exactly 64 hexadecimal characters (32 bytes for AES-256-GCM)
const hexRegex = /^[0-9a-fA-F]{64}$/;
if (!hexRegex.test(phiEncKey)) {
  throw new Error('Security Error: PHI_ENC_KEY must contain exactly 64 hexadecimal characters (32 bytes)');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/followcare',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionSecret,
  phiEncKey,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  notifyProvider: process.env.NOTIFY_PROVIDER || 'mock',
  failRate: parseFloat(process.env.FAIL_RATE || '0.0'),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  publicApiUrl: process.env.PUBLIC_API_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development'
};
