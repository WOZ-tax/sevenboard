import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.MF_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MF_TOKEN_ENCRYPTION_KEY is required for token encryption');
  }
  // key must be 32 bytes for AES-256
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error(
      'MF_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)',
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: base64(iv + ciphertext + authTag)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // iv (16) + encrypted (n) + tag (16)
  const combined = Buffer.concat([iv, encrypted, tag]);
  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const combined = Buffer.from(ciphertext, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Encrypt if key is available, otherwise return plaintext (dev mode).
 */
export function encryptIfAvailable(plaintext: string): string {
  if (!process.env.MF_TOKEN_ENCRYPTION_KEY) return plaintext;
  return encrypt(plaintext);
}

/**
 * Decrypt if encryption key is available.
 * Throws on decryption failure (tampered data or wrong key).
 */
export function decryptIfAvailable(value: string): string {
  if (!process.env.MF_TOKEN_ENCRYPTION_KEY) return value;
  return decrypt(value); // 復号失敗時はエラーを投げる（GCM認証保証を維持）
}
