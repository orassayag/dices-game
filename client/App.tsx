import { useState } from 'react';
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
