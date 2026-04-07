FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy all package.json files (monorepo structure)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

# Install all deps (needed for hoisting) but skip optional/heavy postinstall
RUN npm install --ignore-scripts

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
EXPOSE 3001
CMD ["sh", "scripts/start.sh"]
# force rebuild Tue Apr  7 14:49:26     2026
