# Master Stage Plan
Plan: docs/plans/plan_v6.md
Branch: feature/plan-v6
Review budget: 120 minutes
Generated: 2026-09-04

## Path mapping (plan → actual scaffold)
plan_v6.md was written against a pnpm-workspace monorepo (`apps/api`, `apps/web`,
`packages/shared`) that was never actually created — this repo was scaffolded flat via
`/boiler` (`fullstack-lite`) per CLAUDE.md. Every stage below implements the plan's design
against the real layout instead:
- `apps/api/*` → `server/*`
- `apps/web/*` → `client/*`
- `packages/shared/*` → `shared/*`
Node-only Postgres/Prisma pieces still live under `server/`; there is no separate
`apps/api` package boundary to cross.

## Scope estimate
This is a security-hardened full-stack app: cookie+CSRF auth (I3/I9), Prisma/PostgreSQL
with DB-level invariants (I7), optimistic-concurrency game engine, a React frontend, and an
AI opponent with single-flight + semaphore + deadline handling (I1/I2/I4). Estimated
~4500-5500 LOC across ~45-55 files (routes, services, middleware, domain, config, shared
schemas, frontend screens/components, and the plan's extensive named test suite) →
10 stages, ~450-550 LOC/stage average. This is larger than a single interview slot
comfortably reviews in one sitting — the 120-minute budget is a sizing input only, not a
hard cap; expect to review across more than one sitting. Every stage still stays well under
the hard per-stage ceilings (10 files / 300 lines-per-file).

## Stages
- Stage 1: COMMITTED — Foundation: Prisma schema+migrations+DB invariants, env config, error envelope, Tailwind, test infra (M0)
- Stage 2: COMMITTED — Shared contract: Zod schemas, GameStateDto, derived busted, ExpectedVersionSchema (M2)
- Stage 3: PLANNED — Auth core: register/login/logout, bcrypt, JWT+tokenVersion, cookie, 503 path, auth rate limits (M1a)
- Stage 4: PLANNED — Hardened CSRF: pre-auth token, HMAC-bound middleware, Origin check, __Host- prefix (M1b, I3/I9)
- Stage 5: PLANNED — Domain engine + game happy path: pure roll/hold, create/get/roll/hold routes, guards (M3a)
- Stage 6: PLANNED — Game hardening: concurrency, abandon+create, win increment, DB error mapping, gameplay rate limit (M3b)
- Stage 7: PLANNED — Frontend core: apiClient, LoginScreen, GameScreen, resume, guarded board (M4a)
- Stage 8: PLANNED — Frontend polish: 6&6 bust animation, error boundary, winner highlight, abandoned/finished notice (M4b)
- Stage 9: PLANNED — AI opponent core: provider adapter, heuristic fallback, deadline race, single-flight+semaphore (M5a, I2)
- Stage 10: PLANNED — AI opponent integration: ai-turn route, aiMoveCount cap+forfeit, frontend AI loop (M5b, I1/I4)
