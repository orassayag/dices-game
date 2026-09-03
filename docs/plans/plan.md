# Two-Player Dice Game (Pig Variant) — Plan

## Summary

Build a two-player dice game in which every rule is enforced by a backend API and the React
frontend is a pure display-and-dispatch layer. A turn consists of rolling two dice repeatedly —
each roll adds the sum to a *round score* — until the player either rolls 6 & 6 (round score
lost, turn passes) or holds (round score merges into their global total, turn passes). The first
player whose total reaches a configurable target (default 100) wins.

The assignment brief supplies requirements, not decisions. This plan makes every decision once,
in writing: the stack, the folder layout, the database schema, the full API contract, the
identity model that reconciles "authenticated users" with "two players in one browser tab", and
an ordered set of milestones each of which ends in something runnable and demonstrable.

**Stack (fixed):**

| Layer | Choice |
|---|---|
| Backend | Node 20+, Fastify 5, TypeScript (strict), Zod 3 for every boundary |
| Database | PostgreSQL 16 via Prisma ORM (migrations + typed client), run through Docker Compose |
| Frontend | Vite 6, React 19, TypeScript (strict), Tailwind CSS 4 |
| Auth | `@fastify/jwt` (HS256, 60-minute access token), `bcrypt` (cost 12) |
| Tests | Vitest (unit + API integration), Supertest-style via `fastify.inject()` |
| Tooling | npm workspaces monorepo, ESLint + Prettier, `tsc --noEmit` |

---

## Scope

**In scope**

- Register/login with hashed passwords and a short-lived signed token; all game endpoints require it.
- Server-owned dice generation, rule enforcement, turn validation, and game lifecycle.
- A shared, versioned game record in PostgreSQL with optimistic concurrency control.
- Two-seat play in one browser tab: two real user accounts, two tokens held in memory.
- A React board matching the supplied screenshots (`1.png`–`6.png`), styled with Tailwind.
- Unit tests on the pure rule engine and integration tests on the API's guard conditions.
- Extras, in priority order and only after the core is green: win counter, double-six
  animation/lockout, server-side AI opponent, sound effects.

**Explicitly out of scope**

- Live cross-browser/cross-machine synchronisation (the brief waives it). No WebSockets, no polling.
- More than two seats per game; tournaments; matchmaking; spectators.
- Refresh tokens, password reset, email verification, OAuth, or account deletion.
- Production abuse tooling: request signing, per-endpoint quotas, progressive lockout backoff,
  CAPTCHA. One login-attempt cap is the whole of it (see I18).
- Deployment, CI pipelines, containerised production images. Docker Compose exists solely to
  provide a local PostgreSQL instance.
- Internationalisation, theming, or a mobile-specific layout.

---

## Issue Resolutions

