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
**outside** any database transaction under an **application-level 3-second deadline**
(`Promise.race`, not the SDK abort signal alone), and each `ai-turn` request applies
**exactly one** validated move — so a slow or hung provider never holds a row lock, never
keeps the HTTP request open, and always falls through to the heuristic. The AI seat is
reachable **only** through `ai-turn`: a human's `roll`/`hold` on the AI seat is rejected.
A per-game AI move cap is **recoverable** and win-safe: a capped move that wins still
finishes the game; otherwise the turn is handed back to the human rather than freezing the
board.

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
  generic `VERSION_CONFLICT`; the frontend recovers from a plain `VERSION_CONFLICT` by
  refetching rather than looping (I7).
- Win-count tracking per user (Extra 1), via a guarded one-time increment credited **only
  to a human winner** (I2); PostgreSQL persistence (Extra 2).
- AI opponent as an LLM adapter with a required heuristic fallback (Extra 3), one validated
  move per request, decision computed outside the DB transaction under an application-level
  3s deadline (I4), reachable only via `ai-turn` (I1), with a recoverable, win-safe
  per-game move cap (I3).
- Brief disable + 6&6 bust animation/message (Extra 4), driven by an explicit DTO field.
- CORS scoped to the frontend origin (no credentials), **required in production** (I6);
  deterministic dice seeding for tests/smoke; test-DB strategy; DB-level invariants
  (finished-game immutability, one live game per owner, valid seat/mode/score ranges), each
  mapped to its **own** error code.
- A per-user gameplay rate limit on `roll`/`hold`/`ai-turn` keyed on the JWT user id (I10).

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking — the single-owner model removes this surface.
- Sound effects (Extra 5) — optional, deferred.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not surfaced.
- Multi-instance / Redis-backed rate-limit store — the demo is single-instance,
  directly exposed (`trust proxy = false`); the in-memory store and its assumption are
  documented, not replaced.

## Issue Resolutions

Fourth-round review of the plan: 12 issues (7 🔴 High, 4 🟡 Medium, 1 🔵 Low), all Fixed via
`auto`. This round builds on the prior 8-issue and 12-issue rounds, whose fixes remain
folded into the Design below.

| ID | Title | Detected by | Resolution | Notes |
|----|-------|------------|------------|-------|
| I1 | Human can play the AI's seat | grok | Fixed (R1) | Action guard rejects `roll`/`hold` on the AI seat with 409 `AI_TURN_REQUIRED`; `ai-turn` is the only path to that seat. §1, §3, §6. |
| I2 | Win count goes up even when the AI wins | grok | Fixed (R2) | Win increment is gated `mode === 'human' \|\| actorSeat !== aiSeat`, so only a human winner is credited. §6. |
| I3 | 50-move AI cap is off by one and can erase a winning move | gpt, z.ai | Fixed (R3) | Evaluate win **before** the cap; cap blocks the 51st attempt (`> 50`). A capped move that wins still finishes. §9. |
| I4 | 3-second AI timeout does not actually bound the request | gpt | Fixed (R4) | Application-level `Promise.race([decide(state, signal), rejectAfter(3000)])`; timeout → heuristic even if the SDK ignores the signal. §9. |
| I5 | Abandon + create are not one atomic step | gpt | Fixed (R5) | `POST /games` wraps abandon + create in one `prisma.$transaction`; partial unique index is the final guard. §7. |
| I6 | CORS silently trusts `localhost:5173` in production | gpt, z.ai | Fixed (R6) | Startup **refuses** in production when `FRONTEND_URL` is unset or points at localhost. §1, §13. |
| I7 | A plain version conflict leaves the UI in a retry loop | z.ai | Fixed (R7) | `apiClient` intercepts 409 `VERSION_CONFLICT`, refetches, updates local version/seat, shows a generic toast. §8. |
| I8 | Error-code list is missing codes its tests require | gpt | Fixed (R8) | `ErrorCode` gains `UNAUTHORIZED` (401), `FORBIDDEN` (403), `GAME_NOT_FOUND` (404), `GAME_CONFLICT`; one status table. §1, §5, §11. |
| I9 | `GameStateDto` relied on everywhere but never fully defined | gpt | Fixed (R9) | Full `GameStateDto` Zod schema written in §5 with nullability + exact `lastMove` variants; created-game state fixed. §5. |
| I10 | Gameplay endpoints have no rate limit | grok | Fixed (R10) | Per-user 60/min limit on `roll`/`hold`/`ai-turn`, keyed on JWT `sub`. §10. |
| I11 | How the AI cap is communicated to the client is undefined | grok | Fixed (R11) | Single channel: `lastMove.kind === 'forfeit'`; `AI_TURN_LIMIT` dropped from `ErrorCode`. §5, §9. |
| I12 | Reference transaction hides where `actorSeat` comes from | grok | Fixed (R12) | `actorSeat` is derived from the locked `game.currentSeat`; never from the request body. §6. |

