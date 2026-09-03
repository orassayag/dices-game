# Two-Player Dice Game ("Pig") — Plan

## Summary

Build a "Pig"-variant two-dice game where **all rules live in a backend API** and a
**React frontend only renders state and calls the API**. Per the assignment's "simulate
players on the same page", a single authenticated user drives both seats on one screen:
they log in once, create a game, and act as Player 1 and Player 2 by clicking. The server
owns identity, the dice, turn order, scoring, win detection, and every validation.

An optional AI opponent plays one seat. Its decision is made by an LLM adapter
(LangChain/LangGraph on a free-tier model) with a **mandatory deterministic heuristic
fallback**, so the demo and tests never depend on the network. The AI decision is computed
**outside** any database transaction, under an explicit `AbortSignal.timeout(3000)`
deadline, and each `ai-turn` request applies **exactly one** validated move — so a slow or
hung provider never holds a row lock nor keeps the HTTP request open, and the optimistic
lock is re-checked on every move. A per-game AI move cap is **recoverable**: hitting it
hands the turn back to the human rather than freezing the board.

Delivered as a TypeScript monorepo: `apps/api` (Express + Prisma + PostgreSQL),
`apps/web` (React + Vite + Tailwind), and `packages/shared` (Zod schemas + DTOs shared by
both sides). The auth token is a `Bearer` token held in `localStorage` and sent in the
`Authorization` header (no cookies, no CSRF surface).

## Scope

**In scope**
- Auth: register + login (bcrypt, JWT with pinned secret/algorithm), rate-limited; only
  authenticated users create/play. Token transport is `Authorization: Bearer` from
  `localStorage` — CORS runs **without** `credentials`.
- Single-owner / two-seat game model; full rule enforcement server-side, including a hold
  that banks the round score into the seat total and resets `roundScore` to `0`.
- Endpoints: register, login, list-my-games, create game, get game, roll, hold, ai-turn.
- Optimistic concurrency (client-supplied `expectedVersion` + row lock), re-checked on
  every move including AI moves, so a double-click cannot produce a second roll. A move
  whose game was abandoned out from under it returns a distinct `GAME_ABANDONED`, not a
  generic `VERSION_CONFLICT`.
- Win-count tracking per user (Extra 1), via a guarded one-time increment; PostgreSQL
  persistence (Extra 2).
- AI opponent as an LLM adapter with a required heuristic fallback (Extra 3), one validated
  move per request, decision computed outside the DB transaction under a 3s deadline, with
  a recoverable per-game move cap.
- Brief disable + 6&6 bust animation/message (Extra 4), driven by an explicit DTO field.
- CORS scoped to the frontend origin (no credentials); deterministic dice seeding for
  tests/smoke; test-DB strategy; DB-level invariants (finished-game immutability, one live
  game per owner, valid seat/mode/score ranges), each mapped to its **own** error code.

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking — the single-owner model removes this surface.
- Sound effects (Extra 5) — optional, deferred.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not surfaced.
- Multi-instance / Redis-backed rate-limit store — the demo is single-instance,
  directly exposed (`trust proxy = false`); the in-memory store and its assumption are
  documented, not replaced.

## Issue Resolutions

Third-round review of the plan. 8 issues (3 🔴 High, 5 🟡 Medium), all Fixed via `auto`.
(This round builds on the prior 12-issue round, whose fixes remain in the Design below.)