| ID | Title | Detected by | Resolution | Notes |
|----|-------|------------|------------|-------|
| I1 | The document is the assignment brief, not an implementation plan | Claude | Fixed | Stack fixed by the developer (Fastify/TS/Zod, Vite/React/TS, PostgreSQL, Tailwind); this plan supplies the layout, schema, contract, and milestones. |
| I2 | Acting player undefined; "two players, one tab" contradicts "authenticated users" | Claude, gemini, grok, z.ai, kimi.ai, preflexity | Fixed | Actor derived from the JWT only. Two real accounts, both tokens in React memory, one seat's token per request. |
| I3 | Authentication spec is one sentence | Claude, grok, kimi.ai, preflexity | Fixed | bcrypt cost 12, HS256 JWT with 60-minute expiry, secret from `JWT_SECRET`, token in memory (never `localStorage`). |
| I4 | Nothing says the *server* rolls the dice | preflexity, grok, Claude | Fixed | `crypto.randomInt(1, 7)` server-side; roll body validated as `z.strictObject({})`, so any supplied dice is a 400. |
| I5 | Two core rules ambiguous (bust cost, win timing) | Claude, grok, preflexity | Fixed | Bust clears the round score only; win checked on hold after the merge with `>=`. Both raised as Open Questions. |
| I6 | No game state model, no lifecycle | grok, Claude, kimi.ai, preflexity | Fixed | Full `Game` record with `status: in_progress → finished \| abandoned`, one-way; `GAME_NOT_ACTIVE` guard on every action. |
| I7 | No API contract | grok, kimi.ai, preflexity, Claude | Fixed | Six endpoints pinned below with a single `GameStateDto` response and one error envelope with fixed codes. |
| I8 | Two fast clicks can corrupt game state | Claude, gemini, grok, z.ai, kimi.ai, preflexity | Fixed | `version` column + conditional `updateMany` inside a transaction; zero rows updated ⇒ 409 `VERSION_CONFLICT`. |
| I9 | AI opponent has no home and no driver | Claude, gemini, z.ai, grok, kimi.ai, preflexity | Fixed | Server-only `POST /games/:id/ai-turn` plays the whole turn through the same rule functions and returns an ordered move list. |
| I10 | Target score unbounded and mutable mid-game | Claude, gemini, z.ai, grok, preflexity | Fixed | `z.number().int().min(10).max(1000).default(100)`, accepted only at creation; input goes read-only once play starts. |
| I11 | Win counting and abandoned games undefined | Claude, preflexity | Fixed | Wins belong to the user account and increment in the same transaction as `status='finished'`; `POST /games` abandons the caller's live games. |
| I12 | No tests required for the rules | Claude, preflexity, kimi.ai, grok | Fixed | Pure rule engine with injected dice; six named unit cases plus API-level guard tests. |
| I13 | One supplied review is about a different project | Claude | Fixed | The `gpt:` block in `reviews.txt` is discarded; six reviewers, not seven. |
| I14 | Screenshots carry unstated acceptance criteria | Claude | Fixed | UI Acceptance section below pins the layout, the label→field mapping, and the deliberate deviations. |
| I15 | Double-six lockout must be presentation only | Claude, gemini, preflexity, kimi.ai, grok | Fixed | Turn passes server-side the instant the bust is saved; the client timer only delays rendering the already-received state. |
| I16 | Extras unordered, unbudgeted, no acceptance criteria | preflexity, Claude | Fixed | Milestone 5 orders them with a one-line acceptance criterion each; each is independently droppable. |
| I17 | CORS and secret configuration unaddressed | grok, kimi.ai, bank | Fixed | CORS allow-list defaults to `http://localhost:5173` (never `'*'`); `.env.example` lists every variable name (bank L002). |
| I18 | No abuse controls on login or rolling | Claude, preflexity | Fixed | `@fastify/rate-limit` on `POST /auth/login` only: 5 attempts per account per 15 minutes. Nothing further. |

---

## Design

### 1. Repository layout

npm workspaces monorepo. A `shared` package holds the Zod schemas and inferred DTOs so the
contract has exactly one definition and the frontend cannot drift from the backend.

```
dices-game/
├── docker-compose.yml           # postgres:16 only
├── package.json                 # workspaces: apps/*, packages/*
├── .env.example                 # every required variable name, no real values
├── docs/
├── packages/
│   └── shared/
│       └── src/
│           ├── schemas/         # Zod: auth, game creation, DTOs, error envelope
│           ├── types/           # z.infer re-exports; no runtime presence
│           └── index.ts
└── apps/
    ├── api/
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   └── src/
    │       ├── domain/          # PURE rule engine — no HTTP, no Prisma, no I/O
    │       │   ├── gameEngine.ts
    │       │   ├── diceRoller.ts        # crypto.randomInt wrapper, injectable
    │       │   ├── aiPolicy.ts
    │       │   └── __tests__/
    │       ├── routes/
    │       │   ├── authRoutes.ts
    │       │   └── gameRoutes.ts
    │       ├── services/
    │       │   ├── authService.ts
    │       │   └── gameService.ts       # transactions + optimistic locking
    │       ├── errors/
    │       │   └── appErrors.ts         # typed error classes
    │       ├── plugins/                 # jwt, cors, rate-limit, prisma, errorHandler
    │       ├── config/env.ts            # Zod-validated process.env, fails fast
    │       ├── app.ts                   # buildApp() — testable via fastify.inject()
    │       └── server.ts
    └── web/
        ├── tailwind.config.ts
        └── src/
            ├── api/apiClient.ts         # typed fetch wrapper, shared schemas
            ├── auth/SeatSessionProvider.tsx
            ├── components/              # Board, PlayerPanel, Dice, ActionBar, ...
            ├── screens/LoginScreen.tsx, GameScreen.tsx
            └── main.tsx
```

**Rule:** `apps/api/src/domain/` imports nothing from Fastify or Prisma. That constraint is what
makes the rule tests one-liners and is enforced by an ESLint `no-restricted-imports` rule on that
directory.

