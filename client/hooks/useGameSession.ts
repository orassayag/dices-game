import { useEffect, useRef, useState } from 'react';
import type { CreateGameInput, GameStateDto } from '../../shared/index';
import { ApiError } from '../api/apiClient';
import { logout } from '../api/authApi';
import {
  aiTurnGame,
  createGame,
  holdGame,
  listInProgressGames,
  rollGame,
  type GameActionResult,
} from '../api/gamesApi';
import type { WinCounts } from '../components/game-board/GameBoard';
import { createLogger } from '../lib/logger';
import { generatePlayerIdentities, type PlayerIdentities } from '../lib/playerAvatars';
import { playWinSound } from '../lib/sound';

const logger = createLogger('game-screen');

const DEFAULT_TARGET_SCORE: number = 100;
const DEFAULT_AI_SEAT: 1 | 2 = 2;

const AI_TURN_THINK_DELAY_MS: number = 900;

export const PLACEHOLDER_GAME: GameStateDto = {
  id: '__placeholder__',
  mode: 'human',
  aiSeat: null,
  targetScore: DEFAULT_TARGET_SCORE,
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
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

interface UseGameSessionOptions {
  onSessionExpired: () => void;
  onLogout: () => void;
}

interface UseGameSessionResult {
  game: GameStateDto | null;
  loading: boolean;
  busy: boolean;
  showNewGameModal: boolean;
  midGameReopen: boolean;
  targetScoreInput: number;
  modeInput: 'human' | 'ai';
  aiSeatInput: 1 | 2;
  errorMessage: string | null;
  infoMessage: string | null;
  aiThinking: boolean;
  wins: WinCounts;
  aiHasPlayed: boolean;
  identities: PlayerIdentities;
  setTargetScoreInput: (value: number) => void;
  setModeInput: (value: 'human' | 'ai') => void;
  setAiSeatInput: (value: 1 | 2) => void;
  handleCreate: () => Promise<void>;
  handleRoll: () => Promise<void>;
  handleHold: () => Promise<void>;
  handleLogout: () => Promise<void>;
  openNewGameModal: () => void;
  closeNewGameModal: () => void;
}

export function useGameSession({ onSessionExpired, onLogout }: UseGameSessionOptions): UseGameSessionResult {
  const [game, setGame] = useState<GameStateDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [showNewGameModal, setShowNewGameModal] = useState<boolean>(false);
  const [midGameReopen, setMidGameReopen] = useState<boolean>(false);
  const [targetScoreInput, setTargetScoreInput] = useState<number>(DEFAULT_TARGET_SCORE);
  const [modeInput, setModeInput] = useState<'human' | 'ai'>('human');
  const [aiSeatInput, setAiSeatInput] = useState<1 | 2>(DEFAULT_AI_SEAT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState<boolean>(false);
  const [wins, setWins] = useState<WinCounts>({ seat1: 0, seat2: 0, ai: 0 });
  // Deliberately sticky: set to true once, never reset back to false.
  const [aiHasPlayed, setAiHasPlayed] = useState<boolean>(false);
  const countedWinGameIdsRef = useRef<Set<string>>(new Set());
  const [identities] = useState(() => generatePlayerIdentities());

  useEffect(() => {
    listInProgressGames()
      .then((games) => {
        const inProgressGame = games[0] ?? null;
        setGame(inProgressGame);
        setShowNewGameModal(true);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
          onSessionExpired();
          return;
        }
        setErrorMessage(friendlyErrorMessage(error));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  async function runAction(action: () => Promise<GameActionResult>): Promise<boolean> {
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await action();
      setGame(result.state);
      if (result.versionConflictRecovered) {
        setInfoMessage('The game moved on — showing the latest state. Try again.');
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
        onSessionExpired();
        return false;
      }
      if (error instanceof ApiError && error.errorCode === 'GAME_ABANDONED') {
        setErrorMessage('This game was abandoned. Loading your latest game…');
        try {
          const games = await listInProgressGames();
          const inProgressGame = games[0] ?? null;
          setGame(inProgressGame);
          setShowNewGameModal(inProgressGame === null);
        } catch (reloadError) {
          setErrorMessage(friendlyErrorMessage(reloadError));
        }
        return false;
      }
      setErrorMessage(friendlyErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!game || busy || showNewGameModal) {
      return;
    }
    if (game.status !== 'in_progress' || game.mode !== 'ai' || game.currentSeat !== game.aiSeat) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timeoutId: number = window.setTimeout(() => {
      void runAction(() => aiTurnGame(game.id, game.version)).finally(() => setAiThinking(false));
    }, AI_TURN_THINK_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAction is stable across renders
  }, [game, busy, showNewGameModal]);

  useEffect(() => {
    if (game?.mode === 'ai') {
      setAiHasPlayed(true);
    }
  }, [game]);

  useEffect(() => {
    if (!game || game.status !== 'finished' || game.winnerSeat === null) {
      return;
    }
    if (countedWinGameIdsRef.current.has(game.id)) {
      return;
    }
    countedWinGameIdsRef.current.add(game.id);
    const winnerSeat: 1 | 2 = game.winnerSeat;
    const winnerIsAi: boolean = game.mode === 'ai' && winnerSeat === game.aiSeat;
    const winnerKey: keyof WinCounts = winnerIsAi ? 'ai' : winnerSeat === 1 ? 'seat1' : 'seat2';
    setWins((current) => ({ ...current, [winnerKey]: current[winnerKey] + 1 }));
    playWinSound();
  }, [game]);

  async function handleCreate(): Promise<void> {
    const succeeded = await runAction(async () => {
      const input: CreateGameInput =
        modeInput === 'ai'
          ? { targetScore: targetScoreInput, mode: 'ai', aiSeat: aiSeatInput }
          : { targetScore: targetScoreInput, mode: 'human' };
      const state = await createGame(input);
      return { state, versionConflictRecovered: false };
    });
    if (succeeded) {
      setShowNewGameModal(false);
    }
  }

  async function handleRoll(): Promise<void> {
    if (!game) {
      return;
    }
    await runAction(() => rollGame(game.id, game.version));
  }

  async function handleHold(): Promise<void> {
    if (!game) {
      return;
    }
    await runAction(() => holdGame(game.id, game.version));
  }

  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch (error) {
      logger.warn('Logout request failed; clearing local session anyway', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onLogout();
    }
  }

  function openNewGameModal(): void {
    setMidGameReopen(true);
    setShowNewGameModal(true);
  }

  function closeNewGameModal(): void {
    setShowNewGameModal(false);
  }

  return {
    game,
    loading,
    busy,
    showNewGameModal,
    midGameReopen,
    targetScoreInput,
    modeInput,
    aiSeatInput,
    errorMessage,
    infoMessage,
    aiThinking,
    wins,
    aiHasPlayed,
    identities,
    setTargetScoreInput,
    setModeInput,
    setAiSeatInput,
    handleCreate,
    handleRoll,
    handleHold,
    handleLogout,
    openNewGameModal,
    closeNewGameModal,
  };
}
