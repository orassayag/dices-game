# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Package Version Check — Do This First

Before writing any code or installing dependencies, verify all package versions listed
in `package.json`. Prefer the most stable, least-buggy known versions. Check the
npm registry or your knowledge of known issues and pin to a specific stable version.
Do not blindly use `latest`.

## Project status

Scaffolded from the `fullstack-lite` boilerplate (via `/boiler`) — a single flat package,
not a pnpm workspace. Three folders, one install, one `package.json`:

- `server/` — Express + TypeScript REST API. Owns all game rules, identity, and state.
  **Prisma 6.19.3 + PostgreSQL landed at M0**, replacing the boilerplate's `node:sqlite`
  (`server/db.ts` is now a `PrismaClient` singleton; schema + DB-invariant migrations live
  in `server/prisma/`). Local Postgres runs via `docker compose up -d`
  (`docker-compose.yml`, port 5432, db `dices_game`). Pinned to Prisma **6.x** rather than
  the newer 7.x major — 7 requires a driver adapter, a custom generator output path, and a
  `prisma.config.ts` for no functional benefit this plan needs; 6.19.3 is the simpler,
  equally-current stable line.
- `client/` — React 19 + Vite 6 SPA. Renders state and calls the API only — no game logic.
  **Tailwind v4.3.3 landed at M0** (`@tailwindcss/vite` plugin in `vite.config.ts`,
  `client/index.css` holds the single `@import "tailwindcss";`).
- `shared/` — Zod schemas + inferred DTO types, the only crossing point between `server/`
  and `client/`. `shared/errors.ts` (new at M0) holds the `ErrorCode` union + HTTP status
  table + the `{ error: { code, message } }` envelope schema — both `server/lib/errors.ts`
  and, later, the frontend import it. `shared/schemas.ts` still holds the boilerplate's
  placeholder `items` example (replaced wholesale at M2, not touched at M0).

M0 (foundation) is complete: Prisma schema + DB-invariant migrations (§2, incl. the I7
winner⇔score CHECKs), `server/config/env.ts` (JWT_SECRET/FRONTEND_URL/DICE_SEED
validation, cookie-flag derivation), the error envelope + typed error classes
(`server/lib/errors.ts`), a minimal structured logger (`server/lib/logger.ts`, no
`console.*` anywhere), credentialed CORS, Tailwind, and the two-project Vitest split
(`web` under jsdom, `api` under real Postgres via `server/__tests__/helpers/globalSetup.ts`
+ `truncateAll()`). Verified green (`pnpm install`, `type-check`, `lint`, `test` — 13/13
passing, `build`, and a manual `/health` + unknown-route smoke test). Feature
implementation continues per `docs/plans/plan_v6.md` milestones M1–M5.

**Note:** an earlier version of this file described a pnpm-workspace monorepo
(`apps/api`/`apps/web`/`packages/shared`, from `api-express` + `react-spa`). That scaffold
was never actually created on disk — this `/boiler` run replaced it with `fullstack-lite`
per explicit developer instruction. `FRONTEND_URL`-pinned credentialed CORS (§1/§13 of the
plan) is still required despite `fullstack-lite`'s default same-origin/proxy model, because
dev serves `client/` (Vite, :5173) and `server/` (:3000) on different ports — see Known
gotchas below.

## Assignment spec (`roeto-home-assignment.pdf`)

Build "Roeto Dices Game", a two-player dice game: all game logic lives in a backend API; a
React frontend only displays state and calls the API.

**Game rules:**
- 2 players, playing in rounds. On a turn, a player rolls 2 dice as many times as they want.
- Each roll adds to the round score.
- Rolling 6 & 6 loses the round score and passes the turn.
- Holding adds the round score to the global score and passes the turn.
- First player to reach the winning score (default 100, player-configurable) wins.
- A player can start a new game at any time.

**Backend requirements:**
- API with authentication; only authenticated users can create/play games.
- Owns player identity, all game-rule enforcement, game state, and turn/action validation.

**Frontend requirements:**
- React app: authenticates the user, displays game state, calls the API for every action
  (roll, hold, new game). No game logic in the frontend.
- Multiple players are simulated on the same page/browser — no live cross-browser updates required.

**Optional extras (not required):** win-count tracking, persistence (DB or local storage),
AI opponent, a brief disable/animation on rolling 6 & 6, sound effects, other creative additions.

---

## Workspace commands

Single flat package at the repo root — one `pnpm install`, no `-r`/`--filter` needed.

**One-command full stack (recommended):** `docker compose up` builds the app image
(root `Dockerfile`), brings up Postgres, applies migrations, and serves the built
client + API together on `http://localhost:3000` — see `docker-compose.yml`'s `app`
service. This always runs a production build; use it for a quick demo, not hot-reload.

