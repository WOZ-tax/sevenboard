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
# --include=dev で Cloud Build 環境の NODE_ENV に依存せず確実に dev も入れる。
RUN npm install --include=dev

# Copy source (API + packages only, skip web source)
COPY packages/ packages/
COPY apps/api/ apps/api/
COPY tsconfig*.json ./
COPY scripts/start.sh scripts/
RUN chmod +x scripts/start.sh

# Generate Prisma + build
# globally install prisma to ensure CLI is available regardless of npm workspace hoisting
RUN npm install -g prisma@6.6.0
RUN prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w apps/api

ENV NODE_ENV=production
ENV REVIEW_SCRIPT_PATH=/app/apps/api/scripts/analyze.py
EXPOSE 3001
CMD ["sh", "scripts/start.sh"]
# force rebuild Tue Apr  7 14:49:26     2026
