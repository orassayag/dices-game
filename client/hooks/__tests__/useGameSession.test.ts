import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../shared/index';
import { ApiError } from '../../api/apiClient';
import * as authApi from '../../api/authApi';
import * as gamesApi from '../../api/gamesApi';
import * as sound from '../../lib/sound';
import { useGameSession } from '../useGameSession';

vi.mock('../../api/gamesApi');
vi.mock('../../api/authApi');
vi.mock('../../lib/sound');

function makeGame(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return {
    id: 'game-1',
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
    version: 1,
    lastMove: null,
    busted: false,
    ...overrides,
  };
}

function renderSession() {
  const onSessionExpired = vi.fn();
  const onLogout = vi.fn();
  const view = renderHook(() => useGameSession({ onSessionExpired, onLogout }));
  return { ...view, onSessionExpired, onLogout };
}

describe('useGameSession', () => {
  beforeEach(() => {
    vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([]);
    vi.mocked(sound.playWinSound).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('mount', () => {
    it('should load an in-progress game and open the modal', async () => {
      vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([makeGame()]);
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.game?.id).toBe('game-1');
      expect(result.current.showNewGameModal).toBe(true);
    });

    it('should call onSessionExpired when the session is unauthorized', async () => {
      vi.mocked(gamesApi.listInProgressGames).mockRejectedValue(
        new ApiError('UNAUTHORIZED', 'no', 401),
      );
      const { onSessionExpired } = renderSession();
      await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    });

    it('should surface a friendly error for a non-ApiError mount failure', async () => {
      vi.mocked(gamesApi.listInProgressGames).mockRejectedValue(new Error('boom'));
      const { result } = renderSession();
      await waitFor(() =>
        expect(result.current.errorMessage).toBe('Something went wrong. Please try again.'),
      );
      expect(result.current.loading).toBe(false);
    });
  });

  describe('handleCreate', () => {
    it('should create a human game and close the modal', async () => {
      vi.mocked(gamesApi.createGame).mockResolvedValue(makeGame({ id: 'created' }));
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.handleCreate();
      });

      expect(gamesApi.createGame).toHaveBeenCalledWith({ targetScore: 100, mode: 'human' });
      expect(result.current.showNewGameModal).toBe(false);
      expect(result.current.game?.id).toBe('created');
    });

    it('should create an AI game with the selected seat', async () => {
      vi.mocked(gamesApi.createGame).mockResolvedValue(
        makeGame({ mode: 'ai', aiSeat: 1, currentSeat: 2 }),
      );
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.setModeInput('ai');
        result.current.setAiSeatInput(1);
      });
      await act(async () => {
        await result.current.handleCreate();
      });

      expect(gamesApi.createGame).toHaveBeenCalledWith({
        targetScore: 100,
        mode: 'ai',
        aiSeat: 1,
      });
      expect(result.current.aiHasPlayed).toBe(true);
    });
  });

  describe('handleRoll / handleHold', () => {
    async function mountedWithGame() {
      vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([makeGame()]);
      const view = renderSession();
      await waitFor(() => expect(view.result.current.loading).toBe(false));
      act(() => view.result.current.closeNewGameModal());
      return view;
    }

    it('should roll and update the game', async () => {
      const { result } = await mountedWithGame();
      vi.mocked(gamesApi.rollGame).mockResolvedValue({
        state: makeGame({ version: 2, roundScore: 5 }),
        versionConflictRecovered: false,
      });
      await act(async () => {
        await result.current.handleRoll();
      });
      expect(result.current.game?.roundScore).toBe(5);
    });

    it('should show an info message when a version conflict was recovered', async () => {
      const { result } = await mountedWithGame();
      vi.mocked(gamesApi.rollGame).mockResolvedValue({
        state: makeGame({ version: 9 }),
        versionConflictRecovered: true,
      });
      await act(async () => {
        await result.current.handleRoll();
      });
      expect(result.current.infoMessage).toMatch(/moved on/);
    });

    it('should call onSessionExpired on an unauthorized action', async () => {
      const { result, onSessionExpired } = await mountedWithGame();
      vi.mocked(gamesApi.rollGame).mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', 401));
      await act(async () => {
        await result.current.handleRoll();
      });
      expect(onSessionExpired).toHaveBeenCalled();
    });

    it('should reload the latest game when the current one is abandoned', async () => {
      const { result } = await mountedWithGame();
      vi.mocked(gamesApi.rollGame).mockRejectedValue(new ApiError('GAME_ABANDONED', 'gone', 410));
      vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([makeGame({ id: 'reloaded' })]);
      await act(async () => {
        await result.current.handleRoll();
      });
      expect(result.current.game?.id).toBe('reloaded');
    });

    it('should surface a reload failure after abandonment', async () => {
      const { result } = await mountedWithGame();
      vi.mocked(gamesApi.rollGame).mockRejectedValue(new ApiError('GAME_ABANDONED', 'gone', 410));
      vi.mocked(gamesApi.listInProgressGames).mockRejectedValue(new Error('reload failed'));
      await act(async () => {
        await result.current.handleRoll();
      });
      expect(result.current.errorMessage).toBe('Something went wrong. Please try again.');
    });

    it('should surface a generic action error', async () => {
      const { result } = await mountedWithGame();
      vi.mocked(gamesApi.holdGame).mockRejectedValue(new ApiError('INVALID_INPUT', 'bad', 400));
      await act(async () => {
        await result.current.handleHold();
      });
      expect(result.current.errorMessage).toBe('bad');
    });

    it('should no-op roll and hold when there is no game', async () => {
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleRoll();
        await result.current.handleHold();
      });
      expect(gamesApi.rollGame).not.toHaveBeenCalled();
      expect(gamesApi.holdGame).not.toHaveBeenCalled();
    });
  });

  describe('win counting', () => {
    it('should increment the seat win count and play the win sound', async () => {
      vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([makeGame()]);
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.closeNewGameModal());

      vi.mocked(gamesApi.holdGame).mockResolvedValue({
        state: makeGame({ status: 'finished', winnerSeat: 1, version: 2 }),
        versionConflictRecovered: false,
      });
      await act(async () => {
        await result.current.handleHold();
      });

      expect(result.current.wins.seat1).toBe(1);
      expect(sound.playWinSound).toHaveBeenCalledTimes(1);
    });

    it('should credit the AI when it wins', async () => {
      vi.mocked(gamesApi.listInProgressGames).mockResolvedValue([
        makeGame({ mode: 'ai', aiSeat: 2 }),
      ]);
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.closeNewGameModal());

      vi.mocked(gamesApi.holdGame).mockResolvedValue({
        state: makeGame({ mode: 'ai', aiSeat: 2, status: 'finished', winnerSeat: 2, version: 2 }),
        versionConflictRecovered: false,
      });
      await act(async () => {
        await result.current.handleHold();
      });

      expect(result.current.wins.ai).toBe(1);
    });
  });

  describe('handleLogout', () => {
    it('should log out and notify on success', async () => {
      vi.mocked(authApi.logout).mockResolvedValue(undefined);
      const { result, onLogout } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleLogout();
      });
      expect(onLogout).toHaveBeenCalled();
    });

    it('should still notify when the logout request fails', async () => {
      vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'));
      const { result, onLogout } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.handleLogout();
      });
      expect(onLogout).toHaveBeenCalled();
    });
  });

  describe('modal controls', () => {
    it('should open the modal mid-game and close it again', async () => {
      const { result } = renderSession();
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.openNewGameModal());
      expect(result.current.showNewGameModal).toBe(true);
      expect(result.current.midGameReopen).toBe(true);

      act(() => result.current.closeNewGameModal());
      expect(result.current.showNewGameModal).toBe(false);
    });
  });
});