| ID | Title | Detected by | Resolution | Notes |
|----|-------|------------|------------|-------|
| I1 | Holding never resets the round score | gpt, grok | Fixed (R1) | `HoldOutcome` gains `nextRoundScore` (always `0`) + banked `seatTotal`; the hold transaction writes the seat total, zeroes `roundScore`, sets status/winner, leaves `lastDice` untouched. §4, §6. |
| I2 | AI move-cap can freeze the game | gpt, z.ai, grok | Fixed (R2) | Cap is recoverable: hand the turn to the human in the same write (`lastMove: forfeit`), bump version; `aiMoveCount` on `Game`, hard limit 50. §2, §9. |
| I3 | Token transport never decided (cookie vs. localStorage) | gpt, grok | Fixed (R3) | `Authorization: Bearer` from `localStorage`; drop `credentials: true` from CORS; XSS/CSRF trade-off documented. §1, §8, §10. |
| I4 | Every DB guard error reported as "game finished" | gpt | Fixed (R4) | Error middleware branches per DB signal: finished-game → `GAME_FINISHED`, unique index → conflict, other CHECK → `DATABASE_CONSTRAINT`. §11. |
| I5 | AI call has no time limit | gpt | Fixed (R5) | `AbortSignal.timeout(3000)` into the provider call; abort falls through to the heuristic. §9. |
| I6 | `trust proxy` left as a placeholder | gpt, grok | Fixed (R6) | Pin `app.set('trust proxy', false)` (directly-exposed single instance); test a forged `X-Forwarded-For` can't shift the limiter key. §10. |
| I7 | Abandoning a game shows a confusing "version conflict" | z.ai | Fixed (R7) | Add `GAME_ABANDONED`; on a zero-row guarded update, re-read and throw it when status is `abandoned`. §5, §7. |
| I8 | Only identical actions raced in the concurrency test | gpt | Fixed (R8) | Extend `concurrency.test.ts` into a roll-vs-hold / hold-vs-roll matrix on the same `expectedVersion`. §6. |

**Prior round (still in force, folded into Design):** AI decision outside the transaction;
one validated move per `ai-turn`; fixed-enum parse of the model reply with heuristic
fallback; mode/seat cross-field refine + DB CHECKs; explicit `lastMove`/`busted` DTO field;
validated `JWT_SECRET` + `HS256` allowlist; partial unique index for one-live-game;
IP-keyed rate limiting; byte-length password + capped username; guarded one-time win
increment; minimal AI data boundary; CORS scoped to `FRONTEND_URL`.

## Design

### §1 — Principles & conventions
- **Pure engine boundary.** Game rules are pure functions in `apps/api/src/domain/`
  taking state + an injected `diceRoller` and returning an outcome object. Domain outcomes
  are mapped **field-by-field** into Prisma columns — never spread.
- **Contract lives in `packages/shared`.** Zod schemas are the single source of truth; DTO
  types are `z.infer<typeof …Schema>`. Both apps import them. A stable `ErrorCode` union
  (`VERSION_CONFLICT`, `GAME_FINISHED`, `GAME_ABANDONED` (I7), `DATABASE_CONSTRAINT` (I4),
  `INVALID_INPUT`, `ROUTE_NOT_FOUND`, `AI_TURN_LIMIT`, `INVALID_CREDENTIALS`) is exported
  here so the frontend can discriminate outcomes reliably.
- **Error envelope.** Success responses return the **bare DTO**; errors return the envelope
  with `error.code` + `error.message` nested. `code` comes from a status→code map. Decision
  recorded in CLAUDE.md at M0.
- **JWT.** `JWT_SECRET` is loaded and validated at startup (reject if missing or under
  ~32 bytes). Tokens are signed and verified with an explicit single algorithm
  (`{ algorithm: 'HS256' }` / `{ algorithms: ['HS256'] }`) and carry `sub` (user id) +
  `iat`/`exp`. This closes both the forge-a-token and algorithm-swap paths.
- **Token transport (I3).** The token is a **`Bearer` token the client holds in
  `localStorage`** and sends in the `Authorization` header. CORS therefore runs **without**
  `credentials` (no cookies). Accepted trade-off: `localStorage` is readable by injected
  script (XSS), mitigated by the app shipping no third-party script and escaping all
  rendered state; in exchange there is **no cookie, hence no CSRF surface** and no
  cross-site request can ride the session. Documented in CLAUDE.md at M0.
- **CORS (I3, I12).** `app.use(cors({ origin: env.FRONTEND_URL }))` — **no `credentials`**,
  with `FRONTEND_URL` **defaulting to `http://localhost:5173`** (the real Vite dev origin)
  when unset — never `'*'`, so a missing env var fails safe (bank L002).
- Naming/style per repo rules (camelCase files, PascalCase components, typed errors with
  `errorCode` context, injected structured logger — no `console.*`).

