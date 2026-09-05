import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../../shared/index';
import { GamePage } from '../GamePage';
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

describe('GamePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should open the new-game modal automatically when no in-progress game exists', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('should always open the new-game modal on load, even when an in-progress game exists', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([freshGame()]);
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll' })).toBeInTheDocument();
  });

  it('should show 0/0 behind the modal on load instead of the previous game’s scores', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
      freshGame({ p1Score: 33, p2Score: 37 }),
    ]);
    const user = userEvent.setup();
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'New Game' });

    expect(screen.queryByText('33')).not.toBeInTheDocument();
    expect(screen.queryByText('37')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('should reopen a cancellable modal over the unchanged board when New Game is clicked mid-game, leaving the in-progress scores visible and untouched', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
      freshGame({ p1Score: 33, p2Score: 37 }),
    ]);
    const user = userEvent.setup();
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'New Game' })).not.toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New Game' }));

    expect(await screen.findByRole('heading', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('heading', { name: 'New Game' })).not.toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('should only reset game state when New Game is submitted via "Let\'s Go!", not merely by opening the modal', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
      freshGame({ p1Score: 33, p2Score: 37 }),
    ]);
    vi.spyOn(gamesApi, 'createGame').mockResolvedValue(
      freshGame({ id: 'g2', p1Score: 0, p2Score: 0 }),
    );
    const user = userEvent.setup();
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.getByText('33')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Let's Go!" }));

    await waitFor(() => expect(screen.queryByText('33')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'New Game' })).not.toBeInTheDocument();
  });

  it('should render a freshly created game (lastMove: null) without crashing, and with no "no moves" placeholder text', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
    vi.spyOn(gamesApi, 'createGame').mockResolvedValue(freshGame());
    const user = userEvent.setup();
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByRole('heading', { name: 'New Game' });

    await user.click(screen.getByRole('button', { name: "Let's Go!" }));

    expect(await screen.findByRole('button', { name: 'Roll' })).toBeInTheDocument();
    expect(screen.queryByText(/no moves/i)).not.toBeInTheDocument();
  });

  it('should call rollGame with the current id and version when Roll is clicked', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([freshGame({ version: 3 })]);
    const rollSpy = vi
      .spyOn(gamesApi, 'rollGame')
      .mockResolvedValue({ state: freshGame({ version: 4 }), versionConflictRecovered: false });
    const user = userEvent.setup();
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Roll' }));

    await waitFor(() => expect(rollSpy).toHaveBeenCalledWith('g1', 3));
  });

  it('should route back to the login screen on an UNAUTHORIZED error', async () => {
    vi.spyOn(gamesApi, 'listInProgressGames').mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'expired', 401),
    );
    const onSessionExpired = vi.fn();
    render(<GamePage user={USER} onSessionExpired={onSessionExpired} onLogout={vi.fn()} />);

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
    render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Roll' }));

    expect(
      await screen.findByText(/This game was abandoned\. Loading your latest game/),
    ).toBeInTheDocument();
    await waitFor(() => expect(gamesApi.listInProgressGames).toHaveBeenCalledTimes(2));
  });

  describe('AI opponent selection (§8)', () => {
    it('should show the AI seat selector only after choosing the AI opponent', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await screen.findByRole('heading', { name: 'New Game' });

      expect(screen.queryByLabelText('AI plays seat')).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText('Opponent'), 'ai');

      expect(screen.getByLabelText('AI plays seat')).toBeInTheDocument();
    });

    it('should create an ai-mode game with the chosen aiSeat', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
      const createSpy = vi
        .spyOn(gamesApi, 'createGame')
        .mockResolvedValue(freshGame({ mode: 'ai', aiSeat: 2 }));
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await screen.findByRole('heading', { name: 'New Game' });

      await user.selectOptions(screen.getByLabelText('Opponent'), 'ai');
      await user.selectOptions(screen.getByLabelText('AI plays seat'), '2');
      await user.click(screen.getByRole('button', { name: "Let's Go!" }));

      await waitFor(() =>
        expect(createSpy).toHaveBeenCalledWith({ targetScore: 100, mode: 'ai', aiSeat: 2 }),
      );
    });
  });

  describe('player identity stability', () => {
    it('should keep player avatars stable while editing the new-game modal fields', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([]);
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await screen.findByRole('heading', { name: 'New Game' });

      const avatar1Before = screen.getByAltText("Player 1's avatar").getAttribute('src');
      const avatar2Before = screen.getByAltText("Player 2's avatar").getAttribute('src');

      const goalScoreInput = screen.getByLabelText('Goal score');
      await user.clear(goalScoreInput);
      await user.type(goalScoreInput, '250');

      expect(screen.getByAltText("Player 1's avatar")).toHaveAttribute('src', avatar1Before);
      expect(screen.getByAltText("Player 2's avatar")).toHaveAttribute('src', avatar2Before);
    });
  });

  describe('AI turn loop (§8, §9)', () => {
    it('should call aiTurnGame automatically when it becomes the AI seat’s turn', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
        freshGame({ mode: 'ai', aiSeat: 1, currentSeat: 1, version: 5 }),
      ]);
      const aiTurnSpy = vi.spyOn(gamesApi, 'aiTurnGame').mockResolvedValue({
        state: freshGame({ mode: 'ai', aiSeat: 1, currentSeat: 2, version: 6 }),
        versionConflictRecovered: false,
      });
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(aiTurnSpy).toHaveBeenCalledWith('g1', 5), { timeout: 2000 });
    });

    it('should show a thinking indicator above the AI seat while the pre-move delay and the call are in flight', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
        freshGame({ mode: 'ai', aiSeat: 1, currentSeat: 1, version: 5 }),
      ]);
      vi.spyOn(gamesApi, 'aiTurnGame').mockResolvedValue({
        state: freshGame({ mode: 'ai', aiSeat: 1, currentSeat: 2, version: 6 }),
        versionConflictRecovered: false,
      });
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(screen.getByText('Player 1 (AI) is thinking…')).toBeInTheDocument();
      await waitFor(
        () => expect(screen.queryByText('Player 1 (AI) is thinking…')).not.toBeInTheDocument(),
        {
          timeout: 2000,
        },
      );
    });

    it('should stop looping once a forfeit hands the turn back to the human seat', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
        freshGame({ mode: 'ai', aiSeat: 1, currentSeat: 1, version: 5 }),
      ]);
      const aiTurnSpy = vi.spyOn(gamesApi, 'aiTurnGame').mockResolvedValue({
        state: freshGame({
          mode: 'ai',
          aiSeat: 1,
          currentSeat: 2,
          version: 6,
          lastMove: { kind: 'forfeit' },
        }),
        versionConflictRecovered: false,
      });
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));

      await screen.findByText('AI gave up its turn.', {}, { timeout: 2000 });
      await waitFor(() => expect(aiTurnSpy).toHaveBeenCalledTimes(1));
    });

    it('should pause the AI auto-turn loop while the New Game modal is open', async () => {
      vi.spyOn(gamesApi, 'listInProgressGames').mockResolvedValue([
        freshGame({ id: 'old-game', mode: 'ai', aiSeat: 1, currentSeat: 1, version: 5 }),
      ]);
      let resolveFirstAiTurn: (value: gamesApi.GameActionResult) => void = () => {};
      const firstAiTurnPromise = new Promise<gamesApi.GameActionResult>((resolve) => {
        resolveFirstAiTurn = resolve;
      });
      const aiTurnSpy = vi.spyOn(gamesApi, 'aiTurnGame').mockReturnValueOnce(firstAiTurnPromise);
      const user = userEvent.setup();
      render(<GamePage user={USER} onSessionExpired={vi.fn()} onLogout={vi.fn()} />);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(aiTurnSpy).toHaveBeenCalledTimes(1), { timeout: 2000 });

      await user.click(screen.getByRole('button', { name: 'New Game' }));
      await screen.findByRole('heading', { name: 'New Game' });

      // Resolves with the AI seat still to move — without the modal-open gate this would
      // immediately re-trigger a second automatic aiTurnGame call.
      resolveFirstAiTurn({
        state: freshGame({ id: 'old-game', mode: 'ai', aiSeat: 1, currentSeat: 1, version: 6 }),
        versionConflictRecovered: false,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: "Let's Go!" })).not.toBeDisabled(),
      );

      expect(aiTurnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
