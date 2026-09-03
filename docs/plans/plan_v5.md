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
(`Promise.race`, which only bounds *waiting* — it does not cancel the provider), and each
`ai-turn` request applies **exactly one** validated move. A **single-flight claim** keyed on
`(gameId, expectedVersion)` guards the paid LLM call so a double-click or two tabs can never
bill two model calls for one committed move (I2). A slow or hung provider never holds a row
lock, never keeps the HTTP request open, and always falls through to the heuristic. The AI
seat is reachable **only** through `ai-turn`: a human's `roll`/`hold` on the AI seat is
rejected. A per-game AI move cap is **recoverable** and win-safe.

Delivered as a TypeScript monorepo: `apps/api` (Express + Prisma + PostgreSQL),
`apps/web` (React + Vite + Tailwind), and `packages/shared` (Zod schemas + DTOs shared by
both sides). **Auth is cookie-based (I1):** the JWT lives in an `HttpOnly; Secure;
SameSite=Lax` cookie the browser attaches automatically — no token in `localStorage`, no
`Authorization` header. Because a cookie re-opens the CSRF surface, the auth section closes
it in the same design: credentialed CORS pinned to an exact origin, a double-submit CSRF
token on every state-changing request, a real `POST /auth/logout`, and a `tokenVersion`
denylist for revocation.

## Scope

**In scope**
- Auth: register + login (bcrypt, JWT with pinned secret/algorithm), rate-limited; only
  authenticated users create/play. **Token transport is an `HttpOnly` cookie (I1)**; CORS
  runs **with** `credentials: true` against an exact origin.
- CSRF defense (I1): double-submit token — a readable `csrfToken` cookie echoed by the
  frontend in an `X-CSRF-Token` header on every state-changing POST, compared server-side,
  alongside `SameSite=Lax`.
- `POST /auth/logout` that clears the auth + CSRF cookies, plus a `tokenVersion` integer on
  `User` embedded in the JWT and checked on every request, for real revocation (I1).
- Single-owner / two-seat game model; full rule enforcement server-side, including a hold
  that banks the round score into the seat total and resets `roundScore` to `0`.
- Endpoints: register, login, logout, list-my-games, create game, get game, roll, hold, ai-turn.
- Optimistic concurrency (client-supplied `expectedVersion` + row lock), re-checked on
  every move including AI moves, so a double-click cannot produce a second roll. A move
  whose game was abandoned out from under it returns a distinct `GAME_ABANDONED`, not a
  generic `VERSION_CONFLICT`; the frontend recovers from a plain `VERSION_CONFLICT` by
  refetching rather than looping.
- Win-count tracking per user (Extra 1), via a guarded one-time increment credited **only
  to a human winner**; PostgreSQL persistence (Extra 2).
- AI opponent as an LLM adapter with a required heuristic fallback (Extra 3), one validated
  move per request, a **single-flight claim + bounded provider semaphore** so one committed
  move costs at most one LLM call and a hung provider cannot pile up unbounded in-flight
  work (I2), decision computed outside the DB transaction under an application-level 3s
  deadline, reachable only via `ai-turn`, with a recoverable, win-safe per-game move cap.
- Brief disable + 6&6 bust animation/message (Extra 4), driven by an explicit DTO field.
- CORS scoped to the frontend origin **with credentials**, **required in production**;
  deterministic dice seeding for tests/smoke; test-DB strategy; DB-level invariants
  (finished-game immutability, one live game per owner, valid seat/mode/score ranges, plus
  value-range `CHECK`s on `targetScore`, dice, and `aiMoveCount` — I3), each mapped to its
  **own** error code.
- A per-user gameplay rate limit on `roll`/`hold`/`ai-turn` keyed on the JWT user id.

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking — the single-owner model removes this surface.
- Full refresh-token rotation — the `tokenVersion` denylist is the lightweight revocation
  middle ground for a take-home (see the accepted-trade-off note in §1).
- Sound effects (Extra 5) — optional, deferred.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not surfaced.
- Multi-instance / Redis-backed rate-limit store — the demo is single-instance,
  directly exposed (`trust proxy = false`); the in-memory store and its assumption are
  documented, not replaced.

## Issue Resolutions

Fifth-round review of the plan: 7 issues (1 🟣 Blocker, 1 🔴 High, 5 🟡 Medium), all Fixed
via `auto`. This round builds on the prior 8-, 12-, and 12-issue rounds, whose fixes remain
folded into the Design below.

