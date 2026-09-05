import { ErrorBoundary } from './components/error-boundary/ErrorBoundary';
import { ThemeToggle } from './components/theme-toggle/ThemeToggle';
import { useCurrentUserSession } from './hooks/useCurrentUserSession';
import { GamePage } from './pages/game-page/GamePage';
import { LoginPage } from './pages/login-page/LoginPage';

// No router: multiple players are simulated on this one page, not multiple browser
// sessions, so there's nothing for a URL to address.
export default function App() {
  const { user, checkingSession, setUser } = useCurrentUserSession();

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <>
      <ThemeToggle />
      {user ? (
        <ErrorBoundary>
          <GamePage
            user={user}
            onSessionExpired={() => setUser(null)}
            onLogout={() => setUser(null)}
          />
        </ErrorBoundary>
      ) : (
        <LoginPage onAuthenticated={setUser} />
      )}
    </>
  );
}
