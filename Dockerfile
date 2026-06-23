FROM node:20-slim
RUN apt-get update && apt-get install -y openssl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy all package.json files (monorepo structure)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# Install all deps including devDependencies (Prisma CLI is a devDep).
# npm ci で package-lock.json に厳密一致させる(再現性確保)。
# --include=dev で Cloud Build 環境の NODE_ENV に依存せず確実に dev も入れる。
RUN npm ci --include=dev

# Copy source (API + packages only, skip web source)
COPY packages/ packages/
COPY apps/api/ apps/api/
COPY tsconfig*.json ./
COPY scripts/start.sh scripts/
# Windows 由来の CRLF 改行だと dash が `set -e\r` を不正オプションとして弾いて
# コンテナが起動失敗するため、ビルド時に CR を除去して LF に正規化する。
RUN sed -i 's/\r$//' scripts/start.sh
RUN chmod +x scripts/start.sh

# Generate Prisma + build
# globally install prisma to ensure CLI is available regardless of npm workspace hoisting
RUN npm install -g prisma@6.6.0
RUN prisma generate --schema=packages/database/prisma/schema.prisma
# generated client を apps/api/node_modules にコピー（apps/api からの import を解決するため）
RUN node apps/api/scripts/copy-prisma-client.js
RUN npm run build -w apps/api

ENV NODE_ENV=production
ENV REVIEW_SCRIPT_PATH=/app/apps/api/scripts/analyze.py
EXPOSE 3001
# 非root実行。ビルド成果物は root 所有だが world-readable のため node ユーザーで起動可能。
# (起動時 migrate は既定オフのため、書き込み権限は不要)
USER node
CMD ["sh", "scripts/start.sh"]
# force rebuild 2026-04-28 invalidate cache for supabase-js bypass