| ID | Title | Detected by | Resolution | Notes |
|----|-------|------------|------------|-------|
| I1 | Login token must live in a cookie, not `localStorage` — and that drags CSRF, CORS, and logout with it | gpt, grok, Developer, Claude | Fixed (R1) | JWT moves to an `HttpOnly; Secure; SameSite=Lax` cookie; CORS flips to `credentials: true` + exact origin; double-submit CSRF token on every state-changing POST; `POST /auth/logout` + `tokenVersion` revocation. The "no cookie, hence no CSRF" rationale is deleted. §1, §3, §5, §8, §10, §13. |
| I2 | AI "think" step runs outside the lock with no single-flight guard → one move can bill two LLM calls and leak a hung request | gpt | Fixed (R2) | `claimAiTurn(gameId, expectedVersion)` before the LLM call (loser refetches); a bounded provider semaphore; timed-out provider requests are recorded. `Promise.race` documented as bounding *waiting only*, not cancelling the provider. §9. |
| I3 | Several "impossible" game states can still be written straight to the DB | gpt | Fixed (R3) | Add DB `CHECK`s: `target_score BETWEEN 10 AND 1000`, `cardinality(last_dice) IN (0,2)`, per-die 1–6, `ai_move_count <= 50`. §2. |
| I4 | Shared schema calls numbers the "single source of truth" but accepts `NaN`, `1.5`, negatives | gpt | Fixed (R4) | Pin `expectedVersion: z.number().int().nonnegative()`; scores/`version` non-negative ints; `targetScore` int 10–1000; `lastDice` a bounded tuple of 1–6 (or empty). §5. |
| I5 | Login reveals whether a username exists via response *timing* | gpt | Fixed (R5) | Always run one bcrypt comparison against a constant `DUMMY_BCRYPT_HASH` when the user is missing. §5, §10. |
| I6 | AI forfeit write described but never shown reusing the guarded, version-checked update | grok | Fixed (R6) | Forfeit path shown as a full snippet through the same guarded `updateMany` as §6; zero-row → `VERSION_CONFLICT`/`GAME_ABANDONED`. §9. |
| I7 | What `GET /games/:id` returns for an *abandoned* game left undefined | grok | Fixed (R7) | `GET /games/:id` returns the full `GameStateDto` for `status = 'abandoned'`/`'finished'` (read guard still applies); the UI shows the notice from that state. §3, §5, §8. |

**Prior rounds (still in force, folded into Design):** action guard rejects human play on the
AI seat (`AI_TURN_REQUIRED`); win increment credited only to a human winner; outcome-then-cap
ordering so a winning capped move still finishes; atomic abandon+create transaction; CORS
production refusal; central `VERSION_CONFLICT` refetch recovery; complete `ErrorCode` union +
status table; full `GameStateDto` schema; per-user gameplay rate limit; `forfeit` as the sole
cap channel; `actorSeat` derived from the locked row; hold resets `roundScore` to `0` and
banks the seat total; per-signal DB error mapping; AI provider 3s deadline; `trust proxy =
false`; `GAME_ABANDONED` distinct from `VERSION_CONFLICT`; roll-vs-hold concurrency matrix; AI
decision outside the transaction; one validated move per `ai-turn`; fixed-enum parse with
heuristic fallback; mode/seat cross-field refine + DB CHECKs; validated `JWT_SECRET` + `HS256`
allowlist; partial unique index for one-live-game; IP-keyed auth rate limiting; byte-length
password + capped username; minimal AI data boundary.

## Design

### §1 — Principles & conventions
- **Pure engine boundary.** Game rules are pure functions in `apps/api/src/domain/`
  taking state + an injected `diceRoller` and returning an outcome object. Domain outcomes
  are mapped **field-by-field** into Prisma columns — never spread.
- **Contract lives in `packages/shared`.** Zod schemas are the single source of truth; DTO
  types are `z.infer<typeof …Schema>`. Both apps import them.
- **`ErrorCode` union + HTTP status table.** A single stable union is exported from
  `packages/shared`, and each code has exactly one HTTP status, recorded in one table that
  both the error middleware (§11) and the frontend discriminator (§8) read:

  | Code | HTTP | Meaning |
  |------|------|---------|
  | `INVALID_INPUT` | 400 | Zod/body/param validation failure |
  | `INVALID_CREDENTIALS` | 401 | login failed (generic, no enumeration) |
  | `UNAUTHORIZED` | 401 | missing/invalid/expired JWT, or stale `tokenVersion` |
  | `CSRF_INVALID` | 403 | missing/mismatched double-submit CSRF token (I1) |
  | `FORBIDDEN` | 403 | authenticated but not the game owner |
  | `GAME_NOT_FOUND` | 404 | game id not owned/does not exist |
  | `ROUTE_NOT_FOUND` | 404 | unknown route |
  | `VERSION_CONFLICT` | 409 | stale `expectedVersion` (recoverable, §8) |
  | `GAME_ABANDONED` | 409 | acted on a game abandoned out from under the client |
  | `GAME_FINISHED` | 409 | write attempted on a finished/abandoned game (DB trigger) |
  | `GAME_CONFLICT` | 409 | one-live-game unique-index violation |
  | `AI_TURN_REQUIRED` | 409 | human `roll`/`hold` attempted on the AI seat |
  | `RATE_LIMITED` | 429 | auth or gameplay rate limit exceeded (§10) |
  | `DATABASE_CONSTRAINT` | 500 | any other CHECK/constraint failure (never mis-reported) |

  `AI_TURN_LIMIT` is **not** an error code: the AI move cap is a *successful* response
  signalled solely by `lastMove.kind === 'forfeit'` (§5, §9).
- **Error envelope.** Success responses return the **bare DTO**; errors return the envelope
  `{ error: { code, message } }`, `code` drawn only from the union above. Decision recorded
  in CLAUDE.md at M0.
- **JWT.** `JWT_SECRET` is loaded and validated at startup (reject if missing or under
  ~32 bytes). Tokens are signed and verified with an explicit single algorithm
  (`{ algorithm: 'HS256' }` / `{ algorithms: ['HS256'] }`) and carry `sub` (user id),
  **`tokenVersion`**, and `iat`/`exp`. Closes the forge-a-token and algorithm-swap paths.
