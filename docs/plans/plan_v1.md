# Two-Player Dice Game ("Pig") — Plan

## Summary

Build a "Pig"-variant two-dice game where **all rules live in a backend API** and a
**React frontend only renders state and calls the API**. Per the assignment's "simulate
players on the same page", a single authenticated user drives both seats on one screen:
they log in once, create a game, and act as Player 1 and Player 2 by clicking. The server
owns identity, the dice, turn order, scoring, win detection, and every validation. The
optional AI opponent is a real LLM agent (LangChain + LangGraph on a free-tier model) that
plays one seat, with a deterministic heuristic fallback so the demo and tests never depend
on the network.

Delivered as a TypeScript monorepo: `apps/api` (Express + Prisma + PostgreSQL),
`apps/web` (React + Vite + Tailwind), and `packages/shared` (Zod schemas + DTOs shared by
both sides).

## Scope

**In scope**
- Auth: register + login (bcrypt, JWT), rate-limited; only authenticated users create/play.
- Single-owner / two-seat game model; full rule enforcement server-side.
- Endpoints: register, login, list-my-games, create game, get game, roll, hold, ai-turn.
- Optimistic concurrency (client-supplied `expectedVersion` + row lock) so a double-click
  cannot produce a second roll.
- Win-count tracking per user (Extra 1); PostgreSQL persistence (Extra 2).
- AI opponent as an LLM agent with heuristic fallback (Extra 3).
- Brief disable + 6&6 bust animation/message (Extra 4).
- Deterministic dice seeding for tests/smoke; test-DB strategy; DB-level finished-game
  invariant.

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking / `opponentUsername` — the single-owner model
  removes this surface entirely (see I3 resolution).
- Sound effects (Extra 5) — optional, deferred; no dependency on it.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not yet surfaced.

## Issue Resolutions

| ID | Title | Detected by | Resolution | Notes |
|----|-------|-------------|------------|-------|
| I1 | Optimistic lock doesn't stop double-click | claude | Fixed (R1) | Client-supplied `expectedVersion` + `FOR UPDATE` row lock; deterministic concurrency test. |
| I2 | No way back after reload / token expiry | claude, perplexity, gpt | Fixed (dev) | Single-user model: `GET /games?status=in_progress` to resume; 12h token; one inline re-login card. |
| I3 | Self-play / dragging in a stranger | claude, gpt, grok, z.ai, gemini | Fixed (structural) | Single-owner model removes opponent accounts; R3's CHECK/OPPONENT_BUSY N/A. |
| I4 | Zod handed to framework validates nothing | claude, gemini | Fixed (dev R4) | Switch to Express; per-route Zod `.parse()` middleware genuinely rejects bad bodies. |
| I5 | Turn check blocks 409-recovery refetch | gpt | Fixed (R5) | Read guard (owner) vs action guard (owner + targets current seat). |
| I6 | AI opponent can't exist under fixed model | claude, gpt, perplexity, z.ai, grok | Fixed (R6) | `mode`/`aiSeat` on Game; dedicated ai-turn guard; LLM agent + heuristic fallback; capped loop. |
| I7 | Roll lands on an abandoned game | claude, gpt, grok, gemini | Fixed (R7) | `version:{increment:1}` on abandon; status moved into the write filter. |
| I8 | FINAL SCORE box has no endpoint | claude, perplexity | Fixed (R8) | `targetScore` set only at create; static on board; `HoldOutcome` defined. |
| I9 | Login limiter locks users / unbounded / register unthrottled | claude, grok, gemini, perplexity | Fixed (R9) | `express-rate-limit` on ip+normalised-username, bounded; register limit; body cap. |
| I10 | Framework errors skip the envelope | claude, gemini | Fixed (R10) | Central Express error middleware + 404 handler normalise every error. |
| I11 | Reference transaction won't run | claude | Fixed (R11) | Explicit field mapping into `move.create`, never spread. |
| I12 | Acceptance tests can't force a bust | claude | Fixed (R12) | `DICE_SEED` seeded roller; `targetScore:10` smoke; deterministic criteria. |
| I13 | No test-DB strategy; mixed envs | claude, perplexity | Fixed (R13) | Serial + `truncateAll`; Vitest workspace jsdom vs node. |
| I14 | schema.test claims a DB guarantee that isn't built | claude, gpt, perplexity | Fixed (R14) | Raw-SQL CHECK + BEFORE UPDATE trigger enforce finished-game invariant. |
| I15 | Envelope collides with scaffold | bank | Fixed (R15) | Bare success DTOs; error `code`/`message` nested; status→code map; recorded in CLAUDE.md. |

## Design

### §1 — Principles & conventions
- **Pure engine boundary.** Game rules are pure functions in `apps/api/src/domain/`
  taking state + an injected `diceRoller` and returning an outcome object. Domain outcomes
  are mapped **field-by-field** into Prisma columns — never spread — so the pure/persistence
  boundary stays real (I11).
- **Contract lives in `packages/shared`.** Zod schemas are the single source of truth; DTO
  types are `z.infer<typeof …Schema>`. Both apps import them.