### 2. Database schema (Prisma / PostgreSQL)

```prisma
model User {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String
  wins         Int      @default(0)
  createdAt    DateTime @default(now())
  gamesAsOne   Game[]   @relation("PlayerOne")
  gamesAsTwo   Game[]   @relation("PlayerTwo")
}

enum GameStatus { in_progress finished abandoned }

model Game {
  id                  String     @id @default(uuid())
  playerOneUserId     String
  playerTwoUserId     String
  playerOne           User       @relation("PlayerOne", fields: [playerOneUserId], references: [id])
  playerTwo           User       @relation("PlayerTwo", fields: [playerTwoUserId], references: [id])
  currentPlayerUserId String
  playerOneTotal      Int        @default(0)
  playerTwoTotal      Int        @default(0)
  roundScore          Int        @default(0)
  targetScore         Int        @default(100)
  lastDice            Int[]      @default([])
  status              GameStatus @default(in_progress)
  winnerUserId        String?
  version             Int        @default(0)
  createdAt           DateTime   @default(now())
  finishedAt          DateTime?
  moves               Move[]
  @@index([playerOneUserId, status])
  @@index([playerTwoUserId, status])
}

model Move {
  id         String   @id @default(uuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  actorId    String
  kind       String   // 'roll' | 'hold'
  dice       Int[]    @default([])
  busted     Boolean  @default(false)
  roundScore Int
  createdAt  DateTime @default(now())
  @@index([gameId, createdAt])
}
```

`Move` is the audit trail: it makes the AI's returned move list real data rather than a
constructed response, and lets an interviewer replay any game.

**Verification:** `apps/api/src/__tests__/schema.test.ts` — against a test database, asserts that
a `Game` cannot transition out of `finished` and that `wins` and `status` change together
(observable boundary: a recorded win always has a finished game behind it). Integration layer,
because it is a database-constraint behavior a unit test cannot prove.

### 3. Identity and the two-seat session (I2, I3)

- Registration: `username` (3–32 chars) + `password` (min 8). Password hashed with `bcrypt`
  cost 12. The hash is never selected into any DTO.
- Login returns `{ token, user: { id, username, wins } }`. Token is HS256, 60-minute expiry,
  signed with `JWT_SECRET` from the environment (`config/env.ts` refuses to boot without it).
- **The frontend holds two tokens in React state** — `{ seatOne: Session, seatTwo: Session }` —
  and attaches whichever seat's token matches `currentPlayerUserId`. Never `localStorage`, so an
  injected script cannot exfiltrate them and a refresh forces a clean re-login.
- **No endpoint ever accepts a player identifier.** The actor is `request.user.sub` from the
  verified token, full stop. Every game handler begins:

  ```ts
  if (game.playerOneUserId !== actorId && game.playerTwoUserId !== actorId) throw new ForbiddenError('NOT_A_PARTICIPANT');
  if (game.status !== 'in_progress') throw new ConflictError('GAME_NOT_ACTIVE');
  if (game.currentPlayerUserId !== actorId) throw new ConflictError('NOT_YOUR_TURN');
  ```

**Verification:** `apps/api/src/routes/__tests__/authGuards.test.ts` — asserts that seat two's
token rolling on seat one's turn returns 409 `NOT_YOUR_TURN`, and that a third account's token
returns 403 `NOT_A_PARTICIPANT`. Boundary protected: identity can never be chosen by the client.
Integration layer, because the guard spans JWT verification and the handler.

### 4. Rule engine (I4, I5)

Pure functions, dice injected, no I/O:

```ts
type RollOutcome = { dice: [number, number]; busted: boolean; nextRoundScore: number; nextPlayerUserId: string };

applyRoll(state: GameState, dice: [number, number]): RollOutcome
applyHold(state: GameState): HoldOutcome
```

Decisions written into the engine:

- **Dice are server-only.** `diceRoller.ts` wraps `crypto.randomInt(1, 7)` (cryptographically
  secure, uniform, upper bound exclusive). The roll route body is `z.strictObject({})`, so a
  request carrying `{"dice":[1,1]}` is rejected with 400 `INVALID_INPUT` before reaching the
  engine. The engine's `dice` parameter exists purely so tests can inject values.