- **Token transport (I1) — cookie, not `localStorage`.** On register/login the server sets
  the JWT in an **`HttpOnly; Secure; SameSite=Lax; Path=/`** cookie (`Secure` relaxed only
  outside production so local http dev works). The browser attaches it automatically; the
  frontend **never** reads the token, never touches `localStorage`, and sends **no
  `Authorization` header**. Auth middleware reads the JWT from the cookie, verifies it, and
  additionally checks the JWT's `tokenVersion` equals the user's current `tokenVersion`
  (§2) → a bumped value invalidates every outstanding token. A failed/absent/stale cookie →
  `401 UNAUTHORIZED`. *Accepted trade-off (documented in CLAUDE.md at M0):* full
  refresh-token rotation is beyond take-home scope; the `HttpOnly` cookie (unreadable by
  injected script) plus the `tokenVersion` denylist is the lightweight middle ground.
- **CSRF (I1) — double-submit token.** Because a cookie is sent automatically, every
  **state-changing** request (`POST /games`, `roll`, `hold`, `ai-turn`, `logout`) is
  CSRF-guarded: on login/register the server also sets a **readable** (non-`HttpOnly`)
  `csrfToken` cookie with a random value; the frontend echoes it in an **`X-CSRF-Token`**
  header; a middleware compares header-vs-cookie and rejects a mismatch/absence with
  `403 CSRF_INVALID`. This double-submit check, combined with `SameSite=Lax` (which alone
  blocks cross-site top-level POSTs), closes the CSRF hole the cookie switch would otherwise
  open. `GET` routes and `POST /auth/login`/`/auth/register` (which have no auth cookie yet)
  are exempt. The "no cookie, hence no CSRF surface" rationale from the prior plan is
  **deleted** — it no longer holds.
- **CORS.** `app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))` — an **exact
  origin**, **never `'*'`** (credentialed CORS forbids the wildcard, so this is required, not
  stylistic; reinforces lessons-bank L002). `FRONTEND_URL` **defaults to
  `http://localhost:5173`** only outside production; in production, startup **refuses to boot**
  when it is unset or contains `localhost`
  (`if (isProduction && (!FRONTEND_URL || FRONTEND_URL.includes('localhost'))) throw new
  ConfigError('FRONTEND_URL is required in production')`). Fails loudly rather than guessing a
  dev origin or silently rejecting all real users.
- Naming/style per repo rules (camelCase files, PascalCase components, typed errors with
  `errorCode` context, injected structured logger — no `console.*`).

### §2 — Data model (Prisma + PostgreSQL)

