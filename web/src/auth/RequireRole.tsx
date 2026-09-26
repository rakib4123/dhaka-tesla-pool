import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '../api/types';
import { ErrorState, Loading } from '../components/StateViews';
import { useAuth } from './AuthContext';
import { homePathFor } from './homePath';

/** Lets through only the given role. Everyone else goes to sign-in or to their own home screen. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { status, me, bootError, retry } = useAuth();
  if (status === 'loading') return <Loading label="Checking your session…" />;
  if (status === 'error' && bootError) return <ErrorState error={bootError} onRetry={() => void retry()} />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.role !== role) return <Navigate to={homePathFor(me.role)} replace />;
  return <>{children}</>;
}
