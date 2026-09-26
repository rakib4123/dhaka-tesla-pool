import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type ApiError, setUnauthorizedHandler, toApiError, tokenStore } from '../api/client';
import { api } from '../api/endpoints';
import type { Me, RegisterInput } from '../api/types';

export const SESSION_ENDED = 'Your session ended. Please sign in again.';

type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  /** A message for the sign-in page, e.g. why the session ended. */
  notice: string | null;
  /** Why the saved session couldn't be checked (server unreachable). */
  bootError: ApiError | null;
  login(email: string, password: string): Promise<Me>;
  register(input: RegisterInput): Promise<Me>;
  logout(notice?: string): void;
  /** Reloads the signed-in user (e.g. after a driver goes online). Throws on failure. */
  refreshMe(): Promise<void>;
  /** Re-checks the saved session after a start-up failure. */
  retry(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootError, setBootError] = useState<ApiError | null>(null);

  const logout = useCallback((message?: string) => {
    tokenStore.clear();
    setMe(null);
    setStatus('anonymous');
    setNotice(message ?? null);
  }, []);

  /** Checks a saved token against the API: /me decides whether the session is still good. */
  const restoreSession = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('anonymous');
      return;
    }
    setStatus('loading');
    try {
      setMe(await api.me());
      setBootError(null);
      setStatus('authenticated');
    } catch (err) {
      const error = toApiError(err);
      if (error.status === 401 || error.status === 404) logout(SESSION_ENDED); // expired, or the account is gone
      else {
        setBootError(error);
        setStatus('error');
      }
    }
  }, [logout]);

  useEffect(() => setUnauthorizedHandler(() => logout(SESSION_ENDED)), [logout]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const startSession = useCallback(async (token: string) => {
    tokenStore.set(token);
    const current = await api.me(); // /me includes the driver's Tesla, which login's user doesn't
    setMe(current);
    setNotice(null);
    setStatus('authenticated');
    return current;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      notice,
      bootError,
      login: async (email, password) => startSession((await api.login(email, password)).token),
      register: async (input) => startSession((await api.register(input)).token),
      logout,
      refreshMe: async () => setMe(await api.me()),
      retry: restoreSession,
    }),
    [status, me, notice, bootError, startSession, logout, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
