import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../../shared/index';
import type { PlayerIdentities } from '../../../lib/playerAvatars';
import { GameBoard } from '../GameBoard';

const IDENTITIES: PlayerIdentities = {
  seat1: { name: 'Player One', avatarImageId: 1 },
  seat2: { name: 'Player Two', avatarImageId: 2 },
};

function freshGame(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return {
    id: 'g1',
    mode: 'human',
    aiSeat: null,
    targetScore: 100,
    status: 'in_progress',
    currentSeat: 1,
    p1Score: 0,
    p2Score: 0,
    roundScore: 0,
    lastDice: [],
    winnerSeat: null,
    version: 0,
    lastMove: null,
    busted: false,
    ...overrides,
  };
}

describe('GameBoard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('6&6 bust freeze', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should disable Roll and Hold and show the bust message when busted is true', () => {
      const game = freshGame({
        busted: true,
        lastMove: { kind: 'roll', dice: [6, 6], busted: true },
      });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled();
      expect(screen.getByText(/Busted! Rolled 6 & 6/)).toBeInTheDocument();
    });

    it('should re-enable the buttons after the freeze elapses', () => {
      const game = freshGame({
        busted: true,
        lastMove: { kind: 'roll', dice: [6, 6], busted: true },
      });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );
      expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();

      act(() => {
        vi.advanceTimersByTime(1200);
      });

      expect(screen.getByRole('button', { name: 'Roll' })).not.toBeDisabled();
    });

    it('should clear the freeze early when the next state is not busted', () => {
      const bustedGame = freshGame({
        busted: true,
        version: 1,
        lastMove: { kind: 'roll', dice: [6, 6], busted: true },
      });
      const { rerender } = render(
        <GameBoard
          game={bustedGame}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );
      expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();

      const heldGame = freshGame({ busted: false, version: 2, lastMove: { kind: 'hold' } });
      rerender(
        <GameBoard
          game={heldGame}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('button', { name: 'Roll' })).not.toBeDisabled();
      expect(screen.queryByText(/Busted!/)).not.toBeInTheDocument();
    });
  });

  describe('winner highlight and status notices', () => {
    it('should show the winner notice and highlight the winning player when finished', () => {
      const game = freshGame({ status: 'finished', winnerSeat: 1, p1Score: 100 });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('status')).toHaveTextContent(/🏆🏆🏆.*wins!.*🏆🏆🏆/);
      expect(screen.getAllByText('Winner!')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();
      expect(screen.getByAltText("Player 1's avatar")).toHaveClass('winner-avatar');
      expect(screen.getByAltText("Player 2's avatar")).not.toHaveClass('winner-avatar');
    });

    it('should show the abandoned notice when the game was abandoned', () => {
      const game = freshGame({ status: 'abandoned' });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('status')).toHaveTextContent('This game was abandoned.');
      expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();
    });

    it('should show no status notice for an in-progress game', () => {
      const game = freshGame({ status: 'in_progress' });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('Hold button gating', () => {
    it('should disable Hold before any dice have been rolled this turn', () => {
      const game = freshGame({ roundScore: 0 });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled();
    });

    it('should enable Hold once a roll has added to the round score', () => {
      const game = freshGame({
        roundScore: 5,
        lastMove: { kind: 'roll', dice: [2, 3], busted: false },
      });
      render(
        <GameBoard
          game={game}
          onRoll={vi.fn()}
          onHold={vi.fn()}
          onNewGame={vi.fn()}
          busy={false}
          identities={IDENTITIES}
          aiThinking={false}
        />,
      );

      expect(screen.getByRole('button', { name: 'Hold' })).not.toBeDisabled();
    });
  });
});