- **Bust rule (chosen reading):** `if (d1 === 6 && d2 === 6) { roundScore = 0; passTurn(); }` —
  the *round* score only; totals are untouched. A single 6 scores normally. This follows the
  brief's literal text; the demo video's harsher variant is raised in Open Questions, and
  switching to it is a one-line change (`total = 0` in the bust branch).
- **Win check (chosen reading):** evaluated only on hold, after the merge, with `>=`:
  `total += roundScore; if (total >= targetScore) finish(actorId)`. Consistent with screenshot
  `6.png`, where `CURRENT` still shows a live round score against a reached total.
- **Turn passing:** `nextPlayerUserId` is the other seat, computed in the engine, never sent by
  the client. Player One always takes the first turn (deterministic, avoids an unstated coin flip).

**Verification:** `apps/api/src/domain/__tests__/gameEngine.test.ts` — the six cases the
assignment is actually grading: (1) 6&6 clears the round score and passes the turn; (2) a single
6 scores normally; (3) hold merges the round score into the total and passes the turn; (4) a hold
landing exactly on the target wins; (5) a hold overshooting the target wins; (6) totals are never
mutated by a bust. Unit layer — the narrowest possible, since the engine has no dependencies.
Wrong-turn and finished-game rejection are proven at the route layer (§3), where the guards live.

### 5. API contract (I7)

All game endpoints require `Authorization: Bearer <token>`.

| Method | Path | Body | Success | Purpose |
|---|---|---|---|---|
| POST | `/auth/register` | `{ username, password }` | 201 `{ token, user }` | Create an account |
| POST | `/auth/login` | `{ username, password }` | 200 `{ token, user }` | Obtain a token (rate-limited) |
| POST | `/games` | `{ opponentUsername, targetScore? }` | 201 `GameStateDto` | New game; abandons the caller's live games |
| GET | `/games/:id` | — | 200 `GameStateDto` | Refetch state (used after a 409) |
| POST | `/games/:id/roll` | `{}` (strict) | 200 `RollResultDto` | Server rolls two dice |
| POST | `/games/:id/hold` | `{}` (strict) | 200 `GameStateDto` | Merge round score, pass turn |
| POST | `/games/:id/ai-turn` | `{}` (strict) | 200 `{ moves: MoveDto[], state: GameStateDto }` | Milestone 5 only |

One canonical state shape, so a single response always redraws the whole board:

```jsonc
// GameStateDto
{
  "id": "…", "status": "in_progress",
  "targetScore": 100, "roundScore": 12, "lastDice": [5, 2],
  "players": [
    { "userId": "…", "username": "player-one", "total": 24, "seat": 1, "wins": 3 },
    { "userId": "…", "username": "player-two", "total": 41, "seat": 2, "wins": 1 }
  ],
  "currentPlayerUserId": "…", "winnerUserId": null, "version": 7
}
// RollResultDto = GameStateDto + { "dice": [6,6], "busted": true }
```

One error envelope, one place it is produced (`plugins/errorHandler.ts` mapping typed errors):

```json
{ "error": { "code": "NOT_YOUR_TURN", "message": "It is not your turn." } }
```

| Status | Codes |
|---|---|
| 400 | `INVALID_INPUT` (Zod failure; `message` names the field and what was expected) |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `NOT_A_PARTICIPANT` |
| 404 | `GAME_NOT_FOUND`, `USER_NOT_FOUND` |
| 409 | `NOT_YOUR_TURN`, `GAME_NOT_ACTIVE`, `VERSION_CONFLICT`, `USERNAME_TAKEN` |
| 429 | `TOO_MANY_LOGIN_ATTEMPTS` |

Typed error classes in `errors/appErrors.ts` (`InvalidInputError`, `ConflictError`,
`ForbiddenError`, `UnauthenticatedError`), each carrying `{ errorCode, ...context }`; the handler
discriminates by `instanceof` before a generic 500 fallback. Nothing is logged with the password
or the token in it.

**Verification:** `apps/api/src/routes/__tests__/gameRoutes.test.ts` — one case per error code
asserting both the HTTP status and `error.code`. Boundary protected: the frontend can distinguish
a recoverable 409 (refetch and retry) from a fatal 403. Integration via `fastify.inject()`.

### 6. Concurrency (I8)

Every mutation is one transaction ending in a version-guarded write:

