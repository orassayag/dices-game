# Dices Game

A two-player "Pig" dice game. All game rules live in the backend API; the React frontend
only displays state and calls the API.

## Running locally

### Full stack via Docker Compose (recommended)

Brings up Postgres, applies migrations, and serves the built client + API from one
container on one port. Requires only Docker.

```bash
docker compose up
```

- App (client + API): http://localhost:3000
- Postgres: localhost:5432 (`dices_game` / `dices_game` / `dices_game`)

The client and API share one origin here (the server serves the built client — see
`server/app.ts`), so there's only one URL to open. Override the dev-only defaults
(`JWT_SECRET`, `FRONTEND_URL`) with a `.env` file at the repo root next to
`docker-compose.yml`, or exported env vars — see the `${VAR:-default}` references in
`docker-compose.yml`. `ALLOW_LOCAL_FRONTEND_URL=true` is baked into the compose file's
`app` service only — it's the documented escape hatch that lets a `localhost` origin
boot in production mode for this demo (see `server/config/env.ts`); never set it outside
this local Docker stack.

### Running client and server separately (development)

Requires Node.js, pnpm, and Docker (for local PostgreSQL). Use this for hot-reload during
development — `docker compose up` above always runs a production build.

```bash
docker compose up -d postgres
pnpm install
cp .env.example .env
pnpm run db:migrate
pnpm run dev
```

The server runs on `http://localhost:3000`, the client on `http://localhost:5173`.

Open `http://localhost:5173` (or `http://localhost:3000` under Docker Compose), register
(or log in), then start a game. When creating a
game, choose **two human players** (log out and back in as a second user to take the
second seat) or **play against the AI** (pick which seat the AI takes). Roll as many
times as you like each turn — rolling 6 & 6 loses the round score and passes the turn;
holding banks the round score and passes the turn. First to the target score wins. The
AI opponent plays automatically on its turn using a built-in decision heuristic — no
API key or external service required.

## Running the tests

```bash
docker compose up -d postgres
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

## Troubleshooting

### `port is already allocated` / `address already in use` on port 3000

```
Error response from daemon: ports are not available: exposing port TCP 0.0.0.0:3000 -> 127.0.0.1:0: listen tcp 0.0.0.0:3000: bind: address already in use
```

Something else on your machine is already using port 3000. This is very often a leftover
`pnpm run dev:server` (or `pnpm run dev`) process from an earlier session that never
stopped — a plain host process, not a Docker container, so **`docker compose down` will
not free it** (it only removes this project's containers).

Auto-fix — kills a leftover `tsx`/`node`/`vite` process holding this project's dev ports
(3000, 5173), but deliberately leaves Docker's own processes alone (killing Docker's
port-forwarding process takes down the whole Docker Desktop VM, not just one container):

```bash
pnpm run free-ports
```

Or do it manually:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
```

If the port is held by a Docker-related process (e.g. `com.docker.backend`) or by a
container from a *different* project (`docker ps -a` lists all containers, not just this
one), stop the container instead of killing the host process:

```bash
docker ps -a --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
docker stop <container-name>
```

If you'd rather keep the other process running, publish the app on a different host port
instead — edit `docker-compose.yml`'s `app` service `ports` entry, e.g.:

```yaml
ports:
  - '3001:3000'
```

then open `http://localhost:3001`.
