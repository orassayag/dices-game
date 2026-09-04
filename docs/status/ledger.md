# Master Run Ledger
Plan: docs/plans/plan_v6.md

## Stage 1 — Foundation: Prisma+Postgres, error envelope, Tailwind, test infra (committed 2026-09-04)
**Files:** .env.example, .gitignore, CLAUDE.md, Dockerfile, client/App.tsx, client/main.tsx,
package.json, pnpm-lock.yaml, pnpm-workspace.yaml, server/app.ts, server/db.ts,
server/middleware/errorHandler.ts, shared/index.ts, shared/types.ts, tsconfig.json,
vite.config.ts, vitest.config.ts, vitest.setup.ts, client/index.css, docker-compose.yml,
server/__tests__/helpers/globalSetup.ts, server/__tests__/helpers/testDb.ts,
server/config/env.ts, server/lib/errors.ts, server/lib/logger.ts, server/prisma/schema.prisma,
server/prisma/migrations/20260904025152_init/migration.sql,
server/prisma/migrations/20260904025159_db_invariants/migration.sql,
server/prisma/migrations/migration_lock.toml, server/prisma/__tests__/schema.test.ts,
shared/errors.ts, vitest.setup.server.ts (plus removal of the fullstack-lite `items` demo
scaffold: client/api/items.ts, client/components/item-list/**, client/pages/Home.tsx,
data/.gitkeep, server/routes/items.ts, server/routes/__tests__/items.test.ts,
server/services/items.ts)
**What was built:** Prisma 6.19.3 + PostgreSQL schema (User/Game/Move) with two migrations
(table DDL + a hand-written raw-SQL migration for DB-level invariants — finished-game
immutability trigger with distinct SQLSTATE PIGF1, one-live-game partial unique index,
value-range CHECKs, I7 winner⇔score CHECKs), replacing node:sqlite. Local Postgres via
docker-compose. `shared/errors.ts`'s ErrorCode union + envelope schema, `server/lib/errors.ts`
typed error classes, rewritten `server/middleware/errorHandler.ts` to the plan's bare-DTO /
`{error:{code,message}}` contract. A minimal structured logger (no console.*).
`server/config/env.ts` validates JWT_SECRET/FRONTEND_URL/DATABASE_URL/DICE_SEED and derives
cookie flags. Credentialed CORS pinned to FRONTEND_URL. Tailwind v4.3.3. Two-Vitest-project
split (web/api) with a real-Postgres globalSetup + truncateAll(). Verified: type-check, lint,
test (13/13), build, manual /health + unknown-route smoke, prod-boot-refusal smoke.
**Key decisions:** Prisma pinned to 6.19.3, not `latest` (resolves to an 8.0.0-rc) or 7.x
stable (needs a driver adapter + prisma.config.ts for no benefit here). Stage exceeded the
skill's 10-file soft ceiling (~26 non-deletion files) — M0 bundles five foundational concerns
that can't be split without leaving a broken intermediate state; flagged transparently rather
than re-splitting the already-presented stage plan mid-flight. Started Docker locally to get
a real Postgres for authoring/verifying migrations and tests. `react-router-dom` left installed
but unused pending an M4 routing decision. Added `exactOptionalPropertyTypes` +
`noUncheckedIndexedAccess` to tsconfig now rather than later. `shared/schemas.ts`'s placeholder
`Item` schemas left in place — stage 2 (Contract, M2) replaces the whole file.
**User overrides during review:** None recorded.

## Stage 2 — Shared contract: Zod schemas, GameStateDto, derived busted, ExpectedVersionSchema (committed 2026-09-04)
**Files:** shared/schemas.ts, shared/__tests__/schemas.test.ts
**What was built:** `shared/schemas.ts` replaces the boilerplate's placeholder `Item`
schemas wholesale with the real API contract from plan_v6.md §5: `GameStateSchema` (the
full `GameStateDto` — `DieSchema`, discriminated-union `LastMoveSchema` over
roll/hold/forfeit, pinned numeric bounds, `lastDice` as `[] | [Die, Die]`, and a
`.transform` that derives the top-level `busted` field from `lastMove`, the single place
`busted` is computed — I6), `CreateGameInputSchema` (`.strict()` + a mode/aiSeat
cross-field `.refine` mirroring the stage-1 DB CHECKs), `ExpectedVersionSchema`
(`.strict()`, non-negative integer), and `AuthCredentialsInputSchema`/`AuthResponseSchema`
(cookie-based — no token in the body; password checked for both min length and a
UTF-8 byte-length cap via a dedicated `TextEncoder` helper, since JS string length
undercounts multi-byte characters against the bcrypt 72-byte limit). 33 new tests in
`shared/__tests__/schemas.test.ts` covering derived-busted for all four lastMove cases,
numeric-bound rejections, the cross-field refine both ways, strict extra-key rejection,
and the UTF-8-byte-vs-JS-length password edge case. No route/auth/DB implementation in
this stage — contract-only. Verified: type-check, lint, test (46/46), build,
`prettier --check`.
**Key decisions:** Auth schemas included here (not deferred to stage 3) since stage 3
needs them to exist before implementing routes against them. Kept `shared/schemas.ts` as
a single flat file, matching the already-established repo convention. Named constants for
every numeric bound — no magic literals.
**User overrides during review:** None recorded.

## Stage 3 — Auth core: register/login/logout, bcrypt, JWT+tokenVersion, cookie, 503 path, auth rate limits (committed 2026-09-04)
**Files:** package.json, pnpm-lock.yaml, server/app.ts, vitest.config.ts,
server/lib/authCrypto.ts, server/middleware/auth.ts, server/middleware/validate.ts,
server/services/authService.ts, server/routes/auth.ts,
server/lib/__tests__/authCrypto.test.ts, server/middleware/__tests__/auth.test.ts,
server/routes/__tests__/auth.test.ts, server/routes/__tests__/authRegisterRateLimit.test.ts,
server/routes/__tests__/authLoginRateLimit.test.ts
**What was built:** M1a per plan_v6.md §1/§5/§10, excluding hardened CSRF (M1b, deferred
to stage 4). `server/lib/authCrypto.ts` — bcryptjs cost 12, module-level `DUMMY_BCRYPT_HASH`
for constant-time login, HS256 JWT with `sub`+`tokenVersion`, `normalizeUsernameKey`
(trim+NFKC+lowercase). `server/middleware/auth.ts` — `requireAuth` reads the `token`
cookie, verifies JWT, re-reads DB `tokenVersion` under a 2s timeout: mismatch/expired →
401, DB read failure/timeout → 503 SERVICE_UNAVAILABLE (I8), never a misleading 401.
`server/services/authService.ts` — `registerUser` relies on the DB unique-constraint
(P2002) catch rather than pre-check (closes the check-then-insert race); `loginUser`
always runs exactly one `bcrypt.compare` (real hash or dummy) and returns one generic
`INVALID_CREDENTIALS`. `server/routes/auth.ts` — register/login/logout with the
HttpOnly/Secure(prod)/SameSite=Lax cookie, 12h maxAge; register limited 10/hr per IP,
login limited 5/min per ip+normalized-username. `server/app.ts` — `trust proxy=false`,
cookie-parser, `express.json({limit:'16kb'})`, `/auth` mounted. Also fixed a pre-existing
test-infra race: `fileParallelism: false` must live at vitest's root config, not nested
in the `api` project block. Verified: type-check, lint, test (78/78), build,
`prettier --check`, manual curl smoke (register/login/logout/duplicate/wrong-password/
malformed-JSON/unknown-route) all matching the documented envelope/status.
**Key decisions:** bcryptjs over native `bcrypt` (zero build-toolchain requirement).
Consolidated auth crypto into one file and inlined both rate limiters into the route file
as deliberate file-count trims; still 14 touched files (package.json/pnpm-lock.yaml are
mechanical `pnpm add` byproducts, and the two rate-limit test files are split out
deliberately to avoid shared-counter contamination between tests). Register/login carry
no CSRF cookie yet — `GET /auth/csrf` lands in stage 4. Logout does not bump
`tokenVersion` (the plan documents cookie-clear and the tokenVersion bump as two separate
capabilities, and the API table has no logout-all endpoint).
**User overrides during review:** None recorded.

## Stage 4 — Hardened CSRF: pre-auth token, HMAC-bound middleware, Origin check, __Host- prefix (committed 2026-09-04)
**Files:** server/lib/csrfCrypto.ts, server/middleware/csrf.ts,
server/__tests__/helpers/csrf.ts, server/lib/__tests__/csrfCrypto.test.ts,
server/middleware/__tests__/csrf.test.ts, server/routes/__tests__/csrf.test.ts,
server/routes/auth.ts, server/routes/__tests__/auth.test.ts,
server/routes/__tests__/authRegisterRateLimit.test.ts,
server/routes/__tests__/authLoginRateLimit.test.ts
**What was built:** M1b per plan_v6.md §1/§5/§10 (I3, I9) — hardened, user-bound
double-submit CSRF on top of stage 3's auth. `server/lib/csrfCrypto.ts` generates/verifies
`<random>.<hmac>` tokens (HMAC-SHA256 keyed by `env.jwtSecret`, domain-separated via a
`'csrf-v1:'` prefix) for both a pre-auth subject and a per-user subject.
`server/middleware/csrf.ts` (`csrfProtection`) checks Origin/Referer against
`env.frontendUrl`, header==cookie, then the HMAC against `req.userId` (post-`requireAuth`)
or the pre-auth subject. `GET /auth/csrf` issues the pre-auth cookie; register/login rotate
to a user-bound cookie on success; logout now requires `requireAuth` before `csrfProtection`
so the token is verified against the real authenticated subject, then clears both cookies.
31 new tests (crypto, middleware, route-level covering every §10 verification bullet).
Verified: type-check, lint, test (109/109), build, `prettier --check`.
**Key decisions:** Reused `env.jwtSecret` as the CSRF HMAC key rather than a dedicated
`CSRF_SECRET` env var. Pre-auth subject is a fixed string (no server-side session to bind a
nonce to — stateless JWT auth). Logout now requires authentication, a deliberate scope
addition beyond stage 3's "clears cookies" text, needed for the CSRF check to bind to the
real subject. 10 files touched, at the stage-sizing ceiling.
**User overrides during review:** None recorded.

## Stage 5 — Domain engine + game happy path: pure roll/hold, create/get/roll/hold routes, guards (committed 2026-09-04)
**Files:** server/domain/gameEngine.ts, server/domain/gameGuards.ts,
server/domain/__tests__/gameEngine.test.ts, server/domain/__tests__/gameGuards.test.ts,
server/lib/gameMapper.ts, server/services/gameService.ts,
server/services/__tests__/gameService.test.ts, server/routes/games.ts,
server/routes/__tests__/games.test.ts, server/app.ts
**What was built:** M3a per plan_v6.md §3/§4/§5/§6 (happy-path subset). Pure
`roll`/`hold` engine (`server/domain/gameEngine.ts`) with an injected dice roller —
6&6 busts the round score and passes the seat, hold banks the round score and sets
`won` at `targetScore`; `createDiceRoller(seed?)` is real by default, deterministic
mulberry32 when `DICE_SEED` is set. `gameGuards.ts` — `assertReadGuard` (owner
404/403) and `assertActionGuard` (adds AI-seat rejection, `409 AI_TURN_REQUIRED`).
`gameMapper.ts` maps a Prisma `Game`+latest `Move` to `GameStateDto` field-by-field
through `GameStateSchema.parse` (derives `busted`, I6). `gameService.ts`'s
`rollGame`/`holdGame` run inside a transaction with a `SELECT ... FOR UPDATE` row
lock so `actorSeat` and the optimistic `expectedVersion` check see the same row; a
zero-row update throws `VERSION_CONFLICT`. `routes/games.ts` adds
create/get/roll/hold, all behind `requireAuth`, state-changing ones also behind
`csrfProtection` + `validateBody`. 37 new tests (146/146 total). Verified:
type-check, lint, test, build, `prettier --check`.
**Key decisions:** `GET /games?status=in_progress` (list-my-games) deferred to stage
6 alongside the abandon+create work it pairs with. `createGame` is a plain insert —
no abandon-existing check yet, so a second live game hits the DB's partial unique
index and falls through to a generic `500 DATABASE_CONSTRAINT` rather than `409
GAME_CONFLICT` (explicitly stage 6 scope). Zero-row update never distinguishes
`GAME_ABANDONED` yet (no abandon path exists). `User.wins` is not incremented on a
win — that guarded counter increment is stage 6/M3b scope. 10 files touched, at the
stage-sizing ceiling — each is a genuinely separate concern (pure rules /
authorization / DB↔DTO translation / orchestration / HTTP).
**User overrides during review:** None recorded.

## Stage 6 — Game hardening: concurrency, abandon+create, win increment, DB error mapping, gameplay rate limit (committed 2026-09-04)
**Files:** shared/schemas.ts, shared/__tests__/schemas.test.ts,
server/services/gameService.ts, server/services/__tests__/gameService.test.ts,
server/routes/games.ts, server/routes/__tests__/games.test.ts,
server/routes/__tests__/gamesList.test.ts, server/routes/__tests__/gamesRateLimit.test.ts,
server/__tests__/helpers/authedSession.ts
**What was built:** M3b per plan_v6.md §6/§7/§10 on top of stage 5's happy path.
`createGame` now runs abandon+create in one `prisma.$transaction` (§7) — any existing
`in_progress` game for the owner is marked `abandoned` before the new game is created,
with a genuine unique-index race mapped to `409 GAME_CONFLICT` via an exported,
directly-unit-tested predicate (`isUniqueConstraintViolation`). Roll/hold's zero-row
update path now distinguishes `GAME_ABANDONED` from a plain `VERSION_CONFLICT` by
re-reading the row's status inside the same transaction (§6). `holdGame` credits the
owner's `User.wins` exactly once on a winning hold, guarded by the same version check
that already prevents a stale retry from re-executing. `GET /games?status=in_progress`
(list-my-games) lands via `ListGamesQuerySchema` + `listInProgressGames`. Gameplay rate
limiting (60/min per authenticated user) applied to roll/hold. `GAME_FINISHED` gets no
new error-mapping code — every write path filters `status: 'in_progress'` in its own
`WHERE` clause, so the trigger's SQLSTATE can never fire through app code; already
covered by stage 1's `schema.test.ts`. Verified: type-check, lint, test (169/169 across
16 suites), build, `prettier --check`.
**Key decisions:** `GAME_CONFLICT` mapping unit-tested via a directly-constructed
`Prisma.PrismaClientKnownRequestError` rather than a live-DB race or `vi.spyOn` on the
shared `prisma` singleton (an earlier attempt spying on `$transaction` left the
proxy-backed client broken for later tests in the same worker). List tests extracted to
their own file (`gamesList.test.ts`) to stay under the register rate limiter's 10/hr
ceiling in `games.test.ts`, with `registerTestUser`/`authedGet`/`authedPost` pulled into
a shared `server/__tests__/helpers/authedSession.ts` once a third file needed them.
Deliberately did NOT extract a shared `rateLimitHandler.ts` for `auth.ts`'s and
`games.ts`'s near-identical rate-limit callback — a first pass did, but it pushed the
stage to 11 touched files; reverted to keep `auth.ts` out of this stage's diff and gave
`games.ts` its own local copy (9 files touched, under the ceiling).
**User overrides during review:** None recorded.
