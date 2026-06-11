#!/bin/sh
set -e

# 起動毎の自動 migrate は危険(失敗すると全インスタンスがクラッシュループし、
# 旧リビジョンへのロールバックも不能になる)。デプロイと migrate を分離するため、
# 既定では migrate をスキップして起動のみ行う。
# RUN_MIGRATIONS=true を明示した場合のみ migrate を実行する。
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "RUN_MIGRATIONS=true: Running Prisma migrations..."
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
else
  echo "RUN_MIGRATIONS is not 'true': skipping Prisma migrations (deploy/migrate separated)."
fi

echo "Starting API server..."
node apps/api/dist/src/main