**Prior rounds (still in force, folded into Design):** hold resets `roundScore` to `0` and
banks the seat total; recoverable AI move cap; `Bearer`-from-`localStorage` transport;
per-signal DB error mapping; AI provider deadline; `trust proxy = false`; `GAME_ABANDONED`
distinct from `VERSION_CONFLICT`; roll-vs-hold concurrency matrix; AI decision outside the
transaction; one validated move per `ai-turn`; fixed-enum parse with heuristic fallback;
mode/seat cross-field refine + DB CHECKs; validated `JWT_SECRET` + `HS256` allowlist;
partial unique index for one-live-game; IP-keyed auth rate limiting; byte-length password +
capped username; guarded one-time win increment; minimal AI data boundary.

## Design

### §1 — Principles & conventions
- **Pure engine boundary.** Game rules are pure functions in `apps/api/src/domain/`
  taking state + an injected `diceRoller` and returning an outcome object. Domain outcomes
  are mapped **field-by-field** into Prisma columns — never spread.
- **Contract lives in `packages/shared`.** Zod schemas are the single source of truth; DTO
  types are `z.infer<typeof …Schema>`. Both apps import them.
- **`ErrorCode` union + HTTP status table (I8, I11).** A single stable union is exported
  from `packages/shared`, and each code has exactly one HTTP status, recorded in one table
  that both the error middleware (§11) and the frontend discriminator (§8) read:

  | Code | HTTP | Meaning |
  |------|------|---------|
  | `INVALID_INPUT` | 400 | Zod/body/param validation failure |
  | `INVALID_CREDENTIALS` | 401 | login failed (generic, no enumeration) |
  | `UNAUTHORIZED` | 401 | missing/invalid/expired JWT |
  | `FORBIDDEN` | 403 | authenticated but not the game owner |
  | `GAME_NOT_FOUND` | 404 | game id not owned/does not exist |
  | `ROUTE_NOT_FOUND` | 404 | unknown route |
  | `VERSION_CONFLICT` | 409 | stale `expectedVersion` (recoverable, §8) |
  | `GAME_ABANDONED` | 409 | acted on a game abandoned out from under the client |
  | `GAME_FINISHED` | 409 | write attempted on a finished/abandoned game (DB trigger) |
  | `GAME_CONFLICT` | 409 | one-live-game unique-index violation |
  | `AI_TURN_REQUIRED` | 409 | human `roll`/`hold` attempted on the AI seat (I1) |
  | `RATE_LIMITED` | 429 | auth or gameplay rate limit exceeded (§10) |
  | `DATABASE_CONSTRAINT` | 500 | any other CHECK/constraint failure (never mis-reported) |

  `AI_TURN_LIMIT` is **not** an error code (I11): the AI move cap is a *successful* response
  signalled solely by `lastMove.kind === 'forfeit'` (§5, §9).
- **Error envelope.** Success responses return the **bare DTO**; errors return the envelope
  `{ error: { code, message } }`, `code` drawn only from the union above. Decision recorded
  in CLAUDE.md at M0.
- **JWT.** `JWT_SECRET` is loaded and validated at startup (reject if missing or under
  ~32 bytes). Tokens are signed and verified with an explicit single algorithm
  (`{ algorithm: 'HS256' }` / `{ algorithms: ['HS256'] }`) and carry `sub` (user id) +
  `iat`/`exp`. Closes both the forge-a-token and algorithm-swap paths.
- **Token transport.** The token is a **`Bearer` token the client holds in `localStorage`**
  and sends in the `Authorization` header. CORS therefore runs **without** `credentials`
  (no cookies). Accepted trade-off: `localStorage` is readable by injected script (XSS),
  mitigated by shipping no third-party script and escaping all rendered state; in exchange
  there is **no cookie, hence no CSRF surface**. Documented in CLAUDE.md at M0.
