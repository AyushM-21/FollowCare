import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Fallback 32-byte key for local development
const DEFAULT_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function getEncryptionKey() {
  const secret = process.env.PHI_ENC_KEY || DEFAULT_KEY;
  return Buffer.from(secret.padEnd(64, '0').slice(0, 64), 'hex');
}

export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(cipherText) {
  if (!cipherText) return null;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText; // Return as-is if unencrypted fallback
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '[Decryption Error]';
  }
}

export function hashPhone(phone) {
  if (!phone) return null;
  const normalized = phone.replace(/[^0-9]/g, '');
  const salt = process.env.PHONE_SALT || 'followcare-phone-salt';
  return crypto.createHmac('sha256', salt).update(normalized).digest('hex');
}

export function maskPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\s+/g, '');
  if (cleaned.length < 6) return '••••••';
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-3);
  return `${prefix} •••• ${suffix}`;
}

export function maskName(name) {
  if (!name) return '';
  const parts = name.split(' ');
  return parts.map(p => p.length > 2 ? `${p[0]}•••${p.slice(-1)}` : p).join(' ');
}