```
User {
  id            String  @id @default(cuid())
  username      String              // display form
  usernameKey   String  @unique     // trim + NFKC + lowercase
  passwordHash  String
  tokenVersion  Int     @default(0) // bumped on logout-all / revocation (I1)
  wins          Int     @default(0) // Extra 1
  createdAt     DateTime @default(now())
}

Game {
  id            String  @id @default(cuid())
  ownerUserId   String
  owner         User    @relation(fields: [ownerUserId], references: [id])
  mode          GameMode @default(human)   // human | ai
  aiSeat        Int?                // 1 | 2 when mode = ai
  aiMoveCount   Int     @default(0) // per-game AI move counter, hard cap 50
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
  kind       MoveKind // roll | hold | forfeit  (forfeit = AI cap hand-back)
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
- **Value ranges — final safety net (I3).** Add, so a persistence bug or manual write can
  never store an impossible game even if code validation is bypassed:
  - `CHECK (target_score BETWEEN 10 AND 1000)`
  - `CHECK (cardinality(last_dice) IN (0, 2))` — dice are stored either empty or as a pair
  - a per-die 1–6 check:
    `CHECK (last_dice <@ ARRAY[1,2,3,4,5,6])` (every element is a legal die face)
  - `CHECK (ai_move_count <= 50)` — the hard cap enforced at the last line of defense too

- **Verification:** `schema.test.ts` (node env) — asserts the DB rejects (a) updating a
  finished game **and that the error carries the finished-game SQLSTATE**, (b)
  `status='finished'` with null `winnerSeat`, (c) `mode='human'` with a non-null `aiSeat`
  and `mode='ai'` with null `aiSeat`, (d) a second `in_progress` game for the same owner,
  and (e, I3) `target_score = 5` / `target_score = 5000`, `last_dice = ARRAY[99]`,
  `last_dice = ARRAY[1,2,3]`, and `ai_move_count = 51` are each rejected. Protects the
  invariants — and the code that distinguishes them (§11) — at the layer that enforces them.
  What regresses if broken: garbage rows (`last_dice = [99]`, out-of-range target) persist
  silently.

### §3 — Authorization guards
- **Read guard** — caller's JWT `sub === game.ownerUserId`; otherwise `403 FORBIDDEN`, or
  `404 GAME_NOT_FOUND` when the game does not exist. Used by `GET /games/:id`. **The read
  guard applies regardless of `status`** — an `abandoned` or `finished` game the caller owns
  passes and returns its full state (I7); only a nonexistent or non-owned id fails.
- **Action guard** — read guard **AND** the action targets `game.currentSeat` **AND**
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
  acted and gets **200** (the 409-recovery case); (c, I7) the owner `GET`s an **abandoned**
  game and a **finished** game and gets **200** with the full `GameStateDto` and the right
  `status`, not a 404; (d) `ai-turn` on a `human` game, or when the current seat isn't
  `aiSeat`, returns 409; (e) **a manual `roll`/`hold` while the AI seat is current returns
  `409 AI_TURN_REQUIRED`** (protects the human-plays-AI regression).

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
| POST | `/auth/register` | `{ username, password }` | `{ user: { id, username } }` (sets auth + csrf cookies) |
| POST | `/auth/login` | `{ username, password }` | `{ user: { id, username } }` (sets auth + csrf cookies) |
| POST | `/auth/logout` | — (CSRF-guarded) | `204` (clears auth + csrf cookies) |
| GET | `/games?status=in_progress` | — (bounded `limit`) | `GameStateDto[]` (owner's) |
| POST | `/games` | `{ targetScore (10–1000), mode, aiSeat? }` | `GameStateDto` |
| GET | `/games/:id` | — | `GameStateDto` (read guard; any status) |
| POST | `/games/:id/roll` | `{ expectedVersion }` (`z.strictObject`) | `GameStateDto` |
| POST | `/games/:id/hold` | `{ expectedVersion }` | `GameStateDto` |
| POST | `/games/:id/ai-turn` | `{ expectedVersion }` | `GameStateDto` |

**Auth responses no longer return `{ token }` (I1)** — the token is set as an `HttpOnly`
cookie server-side; the body carries only non-secret user identity. Every state-changing
POST additionally requires the `X-CSRF-Token` header (§1).

- **`GET /games/:id` for non-live games (I7).** Returns the **full `GameStateDto`** with the
  real `status` (`'abandoned'` or `'finished'`) whenever the caller owns the game — the read
  guard is the only gate, and it does not filter on status. A client holding a stale game id
  after an abandon therefore gets a well-defined state (`status: 'abandoned'`) instead of an
  ambiguous `404`; the frontend renders the abandoned/finished notice from it (§8). `404
  GAME_NOT_FOUND` is reserved for an id that truly does not exist or is not owned.

- **Full `GameStateDto` schema (numeric bounds pinned, I4).** Written explicitly in
  `packages/shared`; every field's nullability is fixed, and every numeric field expresses
  its real contract so the schema the plan calls the "single source of truth" actually
  enforces it — `NaN`, fractions, and negatives can no longer pass on the way in *or* out:

  ```ts
  const DieSchema = z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
  ]);

  const LastMoveSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('roll'), dice: z.tuple([DieSchema, DieSchema]), busted: z.boolean() }),
    z.object({ kind: z.literal('hold') }),
    z.object({ kind: z.literal('forfeit') }),               // AI cap hand-back
  ]);

  const GameStateSchema = z.object({
    id: z.string(),
    mode: z.enum(['human', 'ai']),
    aiSeat: z.union([z.literal(1), z.literal(2)]).nullable(),   // null when mode='human'
    targetScore: z.number().int().min(10).max(1000),           // (I4)
    status: z.enum(['in_progress', 'finished', 'abandoned']),
    currentSeat: z.union([z.literal(1), z.literal(2)]),
    p1Score: z.number().int().nonnegative(),                   // (I4)
    p2Score: z.number().int().nonnegative(),                   // (I4)
    roundScore: z.number().int().nonnegative(),                // (I4)
    lastDice: z.union([z.tuple([]), z.tuple([DieSchema, DieSchema])]), // [] or a pair of 1–6 (I4)
    winnerSeat: z.union([z.literal(1), z.literal(2)]).nullable(),
    version: z.number().int().nonnegative(),                   // (I4)
    lastMove: LastMoveSchema.nullable(),                       // null on a freshly created game
    busted: z.boolean(),                                       // mirrors lastMove.busted; false when no move yet
  });

  const ExpectedVersionSchema = z.object({
    expectedVersion: z.number().int().nonnegative(),           // (I4) — no NaN/1.5/negative
  }).strict();
  ```

- **Created-game initial state.** A freshly created game returns `lastMove: null`,
  `busted: false`, `lastDice: []`, `roundScore: 0`, `winnerSeat: null`. The frontend
  **must** handle `lastMove === null` before the first roll (guarded render).

- **`lastMove` semantics per transition.**
  - normal roll → `{ kind: 'roll', dice, busted: false }`
  - bust → `{ kind: 'roll', dice: [6,6], busted: true }`, `roundScore: 0`
  - hold / win → `{ kind: 'hold' }`, `roundScore: 0`
  - AI cap hand-back → `{ kind: 'forfeit' }` — the **only** channel signalling the cap; the
    request is a normal 200 success, not an error.
  - **Held dice on hold:** `lastDice` is **retained** through a hold (the final roll stays
    visible) and only reset on the next roll; documented so the UI is deterministic.

- **Create-game cross-field rule.** The schema `.refine`s
  `d => d.mode === 'ai' ? (d.aiSeat === 1 || d.aiSeat === 2) : d.aiSeat == null`, mirrored by
  the DB CHECKs in §2 — an impossible game is impossible to store.

- **Auth input rules.** Password: validate UTF-8 **byte** length explicitly
  (`new TextEncoder().encode(pw).length <= 72`, the bcrypt limit) **and** a minimum
  (`>= 8` chars). Username: `min 3, max 30`, normalized (trim + NFKC + lowercase →
  `usernameKey`) **before** length/uniqueness checks.

- **Constant-time login (I5).** The login handler **always** runs exactly one
  `bcrypt.compare`, even when the username does not exist, against a module-level constant
  `DUMMY_BCRYPT_HASH` (a real bcrypt hash of an arbitrary string, cost 12):
  `const hash = user?.passwordHash ?? DUMMY_BCRYPT_HASH; const ok = await bcrypt.compare(password, hash);`
  then returns the generic `INVALID_CREDENTIALS` when `!user || !ok`. Present and absent
  usernames therefore take comparable time, closing the timing side-channel that would
  otherwise let an attacker enumerate accounts by stopwatch.

- **Validation:** an Express middleware runs `Schema.parse()` on body/params per route; a
  roll body carrying `dice` fails `ExpectedVersionSchema` → `400 INVALID_INPUT`.
  **Verification:** `validation.test.ts` asserts that 400, plus the create-game refine
  rejections and the password byte/min and username cap rejections, plus that a parsed
  `GameStateDto` round-trips through `GameStateSchema` including the `lastMove: null`
  created-game case, **and (I4) that `{ expectedVersion: 1.5 }`, `{ expectedVersion: NaN }`,
  `{ expectedVersion: -1 }` are each rejected `400 INVALID_INPUT`, and a `GameStateDto`
  carrying `targetScore: 5` or `lastDice: [7,7]` fails `GameStateSchema`** (protects the
  numeric-bounds contract).

### §6 — Roll/hold transaction (reference implementation)
```ts
await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${id} FOR UPDATE`; // row lock
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  const actorSeat = game.currentSeat;                     // derived from the LOCKED row, never the body
  assertActionGuard(game, actorSeat);                     // rejects the AI seat with AI_TURN_REQUIRED
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
  if (outcome.won && (game.mode === 'human' || actorSeat !== game.aiSeat)) {      // credit only a HUMAN winner
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
`kind: 'roll'` move. **`actorSeat` is always the locked `game.currentSeat`** — no seat is
ever accepted from the request body, so the race the lock closes stays closed. **Win credit:**
the guarded one-time increment runs only when the winning seat is a *human* seat, so an AI
victory never credits the human owner. **Zero-row update:** re-read the row before assuming a
version race; if it is now `abandoned`, throw `GAME_ABANDONED`. This same guarded-`updateMany`
shape is reused verbatim by the AI forfeit path (§9, I6).

- **Verification:** `concurrency.test.ts` — race two rolls, race `roll`+`hold`, and race
  `hold`+`roll`, each pair on the **same** `expectedVersion`; every pair asserts exactly one
  200 and one 409 `VERSION_CONFLICT`. `hold.test.ts` — a hold raises the seat total by the
  round score, leaves `roundScore` at `0`, keeps `lastDice` showing the last roll.
  `lifecycle.test.ts` — abandon a game between read and write; assert the in-flight roll
  returns **`GAME_ABANDONED`**, not a bare version conflict. `winIncrement.test.ts` — fire a
  winning **human** hold twice and assert `wins` rises by **exactly one**; fire a winning
  **AI** hold (via `ai-turn`) and assert the owner's `wins` is **unchanged**.

### §7 — New-game / abandon lifecycle
`POST /games` runs abandon + create in **one `prisma.$transaction`** so the owner is never
left with no playable game and two near-simultaneous creates cannot interleave:

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
  after the abandon leaves the **original** game still `in_progress` (protects the
  atomicity); `GET /games?status=in_progress` returns at most one.

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game form
  (with the `targetScore` input, 10–1000, and mode/aiSeat selection).
- **Cookie auth + CSRF (I1).** The frontend **never** reads or stores the JWT — it lives in
  an `HttpOnly` cookie the browser attaches automatically. `apiClient` is configured with
  **`credentials: 'include'`** (fetch) / **`withCredentials: true`** (axios) so the cookie
  rides every request. On login/register it reads the readable `csrfToken` cookie once and
  attaches it as an **`X-CSRF-Token`** header on every **state-changing** request
  (`POST /games`, `roll`, `hold`, `ai-turn`, `logout`). **Logout** calls `POST /auth/logout`
  (which clears both cookies server-side) and routes back to `LoginScreen`; a `401
  UNAUTHORIZED` is treated as a lost session (below). There is no `localStorage` token and no
  `Authorization` header anywhere in the client.
- **Version-conflict recovery.** `apiClient` intercepts a `409 VERSION_CONFLICT` centrally:
  it **refetches `GET /games/:id`**, updates the local `version` and derived `currentSeat`
  from the fresh state, re-enables the buttons, and shows a generic "the game moved on — try
  again" toast. This breaks the stale-version infinite loop. `GAME_ABANDONED` keeps its own
  distinct handling below.
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box.
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`. The board **guards on `lastMove === null`** (freshly
  created game) so the first render never dereferences a move that hasn't happened.
