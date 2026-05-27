import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env['SETTINGS_ENCRYPTION_KEY'];
  if (!raw) throw new Error('SETTINGS_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return key;
}

export function encryptSetting(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSetting(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    // Legacy plaintext value — return as-is so existing tokens keep working
    // until the admin re-saves the settings
    return ciphertext;
  }
  const key = getKey();
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted setting format');
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
