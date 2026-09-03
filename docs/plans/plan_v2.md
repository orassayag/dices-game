# Two-Player Dice Game ("Pig") — Plan

## Summary

Build a "Pig"-variant two-dice game where **all rules live in a backend API** and a
**React frontend only renders state and calls the API**. Per the assignment's "simulate
players on the same page", a single authenticated user drives both seats on one screen:
they log in once, create a game, and act as Player 1 and Player 2 by clicking. The server
owns identity, the dice, turn order, scoring, win detection, and every validation.

An optional AI opponent plays one seat. Its decision is made by an LLM adapter
(LangChain/LangGraph on a free-tier model) with a **mandatory deterministic heuristic
fallback**, so the demo and tests never depend on the network. Critically, the AI decision
is computed **outside** any database transaction, and each `ai-turn` request applies
**exactly one** validated move — so a slow provider never holds a row lock, and the
optimistic lock is re-checked on every move.

Delivered as a TypeScript monorepo: `apps/api` (Express + Prisma + PostgreSQL),
`apps/web` (React + Vite + Tailwind), and `packages/shared` (Zod schemas + DTOs shared by
both sides).

## Scope

**In scope**
- Auth: register + login (bcrypt, JWT with pinned secret/algorithm), rate-limited; only
  authenticated users create/play.
- Single-owner / two-seat game model; full rule enforcement server-side.
- Endpoints: register, login, list-my-games, create game, get game, roll, hold, ai-turn.
- Optimistic concurrency (client-supplied `expectedVersion` + row lock), re-checked on
  every move including AI moves, so a double-click cannot produce a second roll.
- Win-count tracking per user (Extra 1), via a guarded one-time increment; PostgreSQL
  persistence (Extra 2).
- AI opponent as an LLM adapter with a required heuristic fallback (Extra 3), one validated
  move per request, decision computed outside the DB transaction.
- Brief disable + 6&6 bust animation/message (Extra 4), driven by an explicit DTO field.
- CORS scoped to the frontend origin; deterministic dice seeding for tests/smoke; test-DB
  strategy; DB-level invariants (finished-game immutability, one live game per owner, valid
  seat/mode/score ranges).

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking — the single-owner model removes this surface.
- Sound effects (Extra 5) — optional, deferred.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not surfaced.
- Multi-instance / Redis-backed rate-limit store — the demo is single-instance; the
  in-memory store and its assumption are documented, not replaced.

## Issue Resolutions

Second-round review of the v1 plan. 12 issues (1 🟣 Blocker, 5 🔴 High, 6 🟡 Medium), all
Fixed via `auto`.

| ID | Title | Detected by | Resolution | Notes |
|----|-------|------------|------------|-------|
| I1 | AI's slow network call made while the game row is locked | Claude, gpt, gemini, z.ai, perplexity | Fixed (R1) | Decide outside the transaction; open a short transaction only to write the one move. §9, §6. |
| I2 | One `ai-turn` request runs many moves; can act for wrong player | gemini, z.ai, grok, gpt, perplexity | Fixed (R2) | Exactly one AI action per request; re-check `expectedVersion`/seat each call; cap → terminal `AI_TURN_LIMIT`. §9. |
| I3 | AI model's free-form output trusted and executed | gpt, z.ai, perplexity, Claude | Fixed (R3) | Parse reply with a fixed enum schema; parse failure → heuristic fallback. §9. |
| I4 | Impossible AI/human game can be created | gpt, gemini, perplexity | Fixed (R4) | Cross-field `.refine` + DB CHECKs tying `mode` to `aiSeat`. §2, §5. |
| I5 | Frontend told to read a `busted` flag the API never sends | gpt, perplexity, gemini | Fixed (R5) | Explicit tested `lastMove`/`busted` outcome field on `GameStateDto`. §5, §8. |
| I6 | JWT secret and signing rules unspecified | grok, perplexity | Fixed (R6) | Validated `JWT_SECRET`, explicit `HS256` allowlist on sign+verify, `sub`/`iat`/`exp`. §1, §10. |
| I7 | Two "New Game" clicks can leave two live games | gpt | Fixed (R7) | Partial unique index on `(ownerUserId) WHERE status='in_progress'` → 409. §2, §7. |
| I8 | Rate-limit depends on unset proxy/storage details | gpt, grok, perplexity, z.ai | Fixed (R8) | Set `trust proxy`, key off derived client IP, pin numbers, document in-memory single-instance. §10. |
| I9 | Password/username length rules weak or count wrong unit | gpt, grok, z.ai, perplexity | Fixed (R9) | Byte-length password check + minimum; capped normalized username. §5, §10. |
| I10 | Win increment not shown as a safe one-time update | gemini, perplexity | Fixed (R10) | Guarded `updateMany` gate; increment only when one row changed; double-fire test. §6. |
| I11 | No boundary on data sent to the third-party AI | perplexity | Fixed (R11) | Single `AiDecisionProvider.decide(state)` adapter sends a fixed minimal field list. §9. |
| I12 | CORS never configured; browser can't call the API | z.ai, bank | Fixed (R12) | CORS scoped to `FRONTEND_URL`, default to real dev origin, never `'*'` (bank L002). §1, §10. |