**Per-side dev loop:** requires a local PostgreSQL — `docker compose up -d postgres`
(docker-compose.yml) before `dev`, `build`, or `test`; the `test` project also needs
Docker running (it creates and migrates a disposable `dices_game_test` database on the
same instance).

```bash
docker compose up               # Full stack: Postgres + migrate + built app on :3000
docker compose up -d postgres   # Local PostgreSQL only (once per machine reboot)
pnpm install             # Install all dependencies (postinstall runs `prisma generate`)
pnpm run db:migrate      # Apply Prisma migrations to the dev DB (prisma migrate dev)
pnpm run dev              # Start server (:3000) + client (:5173) together
pnpm run dev:server       # Server only, tsx watch
pnpm run dev:client       # Client only, Vite dev server
pnpm run build            # prisma generate + build client + full type-check
pnpm run start            # Run production server (serves built client + API)
pnpm run type-check       # Type-check (alias of typecheck)
pnpm run lint             # Lint all files
pnpm run test             # Run all tests once (both Vitest projects: web + api), with an Istanbul coverage table printed for every file (60/60/50 thresholds)
pnpm run test:coverage    # Same as `pnpm run test` — kept as an explicit alias
```

---

## Local Rules & Skills (auto-populated by /boiler)

Bank conventions were loaded once at the project root during scaffolding (single boilerplate,
no per-app split):
- `.claude/rules/` — `async-patterns`, `code-structure-style`, `constants-configuration`,
  `package-manager-pnpm`, `react-component-structure`, `testing-conventions`,
  `typescript-typing`
- `.claude/skills/` — `clean-typescript`, `codebase-design`, `diagnosing-bugs`,
  `domain-modeling`, `implement`, `improve-codebase-architecture`,
  `modern-accessible-html-jsx`, `modern-best-practice-react-components`,
  `modern-browser-apis`, `modern-tailwind`, `prototype`

Read these before making changes anywhere in the repo.

<!-- boiler:project-context:start -->
---
## Project Context (auto-generated by /boiler)

**Plan source:** docs/plans/plan_v6.md
**Boilerplate used:** fullstack-lite
**Scaffolded:** 2026-09-04

### Project-Specific Notes

"Roeto Dices Game" — a two-player dice game where **all rules live in the backend** and the
React frontend only renders server state. Single authenticated user drives both seats on
one screen.

Key decisions locked by the plan (see `docs/plans/plan_v6.md`):
- **Cookie-based JWT auth** (`HttpOnly; Secure; SameSite=Lax`) — no token in `localStorage`, no `Authorization` header. Hardened, user-bound CSRF token (server-verified HMAC, `__Host-` prefix in prod, `Origin`/`Referer` check) covering **every** state-changing POST including `/auth/login`.
- **Credentialed CORS pinned to an exact origin** (`FRONTEND_URL`), never `'*'`; production **refuses to boot** if `FRONTEND_URL` is unset or contains `localhost`. Required even though `fullstack-lite`'s own baseline treats CORS as out-of-scope (dev's `client:5173` → `server:3000` split needs it; the boilerplate's default same-origin production serving does not remove the requirement for dev/CSRF).
- **`tokenVersion` revocation** checked on every request, with a controlled **`503 SERVICE_UNAVAILABLE`** (never a misleading `401`) when the backing DB read is unavailable.
- **Pure domain engine** (`server/domain/`) — rules are pure functions taking state + injected `diceRoller`; outcomes mapped field-by-field to Prisma columns.
- **Contract in `shared/`** — Zod schemas are the single source of truth; DTOs are `z.infer<...>`. The stable `ErrorCode` union + one HTTP-status table are read by both the error middleware and the frontend discriminator. Success = bare DTO; error = `{ error: { code, message } }` — **replaces** the boilerplate's default `{ error: string }` / `{ error: 'Validation failed', details }` shapes in `server/middleware/errorHandler.ts`.
- **Optimistic concurrency** (client `expectedVersion` + row lock); `GAME_ABANDONED` distinct from `VERSION_CONFLICT`.
- **`busted` is derived** from `lastMove` in one mapper — never an independent stored flag.
- **AI opponent** (`ai-turn` only) is an LLM adapter with a **mandatory deterministic heuristic fallback** (offline-safe demo/CI), decision computed outside the DB transaction under a 3s `Promise.race` deadline, single-flight claim + bounded semaphore released on real settlement, and a win-safe recoverable per-game move cap (counts successful moves, forfeits before the cap without incrementing or keeping the round score).
- **Prisma + PostgreSQL** with DB-level CHECK/trigger invariants (finished-game immutability via a distinct SQLSTATE, one-live-game partial unique index, value ranges, winner⇔score consistency), each mapped to its own error code — **replaces** the boilerplate's default `node:sqlite`.

Milestones: M0 scaffold/decisions → M1 auth+CSRF → M2 shared contract → M3a/M3b game → M4 frontend (first submittable) → M5 AI opponent.

