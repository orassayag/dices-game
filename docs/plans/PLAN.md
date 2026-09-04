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
bill two model calls for one committed move. The claim and the bounded provider semaphore
are held **until the provider promise actually settles**, not until the 3s wait ends, so a
hung call can never leak a second paid call for the same move (I2). A per-game AI move cap
is **recoverable** and win-safe: it counts **successful AI moves only**, fires *before* the
count would exceed the cap, and the forfeit hand-back neither increments the counter nor
keeps the round score (I1, I4).

Delivered as a TypeScript monorepo: `apps/api` (Express + Prisma + PostgreSQL),
`apps/web` (React + Vite + Tailwind), and `packages/shared` (Zod schemas + DTOs shared by
both sides). **Auth is cookie-based:** the JWT lives in an `HttpOnly; Secure; SameSite=Lax`
cookie the browser attaches automatically — no token in `localStorage`, no `Authorization`
header. Because a cookie re-opens the CSRF surface, the auth section closes it with a
**hardened, user-bound CSRF token** (not the weak naive double-submit): the token is bound
to the user via a server-verified HMAC, uses the `__Host-` cookie prefix in production,
rotates on login and clears on logout, and is backed by an `Origin`/`Referer` check on every
state-changing request — **including `POST /auth/login`**, which carries a pre-auth token to
close login-CSRF (I3, I9). Credentialed CORS is pinned to an exact origin, and revocation
runs through a `tokenVersion` denylist checked on every request, with a **defined failure
path** when the database backing that check is briefly unavailable (I8).

## Scope

**In scope**
- Auth: register + login (bcrypt, JWT with pinned secret/algorithm), rate-limited; only
  authenticated users create/play. **Token transport is an `HttpOnly` cookie**; CORS runs
  **with** `credentials: true` against an exact origin.
- **Hardened CSRF defense (I3, I9):** a user-bound double-submit token — value carries a
  server-verified HMAC of the user id, delivered in a `__Host-csrfToken` cookie (production)
  echoed by the frontend in an `X-CSRF-Token` header on every state-changing POST, rotated on
  login and cleared on logout, plus a mandatory `Origin`/`Referer` allowlist check. `POST
  /auth/login` is **not** exempt — it carries a pre-auth token to close login-CSRF.
- `POST /auth/logout` that clears the auth + CSRF cookies, plus a `tokenVersion` integer on
  `User` embedded in the JWT and checked on every request, for real revocation — with a
  **controlled `503 SERVICE_UNAVAILABLE`** when the backing DB read is unavailable (I8),
  never an ambiguous `401`.
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
  move per request, a **single-flight claim + bounded provider semaphore released on real
  settlement** so one committed move costs at most one LLM call and a hung provider cannot
  leak a second call or pile up unbounded in-flight work (I2), decision computed outside the
  DB transaction under an application-level 3s deadline, reachable only via `ai-turn`, with a
  recoverable, win-safe per-game move cap that **counts successful moves, fires before the
  cap, and forfeits without incrementing or keeping the round score** (I1, I4).
- Brief disable + 6&6 bust animation/message (Extra 4), driven by a **single derived**
  `busted` field computed from `lastMove` (I6) — no independent flag that can go stale.
- CORS scoped to the frontend origin **with credentials**, **required in production**;
  deterministic dice seeding for tests/smoke; test-DB strategy; DB-level invariants
  (finished-game immutability, one live game per owner, valid seat/mode/score ranges,
  value-range `CHECK`s on `targetScore`, dice, and `aiMoveCount`, **plus winner⇔score
  consistency CHECKs — I7**), each mapped to its **own** error code.
- A per-user gameplay rate limit on `roll`/`hold`/`ai-turn` keyed on the JWT user id.

**Out of scope**
- Live cross-browser/multi-machine updates (assignment says not required).
- Separate opponent accounts / matchmaking — the single-owner model removes this surface.
- Full refresh-token rotation — the `tokenVersion` denylist is the lightweight revocation
  middle ground for a take-home (see the accepted-trade-off note in §1).
- Sound effects (Extra 5) — optional, deferred.
- Move-history replay endpoint — `Move` rows are written for audit/AI but not surfaced.
- Multi-instance / Redis-backed rate-limit store and single-flight claim — the demo is
  single-instance, directly exposed (`trust proxy = false`); the in-memory stores and their
  assumption are documented, not replaced.

**Prior rounds (still in force, folded into Design):** cookie-based JWT transport; action guard
rejects human play on the AI seat (`AI_TURN_REQUIRED`); win increment credited only to a human
winner; outcome-then-cap ordering so a winning capped move still finishes; atomic abandon+create
transaction; CORS production refusal; central `VERSION_CONFLICT` refetch recovery; complete
`ErrorCode` union + status table; full `GameStateDto` schema with pinned numeric bounds;
per-user gameplay rate limit; `forfeit` as the sole cap channel; `actorSeat` derived from the
locked row; hold resets `roundScore` to `0` and banks the seat total; per-signal DB error
mapping; AI provider 3s deadline; `trust proxy = false`; `GAME_ABANDONED` distinct from
`VERSION_CONFLICT`; roll-vs-hold concurrency matrix; AI decision outside the transaction; one
validated move per `ai-turn`; fixed-enum parse with heuristic fallback; mode/seat cross-field
refine + DB CHECKs; validated `JWT_SECRET` + `HS256` allowlist; partial unique index for
one-live-game; IP-keyed auth rate limiting; byte-length password + capped username; minimal AI
data boundary; constant-time login; abandoned/finished full-state reads.

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
  | `INVALID_INPUT` | 400 | Zod/body/param validation failure, **incl. malformed-JSON body-parser errors (I5)** |
  | `INVALID_CREDENTIALS` | 401 | login failed (generic, no enumeration) |
  | `UNAUTHORIZED` | 401 | missing/invalid/expired JWT, or stale `tokenVersion` |
  | `CSRF_INVALID` | 403 | missing/mismatched/user-unbound CSRF token, or failed `Origin` check (I3, I9) |
  | `FORBIDDEN` | 403 | authenticated but not the game owner |
  | `GAME_NOT_FOUND` | 404 | game id not owned/does not exist |
  | `ROUTE_NOT_FOUND` | 404 | unknown route |
  | `VERSION_CONFLICT` | 409 | stale `expectedVersion` (recoverable, §8) |
  | `GAME_ABANDONED` | 409 | acted on a game abandoned out from under the client |
  | `GAME_FINISHED` | 409 | write attempted on a finished/abandoned game (DB trigger) |
  | `GAME_CONFLICT` | 409 | one-live-game unique-index violation |
  | `AI_TURN_REQUIRED` | 409 | human `roll`/`hold` attempted on the AI seat |
  | `RATE_LIMITED` | 429 | auth or gameplay rate limit exceeded (§10) |
  | `SERVICE_UNAVAILABLE` | 503 | auth-path DB read (the `tokenVersion` revocation check) unavailable (I8) |
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
- **Token transport — cookie, not `localStorage`.** On register/login the server sets
  the JWT in an **`HttpOnly; Secure; SameSite=Lax; Path=/`** cookie (`Secure` relaxed only
  outside production so local http dev works). The browser attaches it automatically; the
  frontend **never** reads the token, never touches `localStorage`, and sends **no
  `Authorization` header**. Auth middleware reads the JWT from the cookie, verifies it, and
  additionally checks the JWT's `tokenVersion` equals the user's current `tokenVersion`
  (§2, §10) → a bumped value invalidates every outstanding token. A failed/absent/stale
  cookie → `401 UNAUTHORIZED`. *Accepted trade-off (documented in CLAUDE.md at M0):* full
  refresh-token rotation is beyond take-home scope; the `HttpOnly` cookie (unreadable by
  injected script) plus the `tokenVersion` denylist is the lightweight middle ground.
