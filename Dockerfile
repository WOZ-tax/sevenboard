# Multi-stage build for SevenBoard API
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install all dependencies (including dev for build)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
RUN npm ci

# Generate Prisma client
FROM deps AS prisma
COPY packages/database/ packages/database/
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build API
FROM prisma AS build
COPY apps/api/ apps/api/
COPY tsconfig.json ./
RUN npm run build -w apps/api

# Production dependencies only
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
RUN npm ci --omit=dev

# Production image
FROM base AS production
ENV NODE_ENV=production
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node packages/database/prisma/schema.prisma ./packages/database/prisma/
USER node

EXPOSE 3001
CMD ["node", "apps/api/dist/main"]