**Held-back lower-severity items folded into hardening (§2, §11):** value-range DB CHECKs
(`current_seat IN (1,2)`, scores `>= 0`, `winner_seat IN (1,2)`, dice in `[1,6]`); a stable
error-code list published in `packages/shared`; a request-id through the logger and a
`/health` route; the Postgres trigger/CHECK error code mapped to `409 GAME_FINISHED` in the
central error middleware; `@@index([ownerUserId, status])` + a small `limit` on the games
list; documented trade-offs for the non-revocable 12h token and account-enumeration on
register. **Corrected reviewer misread:** the finished-game biconditional CHECK
`((status='finished') = (winner_seat IS NOT NULL))` is already correct — it is not "fixed".

## Design

### §1 — Principles & conventions
- **Pure engine boundary.** Game rules are pure functions in `apps/api/src/domain/`
  taking state + an injected `diceRoller` and returning an outcome object. Domain outcomes
  are mapped **field-by-field** into Prisma columns — never spread.
- **Contract lives in `packages/shared`.** Zod schemas are the single source of truth; DTO
  types are `z.infer<typeof …Schema>`. Both apps import them. A stable `ErrorCode` union
  (e.g. `VERSION_CONFLICT`, `GAME_FINISHED`, `INVALID_INPUT`, `ROUTE_NOT_FOUND`,
  `AI_TURN_LIMIT`, `INVALID_CREDENTIALS`) is exported here so the frontend can discriminate
  outcomes reliably.
- **Error envelope.** Success responses return the **bare DTO**; errors return the envelope
  with `error.code` + `error.message` nested. `code` comes from a status→code map. Decision
  recorded in CLAUDE.md at M0.
- **JWT (I6).** `JWT_SECRET` is loaded and validated at startup (reject if missing or under
  ~32 bytes). Tokens are signed and verified with an explicit single algorithm
  (`{ algorithm: 'HS256' }` / `{ algorithms: ['HS256'] }`) and carry `sub` (user id) +
  `iat`/`exp`. This closes both the forge-a-token and algorithm-swap paths.
- **CORS (I12).** `app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))`, with
  `FRONTEND_URL` **defaulting to `http://localhost:5173`** (the real Vite dev origin) when
  unset — never `'*'`, so a missing env var fails safe (bank L002).
- Naming/style per repo rules (camelCase files, PascalCase components, typed errors with
  `errorCode` context, injected structured logger — no `console.*`).

### §2 — Data model (Prisma + PostgreSQL)

```
User {
  id            String  @id @default(cuid())
  username      String              // display form
  usernameKey   String  @unique     // trim + NFKC + lowercase (I9)
  passwordHash  String
  wins          Int     @default(0) // Extra 1
  createdAt     DateTime @default(now())
}

Game {
  id            String  @id @default(cuid())
  ownerUserId   String
  owner         User    @relation(fields: [ownerUserId], references: [id])
  mode          GameMode @default(human)   // human | ai
  aiSeat        Int?                // 1 | 2 when mode = ai (I4, I6)
  targetScore   Int                 // set only at create
  status        GameStatus @default(in_progress) // in_progress | finished | abandoned
  currentSeat   Int     @default(1) // 1 | 2
  p1Score       Int     @default(0)
  p2Score       Int     @default(0)
  roundScore    Int     @default(0)
  lastDice      Int[]   @default([])
  winnerSeat    Int?
  version       Int     @default(0) // optimistic lock (I1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  moves         Move[]
  @@index([ownerUserId, status])                  // list-my-games (held-back)
}

Move {
  id         String   @id @default(cuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id])
  actorSeat  Int
  kind       MoveKind // roll | hold
  dice       Int[]    @default([])
  busted     Boolean  @default(false)
  roundScore Int      // round score AFTER this move
  createdAt  DateTime @default(now())
  @@index([gameId])
}
```