- **6&6 bust (Extra 4):** when `state.busted` is true, disable actions ~1.2s and show the
  bust message/animation, with `state.lastMove.dice` (`[6,6]`) visible during it.
- **AI turn:** when `state.mode === 'ai'` and `state.currentSeat === state.aiSeat`, the client
  calls `POST /games/:id/ai-turn` **once per returned state** and re-calls while the AI seat is
  still current (mirrors the server's one-move-per-request contract). A `lastMove.kind ===
  'forfeit'` state (the recoverable cap) hands the turn back to the human and stops the loop,
  showing an "AI gave up its turn" message — driven **solely** by that field, no error
  envelope.
- **Abandoned / finished game (I7).** A `GAME_ABANDONED` response, **or** a `GET /games/:id`
  that returns `status: 'abandoned'`/`'finished'`, shows a clear notice ("this game was
  abandoned — starting fresh" / the winner banner) driven off the returned `status`, and for
  an abandon reloads `GET /games?status=in_progress` — a stale game id after an abandon
  renders a defined state, never an ambiguous error.
- **Session recovery:** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen` renders an
  inline re-login card while the board stays mounted; token lifetime `12h` (documented as
  revocable via `tokenVersion` (I1), otherwise a stateless trade-off for a take-home).
- **Winner highlight:** highlight `winnerSeat` explicitly.
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; a **created-game state with `lastMove: null`
  renders without crashing**; clicking Roll calls the client with the current `version`; a
  `busted` response disables buttons; a `GAME_ABANDONED` response **and** a fetched
  `status: 'abandoned'` state both show the abandoned notice (I7). `versionConflict.test.tsx`
  — a `409 VERSION_CONFLICT` triggers a refetch and the **next** click carries the refreshed
  version (protects against the retry loop). `csrf.test.tsx` **(I1)** — a state-changing call
  sends the `X-CSRF-Token` header read from the `csrfToken` cookie, and a `GET` does not
  (protects the CSRF wiring). `aiLoop.test.tsx` — given successive states where the AI seat
  stays current, the client re-issues `ai-turn` and stops when the seat passes or a `forfeit`
  state returns, showing the "AI gave up" message from `lastMove.kind`.

### §9 — AI opponent (Extra 3)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`. The human can never drive this seat by hand (§3).
- **Single-flight claim before the LLM call (I2).** Because the paid model call happens
  *before* the short write transaction (to avoid holding a row lock across the network), two
  `ai-turn` requests for the **same** `(gameId, expectedVersion)` — a double-click or two
  tabs — could otherwise both read the state and both bill an LLM call before either writes.
  A **single-flight claim** closes this: `claimAiTurn(gameId, expectedVersion) → 'acquired' |
  'alreadyInProgress'` (an in-memory keyed lock for this single-instance demo, released in a
  `finally`). Only the `'acquired'` caller computes a decision; the loser **refetches
  `GET /games/:id`** and does not call the model. So one committed AI move costs **at most one
  LLM call**. (Documented single-instance assumption, consistent with the in-memory rate-limit
  store; a multi-instance deployment would key this in Redis — out of scope, §Scope.)
- **Bounded provider concurrency (I2).** The provider call is wrapped in a small **bounded
  semaphore** so a burst of `ai-turn` requests can never open unlimited concurrent provider
  operations. Any provider call that hits the deadline is **recorded via the structured
  logger** (a `WARNING` with `{ gameId, reason: 'ai_provider_timeout' }`), so a hung or
  chronically-slow provider is observable instead of silently accumulating.
- **One move per request.** Each `ai-turn` request, after acquiring the claim: (1) re-reads
  game state under the row lock, (2) re-checks `expectedVersion` and derives the actor seat
  from the fresh `currentSeat`, (3) computes **one** decision, (4) applies it through the §6
  transaction, bumping `version` and incrementing `aiMoveCount`, (5) returns fresh state. The
  client re-calls while the AI seat is still current.
- **Outcome-then-cap ordering.** After the AI move is computed, the server evaluates in this
  strict order so a winning move is never erased by the cap:
  ```ts
  if (outcome.won) finish();                               // a winning move ALWAYS finishes, even the capped one
  else if (nextAiMoveCount > 50) forfeitToHuman();         // cap blocks the 51st attempt, not the 50th
  else applyNormalMove();
  ```
- **Forfeit through the same guarded update (I6).** `forfeitToHuman()` is **not** a plain
  write — it goes through the identical guarded `updateMany` as §6, so a concurrent human
  action can't race it into an inconsistent seat:
  ```ts
  const updated = await tx.game.updateMany({
    where: { id, version: expectedVersion, status: 'in_progress' },   // same guard as §6
    data: {
      version: { increment: 1 },
      currentSeat: humanSeat,                              // the non-AI seat
      aiMoveCount: { increment: 1 },
      // lastMove derived as { kind: 'forfeit' } at the DTO layer; scores untouched
    },
  });
  if (updated.count === 0) {                               // zero-row → same mapping as §6
    const fresh = await tx.game.findUnique({ where: { id } });
    if (fresh?.status === 'abandoned') throw new ConflictError('GAME_ABANDONED');
    throw new ConflictError('VERSION_CONFLICT');
  }
  await tx.move.create({ data: { gameId: id, actorSeat: game.aiSeat!, kind: 'forfeit', roundScore: game.roundScore } });
  ```
  The board stays playable and the human can immediately act. There is no separate error code.
- **Decision computed outside the transaction.** The order is strictly:
  claim → read state → `AiDecisionProvider.decide(state)` (may hit the network, bounded
  semaphore) → validate → open a short, fast transaction to write the one move. **No network
  `await` ever happens while a `FOR UPDATE` lock or open transaction is held.**
- **Application-level deadline.** The provider call is bounded by
  `await Promise.race([provider.decide(state, signal), rejectAfter(3000)])`, where
  `rejectAfter` rejects on its own timer and `signal` is `AbortSignal.timeout(3000)` passed
  into the SDK so a cooperative provider also cancels. **`Promise.race` bounds only how long
  the handler *waits* — it does not cancel the underlying provider request**, so a provider
  that ignores the abort signal may keep running after the response is sent (that is exactly
  why the bounded semaphore and the timeout log above exist — I2). A race timeout is treated
  **exactly like a parse failure** → heuristic. The 3000ms value is a named constant.
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
  bumps version. `aiSingleFlight.test.ts` **(I2)** — two concurrent `ai-turn` calls on the
  **same** `(gameId, expectedVersion)` result in **at most one** `provider.decide` invocation
  (spy count ≤ 1) and exactly one committed move; the loser refetches (protects against
  double-billing). `aiTimeout.test.ts` — **two** providers: one that ignores the abort signal
  and hangs, one that honors it; both must return within the deadline via `Promise.race`,
  drive the move from the heuristic, and **emit the timeout log** (protects the observability
  and the bounded-wait, without claiming cancellation). `aiCap.test.ts` — (a) drive the AI to
  the cap and assert the turn is handed back (`lastMove.kind === 'forfeit'`, `currentSeat` =
  human seat) **through the guarded update** (a stale `expectedVersion` forfeit yields
  `VERSION_CONFLICT`, protecting I6), and the human can then move; (b) **a move that both hits
  the cap boundary and wins finishes the game** (`status === 'finished'`, `winnerSeat` set)
  rather than forfeiting. `aiValidation.test.ts` — a malformed model reply (`"ROLL!"`,
  `{action:'fly'}`, broken JSON) falls back to the heuristic. `aiBoundary.test.ts` — the
  payload handed to the provider contains only the six allowed fields. The live LLM path is
  never hit in tests (no network in CI).

### §10 — Auth & gameplay hardening
- Passwords bcrypt cost 12; validated by byte length + minimum as in §5. **Login always runs
  one `bcrypt.compare` against `DUMMY_BCRYPT_HASH` when the user is missing (I5)** so present
  and absent usernames take comparable time.
- **JWT** as pinned in §1 (validated `JWT_SECRET`, `HS256` allowlist, `sub`/`tokenVersion`/
  `iat`/`exp`), carried in the **`HttpOnly` cookie (I1)**. Auth middleware reads the cookie,
  verifies the signature, and rejects when the JWT's `tokenVersion` ≠ the user's current
  `tokenVersion` → `401 UNAUTHORIZED`.
- **CSRF middleware (I1).** Runs before every state-changing route; compares the
  `X-CSRF-Token` header against the `csrfToken` cookie and rejects a mismatch/absence with
  `403 CSRF_INVALID`. `GET`s and the two pre-auth `/auth` POSTs are exempt.
- **Logout (I1).** `POST /auth/logout` clears the auth + `csrfToken` cookies (`Max-Age=0`).
  Bumping `User.tokenVersion` (an admin/self action) invalidates every outstanding token
  system-wide on the next request.
- **Auth rate limiting.** `app.set('trust proxy', false)` — the demo is a **directly-exposed
  single instance**, so Express must **not** believe any `X-Forwarded-For` header; the
  limiter keys off the real socket IP. (Behind exactly one proxy this becomes `1`;
  documented.) `/auth/login` **5/min per (ip + normalized-username)**; `/auth/register`
  **10/hr per ip**; `express.json({ limit: '16kb' })` so an oversized body never reaches
  bcrypt. Per-username-only lockout is deliberately rejected. Over-limit → `429 RATE_LIMITED`.
- **Gameplay rate limiting.** A modest per-user limit of **60/min** on `roll`, `hold`, and
  `ai-turn`, keyed on the authenticated **JWT `sub`** (not IP, so it holds across the
  single-owner two-seat model), documented next to the auth limits. Caps a tight `ai-turn`
  loop against a live LLM key from running up cost and DB load. Over-limit → `429
  RATE_LIMITED`. The store is **in-memory / single-instance** for this demo — documented
  assumption, not a distributed store.
- Login returns a single generic `INVALID_CREDENTIALS` (no account enumeration by message
  *or* timing, I5); register necessarily reveals a taken name — noted as accepted.

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not; a JWT
  signed with a different algorithm/secret is rejected by verify; **a JWT whose
  `tokenVersion` is behind the user's current value is rejected `401` (protects I1
  revocation)**. `loginTiming.test.ts` **(I5)** — a login for a **nonexistent** username still
  invokes `bcrypt.compare` exactly once (spy asserts the dummy-hash path ran), so the missing
  and present paths do the same work. `csrf.test.ts` **(I1)** — a state-changing POST with a
  valid auth cookie but **missing/mismatched** `X-CSRF-Token` is rejected `403 CSRF_INVALID`,
  while a matching header/cookie pair passes, and a `GET` needs none. `logout.test.ts`
  **(I1)** — `POST /auth/logout` clears the cookies (response `Set-Cookie` with `Max-Age=0`)
  and a subsequent request with the old cookie is `401`. `rateLimitProxy.test.ts` — with
  `trust proxy` false, requests carrying a forged/rotating `X-Forwarded-For` all key to the
  same socket IP and hit the limit. `gameplayRateLimit.test.ts` — 61 `ai-turn`/`roll` calls
  from one authenticated user within a minute get a `429 RATE_LIMITED` on the last, and a
  **different** user's calls are unaffected.

