FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/

RUN npm install -w apps/api -w packages/database -w packages/shared

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY tsconfig*.json ./

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build -w apps/api

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/api/dist/main"]
