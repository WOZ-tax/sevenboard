const fs = require('fs');
const path = require('path');

const candidates = [
  // 新構成: monorepo root の hoisted node_modules（最新 generate はこちらに出る）
  path.resolve(__dirname, '../../../node_modules/@prisma/client'),
  // 旧構成: packages/database 配下にローカル install されているケース
  path.resolve(__dirname, '../../../packages/database/node_modules/@prisma/client'),
];
const src = candidates.find((p) => fs.existsSync(p));
const dst = path.resolve(__dirname, '../node_modules/@prisma/client');

if (!src) {
  console.error('Prisma client not found. Tried:');
  candidates.forEach((c) => console.error(' -', c));
  console.error('Run prisma generate from packages/database first.');
  process.exit(1);
}

fs.cpSync(src, dst, { recursive: true, force: true });
console.log('Copied generated @prisma/client to apps/api/node_modules from', src);

// .prisma ランタイムも同様にフォールバック
const runtimeCandidates = [
  path.resolve(__dirname, '../../../node_modules/.prisma'),
  path.resolve(__dirname, '../../../packages/database/node_modules/.prisma'),
];
const runtimeSrc = runtimeCandidates.find((p) => fs.existsSync(p));
const runtimeDst = path.resolve(__dirname, '../node_modules/.prisma');
if (runtimeSrc) {
  fs.cpSync(runtimeSrc, runtimeDst, { recursive: true, force: true });
  console.log('Copied .prisma runtime to apps/api/node_modules from', runtimeSrc);
}