### §2 — Data model (Prisma + PostgreSQL)

```
User {
  id            String  @id @default(cuid())
  username      String              // display form
  usernameKey   String  @unique     // trim + NFKC + lowercase
  passwordHash  String
  wins          Int     @default(0) // Extra 1
  createdAt     DateTime @default(now())
}

Game {
  id            String  @id @default(cuid())
  ownerUserId   String
  owner         User    @relation(fields: [ownerUserId], references: [id])
  mode          GameMode @default(human)   // human | ai
  aiSeat        Int?                // 1 | 2 when mode = ai
  aiMoveCount   Int     @default(0) // per-game AI move counter, hard cap 50 (I2)
  targetScore   Int                 // set only at create
  status        GameStatus @default(in_progress) // in_progress | finished | abandoned
  currentSeat   Int     @default(1) // 1 | 2
  p1Score       Int     @default(0)
  p2Score       Int     @default(0)
  roundScore    Int     @default(0)
  lastDice      Int[]   @default([])
  winnerSeat    Int?
  version       Int     @default(0) // optimistic lock
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  moves         Move[]
  @@index([ownerUserId, status])                  // list-my-games
}

Move {
  id         String   @id @default(cuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id])
  actorSeat  Int
  kind       MoveKind // roll | hold | forfeit  (forfeit = AI cap hand-back, I2)
  dice       Int[]    @default([])
  busted     Boolean  @default(false)
  roundScore Int      // round score AFTER this move
  createdAt  DateTime @default(now())
  @@index([gameId])
}
```

**DB-level invariants (raw-SQL migration).**
- `CHECK ((status = 'finished') = (winner_seat IS NOT NULL))`.
- A `BEFORE UPDATE` trigger that raises when the old `status <> 'in_progress'` (a
  finished/abandoned game is immutable). This trigger raises a **distinct SQLSTATE**
  (custom `PLpgSQL` `RAISE ... USING ERRCODE`) so §11 can map it to `GAME_FINISHED`
  without swallowing other constraint failures (I4).
- **Mode/seat tie:** `CHECK ((mode = 'ai') = (ai_seat IS NOT NULL))` and
  `CHECK (ai_seat IN (1,2) OR ai_seat IS NULL)`.
- **One live game per owner:**
  `CREATE UNIQUE INDEX game_one_live_per_owner ON "Game"(owner_user_id) WHERE status = 'in_progress'`.
- **Value ranges:** `CHECK (current_seat IN (1,2))`, `CHECK (p1_score >= 0 AND
  p2_score >= 0 AND round_score >= 0)`, `CHECK (winner_seat IN (1,2) OR winner_seat IS NULL)`,
  `CHECK (ai_move_count >= 0)`.

- **Verification:** `schema.test.ts` (node env) — asserts the DB rejects (a) updating a
  finished game **and that the error carries the finished-game SQLSTATE**, (b)
  `status='finished'` with null `winnerSeat`, (c) `mode='human'` with a non-null `aiSeat`
  and `mode='ai'` with null `aiSeat`, (d) a second `in_progress` game for the same owner.
  Protects the invariants — and the code that distinguishes them (I4) — at the layer that
  enforces them.

