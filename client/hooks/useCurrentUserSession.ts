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

/** Resolves whether an existing auth-cookie session is still valid on mount, so the app
 * never flashes the login screen before that one check resolves (bug fix: `user` starts
 * as null and nothing previously asked the server whether a session already existed).
 * App consumes this and only renders the resolved state. */
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
