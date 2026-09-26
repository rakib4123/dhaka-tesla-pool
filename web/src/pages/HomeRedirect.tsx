import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { homePathFor } from '../auth/homePath';
import { ErrorState, Loading } from '../components/StateViews';

export function HomeRedirect() {
  const { status, me, bootError, retry } = useAuth();
  if (status === 'loading') return <Loading label="Checking your session…" />;
  if (status === 'error' && bootError) return <ErrorState error={bootError} onRetry={() => void retry()} />;
  return <Navigate to={me ? homePathFor(me.role) : '/login'} replace />;
}