- **Error envelope (I15).** Success responses return the **bare DTO**. Errors return the
  scaffold envelope with `error.code` + `error.message` nested inside. `code` comes from a
  status→code map that reuses the scaffold's existing convention. Decision recorded in
  CLAUDE.md at M0.
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
  ownerUserId   String              // the one logged-in user (I3)
  owner         User    @relation(fields: [ownerUserId], references: [id])
  mode          GameMode @default(human)   // human | ai
  aiSeat        Int?                // 1 | 2 when mode = ai (I6)
  targetScore   Int                 // set only at create (I8)
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

**DB-level finished-game invariant (I14).** A raw-SQL migration adds:
- `CHECK ((status = 'finished') = (winner_seat IS NOT NULL))`
- a `BEFORE UPDATE` trigger that raises when the row's old `status <> 'in_progress'`
  (a finished/abandoned game can never be mutated).

- **Verification:** `schema.test.ts` (node env) attempts to update a finished game and
  asserts the DB rejects it, and attempts to set `status='finished'` with null `winnerSeat`
  and asserts the CHECK fails. Protects the "a finished game is immutable" boundary at the
  layer that actually enforces it.

### §3 — Authorization guards (I3, I5, I6)
Two guards, written explicitly (no "every handler begins with…"):
- **Read guard** — caller's JWT `sub === game.ownerUserId`. Used by `GET /games/:id`.
- **Action guard** — read guard **AND** the action targets `game.currentSeat`
  (the client acts as whichever seat is current). Used by `roll`, `hold`.
- **AI-turn guard** — read guard **AND** `game.mode === 'ai'` **AND**
  `game.currentSeat === game.aiSeat`. Documented as the one endpoint that deliberately does
  **not** use the action guard, so a later reader doesn't "fix" it back (I6).

- **Verification:** `authGuards.test.ts` — (a) a non-owner gets 403 on every game route;
  (b) the owner `GET`s a game whose current seat differs from the seat just acted and gets
  **200** (the exact 409-recovery case from I5); (c) `ai-turn` on a `human` game or when the
  current seat isn't `aiSeat` returns 409.

### §4 — Domain engine (`apps/api/src/domain/`)
Pure, dice injected:
```ts
type RollOutcome = { dice: [number, number]; busted: boolean; nextRoundScore: number; nextCurrentSeat: 1 | 2 };
type HoldOutcome = { seatTotal: number; nextCurrentSeat: 1 | 2; won: boolean; clearsLastDice: true };
```
- `roll`: two dice via injected `diceRoller`; `6 & 6` → `busted`, round score lost, seat
  passes; else round score += sum, seat stays.
- `hold`: current seat total += round score; if `>= targetScore` → `won`, else pass seat;
  a hold **always clears `lastDice`** (I8).

- **Verification:** `engine.test.ts` (node, no DB) — bust on `[6,6]`, accumulation on other
  rolls, hold-to-win sets `won`, hold clears `lastDice`, seat alternation. Narrowest layer;
  proves the rules without HTTP or DB.

### §5 — API contract (`packages/shared` Zod schemas)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/register` | `{ username, password }` (password 1–72 bytes) | `{ token }` |
| POST | `/auth/login` | `{ username, password }` | `{ token }` |
| GET | `/games?status=in_progress` | — | `GameStateDto[]` (owner's) (I2) |
| POST | `/games` | `{ targetScore (10–1000), mode, aiSeat? }` | `GameStateDto` (I8) |
| GET | `/games/:id` | — | `GameStateDto` (read guard) (I5) |
| POST | `/games/:id/roll` | `{ expectedVersion }` (`z.strictObject`) | `GameStateDto` (I1, I4) |
| POST | `/games/:id/hold` | `{ expectedVersion }` | `GameStateDto` |
| POST | `/games/:id/ai-turn` | `{ expectedVersion }` | `GameStateDto` (I6) |

- **Validation (I4):** an Express middleware runs `Schema.parse()` on body/params per route;
  a roll body carrying `dice` fails `z.strictObject({ expectedVersion })` → 400
  `INVALID_INPUT`. **Verification:** `validation.test.ts` asserts that exact 400.
- Password max length is enforced at 72 bytes (bcrypt truncation guard).

### §6 — Roll/hold transaction (reference implementation)
```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`; // row lock (I1)
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  assertActionGuard(game, actorSeat);                     // I5
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
  await tx.move.create({ data: {                          // explicit mapping (I11)
    gameId: id, actorSeat, kind: 'roll',
    dice: outcome.dice, busted: outcome.busted, roundScore: outcome.nextRoundScore,
  }});
  return tx.game.findUniqueOrThrow({ where: { id } });
});
```
Hold and the win increment run in the **same transaction**: on `won`, set
`status='finished'`, `winnerSeat`, and `user.update({ wins: { increment: 1 } })` atomically.

- **Verification:** `concurrency.test.ts` — fire two rolls with the **same** `expectedVersion`;
  assert exactly one 200 and one 409 `VERSION_CONFLICT` (deterministic, I1). `lifecycle.test.ts`
  — abandon a game between read and write and assert the in-flight roll returns 409 (I7).

### §7 — New-game / abandon lifecycle
`POST /games` abandons the owner's other `in_progress` games **with a version bump**
(`updateMany({ where: { ownerUserId, status: 'in_progress' }, data: { status: 'abandoned', version: { increment: 1 } } })`) so an in-flight roll on the old game hits the status filter
and 409s (I7). Only the owner's own games are touched (no cross-user effect — impossible
under the single-owner model anyway).

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game
  form (with the `targetScore` input, 10–1000).
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box (I8).
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`.
- **6&6 bust (Extra 4):** when a response has `busted`, disable actions ~1.2s and show a
  bust message/animation.