- **CORS (I6).** `app.use(cors({ origin: env.FRONTEND_URL }))` — **no `credentials`**, never
  `'*'`. `FRONTEND_URL` **defaults to `http://localhost:5173`** only outside production; in
  production, startup **refuses to boot** when it is unset or contains `localhost`
  (`if (isProduction && (!FRONTEND_URL || FRONTEND_URL.includes('localhost'))) throw new
  ConfigError('FRONTEND_URL is required in production')`). Fails loudly rather than guessing
  a dev origin or silently rejecting all real users.
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
  aiMoveCount   Int     @default(0) // per-game AI move counter, hard cap 50 (I3)
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
  kind       MoveKind // roll | hold | forfeit  (forfeit = AI cap hand-back, I3)
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
  finished/abandoned game is immutable), raising a **distinct SQLSTATE** (custom `PLpgSQL`
  `RAISE ... USING ERRCODE`) so §11 maps it to `GAME_FINISHED` without swallowing other
  constraint failures.
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
  Protects the invariants — and the code that distinguishes them (§11) — at the layer that
  enforces them.

### §3 — Authorization guards
- **Read guard** — caller's JWT `sub === game.ownerUserId`; otherwise `403 FORBIDDEN`, or
  `404 GAME_NOT_FOUND` when the game does not exist. Used by `GET /games/:id`.
- **Action guard (I1)** — read guard **AND** the action targets `game.currentSeat` **AND**
  the current seat is a **human** seat. When `game.mode === 'ai' && game.currentSeat ===
  game.aiSeat`, a `roll`/`hold` is rejected with `409 AI_TURN_REQUIRED` — making `ai-turn`
  the *only* path to the AI seat and closing the "human decides the AI's dice" bypass. Used
  by `roll`, `hold`.
- **AI-turn guard** — read guard **AND** `game.mode === 'ai'` **AND**
  `game.currentSeat === game.aiSeat`. Documented as the one endpoint that deliberately does
  **not** use the action guard (it is the *inverse* seat check), so a later reader doesn't
  "fix" it back.

- **Verification:** `authGuards.test.ts` — (a) a non-owner gets `403 FORBIDDEN` on every
  game route; (b) the owner `GET`s a game whose current seat differs from the seat just
  acted and gets **200** (the 409-recovery case); (c) `ai-turn` on a `human` game, or when
  the current seat isn't `aiSeat`, returns 409; (d) **a manual `roll`/`hold` while the AI
  seat is current returns `409 AI_TURN_REQUIRED`** (protects I1 — regresses to letting a
  human play the AI if broken).

### §4 — Domain engine (`apps/api/src/domain/`)
Pure, dice injected:
```ts
type RollOutcome = { dice: [number, number]; busted: boolean; nextRoundScore: number; nextCurrentSeat: 1 | 2 };
type HoldOutcome = { seatTotal: number; nextRoundScore: 0; nextCurrentSeat: 1 | 2; won: boolean };
```
- `roll`: two dice via injected `diceRoller`; `6 & 6` → `busted`, round score lost, seat
  passes; else round score += sum, seat stays.
- `hold`: compute the acting seat's new total as `seatTotal = priorSeatTotal + roundScore`;
  set `nextRoundScore = 0` (the round counter is always cleared on hold); if
  `seatTotal >= targetScore` → `won`, else pass the seat. The outcome carries **both** the
  banked `seatTotal` and the zeroed `nextRoundScore`, so the persistence layer (§6) writes
  the seat score and clears the round without recomputing.
- The DTO's `lastMove`/`busted` fields (§5) are derived from the outcome at the persistence
  layer.

- **Verification:** `engine.test.ts` (node, no DB) — bust on `[6,6]`, accumulation on other
  rolls, **hold banks the round score into the seat total and returns `nextRoundScore: 0`**
  (regresses to double-count if broken), hold-to-win sets `won`, seat alternation. Narrowest
  layer; proves the rules without HTTP or DB.

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

