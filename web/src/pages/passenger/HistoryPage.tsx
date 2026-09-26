import { useState } from 'react';
import { api } from '../../api/endpoints';
import type { Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { EventTimeline } from '../../components/EventTimeline';
import { FareBreakdown } from '../../components/FareBreakdown';
import { EmptyState, ErrorState, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { formatDateTime, formatTaka } from '../../lib/format';
import { rideStatusLabel } from '../../lib/status';

function outcome(ride: Ride): string {
  if (ride.fare) return `${rideStatusLabel(ride.status)} · ${formatTaka(ride.fare.totalPaisa)}`;
  if (ride.status === 'CANCELLED') return 'Cancelled · no charge';
  return `${rideStatusLabel(ride.status)} · est. ${formatTaka(ride.estimate.soloPaisa)}`;
}

function RideTimeline({ rideId }: { rideId: string }) {
  const detail = useApi(() => api.ride(rideId));
  if (detail.loading && !detail.data) return <Loading label="Loading what happened…" />;
  if (!detail.data) return <ErrorState error={detail.error!} onRetry={() => void detail.refetch()} />;
  return <EventTimeline events={detail.data.events} />;
}

function RideHistoryItem({ ride }: { ride: Ride }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{`${ride.pickupZone.name} → ${ride.dropoffZone.name}`}</p>
          <p className="text-sm text-stone-500">
            {formatDateTime(ride.createdAt)}
            {ride.pool ? ` · ${ride.pool.vehicleName} with ${ride.pool.driverName}` : ''}
          </p>
          <p className="text-sm">{outcome(ride)}</p>
        </div>
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide details' : 'Details'}
        </Button>
      </div>
      {open && (
        <div className="space-y-3">
          {ride.fare && <FareBreakdown fare={ride.fare} distanceKm={ride.distanceKm} />}
          <RideTimeline rideId={ride.id} />
        </div>
      )}
    </Card>
  );
}

export function HistoryPage() {
  const rides = useApi(api.rides);

  if (rides.loading && !rides.data) return <Loading label="Loading your rides…" />;
  if (!rides.data) return <ErrorState error={rides.error!} onRetry={() => void rides.refetch()} />;

  return (
    <>
      <h1 className="text-xl font-semibold">Your rides</h1>
      {rides.data.length === 0 ? (
        <EmptyState title="No rides yet" hint="Your trips will show up here." />
      ) : (
        rides.data.map((ride) => <RideHistoryItem key={ride.id} ride={ride} />)
      )}
    </>
  );
}