- **Auth-path DB dependency & failure behavior (I8).** The per-request `tokenVersion`
  re-check makes PostgreSQL a hard dependency of *every* authenticated request — this is a
  **documented, deliberate** trade-off (revocation over pure statelessness). Its failure
  path is defined, not implicit: if the `tokenVersion` read **throws or times out** (a
  short per-query timeout wraps it), the middleware returns a controlled **`503
  SERVICE_UNAVAILABLE`** — distinguishable from `401 UNAUTHORIZED` (bad/stale token) so a
  transient DB blip never masquerades as "you are logged out". A short in-memory
  `tokenVersion` cache (a few seconds TTL, keyed by user id, invalidated on logout/bump) is
  an **accepted optional optimization** to smooth brief blips; the correctness contract is
  the `503`, and the cache never serves a value past a `tokenVersion` bump.
- **CSRF (I3, I9) — hardened, user-bound double-submit + Origin check.** A cookie is sent
  automatically, so every **state-changing** request (`POST /auth/login`, `POST /games`,
  `roll`, `hold`, `ai-turn`, `logout`) is CSRF-guarded. The prior naive double-submit
  (readable random cookie echoed in a header, server only checks header == cookie) is
  **replaced** — that check only proves header and cookie match, not that the server issued
  the value, so anyone able to write a cookie (sibling subdomain script, shared machine)
  could set both sides. The hardened design:
  - **User-bound token value.** The `csrfToken` value is `<random>.<HMAC_secret(userId,
    random)>`; the middleware recomputes and verifies the HMAC against the authenticated
    `sub`, so a token the server did not issue for *this* user fails. (For the pre-auth
    login token, the HMAC is over a pre-session nonce instead of a user id — see I9 below.)
  - **`__Host-` cookie prefix in production.** The cookie is named `__Host-csrfToken`
    (`Secure; Path=/; no Domain`), which browsers refuse to let a subdomain overwrite —
    closing the cookie-injection path. Outside production (local http) the plain
    `csrfToken` name is used since `__Host-` requires `Secure`.
  - **Rotation.** The token is issued fresh on register/login and **cleared** on logout, so
    a stale token cannot be replayed after a session ends.
  - **`Origin`/`Referer` allowlist check.** Every state-changing request must carry an
    `Origin` (or, absent that, `Referer`) matching `FRONTEND_URL`; a mismatch is
    `403 CSRF_INVALID` **before** the token check — defense in depth that also covers the
    login route.
  - Combined with `SameSite=Lax` (which alone blocks cross-site top-level POSTs), this
    closes both the cookie-injection and cross-site paths. `GET` routes are exempt from the
    token echo but **not** from being safe (they perform no state change).
  - Delivery alternative (equivalently acceptable): return the CSRF token in the
    login/register response **body** and hold it in memory rather than reading
    `document.cookie` — sidesteps cross-subdomain cookie reads entirely. Either is fine as
    long as the value stays user-bound and the `Origin` check remains.
