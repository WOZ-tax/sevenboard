#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

echo "Running seed..."
npx tsx packages/database/prisma/seed.ts || echo "Seed skipped (already exists or error)"

echo "Starting API server..."
node apps/api/dist/main