```ts
await prisma.$transaction(async (tx) => {
  const game = await tx.game.findUniqueOrThrow({ where: { id } });
  guard(game, actorId);
  const outcome = applyRoll(toGameState(game), rollDice());
  const updated = await tx.game.updateMany({
    where: { id, version: game.version },
    data: { ...toColumns(outcome), version: { increment: 1 } },
  });
  if (updated.count === 0) throw new ConflictError('VERSION_CONFLICT');
  await tx.move.create({ data: { gameId: id, actorId, kind: 'roll', ...outcome } });
});
```

The client disabling the button in-flight is a courtesy, not the fix. On 409 `VERSION_CONFLICT`
the UI silently `GET /games/:id` and re-renders.

**Verification:** `apps/api/src/services/__tests__/concurrency.test.ts` — fires two `roll`
requests concurrently against one game and asserts exactly one succeeds, the other is 409, and
the round score reflects exactly one roll. Boundary protected: a double-click can never
double-apply or resurrect a busted round score. Integration layer — the race only exists across
a real transaction boundary.

### 7. Game lifecycle and win counting (I6, I11)

- `status` is `in_progress → finished` or `in_progress → abandoned`, never backwards. Enforced by
  the same guard on every handler.
- `POST /games` first sets every `in_progress` game where the caller is a participant to
  `abandoned` with a timestamp, then creates the new game — inside one transaction. This is rule 8
  ("start a new game at any time") made explicit.
- Finishing is atomic: `UPDATE games SET status='finished', winner_id=?, finished_at=now()` and
  `UPDATE users SET wins = wins + 1` commit together or not at all, so a crash can never leave a
  finished game with an unrecorded win.
- Only `finished` games count toward `wins`; abandoning while behind cannot launder a loss.
- Wins belong to the **user account** — which is meaningful precisely because §3 gives each seat
  its own real account.

### 8. Frontend (I14, I15)

React + Tailwind, no game logic. `SeatSessionProvider` holds the two sessions; `apiClient`
attaches the correct token, parses every response through the shared Zod schema, and throws a
typed `ApiError` carrying `error.code`. Server state lives in one `gameState` object replaced
wholesale by each response — the frontend never computes a score, a turn, or a winner.

**UI acceptance.** `1.png`–`6.png` define the target layout. High-quality Tailwind styling is a
first-class requirement, not an afterthought: the split-panel board with the active side
highlighted, the oversized total, the pill-shaped `CURRENT` badge, and the dice faces are built
as reusable components with consistent spacing, transitions, and focus states.

Label → field mapping, pinned:

| Screenshot label | Field |
|---|---|
| `FINAL SCORE` (input) | `targetScore` |
| `CURRENT` (small boxed number) | `roundScore` |
| Large unlabelled number | that player's `total` |
| Two dice images | `lastDice` |

Deliberate deviations from the screenshots, all intentional:

1. A login screen precedes the board (both seats sign in before play) — the brief requires
   authentication and no screenshot shows it.
2. The `FINAL SCORE` input becomes **read-only once the first roll lands** (I10), closing the
   "retype the target to 5 and win" hole visible in `3.png`–`6.png`.
3. A win counter per player is added to each panel (extra 1).

**Bust animation (I15).** The lockout is presentation only. The server has already passed the
turn by the time the response arrives; the client holds the busting player's view for ~1.2s,
shows the message/animation, then applies the already-received state. Disabled buttons are not a
rule — anything that slips through the window is rejected by the turn check in §3.

**Error boundary:** `GameScreen` is wrapped in an error boundary whose fallback offers "Reload
game" and "New game" rather than a dead end.

**Verification:** `apps/web/src/components/__tests__/board.test.tsx` (Vitest + Testing Library) —
renders a `GameStateDto` fixture and asserts the mapping above, that the target input is
`readOnly` when `roundScore > 0 || lastDice.length > 0`, and that Roll/Hold are disabled for the
non-active seat. Boundary protected: the display never contradicts server state. Component layer,
which is the narrowest that proves rendering.

### 9. Configuration and CORS (I17)

`config/env.ts` parses `process.env` through a Zod schema at boot and exits with a named-field
message if anything is missing. `.env.example` is committed with every key and no values:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dices
JWT_SECRET=
CORS_ORIGIN=http://localhost:5173
PORT=3000
```

CORS is an explicit allow-list whose **default is a real origin** (`http://localhost:5173`), never
`'*'` — an unset variable fails closed rather than silently opening the API (bank lesson L002).
`JWT_SECRET` has no default at all; the server refuses to start without it.

### 10. Rate limiting (I18)