### §3 — Authorization guards
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
type HoldOutcome = { seatTotal: number; nextRoundScore: 0; nextCurrentSeat: 1 | 2; won: boolean };
```
- `roll`: two dice via injected `diceRoller`; `6 & 6` → `busted`, round score lost, seat
  passes; else round score += sum, seat stays.
- `hold` **(I1):** compute the acting seat's new total as `seatTotal = priorSeatTotal +
  roundScore`; set `nextRoundScore = 0` (the round counter is always cleared on hold); if
  `seatTotal >= targetScore` → `won`, else pass the seat. The outcome carries **both** the
  banked `seatTotal` and the zeroed `nextRoundScore`, so the persistence layer (§6) writes
  the seat score and clears the round without recomputing.
- The DTO's `lastMove`/`busted` fields (§5) are derived from the outcome at the persistence
  layer.

- **Verification:** `engine.test.ts` (node, no DB) — bust on `[6,6]`, accumulation on other
  rolls, **hold banks the round score into the seat total and returns `nextRoundScore: 0`**
  (protects I1: a hold must move the points and zero the counter — regresses to double-count
  if broken), hold-to-win sets `won`, seat alternation. Narrowest layer; proves the rules
  without HTTP or DB.

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

- **`GameStateDto` outcome field.** The DTO carries an explicit, tested field for
  "what just happened", defined for **every** transition:
  - normal roll → `lastMove: { kind: 'roll', dice, busted: false }`
  - bust → `lastMove: { kind: 'roll', dice: [6,6], busted: true }`, `roundScore: 0`
  - hold / win → `lastMove: { kind: 'hold' }`, `roundScore: 0` (I1)
  - AI cap hand-back → `lastMove: { kind: 'forfeit' }` (I2)
  A convenience boolean `busted` mirrors `lastMove.busted` for the animation. **Held dice on
  hold:** `lastDice` is **retained** through a hold (the final roll stays visible) and only
  reset on the next roll; documented so the UI is deterministic. The frontend reads
  `state.busted` / `state.lastMove` — no field the API doesn't send.

- **Create-game cross-field rule.** The schema `.refine`s
  `d => d.mode === 'ai' ? (d.aiSeat === 1 || d.aiSeat === 2) : d.aiSeat == null`, mirrored by
  the DB CHECKs in §2 — an impossible game is impossible to store.

- **Auth input rules.** Password: validate UTF-8 **byte** length explicitly
  (`new TextEncoder().encode(pw).length <= 72`, the bcrypt limit) **and** a minimum
  (`>= 8` chars). Username: `min 3, max 30`, normalized (trim + NFKC + lowercase → `usernameKey`)
  **before** length/uniqueness checks.

- **Abandoned-game code (I7).** `GAME_ABANDONED` is part of the shared `ErrorCode` union so
  the frontend can distinguish "someone started a new game and orphaned this one" from an
  ordinary double-click `VERSION_CONFLICT`. See §6/§7 for where it is thrown.

- **Validation:** an Express middleware runs `Schema.parse()` on body/params per
  route; a roll body carrying `dice` fails `z.strictObject({ expectedVersion })` → 400
  `INVALID_INPUT`. **Verification:** `validation.test.ts` asserts that 400, plus the
  create-game refine rejections and the password byte/min and username cap rejections.

### §6 — Roll/hold transaction (reference implementation)
```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`; // row lock
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  assertActionGuard(game, actorSeat);
  const outcome = hold(toState(game));                    // pure engine (roll path analogous)
  const updated = await tx.game.updateMany({
    where: { id, version: expectedVersion, status: 'in_progress' },
    data: {
      version: { increment: 1 },
      currentSeat: outcome.nextCurrentSeat,
      roundScore: outcome.nextRoundScore,                 // 0 on hold (I1)
      ...(actorSeat === 1 ? { p1Score: outcome.seatTotal } : { p2Score: outcome.seatTotal }), // I1
      ...(outcome.won ? { status: 'finished', winnerSeat: actorSeat } : {}),
      // lastDice deliberately NOT written on hold — the last roll stays visible (I1)
    },
  });
  if (updated.count === 0) {
    const fresh = await tx.game.findUnique({ where: { id } });
    if (fresh?.status === 'abandoned') throw new ConflictError('GAME_ABANDONED'); // I7
    throw new ConflictError('VERSION_CONFLICT');
  }
  await tx.move.create({ data: {                          // explicit mapping
    gameId: id, actorSeat, kind: 'hold',
    dice: game.lastDice, busted: false, roundScore: 0,
  }});
  return tx.game.findUniqueOrThrow({ where: { id } });
});
```
The roll path is the same shape, writing `lastDice`/`roundScore` from `RollOutcome` and a
`kind: 'roll'` move. **On hold (I1)** the seat total is banked and `roundScore` is set to
`0` in the same guarded update, so the round points move exactly once and the counter always
clears. **Zero-row update (I7):** before assuming a version race, re-read the row; if it is
now `abandoned`, throw `GAME_ABANDONED` so the client shows the real reason.

