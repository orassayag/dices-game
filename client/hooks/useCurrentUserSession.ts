import { useEffect, useState } from 'react';
import { getCurrentUser } from '../api/authApi';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface UseCurrentUserSessionResult {
  user: AuthenticatedUser | null;
  checkingSession: boolean;
  setUser: (user: AuthenticatedUser | null) => void;
}

export function useCurrentUserSession(): UseCurrentUserSessionResult {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  useEffect(() => {
    getCurrentUser()
      .then((response) => setUser(response.user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  return { user, checkingSession, setUser };
}