### §11 — Error handling & observability
Central Express error middleware: `instanceof` typed errors first (`InvalidInputError`,
`ConflictError`, `ForbiddenError`, `NotFoundError`, `CsrfError`, …) → envelope;
`ZodError → INVALID_INPUT`. Auth middleware failures → `401 UNAUTHORIZED`; CSRF middleware
failures → `403 CSRF_INVALID`. **Per-signal DB mapping** — each database rule maps to its
**own** code, never one blanket "finished":
- the finished-game trigger's own SQLSTATE → `409 GAME_FINISHED`;
- the `game_one_live_per_owner` unique-index violation → `409 GAME_CONFLICT`;
- any other CHECK / constraint failure (incl. the I3 value-range CHECKs) → `500
  DATABASE_CONSTRAINT` — **never** silently reported as `GAME_FINISHED`.

Else map by `err.status`; else 500. `app.use` a 404 handler returning
`{ error: { code: 'ROUTE_NOT_FOUND' } }`. A request-id is threaded through the injected
structured logger, and a `/health` route is exposed. All responses (including framework
errors) exit in the single envelope, and every code comes from the shared `ErrorCode` union
and its status table (§1).

- **Verification:** `errors.test.ts` — POST empty body to `/roll` → `INVALID_INPUT` (400);
  unknown route → `ROUTE_NOT_FOUND` (404); missing/garbage cookie JWT → `UNAUTHORIZED` (401);
  missing CSRF header → `CSRF_INVALID` (403, I1); non-owner → `FORBIDDEN` (403); unknown game
  id → `GAME_NOT_FOUND` (404); finished-game trigger → `GAME_FINISHED` (409); one-live-game
  unique index → `GAME_CONFLICT` (409, not `GAME_FINISHED`); a value-range CHECK →
  `DATABASE_CONSTRAINT` (500, not `GAME_FINISHED`). Pins every status in the §1 table.