**Guarded win increment.** On a winning hold, `user.update({ wins: { increment: 1 } })` runs
**only when the guarded `updateMany` changed exactly one row**, in the same transaction. This
makes the win count increment exactly once even under retry/duplicate.

- **Verification:** `concurrency.test.ts` **(I8)** — a small matrix: race two rolls, race
  `roll`+`hold`, and race `hold`+`roll`, each pair on the **same** `expectedVersion`; every
  pair asserts exactly one 200 and one 409 `VERSION_CONFLICT` (protects that optimistic
  locking guards *different* transitions, not just identical ones). `hold.test.ts` — a hold
  raises the seat total by the round score, leaves `roundScore` at `0`, and keeps `lastDice`
  showing the last roll (protects I1 end-to-end). `lifecycle.test.ts` — abandon a game
  between read and write; assert the in-flight roll returns **`GAME_ABANDONED`** (I7), not a
  bare version conflict. `winIncrement.test.ts` — fire the winning hold **twice** and assert
  `wins` rises by **exactly one**.

### §7 — New-game / abandon lifecycle
`POST /games` abandons the owner's other `in_progress` games **with a version bump**
(`updateMany({ where: { ownerUserId, status: 'in_progress' }, data: { status: 'abandoned',
version: { increment: 1 } } })`) so an in-flight roll on the old game hits the status filter
and — per §6 — surfaces as `GAME_ABANDONED` (I7). The **partial unique index** guarantees
the subsequent create cannot coexist with another live game even under two simultaneous
requests; the resulting unique-violation is translated to a clean `409` (§11, distinct from
`GAME_FINISHED`).

- **Verification:** `newGame.test.ts` — two near-simultaneous `POST /games` for one owner
  yield exactly one live game (one 201, one 409); `GET /games?status=in_progress` returns at
  most one.

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game form
  (with the `targetScore` input, 10–1000, and mode/aiSeat selection).
- **Token handling (I3):** on login/register the returned token is stored in `localStorage`;
  `apiClient` attaches `Authorization: Bearer <token>` to every request. No cookies are set
  or read. Logout / a 401 clears the stored token.
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box.
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`.
- **6&6 bust (Extra 4):** when `state.busted` is true, disable actions ~1.2s and show the
  bust message/animation, with `state.lastMove.dice` (`[6,6]`) visible during it.
- **AI turn:** when `state.mode === 'ai'` and `state.currentSeat === state.aiSeat`, the client
  calls `POST /games/:id/ai-turn` **once per returned state** and re-calls while the AI seat is
  still current (mirrors the server's one-move-per-request contract). A `lastMove.kind ===
  'forfeit'` state (the recoverable cap, I2) hands the turn back to the human and stops the
  loop, optionally showing an `AI_TURN_LIMIT` note.
- **Abandoned-game notice (I7):** a `GAME_ABANDONED` response shows "this game was abandoned
  — starting fresh" and reloads `GET /games?status=in_progress`, rather than the generic
  conflict toast.
- **Session recovery:** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen` renders an
  inline re-login card while the board stays mounted; token lifetime `12h` (documented as
  non-revocable — acceptable stateless trade-off for a take-home).
- **Winner highlight:** highlight `winnerSeat` explicitly.
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; clicking Roll calls the client with the current
  `version`; a `busted` response disables buttons; a `GAME_ABANDONED` response shows the
  abandoned notice (I7). `aiLoop.test.tsx` — given successive states where the AI seat stays
  current, asserts the client re-issues `ai-turn` and stops when the seat passes or a
  `forfeit` state returns (I2).

### §9 — AI opponent (Extra 3)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`.
- **One move per request.** Each `ai-turn` request: (1) re-reads game state, (2) re-checks
  `expectedVersion` and derives the actor seat from the fresh `currentSeat`, (3) computes
  **one** decision, (4) applies it through the §6 transaction, bumping `version` and
  incrementing `aiMoveCount`, (5) returns fresh state. The client re-calls while the AI seat
  is still current. A mid-turn bust passes the seat to the human, so the next request no
  longer passes the AI-turn guard — the server can never play for the wrong player.