**DB-level invariants (raw-SQL migration).**
- `CHECK ((status = 'finished') = (winner_seat IS NOT NULL))` — already correct; keep.
- A `BEFORE UPDATE` trigger that raises when the old `status <> 'in_progress'` (a
  finished/abandoned game is immutable).
- **Mode/seat tie (I4):** `CHECK ((mode = 'ai') = (ai_seat IS NOT NULL))` and
  `CHECK (ai_seat IN (1,2) OR ai_seat IS NULL)`.
- **One live game per owner (I7):**
  `CREATE UNIQUE INDEX game_one_live_per_owner ON "Game"(owner_user_id) WHERE status = 'in_progress'`.
- **Value ranges (hardening):** `CHECK (current_seat IN (1,2))`, `CHECK (p1_score >= 0 AND
  p2_score >= 0 AND round_score >= 0)`, `CHECK (winner_seat IN (1,2) OR winner_seat IS NULL)`.

- **Verification:** `schema.test.ts` (node env) — asserts the DB rejects (a) updating a
  finished game, (b) `status='finished'` with null `winnerSeat`, (c) `mode='human'` with a
  non-null `aiSeat` and `mode='ai'` with null `aiSeat`, (d) a second `in_progress` game for
  the same owner. Protects the invariants at the layer that actually enforces them.

### §3 — Authorization guards (I5, I6)
- **Read guard** — caller's JWT `sub === game.ownerUserId`. Used by `GET /games/:id`.
- **Action guard** — read guard **AND** the action targets `game.currentSeat`. Used by
  `roll`, `hold`.
- **AI-turn guard** — read guard **AND** `game.mode === 'ai'` **AND**
  `game.currentSeat === game.aiSeat`. Documented as the one endpoint that deliberately does
  **not** use the action guard, so a later reader doesn't "fix" it back.

- **Verification:** `authGuards.test.ts` — (a) a non-owner gets 403 on every game route;
  (b) the owner `GET`s a game whose current seat differs from the seat just acted and gets
  **200** (the 409-recovery case); (c) `ai-turn` on a `human` game, or when the current seat
  isn't `aiSeat`, returns 409.

### §4 — Domain engine (`apps/api/src/domain/`)
Pure, dice injected:
```ts
type RollOutcome = { dice: [number, number]; busted: boolean; nextRoundScore: number; nextCurrentSeat: 1 | 2 };
type HoldOutcome = { seatTotal: number; nextCurrentSeat: 1 | 2; won: boolean };
```
- `roll`: two dice via injected `diceRoller`; `6 & 6` → `busted`, round score lost, seat
  passes; else round score += sum, seat stays.
- `hold`: current seat total += round score; if `>= targetScore` → `won`, else pass seat.
- The engine returns the outcome; the DTO's `lastMove`/`busted` fields (§5) are derived from
  it at the persistence layer.

- **Verification:** `engine.test.ts` (node, no DB) — bust on `[6,6]`, accumulation on other
  rolls, hold-to-win sets `won`, seat alternation. Narrowest layer; proves the rules without
  HTTP or DB.

