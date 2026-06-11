import { encrypt, encryptIfAvailable, decryptIfAvailable } from './crypto.util';

const KEY_HEX = '0'.repeat(64); // 32 bytes
const ORIG = process.env.MF_TOKEN_ENCRYPTION_KEY;

describe('crypto.util (decrypt は平文フォールバック必須 / 2026-06-02 全断の教訓)', () => {
  afterEach(() => {
    if (ORIG === undefined) delete process.env.MF_TOKEN_ENCRYPTION_KEY;
    else process.env.MF_TOKEN_ENCRYPTION_KEY = ORIG;
  });

  it('鍵なし: 平文を素通し(往復)', () => {
    delete process.env.MF_TOKEN_ENCRYPTION_KEY;
    expect(encryptIfAvailable('tok_plain')).toBe('tok_plain');
    expect(decryptIfAvailable('tok_plain')).toBe('tok_plain');
  });

  it('鍵あり: 暗号化→復号で往復する(marker付き)', () => {
    process.env.MF_TOKEN_ENCRYPTION_KEY = KEY_HEX;
    const enc = encryptIfAvailable('tok_secret');
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptIfAvailable(enc)).toBe('tok_secret');
  });

  it('鍵あり + DBに平文レガシー値: 500を投げず平文を返す(全断回避)', () => {
    process.env.MF_TOKEN_ENCRYPTION_KEY = KEY_HEX;
    // marker無しの平文。GCM認証で復号失敗 → catch → 平文返却。
    expect(() => decryptIfAvailable('legacy_plaintext_token')).not.toThrow();
    expect(decryptIfAvailable('legacy_plaintext_token')).toBe(
      'legacy_plaintext_token',
    );
  });

  it('鍵あり + markerなしの旧暗号文も復号できる(後方互換)', () => {
    process.env.MF_TOKEN_ENCRYPTION_KEY = KEY_HEX;
    const legacyCipher = encrypt('old_format'); // marker無しの生base64
    expect(decryptIfAvailable(legacyCipher)).toBe('old_format');
  });
});
