import { api } from '../../api/endpoints';
import type { DriverRider } from '../../api/types';
import { Card } from '../../components/Button';
import { EmptyState, ErrorState, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { formatDateTime, formatTaka } from '../../lib/format';

const LEFT_REASONS: Record<string, string> = {
  DRIVER_CANCELLED: 'back in the queue',
  PASSENGER_CANCELLED: 'cancelled',
};

function riderOutcome(rider: DriverRider): string {
  if (rider.leftReason) return LEFT_REASONS[rider.leftReason] ?? rider.leftReason.toLowerCase();
  return rider.fareTotalPaisa === null ? '—' : formatTaka(rider.fareTotalPaisa);
}

export function DriverHistoryPage() {
  const history = useApi(api.driverHistory);

  if (history.loading && !history.data) return <Loading label="Loading your trips…" />;
  if (!history.data) return <ErrorState error={history.error!} onRetry={() => void history.refetch()} />;

  return (
    <>
      <h1 className="text-xl font-semibold">Past trips</h1>
      {history.data.length === 0 ? (
        <EmptyState title="No finished trips yet" hint="Completed and cancelled trips show up here." />
      ) : (
        history.data.map((pool) => {
          const collected = pool.riders
            .filter((rider) => rider.leftReason === null)
            .reduce((sum, rider) => sum + (rider.fareTotalPaisa ?? 0), 0);
          return (
            <Card key={pool.id} className="space-y-2">
              <p className="text-sm text-stone-500">{formatDateTime(pool.completedAt ?? pool.createdAt)}</p>
              <p className="font-medium">{`${pool.status === 'COMPLETED' ? 'Completed' : 'Cancelled'} · from ${pool.pickupZone.name}`}</p>
              <ul className="text-sm">
                {pool.riders.map((rider) => (
                  <li key={rider.rideId} className="flex justify-between gap-3">
                    <span>{`${rider.firstName} → ${rider.dropoffZone.name}`}</span>
                    <span className="tabular-nums text-stone-600">{riderOutcome(rider)}</span>
                  </li>
                ))}
              </ul>
              {pool.status === 'COMPLETED' && <p className="text-sm font-medium">{`Collected ${formatTaka(collected)}`}</p>}
            </Card>
          );
        })
      )}
    </>
  );
}
