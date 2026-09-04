# node:sqlite requires Node 22.10+; no native compilation needed, so slim works.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "tsx/esm", "server/index.ts"]
