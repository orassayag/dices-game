import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../shared/index';
import * as apiClient from '../apiClient';
import { ApiError } from '../apiClient';
import {
  aiTurnGame,
  createGame,
  getGame,
  holdGame,
  listInProgressGames,
  rollGame,
} from '../gamesApi';

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

describe('gamesApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should list in-progress games with the limit query', async () => {
    const spy = vi.spyOn(apiClient, 'apiRequest').mockResolvedValue([makeGame()]);

    const result = await listInProgressGames();

    expect(spy).toHaveBeenCalledWith('/games?status=in_progress&limit=1');
    expect(result).toHaveLength(1);
  });

  it('should POST a new game', async () => {
    const spy = vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(makeGame());

    await createGame({ targetScore: 100, mode: 'human' });

    expect(spy).toHaveBeenCalledWith('/games', {
      method: 'POST',
      body: { targetScore: 100, mode: 'human' },
    });
  });

  it('should GET a game by id', async () => {
    const spy = vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(makeGame());

    await getGame('game-1');

    expect(spy).toHaveBeenCalledWith('/games/game-1');
  });

  it('should roll and report no version conflict on success', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(makeGame({ version: 2 }));

    const result = await rollGame('game-1', 1);

    expect(result.versionConflictRecovered).toBe(false);
    expect(result.state.version).toBe(2);
  });

  it('should hold and report no version conflict on success', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(makeGame({ version: 3 }));

    const result = await holdGame('game-1', 2);

    expect(result.versionConflictRecovered).toBe(false);
  });

  it('should take an AI turn and report no version conflict on success', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(makeGame({ version: 4 }));

    const result = await aiTurnGame('game-1', 3);

    expect(result.versionConflictRecovered).toBe(false);
  });

  it('should recover from a VERSION_CONFLICT by refetching the game', async () => {
    const spy = vi
      .spyOn(apiClient, 'apiRequest')
      .mockRejectedValueOnce(new ApiError('VERSION_CONFLICT', 'stale', 409))
      .mockResolvedValueOnce(makeGame({ version: 9 }));

    const result = await rollGame('game-1', 1);

    expect(result.versionConflictRecovered).toBe(true);
    expect(result.state.version).toBe(9);
    expect(spy).toHaveBeenLastCalledWith('/games/game-1');
  });

  it('should rethrow non-conflict errors', async () => {
    vi.spyOn(apiClient, 'apiRequest').mockRejectedValue(
      new ApiError('GAME_ABANDONED', 'gone', 410),
    );

    await expect(holdGame('game-1', 1)).rejects.toBeInstanceOf(ApiError);
  });
});