- **Session recovery (I2):** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen`
  renders an inline re-login card while the board stays mounted; token lifetime `12h`.
- **Winner highlight:** highlight `winnerSeat` explicitly (fixes the held-back
  "highlights the loser" bug — the seat model makes the winner unambiguous).
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; clicking Roll calls the client with the current
  `version`; a `busted` response disables buttons. Proves render + call wiring without a real
  server.

### §9 — AI opponent (Extra 3, I6)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`.
- **Agent:** a LangGraph graph (LangChain, **free-tier model** — configured via env, e.g. a
  free Gemini/Groq key) decides `roll` vs `hold` each step given the visible state. One
  transaction, one version increment, N `Move` rows, loop capped at 50.
- **Fallback (required):** if no API key, no network, or the LLM errors/times out, the graph
  falls back to a deterministic heuristic (`hold` once `seatTotal + roundScore >= targetScore`
  or `roundScore >= 20`, else `roll`). This keeps the demo and CI offline and deterministic.

- **Verification:** `ai.test.ts` runs the turn with the LLM path **mocked/disabled** so the
  heuristic fallback drives it, seeded dice (`DICE_SEED`), and asserts a full AI turn
  advances state and passes the seat. The live LLM path is never hit in tests (no network in
  CI).

### §10 — Auth hardening (I9)
- Passwords bcrypt cost 12; length capped 1–72 bytes.
- `express-rate-limit` on `/auth/login` keyed `ip + ":" + normaliseUsername(body.username)`
  (trim + NFKC + lowercase — same normalisation as `usernameKey`), bounded store.
- Separate IP-only limit on `/auth/register` (10/hr); `express.json({ limit: '16kb' })` so an
  oversized body never reaches bcrypt.
- §10 states per-username lockout was rejected deliberately (it would let anyone lock any
  account).

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not.

### §11 — Error handling (I10, I15)
Central Express error middleware: `instanceof` typed errors first
(`InvalidInputError`, `ConflictError`, …) → envelope; `ZodError → INVALID_INPUT`; else map by
`err.status`; else 500. `app.use` a 404 handler returning
`{ error: { code: 'ROUTE_NOT_FOUND' } }`. All responses (including framework errors) exit in
the single envelope.

- **Verification:** `errors.test.ts` — POST empty body to `/roll` → `error.code ===
  'INVALID_INPUT'`; hit an unknown route → `ROUTE_NOT_FOUND`.

### §12 — Test strategy (I13)
- Vitest **workspace**: `apps/web` under `environment: 'jsdom'` + Testing Library;
  `apps/api` under `node`.
- API suites run **serial** (`singleThread: true`) with a `truncateAll()` helper in
  `beforeEach`, against a disposable PostgreSQL that `globalSetup` migrates via
  `prisma migrate deploy`.

### §13 — Determinism & smoke (I12)
- `DICE_SEED` env (validated in `config/env.ts`, **refused when `NODE_ENV==='production'`**)
  swaps `diceRoller` for a seeded generator.
- Smoke run: create a game at `targetScore: 10`, force `[6,6]` via the seed, assert round
  cleared + seat passed, then hold to a win and assert the winner's `wins` incremented by
  exactly one.

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config, error-envelope reconciliation recorded in
  CLAUDE.md, Vitest workspace, test-DB `globalSetup`. Confirm real installed versions before
  pinning (Tailwind 4 uses CSS-first `@import "tailwindcss"` + `@theme` + `@tailwindcss/vite`,
  no `tailwind.config.ts` by default — verify at install).
- **M1 — Auth.** register/login, bcrypt, JWT (12h), rate limits, `usernameKey` unique index.
- **M2 — Contract (`packages/shared`).** Zod schemas, DTOs, error envelope, `expectedVersion`.
  Both apps compile against it before either implements it.
- **M3a — Game happy path.** create / get / roll / hold, read/action guard split, pure engine,
  playable end-to-end with `curl` at `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, abandon lifecycle, atomic win increment,
  DB finished-game CHECK/trigger.
- **M4 — Frontend.** Login, resume, create form, board, 6&6 disable/animation, session card,
  error boundary.
- **M5 — AI opponent.** `mode`/`aiSeat`, LangGraph agent + heuristic fallback, `ai-turn`,
  `Move` rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) and add its key to `.env` at M5 — otherwise the heuristic runs.