### §12 — Test strategy
- Vitest **workspace**: `apps/web` under `environment: 'jsdom'` + Testing Library;
  `apps/api` under `node`.
- API suites run **serial** (`singleThread: true`) with a `truncateAll()` helper in
  `beforeEach`, against a disposable PostgreSQL that `globalSetup` migrates via
  `prisma migrate deploy`. (Real PostgreSQL is used for tests — SQLite is never involved, so
  raw-SQL triggers/CHECKs, including the I3 value-range CHECKs, are exercised as in
  production.)

### §13 — Determinism, config & smoke
- `DICE_SEED` env (validated in `config/env.ts`, **refused when `NODE_ENV==='production'`**)
  swaps `diceRoller` for a seeded generator.
- `FRONTEND_URL` is validated in the same `config/env.ts`: **required and non-localhost in
  production**, defaulted to `http://localhost:5173` otherwise. It is now also the **exact
  credentialed-CORS origin (I1)** — a missing/localhost production value is a startup failure,
  tested in `env.test.ts`.
- **Cookie flags by env (I1).** The auth cookie is `HttpOnly; SameSite=Lax; Path=/`, with
  `Secure` set in production and relaxed for local http dev; the `csrfToken` cookie is the
  same minus `HttpOnly`. Documented in `config/env.ts` and CLAUDE.md at M0.
