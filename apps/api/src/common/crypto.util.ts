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
 * 暗号文の先頭に付ける形式マーカー。これがあれば「暗号化済み」と判定でき、
 * 平文(暗号化前のレガシー値)との取り違えを防ぐ。
 */
const ENC_MARKER = 'enc:v1:';

/**
 * Encrypt if key is available, otherwise return plaintext (dev mode).
 * 暗号化時は形式マーカーを付与し、読み出し側が暗号文/平文を区別できるようにする。
 */
export function encryptIfAvailable(plaintext: string): string {
  if (!process.env.MF_TOKEN_ENCRYPTION_KEY) return plaintext;
  return ENC_MARKER + encrypt(plaintext);
}

/**
 * Decrypt if encryption key is available.
 *
 * 2026-06-02 の本番全断(平文トークンに decrypt を強制して 500 → 全API断)の教訓を反映。
 * 復号失敗時はハードエラーにせず、元の値(平文とみなす)を返す:
 *   - 新フォーマット(marker付き): marker を外して復号。
 *   - markerなしの旧暗号文: 復号を試み、成功すればそれを使う。
 *   - markerなしの平文(暗号化導入前のレガシー): 復号は GCM 認証で失敗するため、
 *     catch して平文をそのまま返す。
 *   - 鍵不一致/破損で暗号文の復号に失敗した場合も、元値を返して 401→再接続フローに委ね、
 *     500 によるサービス全断を避ける。
 */
export function decryptIfAvailable(value: string): string {
  if (!value) return value;
  if (!process.env.MF_TOKEN_ENCRYPTION_KEY) return value;
  const payload = value.startsWith(ENC_MARKER)
    ? value.slice(ENC_MARKER.length)
    : value;
  try {
    return decrypt(payload);
  } catch {
    return value;
  }
}