- **Login CSRF (I9).** `POST /auth/login` is **no longer CSRF-exempt**. `GET /auth/csrf`
  (or the initial app load) issues a **pre-auth** CSRF token bound to a pre-session nonce;
  the login request must echo it in `X-CSRF-Token` and pass the `Origin` check. On
  successful auth the pre-auth token is **replaced** by the user-bound token above. This
  closes login-CSRF (a malicious page silently logging the victim's browser into the
  *attacker's* account). `POST /auth/register` follows the same pre-auth pattern.
- **CORS.** `app.use(cors({ origin: env.FRONTEND_URL, credentials: true }))` — an **exact
  origin**, **never `'*'`** (credentialed CORS forbids the wildcard, so this is required, not
  stylistic; reinforces lessons-bank L002). `FRONTEND_URL` **defaults to
  `http://localhost:5173`** only outside production; in production, startup **refuses to boot**
  when it is unset or contains `localhost`
  (`if (isProduction && (!FRONTEND_URL || FRONTEND_URL.includes('localhost'))) throw new
  ConfigError('FRONTEND_URL is required in production')`). Fails loudly rather than guessing a
  dev origin or silently rejecting all real users. `FRONTEND_URL` is also the allowlist the
  `Origin`/`Referer` CSRF check compares against.
- Naming/style per repo rules (camelCase files, PascalCase components, typed errors with
  `errorCode` context, injected structured logger — no `console.*`).

### §2 — Data model (Prisma + PostgreSQL)

```
User {
  id            String  @id @default(cuid())
  username      String              // display form
  usernameKey   String  @unique     // trim + NFKC + lowercase
  passwordHash  String
  tokenVersion  Int     @default(0) // bumped on logout-all / revocation
  wins          Int     @default(0) // Extra 1
  createdAt     DateTime @default(now())
}

Game {
  id            String  @id @default(cuid())
  ownerUserId   String
  owner         User    @relation(fields: [ownerUserId], references: [id])
  mode          GameMode @default(human)   // human | ai
  aiSeat        Int?                // 1 | 2 when mode = ai
  aiMoveCount   Int     @default(0) // count of SUCCESSFUL AI moves; hard cap 50 (I1)
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

**`aiMoveCount` semantics (I1).** `aiMoveCount` counts **successful, committed AI moves
only** — not attempts, not turns, not the forfeit. It is incremented **only** inside the
normal-move write path (§9 step 4). The cap check reads the count *before* deciding and
fires the forfeit when `game.aiMoveCount >= 50` **without** incrementing, so the counter,
the `ai_move_count <= 50` CHECK, and the forfeit all agree. The 51st *attempt* forfeits; it
never tries to write 51.

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
- **Value ranges — final safety net.** So a persistence bug or manual write can never store
  an impossible game even if code validation is bypassed:
  - `CHECK (target_score BETWEEN 10 AND 1000)`
  - `CHECK (cardinality(last_dice) IN (0, 2))` — dice are stored either empty or as a pair
  - a per-die 1–6 check: `CHECK (last_dice <@ ARRAY[1,2,3,4,5,6])`
  - `CHECK (ai_move_count <= 50)` — the hard cap enforced at the last line of defense too
- **Winner⇔score consistency (I7).** The winner "safety net" now actually ties the winner to
  the score, closing the hole where `status='finished', winnerSeat=1, p1Score=0` was accepted:
  - `CHECK (status <> 'finished' OR winner_seat <> 1 OR p1_score >= target_score)`
  - `CHECK (status <> 'finished' OR winner_seat <> 2 OR p2_score >= target_score)`
  - `CHECK (status <> 'in_progress' OR (p1_score < target_score AND p2_score < target_score))`
    — an in-progress game cannot already have a seat at/over the target with no winner.

- **Verification:** `schema.test.ts` (node env) — asserts the DB rejects (a) updating a
  finished game **and that the error carries the finished-game SQLSTATE**, (b)
  `status='finished'` with null `winnerSeat`, (c) `mode='human'` with a non-null `aiSeat`
  and `mode='ai'` with null `aiSeat`, (d) a second `in_progress` game for the same owner,
  (e) `target_score = 5` / `target_score = 5000`, `last_dice = ARRAY[99]`,
  `last_dice = ARRAY[1,2,3]`, and `ai_move_count = 51` are each rejected, **and (f, I7)
  `status='finished', winnerSeat=1, p1Score=0, targetScore=100` is rejected, the seat-2
  mirror is rejected, and an `in_progress` row with `p1Score >= targetScore` is rejected**.
  What regresses if broken: garbage rows (out-of-range values, a "winner" who never reached
  the target) persist silently. Boundary protected: the DB is the last line of defense for
  every impossible-state class. Narrowest layer that can prove a raw-SQL CHECK fires.

### §3 — Authorization guards
- **Read guard** — caller's JWT `sub === game.ownerUserId`; otherwise `403 FORBIDDEN`, or
  `404 GAME_NOT_FOUND` when the game does not exist. Used by `GET /games/:id`. **The read
  guard applies regardless of `status`** — an `abandoned` or `finished` game the caller owns
  passes and returns its full state; only a nonexistent or non-owned id fails.
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
  acted and gets **200** (the 409-recovery case); (c) the owner `GET`s an **abandoned**
  game and a **finished** game and gets **200** with the full `GameStateDto` and the right
  `status`, not a 404; (d) `ai-turn` on a `human` game, or when the current seat isn't
  `aiSeat`, returns 409; (e) **a manual `roll`/`hold` while the AI seat is current returns
  `409 AI_TURN_REQUIRED`** (protects the human-plays-AI regression). Boundary: only the owner
  touches a game, and only via the seat channel that seat allows.

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
- **`busted` is derived, never independently stored (I6).** The DTO's `busted` field is
  computed **only** at the persistence/DTO mapper (§5) from `lastMove` — there is no separate
  top-level source of truth that could drift from `lastMove.busted`.

- **Verification:** `engine.test.ts` (node, no DB) — bust on `[6,6]`, accumulation on other
  rolls, **hold banks the round score into the seat total and returns `nextRoundScore: 0`**
  (regresses to double-count if broken), hold-to-win sets `won`, seat alternation. Narrowest
  layer; proves the rules without HTTP or DB.

### §5 — API contract (`packages/shared` Zod schemas)
| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/auth/csrf` | — | `204` (sets a pre-auth `csrfToken` cookie, I9) |
| POST | `/auth/register` | `{ username, password }` (CSRF-guarded, I9) | `{ user: { id, username } }` (sets auth + csrf cookies) |
| POST | `/auth/login` | `{ username, password }` (CSRF-guarded, I9) | `{ user: { id, username } }` (sets auth + csrf cookies) |
| POST | `/auth/logout` | — (CSRF-guarded) | `204` (clears auth + csrf cookies) |
| GET | `/games?status=in_progress` | — (bounded `limit`) | `GameStateDto[]` (owner's) |
| POST | `/games` | `{ targetScore (10–1000), mode, aiSeat? }` | `GameStateDto` |
| GET | `/games/:id` | — | `GameStateDto` (read guard; any status) |
| POST | `/games/:id/roll` | `{ expectedVersion }` (`z.strictObject`) | `GameStateDto` |
| POST | `/games/:id/hold` | `{ expectedVersion }` | `GameStateDto` |
| POST | `/games/:id/ai-turn` | `{ expectedVersion }` | `GameStateDto` |

**Auth responses no longer return `{ token }`** — the token is set as an `HttpOnly` cookie
server-side; the body carries only non-secret user identity. Every state-changing POST —
**including login and register (I9)** — additionally requires the `X-CSRF-Token` header and a
matching `Origin` (§1).

- **`GET /games/:id` for non-live games.** Returns the **full `GameStateDto`** with the real
  `status` (`'abandoned'` or `'finished'`) whenever the caller owns the game — the read guard
  is the only gate, and it does not filter on status. A client holding a stale game id after
  an abandon gets a well-defined state instead of an ambiguous `404`; `404 GAME_NOT_FOUND` is
  reserved for an id that truly does not exist or is not owned.

- **Full `GameStateDto` schema (numeric bounds pinned).** Written explicitly in
  `packages/shared`; every field's nullability is fixed, and every numeric field expresses
  its real contract so `NaN`, fractions, and negatives can no longer pass on the way in *or*
  out. **`busted` is derived from `lastMove` (I6), not an independent flag:**

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
    targetScore: z.number().int().min(10).max(1000),
    status: z.enum(['in_progress', 'finished', 'abandoned']),
    currentSeat: z.union([z.literal(1), z.literal(2)]),
    p1Score: z.number().int().nonnegative(),
    p2Score: z.number().int().nonnegative(),
    roundScore: z.number().int().nonnegative(),
    lastDice: z.union([z.tuple([]), z.tuple([DieSchema, DieSchema])]), // [] or a pair of 1–6
    winnerSeat: z.union([z.literal(1), z.literal(2)]).nullable(),
    version: z.number().int().nonnegative(),
    lastMove: LastMoveSchema.nullable(),                       // null on a freshly created game
    // NOTE (I6): `busted` is NOT a stored field. It is derived by the single mapper below
    // and validated only as an output invariant — never accepted as independent input.
  }).transform((s) => ({
    ...s,
    busted: s.lastMove?.kind === 'roll' ? s.lastMove.busted : false,  // single source of truth
  }));
  ```

  The DTO the frontend receives still carries a top-level `busted` for the animation (§8),
  but it is **computed** in exactly one place from `lastMove`; there is no code path that sets
  it independently, so a hold (`lastMove.kind === 'hold'`) always yields `busted: false` and
  can never leave a stale `true` re-triggering the freeze animation.

  ```ts
  const ExpectedVersionSchema = z.object({
    expectedVersion: z.number().int().nonnegative(),           // no NaN/1.5/negative
  }).strict();
  ```

- **Created-game initial state.** A freshly created game returns `lastMove: null`,
  `busted: false` (derived), `lastDice: []`, `roundScore: 0`, `winnerSeat: null`. The
  frontend **must** handle `lastMove === null` before the first roll (guarded render).

- **`lastMove` semantics per transition.**
  - normal roll → `{ kind: 'roll', dice, busted: false }`
  - bust → `{ kind: 'roll', dice: [6,6], busted: true }`, `roundScore: 0`
  - hold / win → `{ kind: 'hold' }`, `roundScore: 0` → derived `busted: false`
  - AI cap hand-back → `{ kind: 'forfeit' }`, `roundScore: 0` (I4) — the **only** channel
    signalling the cap; the request is a normal 200 success, not an error.
  - **Held dice on hold:** `lastDice` is **retained** through a hold (the final roll stays
    visible) and only reset on the next roll; documented so the UI is deterministic.

- **Create-game cross-field rule.** The schema `.refine`s
  `d => d.mode === 'ai' ? (d.aiSeat === 1 || d.aiSeat === 2) : d.aiSeat == null`, mirrored by
  the DB CHECKs in §2 — an impossible game is impossible to store.

- **Auth input rules.** Password: validate UTF-8 **byte** length explicitly
  (`new TextEncoder().encode(pw).length <= 72`, the bcrypt limit) **and** a minimum
  (`>= 8` chars). Username: `min 3, max 30`, normalized (trim + NFKC + lowercase →
  `usernameKey`) **before** length/uniqueness checks.

- **Constant-time login.** The login handler **always** runs exactly one `bcrypt.compare`,
  even when the username does not exist, against a module-level constant `DUMMY_BCRYPT_HASH`
  (a real bcrypt hash, cost 12):
  `const hash = user?.passwordHash ?? DUMMY_BCRYPT_HASH; const ok = await bcrypt.compare(password, hash);`
  then returns the generic `INVALID_CREDENTIALS` when `!user || !ok`. Present and absent
  usernames therefore take comparable time.

- **Validation:** an Express middleware runs `Schema.parse()` on body/params per route; a
  roll body carrying `dice` fails `ExpectedVersionSchema` → `400 INVALID_INPUT`.
  **Verification:** `validation.test.ts` asserts that 400, plus the create-game refine
  rejections and the password byte/min and username cap rejections, plus that a parsed
  `GameStateDto` round-trips through `GameStateSchema` including the `lastMove: null`
  created-game case; that `{ expectedVersion: 1.5 }`, `{ NaN }`, `{ -1 }` are each rejected
  `400 INVALID_INPUT`, and a `GameStateDto` carrying `targetScore: 5` or `lastDice: [7,7]`
  fails `GameStateSchema`; **and (I6) that a `hold` `lastMove` yields derived `busted: false`
  and a `{ kind: 'roll', busted: true }` `lastMove` yields derived `busted: true`, with no
  input path able to set `busted` independently** (protects the single-source-of-truth
  contract). Boundary: the schema the plan calls the "single source of truth" actually is one.

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
ever accepted from the request body. **Win credit:** the guarded one-time increment runs only
when the winning seat is a *human* seat. **Zero-row update:** re-read the row before assuming
a version race; if it is now `abandoned`, throw `GAME_ABANDONED`. This same
guarded-`updateMany` shape is reused verbatim by the AI forfeit path (§9).

- **Verification:** `concurrency.test.ts` — race two rolls, race `roll`+`hold`, and race
  `hold`+`roll`, each pair on the **same** `expectedVersion`; every pair asserts exactly one
  200 and one 409 `VERSION_CONFLICT`. `hold.test.ts` — a hold raises the seat total by the
  round score, leaves `roundScore` at `0`, keeps `lastDice` showing the last roll.
  `lifecycle.test.ts` — abandon a game between read and write; assert the in-flight roll
  returns **`GAME_ABANDONED`**, not a bare version conflict. `winIncrement.test.ts` — fire a
  winning **human** hold twice and assert `wins` rises by **exactly one**; fire a winning
  **AI** hold (via `ai-turn`) and assert the owner's `wins` is **unchanged**. Boundary: one
  committed write per version, per seat rules, with the correct win credit.

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
  atomicity); `GET /games?status=in_progress` returns at most one. Boundary: exactly one live
  game per owner, and abandon never orphans the owner.

### §8 — Frontend (`apps/web`)
- **Screens:** `LoginScreen` → `GameScreen`. On mount `GameScreen` calls
  `GET /games?status=in_progress`; if one exists, offer **Resume**, else the create-game form
  (with the `targetScore` input, 10–1000, and mode/aiSeat selection).
- **Cookie auth + hardened CSRF (I3, I9).** The frontend **never** reads or stores the JWT —
  it lives in an `HttpOnly` cookie the browser attaches automatically. `apiClient` is
  configured with **`credentials: 'include'`** (fetch) / **`withCredentials: true`** (axios)
  so the cookie rides every request. **Before login/register** it calls `GET /auth/csrf` to
  obtain the pre-auth token, then attaches the current `csrfToken` in an **`X-CSRF-Token`**
  header on every **state-changing** request — **including login and register** — and relies
  on the browser sending a correct `Origin`. After successful login it re-reads the rotated
  user-bound token. **Logout** calls `POST /auth/logout` (which clears both cookies
  server-side) and routes back to `LoginScreen`; a `401 UNAUTHORIZED` is treated as a lost
  session. A `503 SERVICE_UNAVAILABLE` (I8) is treated as **transient** — a "service busy,
  retrying" toast and a bounded retry, **not** a logout — so a brief DB blip doesn't eject a
  logged-in user. There is no `localStorage` token and no `Authorization` header anywhere.
- **Version-conflict recovery.** `apiClient` intercepts a `409 VERSION_CONFLICT` centrally:
  it **refetches `GET /games/:id`**, updates the local `version` and derived `currentSeat`
  from the fresh state, re-enables the buttons, and shows a generic "the game moved on — try
  again" toast. This breaks the stale-version infinite loop. `GAME_ABANDONED` keeps its own
  distinct handling below.
- `targetScore` is sent only at create and rendered as **static** text in the board's
  `FINAL SCORE` box.
- Board renders `GameStateDto`; every action (roll/hold/new/ai-turn) is an API call that
  returns fresh state — **no game logic in the frontend**. Buttons carry the current
  `version` as `expectedVersion`. The board **guards on `lastMove === null`** so the first
  render never dereferences a move that hasn't happened.
- **6&6 bust (Extra 4):** when `state.busted` (the single derived flag, I6) is true, disable
  actions ~1.2s and show the bust message/animation, with `state.lastMove.dice` (`[6,6]`)
  visible during it. Because `busted` is derived from `lastMove`, a subsequent hold always
  clears it — the freeze never re-fires on a non-bust turn.
- **AI turn:** when `state.mode === 'ai'` and `state.currentSeat === state.aiSeat`, the client
  calls `POST /games/:id/ai-turn` **once per returned state** and re-calls while the AI seat is
  still current. A `lastMove.kind === 'forfeit'` state (the recoverable cap) hands the turn
  back to the human and stops the loop, showing an "AI gave up its turn" message — driven
  **solely** by that field, no error envelope.
- **Abandoned / finished game.** A `GAME_ABANDONED` response, **or** a `GET /games/:id`
  returning `status: 'abandoned'`/`'finished'`, shows a clear notice driven off the returned
  `status`, and for an abandon reloads `GET /games?status=in_progress`.
- **Session recovery:** `apiClient` maps 401 → `SessionExpiredError`; `GameScreen` renders an
  inline re-login card while the board stays mounted; token lifetime `12h` (revocable via
  `tokenVersion`).
- **Winner highlight:** highlight `winnerSeat` explicitly.
- **Error boundary** wraps `GameScreen`; caught errors log through the structured logger.

- **Verification:** `board.test.tsx` (jsdom + Testing Library) — renders a `GameStateDto`,
  asserts scores/current-seat/target render; a **created-game state with `lastMove: null`
  renders without crashing**; clicking Roll calls the client with the current `version`; a
  `busted` response disables buttons **and a following `hold` state clears the freeze (I6)**;
  a `GAME_ABANDONED` response **and** a fetched `status: 'abandoned'` state both show the
  abandoned notice. `versionConflict.test.tsx` — a `409 VERSION_CONFLICT` triggers a refetch
  and the **next** click carries the refreshed version. `csrf.test.tsx` **(I3, I9)** — a
  state-changing call (including **login**) sends the `X-CSRF-Token` header, and a `GET` does
  not. `sessionResilience.test.tsx` **(I8)** — a `503` shows a transient/retry state and does
  **not** route to login, while a `401` does. `aiLoop.test.tsx` — given successive states
  where the AI seat stays current, the client re-issues `ai-turn` and stops when the seat
  passes or a `forfeit` state returns. Boundary: the UI only ever renders server state and
  never invents game logic or ejects the user on a transient blip.

### §9 — AI opponent (Extra 3)
- `mode='ai'`, `aiSeat` chosen at create. When `currentSeat === aiSeat` the client calls
  `POST /games/:id/ai-turn`. The human can never drive this seat by hand (§3).
- **Single-flight claim + settlement-based release (I2).** Because the paid model call
  happens *before* the short write transaction (to avoid holding a row lock across the
  network), two `ai-turn` requests for the **same** `(gameId, expectedVersion)` — a
  double-click or two tabs — could otherwise both bill an LLM call. A **single-flight claim**
  closes this: `claimAiTurn(gameId, expectedVersion) → 'acquired' | 'alreadyInProgress'` (an
  in-memory keyed lock for this single-instance demo). **The claim and the provider semaphore
  slot are released when the provider promise actually SETTLES — not when the 3s wait ends:**

  ```ts
  const decision = provider.decide(state, signal);              // the real, possibly-hung call
  decision.finally(() => { releaseClaim(); semaphore.release(); }); // released on REAL settlement (I2)
  const result = await raceWithDeadline(decision, AI_DEADLINE_MS); // handler waits at most 3s
  ```

  A timed-out request returns immediately on the heuristic, **but its claim and semaphore
  slot stay held until the underlying call finishes** — so a hung call can never let a second
  `ai-turn` for the same move acquire the claim and start a second paid call, and the
  semaphore truly caps concurrency. Only the `'acquired'` caller computes a decision; the
  loser **refetches `GET /games/:id`** and does not call the model. So one committed AI move
  costs **at most one** LLM call, hung or not. (Documented single-instance assumption; a
  multi-instance deployment would key this in Redis — out of scope, §Scope.)
- **Bounded provider concurrency (I2).** The provider call is wrapped in a small **bounded
  semaphore** (released on real settlement, above) so a burst of `ai-turn` requests can never
  open unlimited concurrent provider operations, even when calls hang. Any provider call that
  hits the deadline is **recorded via the structured logger** (`WARNING` with `{ gameId,
  reason: 'ai_provider_timeout' }`), so a hung or chronically-slow provider is observable.
- **One move per request.** Each `ai-turn` request, after acquiring the claim: (1) re-reads
  game state under the row lock, (2) re-checks `expectedVersion` and derives the actor seat
  from the fresh `currentSeat`, (3) computes **one** decision, (4) applies it through the §6
  transaction — **incrementing `aiMoveCount` only on this normal-move commit** (I1) — (5)
  returns fresh state. The client re-calls while the AI seat is still current.
- **Cap-then-outcome ordering (I1).** The cap is checked against `aiMoveCount` (successful
  moves) **before** any increment, and a winning move still finishes:
  ```ts
  if (game.aiMoveCount >= 50) forfeitToHuman();   // 51st ATTEMPT forfeits; never writes 51 (I1)
  else {
    const outcome = decideAndComputeMove(...);
    if (outcome.won) finish();                    // a winning move ALWAYS finishes
    else applyNormalMove();                        // this path (and ONLY this path) increments aiMoveCount
  }
  ```
  A move that would be the 50th still plays (and can win); the 51st attempt forfeits without
  touching the counter, so the count never reaches 51 and the `ai_move_count <= 50` CHECK
  never rejects the forfeit write — closing the Blocker crash.
- **Forfeit through the same guarded update, round score cleared (I1, I4).**
  `forfeitToHuman()` goes through the identical guarded `updateMany` as §6, **does not
  increment `aiMoveCount`**, and **clears `roundScore` to `0`** so the AI's accumulated round
  points are discarded exactly like a bust or hold — they never become the human's opening
  score:
  ```ts
  const updated = await tx.game.updateMany({
    where: { id, version: expectedVersion, status: 'in_progress' },   // same guard as §6
    data: {
      version: { increment: 1 },
      currentSeat: humanSeat,                             // the non-AI seat
      roundScore: 0,                                      // (I4) AI loses its round on forfeit
      // NO aiMoveCount increment (I1); lastMove derived as { kind: 'forfeit' }; scores untouched
    },
  });
  if (updated.count === 0) {                              // zero-row → same mapping as §6
    const fresh = await tx.game.findUnique({ where: { id } });
    if (fresh?.status === 'abandoned') throw new ConflictError('GAME_ABANDONED');
    throw new ConflictError('VERSION_CONFLICT');
  }
  await tx.move.create({ data: { gameId: id, actorSeat: game.aiSeat!, kind: 'forfeit', roundScore: 0 } });
  ```
  The board stays playable and the human can immediately act, starting their turn with
  `roundScore === 0`. There is no separate error code.
- **Decision computed outside the transaction.** The order is strictly:
  claim → read state → `AiDecisionProvider.decide(state)` (may hit the network, bounded
  semaphore) → validate → open a short, fast transaction to write the one move. **No network
  `await` ever happens while a `FOR UPDATE` lock or open transaction is held.**
- **Application-level deadline.** The provider call is bounded by
  `await Promise.race([provider.decide(state, signal), rejectAfter(AI_DEADLINE_MS)])`, where
  `rejectAfter` rejects on its own timer and `signal` is `AbortSignal.timeout(AI_DEADLINE_MS)`
  passed into the SDK so a cooperative provider also cancels. **`Promise.race` bounds only how
  long the handler *waits* — it does not cancel the underlying provider request**, which is
  exactly why the claim/semaphore release is tied to real settlement (I2) and the timeout is
  logged. A race timeout is treated **exactly like a parse failure** → heuristic.
  `AI_DEADLINE_MS = 3000` is a named constant.
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
  (spy count ≤ 1) and exactly one committed move; the loser refetches. **`aiHungLeak.test.ts`
  (I2)** — a provider that hangs past the deadline: request A times out at 3s and returns the
  heuristic move; **while A's provider call is still unsettled**, request B for the same
  `(gameId, expectedVersion)` arrives and gets `'alreadyInProgress'` (spy asserts B never
  calls `provider.decide`), and the semaphore never exceeds its bound — protects against the
  double-billing/pile-up the wait-end release allowed. `aiTimeout.test.ts` — a provider that
  ignores the abort signal returns within the deadline via `Promise.race`, drives the move
  from the heuristic, and **emits the timeout log**. **`aiCap.test.ts` (I1, I4)** — (a) drive
  `aiMoveCount` to 50, assert the **next** `ai-turn` forfeits (`lastMove.kind === 'forfeit'`,
  `currentSeat` = human seat), **`aiMoveCount` stays 50** (no increment), **the write
  succeeds with no 500**, and **the human's turn starts with `roundScore === 0`** (protects
  both the Blocker crash and the unearned-points exploit); a stale `expectedVersion` forfeit
  yields `VERSION_CONFLICT`; (b) a move that both hits the cap boundary (the 50th) and wins
  **finishes** (`status === 'finished'`, `winnerSeat` set) rather than forfeiting.
  `aiValidation.test.ts` — a malformed model reply falls back to the heuristic.
  `aiBoundary.test.ts` — the payload handed to the provider contains only the six allowed
  fields. The live LLM path is never hit in tests (no network in CI).

### §10 — Auth & gameplay hardening
- Passwords bcrypt cost 12; validated by byte length + minimum as in §5. **Login always runs
  one `bcrypt.compare` against `DUMMY_BCRYPT_HASH` when the user is missing** so present and
  absent usernames take comparable time.
- **JWT** as pinned in §1 (validated `JWT_SECRET`, `HS256` allowlist, `sub`/`tokenVersion`/
  `iat`/`exp`), carried in the **`HttpOnly` cookie**. Auth middleware reads the cookie,
  verifies the signature, and rejects when the JWT's `tokenVersion` ≠ the user's current
  `tokenVersion` → `401 UNAUTHORIZED`.
- **`tokenVersion` DB-dependency failure path (I8).** The per-request `tokenVersion` read is
  wrapped with a short timeout. On success: compare and `401` on mismatch. On **throw/timeout**
  (DB briefly slow/unavailable): return `503 SERVICE_UNAVAILABLE` — a controlled, distinct
  signal, never a misleading `401`. Documented as the deliberate cost of revocation-over-
  statelessness; an optional short in-memory `tokenVersion` cache (invalidated on logout/bump)
  may smooth blips but never overrides a `tokenVersion` bump.
- **Hardened CSRF middleware (I3, I9).** Runs before every state-changing route (**including
  `/auth/login`, `/auth/register`, `/auth/logout`**). It (1) checks `Origin`/`Referer` against
  `FRONTEND_URL`, (2) compares the `X-CSRF-Token` header against the `csrfToken` cookie, and
  (3) verifies the token's embedded HMAC binds it to the current subject (the authenticated
  `sub` post-auth, or the pre-session nonce for the login/register pre-auth token). Any failure
  → `403 CSRF_INVALID`. Production uses the `__Host-csrfToken` cookie prefix; the token rotates
  on login and is cleared on logout. Only `GET`s are exempt from the header echo.
- **Logout.** `POST /auth/logout` clears the auth + `csrfToken` cookies (`Max-Age=0`). Bumping
  `User.tokenVersion` (an admin/self action) invalidates every outstanding token system-wide.
- **Auth rate limiting.** `app.set('trust proxy', false)` — the demo is a **directly-exposed
  single instance**, so Express must **not** believe any `X-Forwarded-For` header; the limiter
  keys off the real socket IP. `/auth/login` **5/min per (ip + normalized-username)**;
  `/auth/register` **10/hr per ip**; `express.json({ limit: '16kb' })` so an oversized body
  never reaches bcrypt. Per-username-only lockout is deliberately rejected. Over-limit →
  `429 RATE_LIMITED`.
- **Gameplay rate limiting.** A modest per-user limit of **60/min** on `roll`, `hold`, and
  `ai-turn`, keyed on the authenticated **JWT `sub`**. Caps a tight `ai-turn` loop against a
  live LLM key from running up cost and DB load. Over-limit → `429 RATE_LIMITED`. In-memory /
  single-instance for this demo — documented assumption.
- Login returns a single generic `INVALID_CREDENTIALS` (no account enumeration by message
  *or* timing); register necessarily reveals a taken name — noted as accepted.

- **Verification:** `authGuards.test.ts` covers the register limit and that 6 wrong logins
  from one IP for one username are throttled while a different username/IP is not; a JWT
  signed with a different algorithm/secret is rejected by verify; **a JWT whose `tokenVersion`
  is behind the user's current value is rejected `401`**. `loginTiming.test.ts` — a login for
  a **nonexistent** username still invokes `bcrypt.compare` exactly once.
  **`tokenVersionUnavailable.test.ts` (I8)** — with the `tokenVersion` read stubbed to
  throw/time out, an otherwise-valid authenticated request returns **`503 SERVICE_UNAVAILABLE`**,
  not `401` (protects the transient-vs-logged-out distinction). **`csrf.test.ts` (I3, I9)** —
  a state-changing POST with a valid auth cookie but **missing/mismatched** `X-CSRF-Token` is
  `403 CSRF_INVALID`; a token whose HMAC binds it to a **different** user is rejected even
  though header == cookie (protects the user-binding); a request with a **cross-origin**
  `Origin` is rejected regardless of token; **a `POST /auth/login` with no CSRF token is
  rejected `403`** (protects login-CSRF, I9); a matching header/cookie/origin trio passes and
  a `GET` needs none. `logout.test.ts` — `POST /auth/logout` clears the cookies (`Max-Age=0`)
  and a subsequent request with the old cookie is `401`. `rateLimitProxy.test.ts` — with
  `trust proxy` false, forged/rotating `X-Forwarded-For` all key to the same socket IP.
  `gameplayRateLimit.test.ts` — 61 `ai-turn`/`roll` calls from one user within a minute get a
  `429` on the last; a different user is unaffected. Boundary: authentication, revocation, and
  every cross-site/forgery path behave as specified.

### §11 — Error handling & observability
Central Express error middleware: `instanceof` typed errors first (`InvalidInputError`,
`ConflictError`, `ForbiddenError`, `NotFoundError`, `CsrfError`, `ServiceUnavailableError`,
…) → envelope; `ZodError → INVALID_INPUT`. **Malformed-JSON body-parser errors (I5):** an
`express.json()` `SyntaxError` (identified by `err.type === 'entity.parse.failed'` /
`instanceof SyntaxError` with a `body` property) is caught **before** the generic
`err.status` fallback and mapped to **`400 INVALID_INPUT`**, so broken JSON produces a union
code instead of an out-of-union body-parser response. Auth middleware failures →
`401 UNAUTHORIZED`; the `tokenVersion` DB-unavailability path → `503 SERVICE_UNAVAILABLE`
(I8); CSRF middleware failures → `403 CSRF_INVALID`. **Per-signal DB mapping** — each database
rule maps to its **own** code, never one blanket "finished":
- the finished-game trigger's own SQLSTATE → `409 GAME_FINISHED`;
- the `game_one_live_per_owner` unique-index violation → `409 GAME_CONFLICT`;
- any other CHECK / constraint failure (incl. the value-range and I7 winner⇔score CHECKs) →
  `500 DATABASE_CONSTRAINT` — **never** silently reported as `GAME_FINISHED`.

Else map by `err.status`; else 500. `app.use` a 404 handler returning
`{ error: { code: 'ROUTE_NOT_FOUND' } }`. A request-id is threaded through the injected
structured logger, and a `/health` route is exposed. All responses (including framework
errors) exit in the single envelope, and every code comes from the shared `ErrorCode` union
and its status table (§1).

- **Verification:** `errors.test.ts` — POST empty body to `/roll` → `INVALID_INPUT` (400);
  **POST broken JSON (`{"expectedVersion":`) → `INVALID_INPUT` (400, I5), distinct from the
  valid-payload Zod case**; unknown route → `ROUTE_NOT_FOUND` (404); missing/garbage cookie
  JWT → `UNAUTHORIZED` (401); **`tokenVersion` read forced to throw → `SERVICE_UNAVAILABLE`
  (503, I8)**; missing CSRF header → `CSRF_INVALID` (403); non-owner → `FORBIDDEN` (403);
  unknown game id → `GAME_NOT_FOUND` (404); finished-game trigger → `GAME_FINISHED` (409);
  one-live-game unique index → `GAME_CONFLICT` (409, not `GAME_FINISHED`); a value-range or
  winner⇔score CHECK → `DATABASE_CONSTRAINT` (500, not `GAME_FINISHED`). Pins every status in
  the §1 table. Boundary: every error the system can emit is a union code with its documented
  status — no raw framework error leaks.

### §12 — Test strategy
- Vitest **workspace**: `apps/web` under `environment: 'jsdom'` + Testing Library;
  `apps/api` under `node`.
- API suites run **serial** (`singleThread: true`) with a `truncateAll()` helper in
  `beforeEach`, against a disposable PostgreSQL that `globalSetup` migrates via
  `prisma migrate deploy`. (Real PostgreSQL is used for tests — SQLite is never involved, so
  raw-SQL triggers/CHECKs, including the value-range and I7 winner⇔score CHECKs, are exercised
  as in production.)

### §13 — Determinism, config & smoke
- `DICE_SEED` env (validated in `config/env.ts`, **refused when `NODE_ENV==='production'`**)
  swaps `diceRoller` for a seeded generator.
- `FRONTEND_URL` is validated in the same `config/env.ts`: **required and non-localhost in
  production**, defaulted to `http://localhost:5173` otherwise. It is now the **exact
  credentialed-CORS origin *and* the CSRF `Origin`-check allowlist (I3, I9)** — a
  missing/localhost production value is a startup failure, tested in `env.test.ts`.
- **Cookie flags by env.** The auth cookie is `HttpOnly; SameSite=Lax; Path=/`, with `Secure`
  set in production and relaxed for local http dev; the CSRF cookie is the same minus
  `HttpOnly`, and uses the **`__Host-csrfToken`** name in production (I3), the plain
  `csrfToken` name outside it. Documented in `config/env.ts` and CLAUDE.md at M0.
- Smoke run: `GET /auth/csrf`, register (assert the `Set-Cookie` auth + csrf cookies come
  back), create a game at `targetScore: 10`, force `[6,6]` via the seed, assert round cleared
  + seat passed, then hold to a win and assert the winner's `wins` incremented by exactly one
  **and `roundScore` is `0`**.

### Milestones
- **M0 — Scaffold & decisions.** Monorepo (`apps/api`, `apps/web`, `packages/shared`),
  Express + Prisma + Vite + Tailwind, env config (`JWT_SECRET` validation, `FRONTEND_URL`
  production-required + CSRF `Origin` allowlist, **credentialed CORS with exact origin**,
  cookie flags by env incl. `__Host-` prefix), error-envelope + `ErrorCode` union and status
  table (§1, incl. `CSRF_INVALID` and **`SERVICE_UNAVAILABLE` (I8)**), documented
  cookie-transport + `tokenVersion`-revocation trade-off **and its `503` failure path (I8)**,
  Vitest workspace, test-DB `globalSetup`. Confirm real installed versions before pinning
  (Tailwind 4 CSS-first `@import "tailwindcss"` + `@theme` + `@tailwindcss/vite`, no
  `tailwind.config.ts` by default — verify at install).
- **M1 — Auth (cookie-based) + hardened CSRF (I3, I9).** register/login/**logout**, bcrypt
  (with the `DUMMY_BCRYPT_HASH` constant-time path), JWT (12h, HS256, validated secret,
  `tokenVersion` claim) **with the `503` DB-unavailability path (I8)**, **`HttpOnly` auth
  cookie + user-bound `__Host-csrfToken` cookie**, **hardened CSRF middleware (HMAC binding +
  `Origin` check + rotation) covering login/register (I9)**, `GET /auth/csrf` pre-auth token,
  auth rate limits with `trust proxy = false`, byte-length/min password and capped username
  rules, `usernameKey` unique index.
- **M2 — Contract (`packages/shared`).** Zod schemas, the full `GameStateDto` schema with
  fixed nullability + `lastMove` discriminated union + pinned numeric bounds **and the derived
  `busted` mapper (I6)**, `ErrorCode` union + status table (incl. `CSRF_INVALID`,
  `SERVICE_UNAVAILABLE`), create-game cross-field refine, `ExpectedVersionSchema`. Both apps
  compile against it before either implements it.
- **M3a — Game happy path.** create / get (incl. abandoned/finished full-state) / roll / hold
  (round-score reset on hold), read/action guard split incl. the AI-seat rejection,
  `actorSeat` from the locked row, pure engine, playable end-to-end with `curl` at
  `targetScore:10`.
- **M3b — Hardening.** optimistic locking + row lock, atomic abandon+create transaction with
  `GAME_ABANDONED`, partial unique index → `GAME_CONFLICT`, guarded one-time win increment
  credited only to a human winner, DB CHECK/trigger invariants (finished-game distinct
  SQLSTATE, mode/seat, value ranges, **winner⇔score consistency CHECKs — I7**), per-signal DB
  error mapping **incl. malformed-JSON → `INVALID_INPUT` (I5)**, per-user gameplay rate limit,
  roll-vs-hold concurrency matrix.
- **M4 — Frontend.** Login, resume, create form, board (guarding `lastMove === null`), 6&6
  disable/animation **off the single derived `busted` (I6)**, AI-turn loop, `VERSION_CONFLICT`
  refetch-recovery, **cookie auth + CSRF-header wiring incl. login pre-auth token + logout
  (I3, I9)**, **`503`-transient handling that does not eject the user (I8)**,
  abandoned/finished notice from fetched state, session card, error boundary. **First fully
  submittable increment** (core assignment + Extras 1/2/4) — the AI opponent (M5) is strictly
  additive.
- **M5 — AI opponent.** `mode`/`aiSeat`, `AiDecisionProvider` adapter (decision outside the
  transaction, application-level 3s `Promise.race` deadline, minimal data boundary, output
  validation), **single-flight claim + bounded provider semaphore released on real settlement
  + timeout logging (I2)**, heuristic fallback, one-move `ai-turn`, **win-safe recoverable
  `aiMoveCount` cap that counts successful moves and fires before the cap (I1)**, **forfeit
  through the guarded update that clears `roundScore` and does not increment the counter (I1,
  I4)**, `forfeit` as the sole cap channel, `Move` rows.

## Open Questions
- **Free LLM provider for the AI agent.** The plan is provider-agnostic (env-configured) with
  a mandatory heuristic fallback, so no key is required to run or grade the project. If you
  want the live agent path exercised in your own demo, pick one free-tier provider (e.g. Groq
  or Google Gemini free tier) behind the adapter and add its key to `.env` at M5 — otherwise
  the heuristic runs.