- **Recoverable move cap (I2).** `aiMoveCount` is incremented on each AI move; on reaching
  the hard limit (**50**), the server does **not** freeze the game. In the same write it
  **hands the turn back to the human** (`currentSeat = the non-AI seat`, `lastMove: { kind:
  'forfeit' }`), bumps `version`, and returns that state (optionally with an `AI_TURN_LIMIT`
  note). The game stays playable; the human can immediately act.
- **Decision computed outside the transaction.** The order is strictly:
  read state → `AiDecisionProvider.decide(state)` (may hit the network) → validate → open a
  short, fast transaction to write the one move. **No network `await` ever happens while a
  `FOR UPDATE` lock or open transaction is held**, so a slow/hung provider holds no DB
  connection or row lock.
- **Provider deadline (I5).** `decide(state)` runs the LLM call under
  `AbortSignal.timeout(3000)`, and the signal is **passed into the provider SDK** so the
  in-flight request is actually cancelled on timeout. An abort is treated **exactly like a
  parse failure** — fall through to the heuristic — so a hung provider can never keep the
  HTTP request open indefinitely. The 3000ms value is a named constant, documented alongside
  the `ErrorCode`/AI comment.
- **Data boundary.** A single `AiDecisionProvider.decide(state)` adapter is the only thing
  the model sees, and it receives only
  `{ targetScore, currentSeat, seatTotal, roundScore, lastDice, legalActions }` — never the
  token, username, raw DB rows, user-supplied text, or error details.
- **Output validation.** The model reply is parsed with a fixed schema before anything is
  executed: `z.object({ action: z.enum(['roll','hold']) }).parse(modelOutput)`. A parse
  failure is treated **exactly like a timeout** — fall through to the heuristic.
- **Heuristic fallback (required).** If no API key, no network, the LLM errors/times out
  (I5), or the reply fails validation, the adapter falls back to a deterministic heuristic
  (`hold` once `seatTotal + roundScore >= targetScore` or `roundScore >= 20`, else `roll`).
  Keeps the demo and CI offline and deterministic.

- **Verification:** `ai.test.ts` runs a turn with the LLM path **mocked/disabled** so the
  heuristic drives it, seeded dice (`DICE_SEED`), and asserts a single move advances state and
  bumps version. `aiTimeout.test.ts` **(I5)** — a provider that never resolves; assert the
  `AbortSignal.timeout(3000)` fires and the heuristic drives the move within the deadline
  (protects against an indefinitely-open request). `aiCap.test.ts` **(I2)** — drive the AI to
  the 50-move cap and assert the turn is handed back (`lastMove.kind === 'forfeit'`,
  `currentSeat` = human seat) and the **human can then move** (protects against a frozen
  board). `aiValidation.test.ts` — a malformed model reply (`"ROLL!"`, `{action:'fly'}`,
  broken JSON) falls back to the heuristic instead of throwing. `aiBoundary.test.ts` —
  asserts the payload handed to the provider contains only the six allowed fields. The live
  LLM path is never hit in tests (no network in CI).

### §10 — Auth hardening
- Passwords bcrypt cost 12; validated by byte length + minimum as in §5.
- **JWT** as pinned in §1 (validated `JWT_SECRET`, `HS256` allowlist, `sub`/`iat`/`exp`),
  carried as a `Bearer` token (I3).
- **Rate limiting (I6).** `app.set('trust proxy', false)` — the demo is a **directly-exposed
  single instance**, so Express must **not** believe any `X-Forwarded-For` header; the
  limiter keys off the real socket IP. (Were it ever put behind exactly one proxy, this
  becomes `1`; documented.) Concrete numbers: `/auth/login` **5/min per (ip +
  normalized-username)**; `/auth/register` **10/hr per ip**; `express.json({ limit: '16kb' })`
  so an oversized body never reaches bcrypt. Per-username-only lockout is deliberately
  rejected (it would let anyone lock any account). The store is **in-memory /
  single-instance** for this demo — documented assumption, not a distributed store.
