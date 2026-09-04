import { GameStateSchema, type CreateGameInput, type GameStateDto } from '../../shared/index';
import { ApiError, apiRequest } from './apiClient';

const LIST_IN_PROGRESS_GAMES_LIMIT: number = 1;

export async function listInProgressGames(): Promise<GameStateDto[]> {
  const body = await apiRequest(`/games?status=in_progress&limit=${LIST_IN_PROGRESS_GAMES_LIMIT}`);
  return GameStateSchema.array().parse(body);
}

export async function createGame(input: CreateGameInput): Promise<GameStateDto> {
  const body = await apiRequest('/games', { method: 'POST', body: input });
  return GameStateSchema.parse(body);
}

export async function getGame(id: string): Promise<GameStateDto> {
  const body = await apiRequest(`/games/${id}`);
  return GameStateSchema.parse(body);
}

async function rollGameOnce(id: string, expectedVersion: number): Promise<GameStateDto> {
  const body = await apiRequest(`/games/${id}/roll`, {
    method: 'POST',
    body: { expectedVersion },
  });
  return GameStateSchema.parse(body);
}

async function holdGameOnce(id: string, expectedVersion: number): Promise<GameStateDto> {
  const body = await apiRequest(`/games/${id}/hold`, {
    method: 'POST',
    body: { expectedVersion },
  });
  return GameStateSchema.parse(body);
}

export interface GameActionResult {
  state: GameStateDto;
  /** True when a stale `expectedVersion` was recovered by refetching (§8) — the caller
   * should show a "the game moved on" message rather than treating this as a normal move. */
  versionConflictRecovered: boolean;
}

/**
 * Runs a roll/hold action and, on a `409 VERSION_CONFLICT`, recovers centrally by
 * refetching the game instead of surfacing the error — this is what breaks the
 * stale-version retry loop described in plan_v6.md §8.
 */
async function performGameAction(
  id: string,
  action: () => Promise<GameStateDto>,
): Promise<GameActionResult> {
  try {
    const state = await action();
    return { state, versionConflictRecovered: false };
  } catch (error) {
    if (error instanceof ApiError && error.errorCode === 'VERSION_CONFLICT') {
      const state = await getGame(id);
      return { state, versionConflictRecovered: true };
    }
    throw error;
  }
}

export async function rollGame(id: string, expectedVersion: number): Promise<GameActionResult> {
  return await performGameAction(id, () => rollGameOnce(id, expectedVersion));
}

export async function holdGame(id: string, expectedVersion: number): Promise<GameActionResult> {
  return await performGameAction(id, () => holdGameOnce(id, expectedVersion));
}