### §5 — API contract (`packages/shared` Zod schemas)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/register` | `{ username, password }` | `{ token }` |
| POST | `/auth/login` | `{ username, password }` | `{ token }` |
| GET | `/games?status=in_progress` | — (bounded `limit`) | `GameStateDto[]` (owner's) |
| POST | `/games` | `{ targetScore (10–1000), mode, aiSeat? }` | `GameStateDto` |
| GET | `/games/:id` | — | `GameStateDto` (read guard) |
| POST | `/games/:id/roll` | `{ expectedVersion }` (`z.strictObject`) | `GameStateDto` |
| POST | `/games/:id/hold` | `{ expectedVersion }` | `GameStateDto` |
| POST | `/games/:id/ai-turn` | `{ expectedVersion }` | `GameStateDto` |

- **`GameStateDto` outcome field (I5).** The DTO carries an explicit, tested field for
  "what just happened", defined for **every** transition:
  - normal roll → `lastMove: { kind: 'roll', dice, busted: false }`
  - bust → `lastMove: { kind: 'roll', dice: [6,6], busted: true }`, `roundScore: 0`
  - hold / win → `lastMove: { kind: 'hold' }`
  A convenience boolean `busted` mirrors `lastMove.busted` for the animation. **Held dice on
  hold:** `lastDice` is **retained** through a hold (the final roll stays visible) and only
  reset on the next roll; documented so the UI is deterministic. The frontend reads
  `state.busted` / `state.lastMove` — no field the API doesn't send.

- **Create-game cross-field rule (I4).** The schema `.refine`s
  `d => d.mode === 'ai' ? (d.aiSeat === 1 || d.aiSeat === 2) : d.aiSeat == null`, mirrored by
  the DB CHECKs in §2 — an impossible game is impossible to store.

- **Auth input rules (I9).** Password: validate UTF-8 **byte** length explicitly
  (`new TextEncoder().encode(pw).length <= 72`, the bcrypt limit) **and** a minimum
  (`>= 8` chars). Username: `min 3, max 30`, normalized (trim + NFKC + lowercase → `usernameKey`)
  **before** length/uniqueness checks.

- **Validation (I4/general):** an Express middleware runs `Schema.parse()` on body/params per
  route; a roll body carrying `dice` fails `z.strictObject({ expectedVersion })` → 400
  `INVALID_INPUT`. **Verification:** `validation.test.ts` asserts that 400, plus the
  create-game refine rejections and the password byte/min and username cap rejections.

### §6 — Roll/hold transaction (reference implementation)
```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`; // row lock (I1)
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  assertActionGuard(game, actorSeat);
  const outcome = roll(toState(game), diceRoller);        // pure engine
  const updated = await tx.game.updateMany({
    where: { id, version: expectedVersion, status: 'in_progress' }, // I1 + I7
    data: {
      version: { increment: 1 },
      currentSeat: outcome.nextCurrentSeat,
      roundScore: outcome.nextRoundScore,
      lastDice: outcome.dice,
    },
  });
  if (updated.count === 0) throw new ConflictError('VERSION_CONFLICT');
  await tx.move.create({ data: {                          // explicit mapping
    gameId: id, actorSeat, kind: 'roll',
    dice: outcome.dice, busted: outcome.busted, roundScore: outcome.nextRoundScore,
  }});
  return tx.game.findUniqueOrThrow({ where: { id } });
});
```

**Guarded win increment (I10).** On a winning hold, the finished transition runs as the same
conditional `updateMany({ where: { id, version: expectedVersion, status: 'in_progress' },
data: { status: 'finished', winnerSeat } })`, and `user.update({ wins: { increment: 1 } })`
runs **only when that update changed exactly one row**, in the same transaction. This makes
the win count increment exactly once even under retry/duplicate.

- **Verification:** `concurrency.test.ts` — fire two rolls with the **same** `expectedVersion`;
  assert exactly one 200 and one 409 `VERSION_CONFLICT`. `lifecycle.test.ts` — abandon a game
  between read and write; assert the in-flight roll returns 409. `winIncrement.test.ts` — fire
  the winning hold **twice** and assert `wins` rises by **exactly one**.

### §7 — New-game / abandon lifecycle
`POST /games` abandons the owner's other `in_progress` games **with a version bump**
(`updateMany({ where: { ownerUserId, status: 'in_progress' }, data: { status: 'abandoned',
version: { increment: 1 } } })`) so an in-flight roll on the old game hits the status filter
and 409s. The **partial unique index (I7)** guarantees the subsequent create cannot coexist
with another live game even under two simultaneous requests; the resulting unique-violation
is translated to a clean `409`.

- **Verification:** `newGame.test.ts` — two near-simultaneous `POST /games` for one owner
  yield exactly one live game (one 201, one 409); `GET /games?status=in_progress` returns at
  most one.

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game form
  (with the `targetScore` input, 10–1000, and mode/aiSeat selection).
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box.
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`.
- **6&6 bust (Extra 4, I5):** when `state.busted` is true, disable actions ~1.2s and show the
  bust message/animation, with `state.lastMove.dice` (`[6,6]`) visible during it.