- **Full `GameStateDto` schema (I9).** Written explicitly in `packages/shared`; every field's
  nullability is fixed so two developers cannot build divergent DTOs and the frontend never
  reads a field the API doesn't send:

  ```ts
  const LastMoveSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('roll'), dice: z.tuple([z.number(), z.number()]), busted: z.boolean() }),
    z.object({ kind: z.literal('hold') }),
    z.object({ kind: z.literal('forfeit') }),               // AI cap hand-back (I3, I11)
  ]);

  const GameStateSchema = z.object({
    id: z.string(),
    mode: z.enum(['human', 'ai']),
    aiSeat: z.union([z.literal(1), z.literal(2)]).nullable(),   // null when mode='human'
    targetScore: z.number(),
    status: z.enum(['in_progress', 'finished', 'abandoned']),
    currentSeat: z.union([z.literal(1), z.literal(2)]),
    p1Score: z.number(),
    p2Score: z.number(),
    roundScore: z.number(),
    lastDice: z.array(z.number()),                             // [] before the first roll
    winnerSeat: z.union([z.literal(1), z.literal(2)]).nullable(),
    version: z.number(),
    lastMove: LastMoveSchema.nullable(),                       // null on a freshly created game
    busted: z.boolean(),                                       // mirrors lastMove.busted; false when no move yet
  });
  ```

- **Created-game initial state (I9).** A freshly created game returns `lastMove: null`,
  `busted: false`, `lastDice: []`, `roundScore: 0`, `winnerSeat: null`. The frontend
  **must** handle `lastMove === null` before the first roll (guarded render), removing the
  first-render crash.

- **`lastMove` semantics per transition.**
  - normal roll → `{ kind: 'roll', dice, busted: false }`
  - bust → `{ kind: 'roll', dice: [6,6], busted: true }`, `roundScore: 0`
  - hold / win → `{ kind: 'hold' }`, `roundScore: 0`
  - AI cap hand-back → `{ kind: 'forfeit' }` (I3) — the **only** channel signalling the cap
    (I11); the request is a normal 200 success, not an error.
  - **Held dice on hold:** `lastDice` is **retained** through a hold (the final roll stays
    visible) and only reset on the next roll; documented so the UI is deterministic.

- **Create-game cross-field rule.** The schema `.refine`s
  `d => d.mode === 'ai' ? (d.aiSeat === 1 || d.aiSeat === 2) : d.aiSeat == null`, mirrored by
  the DB CHECKs in §2 — an impossible game is impossible to store.

- **Auth input rules.** Password: validate UTF-8 **byte** length explicitly
  (`new TextEncoder().encode(pw).length <= 72`, the bcrypt limit) **and** a minimum
  (`>= 8` chars). Username: `min 3, max 30`, normalized (trim + NFKC + lowercase →
  `usernameKey`) **before** length/uniqueness checks.

- **Validation:** an Express middleware runs `Schema.parse()` on body/params per route; a
  roll body carrying `dice` fails `z.strictObject({ expectedVersion })` → `400 INVALID_INPUT`.
  **Verification:** `validation.test.ts` asserts that 400, plus the create-game refine
  rejections and the password byte/min and username cap rejections, plus that a parsed
  `GameStateDto` round-trips through `GameStateSchema` including the `lastMove: null`
  created-game case (protects I9).