`@fastify/rate-limit` on `POST /auth/login` only: 5 attempts per username per 15 minutes,
returning 429 `TOO_MANY_LOGIN_ATTEMPTS`. Deliberately nothing else — a locally-run two-player
take-home does not warrant per-endpoint quotas or request signing. Accepted, stated gap: the roll
endpoint is unthrottled, which is fine behind the turn check (a bot can only spam its own turn).

### 11. Discarded input (I13)

The `gpt:` block in `docs/pre-plans/reviews.txt` reviews an unrelated "Cosmos incident replay"
project. None of its findings apply and none were carried in. The review file represents six
independent opinions, not seven.

### 12. Milestones

Applies the draft's Scope Challenge, resequenced so persistence lands with the API (PostgreSQL is
the chosen store, not an extra). Each milestone ends in something runnable and demonstrable.

**M0 — Scaffold.** npm workspaces, both apps, strict TS, ESLint/Prettier, Tailwind wired,
`docker-compose up -d` for PostgreSQL, Prisma initialised, `GET /health` green.
*Done when:* `npm run dev` boots API and web, and `/health` returns 200.
*Tests:* none (pure config — stated deliberately).

**M1 — Rule engine + tests.** `domain/` only: `applyRoll`, `applyHold`, `diceRoller`, all pure.
*Done when:* the six §4 cases pass. This is the milestone the assignment is actually grading.
*Tests:* `domain/__tests__/gameEngine.test.ts`.

**M2 — Auth + schema.** Prisma models, migration, register/login, JWT plugin, CORS, env
validation, login rate limit.
*Done when:* two accounts can be registered and logged in via `curl`; a bad password is 401; the
sixth attempt is 429.
*Tests:* `routes/__tests__/authRoutes.test.ts`.

**M3 — Game API.** All six endpoints, guards, transactions, optimistic locking, lifecycle, atomic
win increment.
*Done when:* a full game is playable to a win with `curl` alone, and every §5 error code is
reproducible.
*Tests:* `gameRoutes.test.ts`, `authGuards.test.ts`, `concurrency.test.ts`, `schema.test.ts`.

**M4 — React UI.** Login screen, two-seat session, board matching the screenshots with
high-quality Tailwind styling, read-only target after first roll, error boundary.
*Done when:* the full game is playable in the browser, and the network tab shows one request per
click with no client-side scoring.
*Tests:* `components/__tests__/board.test.tsx`.

**M5 — Extras, in order, each independently droppable.**

| # | Extra | Acceptance criterion |
|---|---|---|
| 1 | Win counter | Wins increment only when the server marks a game `finished`, and survive a server restart. |
| 2 | Double-six animation + lockout | The message shows for ~1.2s; a request fired during the window is still rejected 409 by the server. |
| 3 | Server-side AI opponent | `POST /games/:id/ai-turn` returns the ordered move list; policy is hold at `roundScore >= 20` or when holding would win; the UI only replays the array. |
| 4 | Sound effects | Roll and bust sounds play on user-initiated actions, behind a mute toggle defaulting to on-mute (browser autoplay policy). |

*Tests:* `domain/__tests__/aiPolicy.test.ts` for the AI decision function (unit, dice injected).
Sound and animation are presentation-only and carry no automated test — stated deliberately.

### 13. Final acceptance

`/test` green across the repo: `tsc --noEmit` on all three workspaces, ESLint clean, Vitest suites
passing, `vite build` succeeding, plus a runtime smoke — boot the API against a live PostgreSQL,
register two accounts, create a game, roll to a bust, hold to a win, and confirm the winner's
`wins` incremented by exactly one.

---

## Open Questions

Neither blocks implementation — each has a decided default and a one-line switch cost. All three
should be put to the interviewer.

1. **Does a double six cost the round score or the entire total?** The written rule 4 says the
   round score; the linked demo video uses the variant that wipes the player's whole accumulated
   score. Implemented per the written text. Switching costs one line in the engine's bust branch.
2. **Is the win checked on every roll, or only on hold?** Rule 6 says "first to reach", rule 5a
   says totals only change on hold. Implemented as check-on-hold, consistent with `6.png`.
   Switching means also evaluating the win inside `applyRoll`.
3. **Is visual fidelity to `1.png`–`6.png` graded?** The layout is being matched with the three
   deviations listed in §8. If pixel fidelity is not graded, the styling budget in M4 shrinks.
