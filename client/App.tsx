import { useState } from 'react';
import { LoginScreen } from './screens/login-screen/LoginScreen';
import { GameScreen } from './screens/game-screen/GameScreen';

interface AuthenticatedUser {
  id: string;
  username: string;
}

// No router: two screens with no distinct URLs (§8) — multiple players are simulated on
// this one page, not multiple browser sessions, so there's nothing for a URL to address.
export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  if (!user) {
    return <LoginScreen onAuthenticated={setUser} />;
  }

  return <GameScreen user={user} onSessionExpired={() => setUser(null)} />;
}
