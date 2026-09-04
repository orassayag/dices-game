-- DB-level invariants that Prisma's schema DSL cannot express (plan_v6.md §2).
-- These are the last line of defense: they hold even if application code has a bug.

-- Finished-game immutability: a finished/abandoned game can never be UPDATEd again.
-- Raised with a distinct SQLSTATE so the error middleware (§11) can map it to
-- GAME_FINISHED without swallowing other constraint failures.
CREATE OR REPLACE FUNCTION game_reject_update_when_not_in_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'in_progress' THEN
    RAISE EXCEPTION 'game % is not in_progress and cannot be updated', OLD.id
      USING ERRCODE = 'PIGF1';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_reject_update_when_not_in_progress
  BEFORE UPDATE ON "Game"
  FOR EACH ROW
  EXECUTE FUNCTION game_reject_update_when_not_in_progress();

-- status <-> winnerSeat consistency.
ALTER TABLE "Game" ADD CONSTRAINT game_status_winner_seat_check
  CHECK ((status = 'finished') = ("winnerSeat" IS NOT NULL));

-- mode <-> aiSeat tie: an ai game must have a seat, a human game must not.
ALTER TABLE "Game" ADD CONSTRAINT game_mode_ai_seat_check
  CHECK ((mode = 'ai') = ("aiSeat" IS NOT NULL));
ALTER TABLE "Game" ADD CONSTRAINT game_ai_seat_range_check
  CHECK ("aiSeat" IN (1, 2) OR "aiSeat" IS NULL);

-- One live (in_progress) game per owner.
CREATE UNIQUE INDEX game_one_live_per_owner
  ON "Game" ("ownerUserId")
  WHERE status = 'in_progress';

-- Value ranges — seat, scores, winner, AI move count.
ALTER TABLE "Game" ADD CONSTRAINT game_current_seat_range_check
  CHECK ("currentSeat" IN (1, 2));
ALTER TABLE "Game" ADD CONSTRAINT game_scores_nonnegative_check
  CHECK ("p1Score" >= 0 AND "p2Score" >= 0 AND "roundScore" >= 0);
ALTER TABLE "Game" ADD CONSTRAINT game_winner_seat_range_check
  CHECK ("winnerSeat" IN (1, 2) OR "winnerSeat" IS NULL);
ALTER TABLE "Game" ADD CONSTRAINT game_ai_move_count_nonnegative_check
  CHECK ("aiMoveCount" >= 0);

-- Value ranges — final safety net against an impossible game even if application
-- validation is bypassed.
ALTER TABLE "Game" ADD CONSTRAINT game_target_score_range_check
  CHECK ("targetScore" BETWEEN 10 AND 1000);
ALTER TABLE "Game" ADD CONSTRAINT game_last_dice_cardinality_check
  CHECK (cardinality("lastDice") IN (0, 2));
ALTER TABLE "Game" ADD CONSTRAINT game_last_dice_values_check
  CHECK ("lastDice" <@ ARRAY[1, 2, 3, 4, 5, 6]);
ALTER TABLE "Game" ADD CONSTRAINT game_ai_move_count_cap_check
  CHECK ("aiMoveCount" <= 50);

-- Winner <-> score consistency (I7): a "winner" who never reached the target score,
-- or an in-progress game already at/over target with no winner, is rejected.
ALTER TABLE "Game" ADD CONSTRAINT game_winner_score_seat1_check
  CHECK (status <> 'finished' OR "winnerSeat" <> 1 OR "p1Score" >= "targetScore");
ALTER TABLE "Game" ADD CONSTRAINT game_winner_score_seat2_check
  CHECK (status <> 'finished' OR "winnerSeat" <> 2 OR "p2Score" >= "targetScore");
ALTER TABLE "Game" ADD CONSTRAINT game_in_progress_below_target_check
  CHECK (status <> 'in_progress' OR ("p1Score" < "targetScore" AND "p2Score" < "targetScore"));