- Login returns a single generic `INVALID_CREDENTIALS` (no account enumeration); register
  necessarily reveals a taken name — noted as accepted.

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not; a JWT signed
  with a different algorithm/secret is rejected by verify. `rateLimitProxy.test.ts` **(I6)** —
  with `trust proxy` false, requests carrying a forged/rotating `X-Forwarded-For` all key to
  the same socket IP and hit the limit (protects against the spoofable-IP bypass).

### §11 — Error handling & observability
Central Express error middleware: `instanceof` typed errors first (`InvalidInputError`,
`ConflictError`, …) → envelope; `ZodError → INVALID_INPUT`. **Per-signal DB mapping (I4)** —
each database rule maps to its **own** code, never one blanket "finished":
- the finished-game trigger's own SQLSTATE → `409 GAME_FINISHED`;
- the `game_one_live_per_owner` unique-index violation → `409` conflict;
- any other CHECK / constraint failure → a generic `DATABASE_CONSTRAINT` (500-class) —
  **never** silently reported as `GAME_FINISHED`.

Else map by `err.status`; else 500. `app.use` a 404 handler returning `{ error: { code:
'ROUTE_NOT_FOUND' } }`. A request-id is threaded through the injected structured logger, and a
`/health` route is exposed. All responses (including framework errors) exit in the single
envelope, and every route's error codes come from the shared `ErrorCode` union (§1).

- **Verification:** `errors.test.ts` **(I4)** — POST empty body to `/roll` → `error.code ===
  'INVALID_INPUT'`; hit an unknown route → `ROUTE_NOT_FOUND`; trigger the finished-game trigger
  → `GAME_FINISHED` (409); trip the one-live-game unique index → a **conflict** code (not
  `GAME_FINISHED`); trip a value-range CHECK → `DATABASE_CONSTRAINT` (not `GAME_FINISHED`).
  Protects callers from being told "finished" for unrelated rule violations.

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
  exactly one **and `roundScore` is `0`** (I1).

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config (including `JWT_SECRET` validation,
  `FRONTEND_URL` default, CORS wiring **without credentials**, I3), error-envelope +
  `ErrorCode` union (incl. `GAME_ABANDONED`, `DATABASE_CONSTRAINT`) recorded in CLAUDE.md,
  Vitest workspace, test-DB `globalSetup`, documented token-transport trade-off (I3). Confirm
  real installed versions before pinning (Tailwind 4 CSS-first `@import "tailwindcss"` +
  `@theme` + `@tailwindcss/vite`, no `tailwind.config.ts` by default — verify at install).
- **M1 — Auth.** register/login, bcrypt, JWT (12h, HS256, validated secret), rate limits with
  `trust proxy = false` (I6), byte-length/min password and capped username rules,
  `usernameKey` unique index, `Bearer`-from-`localStorage` transport (I3).
- **M2 — Contract (`packages/shared`).** Zod schemas, DTOs (incl. `lastMove`/`busted`,
  `forfeit` kind), `ErrorCode` union, create-game cross-field refine, `expectedVersion`. Both
  apps compile against it before either implements it.
- **M3a — Game happy path.** create / get / roll / hold (with round-score reset on hold, I1),
  read/action guard split, pure engine, playable end-to-end with `curl` at `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, abandon lifecycle with `GAME_ABANDONED`
  (I7), partial unique index, guarded one-time win increment, DB CHECK/trigger invariants
  (finished-game with a distinct SQLSTATE, mode/seat, value ranges), per-signal DB error
  mapping (I4), roll-vs-hold concurrency matrix (I8).
- **M4 — Frontend.** Login, resume, create form, board, 6&6 disable/animation, AI-turn loop,
  abandoned-game notice (I7), session card, error boundary. **This is the first fully
  submittable increment** (core assignment + Extras 1/2/4) — the AI opponent (M5) is strictly
  additive.
- **M5 — AI opponent.** `mode`/`aiSeat`, `AiDecisionProvider` adapter (decision outside the
  transaction, 3s abort deadline (I5), minimal data boundary, output validation), heuristic
  fallback, one-move `ai-turn`, recoverable `aiMoveCount` cap with turn hand-back (I2),
  `Move` rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) behind the adapter and add its key to `.env` at M5 — otherwise
  the heuristic runs.
