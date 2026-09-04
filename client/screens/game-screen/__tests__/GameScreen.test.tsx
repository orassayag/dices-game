import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../../shared/index';
import { GameScreen } from '../GameScreen';
import { ApiError } from '../../../api/apiClient';
import * as gamesApi from '../../../api/gamesApi';

const USER = { id: 'u1', username: 'alice' };

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

describe('GameScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show the create-game form when no in-progress game exists', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
    render(<GameScreen user={USER} onSessionExpired={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Start a new game' })).toBeInTheDocument();
  });

  it('should resume directly to the board when an in-progress game exists', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([freshGame()]);
    render(<GameScreen user={USER} onSessionExpired={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Start a new game' })).not.toBeInTheDocument();
  });

  it('should render a freshly created game (lastMove: null) without crashing', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
    vi.spyOn(gamesApi, 'createGame').mockResolvedValue(freshGame());
    const user = userEvent.setup();
    render(<GameScreen user={USER} onSessionExpired={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Start a new game' });

    await user.click(screen.getByRole('button', { name: 'Start Game' }));

    expect(await screen.findByText('No moves yet.')).toBeInTheDocument();
  });

  it('should call rollGame with the current id and version when Roll is clicked', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([freshGame({ version: 3 })]);
    const rollSpy = vi
      .spyOn(gamesApi, 'rollGame')
      .mockResolvedValue({ state: freshGame({ version: 4 }), versionConflictRecovered: false });
    const user = userEvent.setup();
    render(<GameScreen user={USER} onSessionExpired={vi.fn()} />);
    await screen.findByRole('button', { name: 'Roll' });

    await user.click(screen.getByRole('button', { name: 'Roll' }));

    await waitFor(() => expect(rollSpy).toHaveBeenCalledWith('g1', 3));
  });

  it('should route back to the login screen on an UNAUTHORIZED error', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'expired', 401),
    );
    const onSessionExpired = vi.fn();
    render(<GameScreen user={USER} onSessionExpired={onSessionExpired} />);

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });

  it('should show an abandoned notice and load the fresh game on a GAME_ABANDONED error', async () => {
    const freshOwnedGame = freshGame({ id: 'g2', version: 0 });
    vi.spyOn(gamesApi, 'listInProgressGames')
      .mockResolvedValueOnce([freshGame({ version: 3 })])
      .mockResolvedValueOnce([freshOwnedGame]);
    vi.spyOn(gamesApi, 'rollGame').mockRejectedValue(
      new ApiError('GAME_ABANDONED', 'This game was abandoned before the action was applied.', 409),
    );
    const user = userEvent.setup();
    render(<GameScreen user={USER} onSessionExpired={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Roll' }));

    expect(
      await screen.findByText(/This game was abandoned\. Loading your latest game/),
    ).toBeInTheDocument();
    await waitFor(() => expect(gamesApi.listInProgressGames).toHaveBeenCalledTimes(2));
  });
});
