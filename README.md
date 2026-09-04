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

> Frontend screens aren't built yet (they land later in the plan) — right now `dev`
> starts a working server + client pair with the foundation (database, error handling,
> auth config) in place.

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
