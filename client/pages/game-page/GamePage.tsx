import { GameBoard } from '../../components/game-board/GameBoard';
import { NewGameModal } from '../../components/new-game-modal/NewGameModal';
import { PLACEHOLDER_GAME, useGameSession } from '../../hooks/useGameSession';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface GamePageProps {
  user: AuthenticatedUser;
  onSessionExpired: () => void;
  onLogout: () => void;
}

export function GamePage({ user, onSessionExpired, onLogout }: GamePageProps) {
  const {
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
  } = useGameSession({ onSessionExpired, onLogout });

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4 text-foreground sm:p-6">
      <div className="fixed top-4 left-4 z-40">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Logout
          </button>
          <span aria-hidden="true">|</span>
          <span>{user.username}</span>
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      {infoMessage && <p className="text-sm text-warning">{infoMessage}</p>}

      {/* Assignment requirement: a player can start a new game at any time — GameBoard's
          New Game button opens the modal below instead of navigating to a separate
          screen; submitting it re-runs createGame, which abandons this game server-side
          (M3b abandon+create) before creating the new one. Renders even with no real game
          yet (PLACEHOLDER_GAME) so the New Game modal always opens over a board, never a
          bare page. The automatic login-time modal still shows PLACEHOLDER_GAME (0/0)
          behind it — even over an existing in-progress game — so the player never sees a
          previous game's scores before choosing to resume it. Once the player has opened
          New Game from the in-game button (midGameReopen), the real board stays visible
          and unchanged behind the modal instead: opening/cancelling New Game must never
          look like a reset — only submitting it ("Let's Go!") actually changes state. */}
      <GameBoard
        key={game?.id ?? 'placeholder'}
        game={showNewGameModal && !midGameReopen ? PLACEHOLDER_GAME : (game ?? PLACEHOLDER_GAME)}
        identities={identities}
        wins={wins}
        aiHasPlayed={aiHasPlayed}
        onRoll={() => void handleRoll()}
        onHold={() => void handleHold()}
        onNewGame={openNewGameModal}
        busy={busy}
        aiThinking={aiThinking}
      />

      {showNewGameModal && (
        <NewGameModal
          targetScore={targetScoreInput}
          mode={modeInput}
          aiSeat={aiSeatInput}
          onTargetScoreChange={setTargetScoreInput}
          onModeChange={setModeInput}
          onAiSeatChange={setAiSeatInput}
          onSubmit={() => void handleCreate()}
          onCancel={game ? closeNewGameModal : null}
          busy={busy}
        />
      )}
    </main>
  );
}
