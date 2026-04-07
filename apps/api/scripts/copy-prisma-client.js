const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../../../packages/database/node_modules/@prisma/client');
const dst = path.resolve(__dirname, '../node_modules/@prisma/client');

if (!fs.existsSync(src)) {
  console.error('Prisma client not found at', src);
  console.error('Run prisma generate from packages/database first.');
  process.exit(1);
}

// Copy recursively
fs.cpSync(src, dst, { recursive: true, force: true });
console.log('Copied generated @prisma/client to local node_modules');

// Also copy the runtime library if it exists separately
const runtimeSrc = path.resolve(__dirname, '../../../packages/database/node_modules/.prisma');
const runtimeDst = path.resolve(__dirname, '../node_modules/.prisma');
if (fs.existsSync(runtimeSrc)) {
  fs.cpSync(runtimeSrc, runtimeDst, { recursive: true, force: true });
  console.log('Copied .prisma runtime to local node_modules');
}
