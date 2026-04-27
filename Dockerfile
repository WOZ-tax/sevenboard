FROM node:20-slim
RUN apt-get update && apt-get install -y openssl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy all package.json files (monorepo structure)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# Install all deps. Prisma の postinstall で query engine binary を取りに行くので
# --ignore-scripts は使わない（6.6 系では skip すると `prisma` コマンドが解決できない）。
RUN npm install

# Copy source (API + packages only, skip web source)
COPY packages/ packages/
COPY apps/api/ apps/api/
COPY tsconfig*.json ./
COPY scripts/start.sh scripts/
RUN chmod +x scripts/start.sh

# Generate Prisma + build
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w apps/api

ENV NODE_ENV=production
ENV REVIEW_SCRIPT_PATH=/app/apps/api/scripts/analyze.py
EXPOSE 3001
CMD ["sh", "scripts/start.sh"]
# force rebuild Tue Apr  7 14:49:26     2026