### §6 — Roll/hold transaction (reference implementation)
```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`; // row lock
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  const actorSeat = game.currentSeat;                     // I12: derived from the LOCKED row, never the body
  assertActionGuard(game, actorSeat);                     // I1: rejects the AI seat with AI_TURN_REQUIRED
  const outcome = hold(toState(game));                    // pure engine (roll path analogous)
  const updated = await tx.game.updateMany({
    where: { id, version: expectedVersion, status: 'in_progress' },
    data: {
      version: { increment: 1 },
      currentSeat: outcome.nextCurrentSeat,
      roundScore: outcome.nextRoundScore,                 // 0 on hold
      ...(actorSeat === 1 ? { p1Score: outcome.seatTotal } : { p2Score: outcome.seatTotal }),
      ...(outcome.won ? { status: 'finished', winnerSeat: actorSeat } : {}),
      // lastDice deliberately NOT written on hold — the last roll stays visible
    },
  });
  if (updated.count === 0) {
    const fresh = await tx.game.findUnique({ where: { id } });
    if (fresh?.status === 'abandoned') throw new ConflictError('GAME_ABANDONED'); // distinct from a version race
    throw new ConflictError('VERSION_CONFLICT');
  }
  if (outcome.won && (game.mode === 'human' || actorSeat !== game.aiSeat)) {      // I2: credit only a HUMAN winner
    await tx.user.update({ where: { id: game.ownerUserId }, data: { wins: { increment: 1 } } });
  }
  await tx.move.create({ data: {
    gameId: id, actorSeat, kind: 'hold',
    dice: game.lastDice, busted: false, roundScore: 0,
  }});
  return tx.game.findUniqueOrThrow({ where: { id } });
});
```
The roll path is the same shape, writing `lastDice`/`roundScore` from `RollOutcome` and a
`kind: 'roll'` move. **`actorSeat` is always the locked `game.currentSeat` (I12)** — no seat
is ever accepted from the request body, so the race the lock closes stays closed. **Win
credit (I2):** the guarded one-time increment runs only when the winning seat is a *human*
seat, so an AI victory never credits the human owner. **Zero-row update:** re-read the row
before assuming a version race; if it is now `abandoned`, throw `GAME_ABANDONED`.

- **Verification:** `concurrency.test.ts` — race two rolls, race `roll`+`hold`, and race
  `hold`+`roll`, each pair on the **same** `expectedVersion`; every pair asserts exactly one
  200 and one 409 `VERSION_CONFLICT`. `hold.test.ts` — a hold raises the seat total by the
  round score, leaves `roundScore` at `0`, keeps `lastDice` showing the last roll.
  `lifecycle.test.ts` — abandon a game between read and write; assert the in-flight roll
  returns **`GAME_ABANDONED`**, not a bare version conflict. `winIncrement.test.ts` — fire a
  winning **human** hold twice and assert `wins` rises by **exactly one**; fire a winning
  **AI** hold (via `ai-turn`) and assert the owner's `wins` is **unchanged** (protects I2).

### §7 — New-game / abandon lifecycle
`POST /games` runs abandon + create in **one `prisma.$transaction` (I5)** so the owner is
never left with no playable game and two near-simultaneous creates cannot interleave:

```ts
await prisma.$transaction(async (tx) => {
  await tx.game.updateMany({
    where: { ownerUserId, status: 'in_progress' },
    data: { status: 'abandoned', version: { increment: 1 } },   // in-flight rolls hit the status filter → GAME_ABANDONED (§6)
  });
  return tx.game.create({ data: { ownerUserId, targetScore, mode, aiSeat, /* … */ } });
});
```
The **partial unique index** (`game_one_live_per_owner`) is the final concurrency guard: if
two transactions race, one create hits the unique violation, translated to `409 GAME_CONFLICT`
(§11, distinct from `GAME_FINISHED`). Because abandon and create share one transaction, a
create failure rolls the abandon back — the old game survives rather than vanishing.

- **Verification:** `newGame.test.ts` — two near-simultaneous `POST /games` for one owner
  yield exactly one live game (one 201, one `409 GAME_CONFLICT`); a create forced to fail
  after the abandon leaves the **original** game still `in_progress` (protects I5's
  atomicity); `GET /games?status=in_progress` returns at most one.

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game form
  (with the `targetScore` input, 10–1000, and mode/aiSeat selection).
- **Token handling:** on login/register the returned token is stored in `localStorage`;
  `apiClient` attaches `Authorization: Bearer <token>` to every request. No cookies are set
  or read. Logout / a 401 (`UNAUTHORIZED`) clears the stored token.
- **Version-conflict recovery (I7).** `apiClient` intercepts a `409 VERSION_CONFLICT`
  centrally: it **refetches `GET /games/:id`**, updates the local `version` and derived
  `currentSeat` from the fresh state, re-enables the buttons, and shows a generic "the game
  moved on — try again" toast. This breaks the stale-version infinite loop (a click in a
  stale tab no longer resends the same dead version forever). `GAME_ABANDONED` keeps its own
  distinct handling below.
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box.
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`. The board **guards on `lastMove === null`** (freshly
  created game, I9) so the first render never dereferences a move that hasn't happened.
- **6&6 bust (Extra 4):** when `state.busted` is true, disable actions ~1.2s and show the
  bust message/animation, with `state.lastMove.dice` (`[6,6]`) visible during it.