### Folder Structure
Single flat package (not a pnpm workspace). `server/`, `client/`, `shared/` each own their
slice; `shared/` is the only crossing point between the other two — never import `server/`
from `client/` or vice versa. One root `CLAUDE.md` covers the whole repo; there is no
per-folder `CLAUDE.md` split.
<!-- boiler:project-context:end -->

---
## Boilerplate Guidelines — fullstack-lite

### Architecture Notes

#### Folder responsibilities
- `server/` — Node-only code. Never import anything from `client/` here.
- `client/` — Browser-only code. Never import anything from `server/` here.
- `shared/` — The ONLY crossing point. Zod schemas and derived TypeScript types only. Safe for both sides. Import through the `shared/index.ts` barrel (`from '../../shared'`) rather than reaching into `shared/schemas` or `shared/types` directly.
- Tests are co-located in `__tests__/` folders next to the code they exercise (e.g. `server/prisma/__tests__/`, `client/components/<name>/__tests__/`) — no root-level `tests/` folder. Two Vitest **projects** (`vitest.config.ts`): `web` (jsdom, `vitest.setup.ts`) and `api` (real Node + Postgres, `vitest.setup.server.ts` + `server/__tests__/helpers/globalSetup.ts`). Server test files still carry `// @vitest-environment node` for clarity even though the `api` project already sets it.
- `data/` — dropped at M0 along with `node:sqlite`; Prisma/PostgreSQL persist to the Docker-managed `postgres-data` volume instead (`docker-compose.yml`).

#### Key conventions
- **`app.ts` exports `createApp()` — never calls `listen()`.** `index.ts` is the only file that calls `listen()`. This makes the app importable in tests without port conflicts.
- **`shared/schemas.ts` is the contract.** Define Zod schemas here. Derive TypeScript types with `z.infer<...>`. Both the Express route and the React component import through the barrel. If they drift, TypeScript catches it.
- **Routes handle HTTP; services handle logic.** Routes parse requests, validate with Zod, call service functions, send responses. Services contain all business logic and database queries. Routes must never contain SQL.
- **Every route handler uses `try/catch` with `next(err)`.** Never let an unhandled async exception crash the process.
- **All POST/PUT/PATCH bodies are validated with Zod.** No exceptions.
- **Parameterized SQL only.** Never interpolate user input into SQL strings.
- **All relative imports include the `.js` extension in server and shared files** (ESM project, `"type": "module"`). `import { createApp } from './app.js'` ✓ — not `'./app'`. Client files (Vite-processed) don't need extensions.
- **Test DB strategy (§12, landed at M0).** The `api` Vitest project's `globalSetup` creates a disposable `dices_game_test` Postgres database (if missing) and applies every migration via `prisma migrate deploy` — real Postgres, not SQLite, so raw-SQL triggers/CHECKs are exercised as in production. Each test file calls `truncateAll()` (`server/__tests__/helpers/testDb.ts`) in `beforeEach` to reset state; the project is serialized (`poolOptions.threads.singleThread`) since every suite shares one database.

#### Naming conventions
| Thing | Convention |
|---|---|
| Source files | `camelCase.ts` |
| React components | `PascalCase.tsx` |
| Functions, variables | `camelCase` |
| Types / interfaces | `PascalCase` |
| Zod schemas | `camelCaseSchema` |
| Database tables | `snake_case` |

### Do's and Don'ts (from the boilerplate)
**Do:** keep `server/`/`client/`/`shared/` strictly separated; include `.js` extensions on server/shared relative imports; `try/catch` + `next(err)` in every async handler; validate all external input with Zod; parameterized queries only; keep service functions pure (no `req`/`res`); named exports everywhere except the db connection and the React root; run `pnpm run lint && pnpm run type-check && pnpm test` after every non-trivial change.

**Don't:** cross-import `server/` ↔ `client/`; call `listen()` outside `server/index.ts`; put SQL in routes or `req`/`res` in services; use `any`; add a dependency without checking stdlib/existing deps first; commit `.env`; build DI containers/repositories before 3+ concrete cases exist; leave ad-hoc `console.log` in committed code.

### Ask-the-human-first list (boilerplate default — largely pre-decided by the plan)
The boilerplate flags auth strategy, DB/ORM, deployment target, rate limiting, CSS framework,
state management, and observability as "ask before implementing." For this project **the plan
has already decided** all of these (cookie-JWT + hardened CSRF, Prisma/PostgreSQL, Tailwind
v4, in-memory rate limiting, no extra state library) — implement per `docs/plans/plan_v6.md`
rather than re-asking, except where the plan itself marks something open (see its
**Open Questions** section, e.g. which free-tier LLM provider to wire for M5).

---
## Known gotchas

