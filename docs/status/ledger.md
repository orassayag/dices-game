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
