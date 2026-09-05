-- Per-name persistent win tracking (plan_v6.md §1/§10 — win-count surfaced).
-- Replaces the per-account "User.wins" counter (never read by any endpoint) with a
-- per-owner, per-name leaderboard whose rows accumulate wins across games and survive a
-- page refresh. The AI is one fixed row per owner (AI_PLAYER_NAME).

-- Drop the superseded per-account counter.
ALTER TABLE "User" DROP COLUMN "wins";

-- Seat display names, stored so a winning hold credits the right name server-side.
-- Added with a transient default so existing rows backfill, then the default is dropped:
-- new games always supply both names explicitly (matching the no-@default schema).
ALTER TABLE "Game" ADD COLUMN "p1Name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Game" ADD COLUMN "p2Name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Game" ALTER COLUMN "p1Name" DROP DEFAULT;
ALTER TABLE "Game" ALTER COLUMN "p2Name" DROP DEFAULT;

-- CreateTable
CREATE TABLE "LeaderboardPlayer" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardPlayer_ownerUserId_name_key" ON "LeaderboardPlayer"("ownerUserId", "name");

-- AddForeignKey
ALTER TABLE "LeaderboardPlayer" ADD CONSTRAINT "LeaderboardPlayer_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A win count can never go negative.
ALTER TABLE "LeaderboardPlayer" ADD CONSTRAINT leaderboard_player_wins_nonnegative_check
  CHECK ("wins" >= 0);
