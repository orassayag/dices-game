import { useEffect, useState } from 'react';
import { getCurrentUser } from './api/authApi';
import { LoginScreen } from './screens/login-screen/LoginScreen';
import { GameScreen } from './screens/game-screen/GameScreen';
import { ErrorBoundary } from './components/error-boundary/ErrorBoundary';
import { ThemeToggle } from './components/theme-toggle/ThemeToggle';

interface AuthenticatedUser {
  id: string;
  username: string;
}

// No router: two screens with no distinct URLs (§8) — multiple players are simulated on
// this one page, not multiple browser sessions, so there's nothing for a URL to address.
export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  // Bug fix: without this check, every reload showed LoginScreen even with a still-valid
  // auth cookie, because `user` starts as null and nothing ever asked the server whether
  // a session already existed. Gates the very first render so the login screen never
  // flashes before that one check resolves.
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  useEffect(() => {
    getCurrentUser()
      .then((response) => setUser(response.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

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
          <GameScreen
            user={user}
            onSessionExpired={() => setUser(null)}
            onLogout={() => setUser(null)}
          />
        </ErrorBoundary>
      ) : (
        <LoginScreen onAuthenticated={setUser} />
      )}
    </>
  );
}
