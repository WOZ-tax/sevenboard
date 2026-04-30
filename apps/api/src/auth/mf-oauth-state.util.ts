import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * MF OAuth の state 署名ユーティリティ。
 *
 * state は外部から戻ってくるため CSRF 攻撃に晒される。
 * - HMAC-SHA256 で署名（secret = MF_OAUTH_STATE_SECRET || JWT_SECRET）
 * - exp（短命 10 分）と nonce を含めてリプレイ耐性
 * - timingSafeEqual で署名比較
 */

interface StatePayload {
  tenantId: string;
  orgId: string;
  userId: string;
  nonce: string;
  exp: number; // unix epoch ms
}

const TTL_MS = 10 * 60 * 1000; // 10 分

function getSecret(): string {
  const secret = process.env.MF_OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'MF_OAUTH_STATE_SECRET (or JWT_SECRET) must be configured for MF OAuth state signing',
    );
  }
  return secret;
}

function sign(payloadB64: string): string {
  const h = createHmac('sha256', getSecret());
  h.update(payloadB64);
  return h.digest('base64url');
}

export function createMfOAuthState(input: {
  tenantId: string;
  orgId: string;
  userId: string;
}): string {
  const payload: StatePayload = {
    tenantId: input.tenantId,
    orgId: input.orgId,
    userId: input.userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Date.now() + TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export type VerifyResult = {
  ok: boolean;
  payload?: StatePayload;
  reason?: 'malformed' | 'bad_signature' | 'expired';
};

export function verifyMfOAuthState(state: string): VerifyResult {
  const parts = state.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payloadB64, sig] = parts;

  const expected = sign(payloadB64);
  // 長さ違いだと timingSafeEqual が throw するため事前チェック
  if (sig.length !== expected.length) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString(),
    ) as StatePayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof payload.tenantId !== 'string' ||
    typeof payload.orgId !== 'string' ||
    typeof payload.userId !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (Date.now() > payload.exp) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}
