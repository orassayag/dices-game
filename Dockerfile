# Single deployment unit: the Express server serves the built client + API from one
# process (server/app.ts, NODE_ENV=production). No separate server compile step exists —
# `pnpm run start` runs the server straight from TS via tsx, so devDependencies (tsx,
# prisma CLI) stay in the image rather than being pruned in a --prod stage.
FROM node:22-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/prisma ./server/prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

EXPOSE 3000
CMD ["sh", "-c", "pnpm run db:migrate:deploy && pnpm run start"]
