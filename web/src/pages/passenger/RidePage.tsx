import { api } from '../../api/endpoints';
import { ErrorState, Loading, StaleBanner } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { POLL_MS } from '../../lib/polling';
import { isActiveRide } from '../../lib/status';
import { ActiveRideCard } from './ActiveRideCard';
import { RequestRideForm } from './RequestRideForm';

export function RidePage() {
  const rides = useApi(api.rides, { pollMs: POLL_MS });

  if (rides.loading && !rides.data) return <Loading label="Loading your ride…" />;
  if (!rides.data) return <ErrorState error={rides.error!} onRetry={() => void rides.refetch()} />;

  const active = rides.data.find((ride) => isActiveRide(ride.status));
  return (
    <>
      {rides.error && <StaleBanner />}
      {active ? (
        <ActiveRideCard ride={active} onChanged={rides.refetch} />
      ) : (
        <RequestRideForm onRequested={rides.refetch} lastRide={rides.data[0]} />
      )}
    </>
  );
}