- **Response-envelope mismatch (fullstack-lite → plan contract) — implemented at M0.** `server/middleware/errorHandler.ts` now returns the plan's bare-DTO-on-success / `{ error: { code, message } }`-on-error contract; `code` comes from `shared/errors.ts`'s `ErrorCode` union via `AppError` subclasses in `server/lib/errors.ts`, not a statusCode→code guess. (lesson L001)
- **CORS is not "out of scope" here despite the boilerplate's default — wired at M0.** `fullstack-lite` treats CORS as unnecessary (same-origin prod serving, dev proxy). `server/app.ts` runs credentialed CORS pinned to `env.frontendUrl` (never `'*'`) — dev runs `client:5173`/`server:3000` as separate origins, and the CSRF `Origin` check (landing at M1b) will reuse the same allowlist. (lesson L002)
- **Gate fetch-on-mount to preserve in-memory state.** For a screen that must both fetch fresh and survive navigation (e.g. resume), gate the query (`enabled: …`/emptiness check) rather than an unconditional mount fetch that clobbers in-memory state. (lesson L003)
- **Keep feature components router-agnostic.** Pass an `onSelect(id)` callback rather than importing `react-router-dom` inside a reusable feature component; only pages/layouts navigate. (lesson L004)
- **Never name a data file literally `tsconfig.json` under `src/`** — it breaks Vite/tsconfck detection. Use a distinct suffix (`tsconfig.kb.json`). (lesson L011)
- **`@anthropic-ai/sdk` `zodOutputFormat()` wants a `zod/v4` import** — if the M5 AI adapter uses that helper, import `z` from `'zod/v4'` for that schema only; keep the rest on classic `'zod'` v3 (the boilerplate's own `shared/schemas.ts` convention). (lesson L014)
- **Prisma is pinned to 6.19.3, not the `latest` 8.0.0-rc.x tag or the 7.x stable line.** `pnpm view prisma dist-tags` currently resolves `latest` to an **8.0.0 release candidate** — never install that blindly (CLAUDE.md's own package-version rule). 7.x is stable but requires a driver adapter (`@prisma/adapter-pg`), a required custom generator `output` path, and a `prisma.config.ts` — real complexity this plan gets no benefit from. 6.19.3 uses the traditional `prisma-client-js` generator with no extra config.
- **Local Postgres is required before `dev`/`build`/`test` will work** — `docker compose up -d` (`docker-compose.yml`) starts it; the `api` Vitest project's `globalSetup` needs the daemon reachable to create/migrate the disposable `dices_game_test` database. A missing/unreachable Docker daemon fails loudly with a clear message from `server/__tests__/helpers/globalSetup.ts`, not a hang.
- **`Game.updatedAt` (`@updatedAt`) has no DB-level default** — Prisma sets it client-side on every write. A raw-SQL `INSERT` (e.g. in `schema.test.ts`, deliberately bypassing the typed client to test invalid values) must supply it explicitly or the insert fails on a NOT NULL violation before ever reaching the CHECK constraint being tested.
- **`ALLOW_LOCAL_FRONTEND_URL=true` is a one-off escape hatch, only for `docker-compose.yml`'s `app` service.** `server/config/env.ts` refuses to boot in production with a `localhost` `FRONTEND_URL` (§1/§13's hardening) — that's still true everywhere else. The one-container `docker compose up` demo is reachable only at `localhost:3000` by design, so its `app` service alone sets this flag to bypass the check; a real deployment must never set it. See `server/config/__tests__/env.test.ts` for the covered branches.

---
## Preferences

Standing developer preferences (from `~/.claude/bank/preferences.md`):
- Always — after improving a session, check whether related files need updating (README.md, relevant skills, etc.).
- Never ask about branch choice ("You're on the default branch. How should /master proceed?") — auto-create the feature branch without asking.
- Once a stage is done and it's not the last step, don't suggest "/master approve" — just say which command continues to the next stage (or how to give feedback). Suggest "/master approve" only at the last stage.
- For `/backup` — when done, print only that it's done with the folder name, nothing else.
- When changing the agentic-project-workflow repo, always write a plain-language `.git/version-note.md` (one bullet per real change, non-developer-readable) before the turn ends.
- For "/master approve", ensure a README.md exists with clear, simple instructions on how to run the app.
- Every new skill defaults to `disable-model-invocation: true` unless it must be model-auto-invocable.

<!-- model-policy:start -->
## Model Policy
Mode: **default**
- plan-review: claude-opus-4-8
- orca (orchestrator / top-tier agent chunks): claude-opus-4-8 / claude-opus-4-8
- plan-finalize / boiler / boiler-update / lesson: claude-sonnet-5
- orca mid / cheap agent chunks: claude-sonnet-5 / claude-haiku-4-5-20251001
Switch with `/mode default` or `/mode god-mode`.
<!-- model-policy:end -->
