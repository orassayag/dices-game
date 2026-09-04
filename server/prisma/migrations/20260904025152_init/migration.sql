-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('human', 'ai');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('in_progress', 'finished', 'abandoned');

-- CreateEnum
CREATE TYPE "MoveKind" AS ENUM ('roll', 'hold', 'forfeit');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL DEFAULT 'human',
    "aiSeat" INTEGER,
    "aiMoveCount" INTEGER NOT NULL DEFAULT 0,
    "targetScore" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'in_progress',
    "currentSeat" INTEGER NOT NULL DEFAULT 1,
    "p1Score" INTEGER NOT NULL DEFAULT 0,
    "p2Score" INTEGER NOT NULL DEFAULT 0,
    "roundScore" INTEGER NOT NULL DEFAULT 0,
    "lastDice" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "winnerSeat" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Move" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "actorSeat" INTEGER NOT NULL,
    "kind" "MoveKind" NOT NULL,
    "dice" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "busted" BOOLEAN NOT NULL DEFAULT false,
    "roundScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameKey_key" ON "User"("usernameKey");

-- CreateIndex
CREATE INDEX "Game_ownerUserId_status_idx" ON "Game"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "Move_gameId_idx" ON "Move"("gameId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
