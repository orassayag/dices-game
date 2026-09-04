FROM node:22-slim

WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node --import tsx/esm server/index.ts"]