- **AI turn:** when `state.mode === 'ai'` and `state.currentSeat === state.aiSeat`, the client
  calls `POST /games/:id/ai-turn` **once per returned state** and re-calls while the AI seat is
  still current (mirrors the server's one-move-per-request contract, I2). An `AI_TURN_LIMIT`
  code stops the loop and surfaces a message.
- **Session recovery:** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen` renders an
  inline re-login card while the board stays mounted; token lifetime `12h` (documented as
  non-revocable — acceptable stateless trade-off for a take-home).
- **Winner highlight:** highlight `winnerSeat` explicitly.
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; clicking Roll calls the client with the current
  `version`; a `busted` response disables buttons. `aiLoop.test.tsx` — given successive states
  where the AI seat stays current, asserts the client re-issues `ai-turn` and stops when the
  seat passes or `AI_TURN_LIMIT` returns.

### §9 — AI opponent (Extra 3, I1/I2/I3/I11)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`.
- **One move per request (I2).** Each `ai-turn` request: (1) re-reads game state, (2)
  re-checks `expectedVersion` and derives the actor seat from the fresh `currentSeat`, (3)
  computes **one** decision, (4) applies it through the §6 transaction, bumping `version`,
  (5) returns fresh state. The client re-calls while the AI seat is still current. A safety
  cap (e.g. per-game move count) returns a terminal `AI_TURN_LIMIT` state (game unchanged) —
  a defined outcome, not undefined behavior. A mid-turn bust passes the seat to the human, so
  the very next request no longer passes the AI-turn guard — the server can never play a move
  for the wrong player.
- **Decision computed outside the transaction (I1, Blocker).** The order is strictly:
  read state → `AiDecisionProvider.decide(state)` (may hit the network) → validate → open a
  short, fast transaction to write the one move. **No network `await` ever happens while a
  `FOR UPDATE` lock or open transaction is held**, so a slow/hung provider holds no DB
  connection or row lock.
- **Data boundary (I11).** A single `AiDecisionProvider.decide(state)` adapter is the only
  thing the model sees, and it receives only
  `{ targetScore, currentSeat, seatTotal, roundScore, lastDice, legalActions }` — never the
  token, username, raw DB rows, user-supplied text, or error details.
- **Output validation (I3).** The model reply is parsed with a fixed schema before anything
  is executed: `z.object({ action: z.enum(['roll','hold']) }).parse(modelOutput)`. A parse
  failure is treated **exactly like a timeout** — fall through to the heuristic.
- **Heuristic fallback (required).** If no API key, no network, the LLM errors/times out, or
  the reply fails validation, the adapter falls back to a deterministic heuristic (`hold` once
  `seatTotal + roundScore >= targetScore` or `roundScore >= 20`, else `roll`). Keeps the demo
  and CI offline and deterministic.

- **Verification:** `ai.test.ts` runs a turn with the LLM path **mocked/disabled** so the
  heuristic drives it, seeded dice (`DICE_SEED`), and asserts a single move advances state and
  bumps version. `aiValidation.test.ts` — the adapter given a malformed model reply
  (`"ROLL!"`, `{action:'fly'}`, broken JSON) falls back to the heuristic instead of throwing.
  `aiBoundary.test.ts` — asserts the payload handed to the provider contains only the six
  allowed fields. The live LLM path is never hit in tests (no network in CI).

### §10 — Auth hardening (I6, I8, I9)
- Passwords bcrypt cost 12; validated by byte length + minimum as in §5.
- **JWT** as pinned in §1 (validated `JWT_SECRET`, `HS256` allowlist, `sub`/`iat`/`exp`).
- **Rate limiting (I8).** `app.set('trust proxy', <known topology>)` set for the deployment;
  the limiter keys off the framework-derived client IP (**not** raw `X-Forwarded-For`).
  Concrete numbers: `/auth/login` **5/min per (ip + normalized-username)**; `/auth/register`
  **10/hr per ip**; `express.json({ limit: '16kb' })` so an oversized body never reaches
  bcrypt. Per-username-only lockout is deliberately rejected (it would let anyone lock any
  account). The store is **in-memory / single-instance** for this demo — documented
  assumption, not a distributed store.
- Login returns a single generic `INVALID_CREDENTIALS` (no account enumeration); register
  necessarily reveals a taken name — noted as accepted.

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not; a JWT signed
  with a different algorithm/secret is rejected by verify.

### §11 — Error handling & observability (I12 + hardening)
Central Express error middleware: `instanceof` typed errors first (`InvalidInputError`,
`ConflictError`, …) → envelope; `ZodError → INVALID_INPUT`; the Postgres trigger/CHECK error
code → `409 GAME_FINISHED` (not a generic 500); else map by `err.status`; else 500.
`app.use` a 404 handler returning `{ error: { code: 'ROUTE_NOT_FOUND' } }`. A request-id is
threaded through the injected structured logger, and a `/health` route is exposed. All
responses (including framework errors) exit in the single envelope, and every route's error
codes come from the shared `ErrorCode` union (§1).

- **Verification:** `errors.test.ts` — POST empty body to `/roll` → `error.code ===
  'INVALID_INPUT'`; hit an unknown route → `ROUTE_NOT_FOUND`; trigger the finished-game trigger
  → `GAME_FINISHED` with a 409 (not 500).

### §12 — Test strategy
- Vitest **workspace**: `apps/web` under `environment: 'jsdom'` + Testing Library;
  `apps/api` under `node`.
- API suites run **serial** (`singleThread: true`) with a `truncateAll()` helper in
  `beforeEach`, against a disposable PostgreSQL that `globalSetup` migrates via
  `prisma migrate deploy`. (Real PostgreSQL is used for tests — SQLite is never involved, so
  raw-SQL triggers/CHECKs are exercised as in production.)

### §13 — Determinism & smoke
- `DICE_SEED` env (validated in `config/env.ts`, **refused when `NODE_ENV==='production'`**)
  swaps `diceRoller` for a seeded generator.
- Smoke run: create a game at `targetScore: 10`, force `[6,6]` via the seed, assert round
  cleared + seat passed, then hold to a win and assert the winner's `wins` incremented by
  exactly one.

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config (including `JWT_SECRET` validation, `FRONTEND_URL`
  default, CORS wiring), error-envelope + `ErrorCode` union recorded in CLAUDE.md, Vitest
  workspace, test-DB `globalSetup`. Confirm real installed versions before pinning (Tailwind 4
  CSS-first `@import "tailwindcss"` + `@theme` + `@tailwindcss/vite`, no `tailwind.config.ts`
  by default — verify at install).
- **M1 — Auth.** register/login, bcrypt, JWT (12h, HS256, validated secret), rate limits with
  `trust proxy`, byte-length/min password and capped username rules, `usernameKey` unique index.
- **M2 — Contract (`packages/shared`).** Zod schemas, DTOs (incl. `lastMove`/`busted`),
  `ErrorCode` union, create-game cross-field refine, `expectedVersion`. Both apps compile
  against it before either implements it.
- **M3a — Game happy path.** create / get / roll / hold, read/action guard split, pure engine,
  playable end-to-end with `curl` at `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, abandon lifecycle, partial unique index,
  guarded one-time win increment, DB CHECK/trigger invariants (finished-game, mode/seat, value
  ranges), finished-game error → `409 GAME_FINISHED` mapping.
- **M4 — Frontend.** Login, resume, create form, board, 6&6 disable/animation, AI-turn loop,
  session card, error boundary. **This is the first fully submittable increment** (core
  assignment + Extras 1/2/4) — the AI opponent (M5) is strictly additive.
- **M5 — AI opponent.** `mode`/`aiSeat`, `AiDecisionProvider` adapter (decision outside the
  transaction, minimal data boundary, output validation), heuristic fallback, one-move
  `ai-turn`, `AI_TURN_LIMIT` cap, `Move` rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) behind the adapter and add its key to `.env` at M5 — otherwise
  the heuristic runs.
