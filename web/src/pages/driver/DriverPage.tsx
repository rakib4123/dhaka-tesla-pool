import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthContext';
import { EmptyState, ErrorState, Loading, StaleBanner } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { POLL_MS } from '../../lib/polling';
import { isAcceptingRiders } from '../../lib/status';
import { AvailabilityBar } from './AvailabilityBar';
import { PoolManifest } from './PoolManifest';
import { RequestList } from './RequestList';

export function DriverPage() {
  const { me, refreshMe } = useAuth();
  const pool = useApi(api.driverPool, { pollMs: POLL_MS });
  const vehicle = me?.vehicle;

  if (!vehicle) return <ErrorState error={new ApiError(404, 'NOT_FOUND', 'No Tesla is linked to this account.')} />;

  const current = pool.data?.pool ?? null;

  function body() {
    if (!vehicle!.isOnline) {
      return <EmptyState title="You're offline" hint="Go online in your zone to see riders waiting nearby." />;
    }
    if (pool.loading && !pool.data) return <Loading label="Loading your trip…" />;
    if (!pool.data) return <ErrorState error={pool.error!} onRetry={() => void pool.refetch()} />;
    return (
      <>
        {pool.error && <StaleBanner />}
        {current && <PoolManifest pool={current} onChanged={pool.refetch} />}
        {(!current || isAcceptingRiders(current)) && (
          <RequestList zoneName={current?.pickupZone.name ?? vehicle!.currentZone?.name ?? 'your zone'} onAccepted={pool.refetch} />
        )}
      </>
    );
  }

  return (
    <>
      <AvailabilityBar vehicle={vehicle} hasActivePool={current !== null} onChanged={refreshMe} />
      {body()}
    </>
  );
}
