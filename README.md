# Dices Game

A two-player "Pig" dice game. All game rules live in the backend API; the React frontend
only displays state and calls the API.

## Getting started

Requires Node.js, pnpm, and Docker (for local PostgreSQL).

```bash
docker compose up -d
pnpm install
cp .env.example .env
pnpm run db:migrate
pnpm run dev
```

The server runs on `http://localhost:3000`, the client on `http://localhost:5173`.

Open `http://localhost:5173`, register (or log in), then start a game. When creating a
game, choose **two human players** (log out and back in as a second user to take the
second seat) or **play against the AI** (pick which seat the AI takes). Roll as many
times as you like each turn — rolling 6 & 6 loses the round score and passes the turn;
holding banks the round score and passes the turn. First to the target score wins. The
AI opponent plays automatically on its turn using a built-in decision heuristic — no
API key or external service required.

## Running the tests

```bash
docker compose up -d
pnpm run test
```

Tests run against a real, disposable PostgreSQL database (`dices_game_test`), created and
migrated automatically — Docker must be running.

## Other commands

```bash
pnpm run type-check   # Type-check the whole project
pnpm run lint          # Lint all files
pnpm run build          # Build for production
pnpm run start           # Run the production build
```
