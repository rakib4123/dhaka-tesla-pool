import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { FareBreakdown } from '../../components/FareBreakdown';
import { InlineError } from '../../components/StateViews';
import { StatusStepper } from '../../components/StatusStepper';
import { singleClick } from '../../lib/clicks';
import { formatTaka } from '../../lib/format';
import { canCancelRide, rideStatusLabel } from '../../lib/status';

function sharingText(coRiderCount: number): string {
  if (coRiderCount === 0) return 'Just you so far. Riders heading your way can still join.';
  return `Sharing with ${coRiderCount} other ${coRiderCount === 1 ? 'passenger' : 'passengers'}`;
}

function estimateText(ride: Ride): string {
  const { soloPaisa, pooledPaisa } = ride.estimate;
  if (ride.pool && ride.pool.coRiderCount > 0) return `Estimated fare: ${formatTaka(pooledPaisa)} (pooled)`;
  return `Estimated fare: ${formatTaka(soloPaisa)} solo · ${formatTaka(pooledPaisa)} if someone shares`;
}

export function ActiveRideCard({ ride, onChanged }: { ride: Ride; onChanged: () => Promise<void> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true;
    setCancelling(true);
    setError(null);
    try {
      await api.cancelRide(ride.id);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      await onChanged(); // the API is the source of truth, so show whatever it says now
      inFlight.current = false;
      setCancelling(false);
      setConfirming(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{rideStatusLabel(ride.status, ride.pool?.vehicleName)}</h1>
        <StatusStepper status={ride.status} />
      </div>

      <p className="text-sm text-stone-700">
        {ride.pickupZone.name} → {ride.dropoffZone.name} · {ride.distanceKm} km · {ride.seats} {ride.seats === 1 ? 'seat' : 'seats'}
      </p>

      {ride.pool ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">{`${ride.pool.driverName} is driving ${ride.pool.vehicleName} (${ride.pool.vehiclePlate})`}</p>
          <p className="text-stone-600">{sharingText(ride.pool.coRiderCount)}</p>
        </div>
      ) : (
        <p className="text-sm text-stone-600">{`Looking for a Tesla in ${ride.pickupZone.name}…`}</p>
      )}

      {ride.fare ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Your fare (locked when the trip started)</p>
          <FareBreakdown fare={ride.fare} distanceKm={ride.distanceKm} />
          <p className="text-sm text-stone-600">{`Pay ${formatTaka(ride.fare.totalPaisa)} in cash at drop-off.`}</p>
        </div>
      ) : (
        <p className="text-sm">{estimateText(ride)}</p>
      )}

      {canCancelRide(ride.status) &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Cancel this ride?</span>
            <Button variant="danger" disabled={cancelling} onClick={singleClick(() => void cancel())}>
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </Button>
            <Button variant="secondary" disabled={cancelling} onClick={() => setConfirming(false)}>
              Keep my ride
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={singleClick(() => setConfirming(true))}>
            Cancel ride
          </Button>
        ))}

      <InlineError message={error} />
    </Card>
  );
}