- **AI turn:** when `state.mode === 'ai'` and `state.currentSeat === state.aiSeat`, the client
  calls `POST /games/:id/ai-turn` **once per returned state** and re-calls while the AI seat is
  still current (mirrors the server's one-move-per-request contract). A `lastMove.kind ===
  'forfeit'` state (the recoverable cap, I3/I11) hands the turn back to the human and stops
  the loop, showing an "AI gave up its turn" message — driven **solely** by that field, no
  error envelope.
- **Abandoned-game notice:** a `GAME_ABANDONED` response shows "this game was abandoned —
  starting fresh" and reloads `GET /games?status=in_progress`, rather than the generic
  conflict toast.
- **Session recovery:** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen` renders an
  inline re-login card while the board stays mounted; token lifetime `12h` (documented as
  non-revocable — acceptable stateless trade-off for a take-home).
- **Winner highlight:** highlight `winnerSeat` explicitly.
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; a **created-game state with `lastMove: null`
  renders without crashing** (protects I9); clicking Roll calls the client with the current
  `version`; a `busted` response disables buttons; a `GAME_ABANDONED` response shows the
  abandoned notice. `versionConflict.test.tsx` **(I7)** — a `409 VERSION_CONFLICT` triggers a
  refetch and the **next** click carries the refreshed version (protects against the retry
  loop). `aiLoop.test.tsx` — given successive states where the AI seat stays current, the
  client re-issues `ai-turn` and stops when the seat passes or a `forfeit` state returns,
  showing the "AI gave up" message from `lastMove.kind` (I11).

### §9 — AI opponent (Extra 3)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`. The human can never drive this seat by hand (I1, §3).
- **One move per request.** Each `ai-turn` request: (1) re-reads game state under the row
  lock, (2) re-checks `expectedVersion` and derives the actor seat from the fresh
  `currentSeat`, (3) computes **one** decision, (4) applies it through the §6 transaction,
  bumping `version` and incrementing `aiMoveCount`, (5) returns fresh state. The client
  re-calls while the AI seat is still current.
- **Outcome-then-cap ordering (I3).** After the AI move is computed, the server evaluates in
  this strict order so a winning move is never erased by the cap:
  ```ts
  if (outcome.won) finish();                               // a winning move ALWAYS finishes, even the capped one
  else if (nextAiMoveCount > 50) forfeitToHuman();         // cap blocks the 51st attempt, not the 50th
  else applyNormalMove();
  ```
  `forfeitToHuman()` writes, in the same guarded update, `currentSeat = the non-AI seat` and
  `lastMove: { kind: 'forfeit' }`, bumps `version`, and returns that state — the board stays
  playable and the human can immediately act. There is no separate error code (I11).
- **Decision computed outside the transaction.** The order is strictly:
  read state → `AiDecisionProvider.decide(state)` (may hit the network) → validate → open a
  short, fast transaction to write the one move. **No network `await` ever happens while a
  `FOR UPDATE` lock or open transaction is held.**
- **Application-level deadline (I4).** The provider call is bounded by
  `await Promise.race([provider.decide(state, signal), rejectAfter(3000)])`, where
  `rejectAfter` rejects on its own timer and `signal` is `AbortSignal.timeout(3000)` passed
  into the SDK so a cooperative provider also cancels. The `Promise.race` guarantees the
  handler returns within the deadline **even if the SDK ignores the signal or hangs during
  cleanup** — the exact hang the SDK-signal-only approach left open. A race timeout is
  treated **exactly like a parse failure** → heuristic. The 3000ms value is a named constant,
  documented alongside the AI comment.
- **Data boundary.** A single `AiDecisionProvider.decide(state)` adapter is the only thing
  the model sees, receiving only
  `{ targetScore, currentSeat, seatTotal, roundScore, lastDice, legalActions }` — never the
  token, username, raw DB rows, user-supplied text, or error details.
- **Output validation.** The model reply is parsed with a fixed schema before execution:
  `z.object({ action: z.enum(['roll','hold']) }).parse(modelOutput)`. A parse failure is
  treated **exactly like a timeout** — fall through to the heuristic.
- **Heuristic fallback (required).** If no API key, no network, the LLM errors/times out, or
  the reply fails validation, the adapter falls back to a deterministic heuristic
  (`hold` once `seatTotal + roundScore >= targetScore` or `roundScore >= 20`, else `roll`).
  Keeps the demo and CI offline and deterministic.

- **Verification:** `ai.test.ts` runs a turn with the LLM path **mocked/disabled** so the
  heuristic drives it, seeded dice (`DICE_SEED`), asserting a single move advances state and
  bumps version. `aiTimeout.test.ts` **(I4)** — **two** providers: one that ignores the abort
  signal and hangs, one that honors it; both must return within the deadline via
  `Promise.race` and drive the move from the heuristic (protects against an indefinitely-open
  request even with an uncooperative SDK). `aiCap.test.ts` **(I3)** — (a) drive the AI to the
  cap and assert the turn is handed back (`lastMove.kind === 'forfeit'`, `currentSeat` =
  human seat) and the human can then move; (b) **a move that both hits the cap boundary and
  wins finishes the game** (`status === 'finished'`, `winnerSeat` set) rather than forfeiting
  (protects the win-override bug). `aiValidation.test.ts` — a malformed model reply
  (`"ROLL!"`, `{action:'fly'}`, broken JSON) falls back to the heuristic. `aiBoundary.test.ts`
  — the payload handed to the provider contains only the six allowed fields. The live LLM
  path is never hit in tests (no network in CI).

### §10 — Auth & gameplay hardening
- Passwords bcrypt cost 12; validated by byte length + minimum as in §5.
- **JWT** as pinned in §1 (validated `JWT_SECRET`, `HS256` allowlist, `sub`/`iat`/`exp`),
  carried as a `Bearer` token.
- **Auth rate limiting.** `app.set('trust proxy', false)` — the demo is a **directly-exposed
  single instance**, so Express must **not** believe any `X-Forwarded-For` header; the
  limiter keys off the real socket IP. (Behind exactly one proxy this becomes `1`;
  documented.) `/auth/login` **5/min per (ip + normalized-username)**; `/auth/register`
  **10/hr per ip**; `express.json({ limit: '16kb' })` so an oversized body never reaches
  bcrypt. Per-username-only lockout is deliberately rejected. Over-limit → `429 RATE_LIMITED`.
- **Gameplay rate limiting (I10).** A modest per-user limit of **60/min** on `roll`, `hold`,
  and `ai-turn`, keyed on the authenticated **JWT `sub`** (not IP, so it holds across the
  single-owner two-seat model), documented next to the auth limits. Caps a tight `ai-turn`
  loop against a live LLM key from running up cost and DB load. Over-limit → `429
  RATE_LIMITED`. The store is **in-memory / single-instance** for this demo — documented
  assumption, not a distributed store.
- Login returns a single generic `INVALID_CREDENTIALS` (no account enumeration); register
  necessarily reveals a taken name — noted as accepted.

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not; a JWT
  signed with a different algorithm/secret is rejected by verify. `rateLimitProxy.test.ts` —
  with `trust proxy` false, requests carrying a forged/rotating `X-Forwarded-For` all key to
  the same socket IP and hit the limit. `gameplayRateLimit.test.ts` **(I10)** — 61
  `ai-turn`/`roll` calls from one authenticated user within a minute get a `429 RATE_LIMITED`
  on the last, and a **different** user's calls are unaffected (protects the per-user key).

### §11 — Error handling & observability
Central Express error middleware: `instanceof` typed errors first (`InvalidInputError`,
`ConflictError`, `ForbiddenError`, `NotFoundError`, …) → envelope; `ZodError → INVALID_INPUT`.
Auth middleware failures → `401 UNAUTHORIZED`. **Per-signal DB mapping** — each database rule
maps to its **own** code, never one blanket "finished":
- the finished-game trigger's own SQLSTATE → `409 GAME_FINISHED`;
- the `game_one_live_per_owner` unique-index violation → `409 GAME_CONFLICT`;
- any other CHECK / constraint failure → `500 DATABASE_CONSTRAINT` — **never** silently
  reported as `GAME_FINISHED`.

Else map by `err.status`; else 500. `app.use` a 404 handler returning
`{ error: { code: 'ROUTE_NOT_FOUND' } }`. A request-id is threaded through the injected
structured logger, and a `/health` route is exposed. All responses (including framework
errors) exit in the single envelope, and every code comes from the shared `ErrorCode` union
and its status table (§1).

- **Verification:** `errors.test.ts` — POST empty body to `/roll` → `INVALID_INPUT` (400);
  unknown route → `ROUTE_NOT_FOUND` (404); missing/garbage JWT → `UNAUTHORIZED` (401);
  non-owner → `FORBIDDEN` (403); unknown game id → `GAME_NOT_FOUND` (404); finished-game
  trigger → `GAME_FINISHED` (409); one-live-game unique index → `GAME_CONFLICT` (409, not
  `GAME_FINISHED`); a value-range CHECK → `DATABASE_CONSTRAINT` (500, not `GAME_FINISHED`).
  Protects callers from being told "finished" for unrelated rule violations and pins every
  status in the §1 table (I8).

### §12 — Test strategy
- Vitest **workspace**: `apps/web` under `environment: 'jsdom'` + Testing Library;
  `apps/api` under `node`.
- API suites run **serial** (`singleThread: true`) with a `truncateAll()` helper in
  `beforeEach`, against a disposable PostgreSQL that `globalSetup` migrates via
  `prisma migrate deploy`. (Real PostgreSQL is used for tests — SQLite is never involved, so
  raw-SQL triggers/CHECKs are exercised as in production.)

### §13 — Determinism, config & smoke
- `DICE_SEED` env (validated in `config/env.ts`, **refused when `NODE_ENV==='production'`**)
  swaps `diceRoller` for a seeded generator.
- `FRONTEND_URL` is validated in the same `config/env.ts`: **required and non-localhost in
  production** (I6), defaulted to `http://localhost:5173` otherwise. A missing production
  value is a startup failure, tested in `env.test.ts`.
- Smoke run: create a game at `targetScore: 10`, force `[6,6]` via the seed, assert round
  cleared + seat passed, then hold to a win and assert the winner's `wins` incremented by
  exactly one **and `roundScore` is `0`**.

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config (`JWT_SECRET` validation, `FRONTEND_URL`
  production-required (I6), CORS **without credentials**), error-envelope + `ErrorCode` union
  and status table (§1, incl. `UNAUTHORIZED`/`FORBIDDEN`/`GAME_NOT_FOUND`/`GAME_CONFLICT`
  (I8), no `AI_TURN_LIMIT` (I11)) recorded in CLAUDE.md, Vitest workspace, test-DB
  `globalSetup`, documented token-transport trade-off. Confirm real installed versions
  before pinning (Tailwind 4 CSS-first `@import "tailwindcss"` + `@theme` +
  `@tailwindcss/vite`, no `tailwind.config.ts` by default — verify at install).
- **M1 — Auth.** register/login, bcrypt, JWT (12h, HS256, validated secret), auth rate limits
  with `trust proxy = false`, byte-length/min password and capped username rules,
  `usernameKey` unique index, `Bearer`-from-`localStorage` transport.
- **M2 — Contract (`packages/shared`).** Zod schemas, the full `GameStateDto` schema with
  fixed nullability + `lastMove` discriminated union (I9), `ErrorCode` union + status table,
  create-game cross-field refine, `expectedVersion`. Both apps compile against it before
  either implements it.
- **M3a — Game happy path.** create / get / roll / hold (round-score reset on hold),
  read/action guard split incl. the AI-seat rejection (I1), `actorSeat` from the locked row
  (I12), pure engine, playable end-to-end with `curl` at `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, atomic abandon+create transaction (I5)
  with `GAME_ABANDONED`, partial unique index → `GAME_CONFLICT`, guarded one-time win
  increment credited only to a human winner (I2), DB CHECK/trigger invariants (finished-game
  distinct SQLSTATE, mode/seat, value ranges), per-signal DB error mapping, per-user gameplay
  rate limit (I10), roll-vs-hold concurrency matrix.
- **M4 — Frontend.** Login, resume, create form, board (guarding `lastMove === null`, I9),
  6&6 disable/animation, AI-turn loop, `VERSION_CONFLICT` refetch-recovery (I7),
  abandoned-game notice, session card, error boundary. **First fully submittable increment**
  (core assignment + Extras 1/2/4) — the AI opponent (M5) is strictly additive.
- **M5 — AI opponent.** `mode`/`aiSeat`, `AiDecisionProvider` adapter (decision outside the
  transaction, application-level 3s `Promise.race` deadline (I4), minimal data boundary,
  output validation), heuristic fallback, one-move `ai-turn`, win-safe recoverable
  `aiMoveCount` cap with `forfeit` hand-back (I3), `forfeit` as the sole cap channel (I11),
  `Move` rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) behind the adapter and add its key to `.env` at M5 — otherwise
  the heuristic runs.