- Smoke run: register (assert the `Set-Cookie` auth + csrf cookies come back), create a game
  at `targetScore: 10`, force `[6,6]` via the seed, assert round cleared + seat passed, then
  hold to a win and assert the winner's `wins` incremented by exactly one **and `roundScore`
  is `0`**.

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config (`JWT_SECRET` validation, `FRONTEND_URL`
  production-required, **credentialed CORS with exact origin (I1)**, cookie flags by env),
  error-envelope + `ErrorCode` union and status table (§1, incl. `CSRF_INVALID` (I1)),
  documented cookie-transport + `tokenVersion`-revocation trade-off (I1), Vitest workspace,
  test-DB `globalSetup`. Confirm real installed versions before pinning (Tailwind 4 CSS-first
  `@import "tailwindcss"` + `@theme` + `@tailwindcss/vite`, no `tailwind.config.ts` by
  default — verify at install).
- **M1 — Auth (cookie-based, I1).** register/login/**logout**, bcrypt (with the
  `DUMMY_BCRYPT_HASH` constant-time path, I5), JWT (12h, HS256, validated secret,
  `tokenVersion` claim), **`HttpOnly` auth cookie + readable `csrfToken` cookie**, **CSRF
  double-submit middleware**, auth rate limits with `trust proxy = false`, byte-length/min
  password and capped username rules, `usernameKey` unique index.
- **M2 — Contract (`packages/shared`).** Zod schemas, the full `GameStateDto` schema with
  fixed nullability + `lastMove` discriminated union **and pinned numeric bounds (I4)**,
  `ErrorCode` union + status table (incl. `CSRF_INVALID`), create-game cross-field refine,
  `ExpectedVersionSchema`. Both apps compile against it before either implements it.
- **M3a — Game happy path.** create / get (incl. **abandoned/finished full-state, I7**) /
  roll / hold (round-score reset on hold), read/action guard split incl. the AI-seat
  rejection, `actorSeat` from the locked row, pure engine, playable end-to-end with `curl` at
  `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, atomic abandon+create transaction with
  `GAME_ABANDONED`, partial unique index → `GAME_CONFLICT`, guarded one-time win increment
  credited only to a human winner, DB CHECK/trigger invariants (finished-game distinct
  SQLSTATE, mode/seat, value ranges **incl. the I3 target/dice/aiMoveCount CHECKs**),
  per-signal DB error mapping, per-user gameplay rate limit, roll-vs-hold concurrency matrix.
- **M4 — Frontend.** Login, resume, create form, board (guarding `lastMove === null`), 6&6
  disable/animation, AI-turn loop, `VERSION_CONFLICT` refetch-recovery, **cookie auth +
  CSRF-header wiring + logout (I1)**, **abandoned/finished notice from fetched state (I7)**,
  session card, error boundary. **First fully submittable increment** (core assignment +
  Extras 1/2/4) — the AI opponent (M5) is strictly additive.
- **M5 — AI opponent.** `mode`/`aiSeat`, `AiDecisionProvider` adapter (decision outside the
  transaction, application-level 3s `Promise.race` deadline, minimal data boundary, output
  validation), **single-flight claim + bounded provider semaphore + timeout logging (I2)**,
  heuristic fallback, one-move `ai-turn`, win-safe recoverable `aiMoveCount` cap with
  **`forfeit` through the guarded update (I6)**, `forfeit` as the sole cap channel, `Move`
  rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) behind the adapter and add its key to `.env` at M5 — otherwise
  the heuristic runs.
