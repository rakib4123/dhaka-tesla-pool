import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { FareEstimate, Ride } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { ErrorState, InlineError, Loading } from '../../components/StateViews';
import { ZoneSelect } from '../../components/ZoneSelect';
import { useApi } from '../../hooks/useApi';
import { formatTaka } from '../../lib/format';
import { rideStatusLabel } from '../../lib/status';

function lastRideText(ride: Ride): string {
  const amount = ride.fare ? ` · ${formatTaka(ride.fare.totalPaisa)}` : '';
  return `Last ride: ${ride.pickupZone.name} → ${ride.dropoffZone.name} · ${rideStatusLabel(ride.status)}${amount}`;
}

export function RequestRideForm({ onRequested, lastRide }: { onRequested: () => Promise<void> | void; lastRide?: Ride }) {
  const zones = useApi(api.zones);
  const [pickupZoneId, setPickupZoneId] = useState<number | ''>('');
  const [dropoffZoneId, setDropoffZoneId] = useState<number | ''>('');
  const [seats, setSeats] = useState(1);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const sameZone = pickupZoneId !== '' && pickupZoneId === dropoffZoneId;
  const ready = pickupZoneId !== '' && dropoffZoneId !== '' && !sameZone;

  useEffect(() => {
    if (pickupZoneId === '' || dropoffZoneId === '' || pickupZoneId === dropoffZoneId) {
      setEstimate(null);
      return;
    }
    let stale = false;
    api
      .estimate({ pickupZoneId, dropoffZoneId, seats })
      .then((result) => !stale && setEstimate(result))
      .catch(() => !stale && setEstimate(null));
    return () => {
      stale = true; // a newer choice replaced this one before the answer came back
    };
  }, [pickupZoneId, dropoffZoneId, seats]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || inFlight.current) return; // a double click sends one booking
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api.createRide({ pickupZoneId, dropoffZoneId, seats });
      await onRequested();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (zones.loading && !zones.data) return <Loading label="Loading Dhaka's zones…" />;
  if (!zones.data) return <ErrorState error={zones.error!} onRetry={() => void zones.refetch()} />;

  return (
    <div className="space-y-4">
      {lastRide && <p className="rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">{lastRideText(lastRide)}</p>}
      <Card>
        <h1 className="text-xl font-semibold">Where to?</h1>
        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <ZoneSelect id="pickup" label="Pickup" zones={zones.data} value={pickupZoneId} onChange={setPickupZoneId} />
          <ZoneSelect id="dropoff" label="Drop-off" zones={zones.data} value={dropoffZoneId} onChange={setDropoffZoneId} />
          {sameZone && <p className="text-sm text-red-700">Pick a different drop-off zone.</p>}
          <div>
            <label htmlFor="seats" className="block text-sm font-medium">Seats</label>
            <select id="seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2">
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {estimate && (
            <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
              <p className="font-medium">{`${formatTaka(estimate.soloPaisa)} solo · ${formatTaka(estimate.pooledPaisa)} if pooled`}</p>
              <p className="text-stone-500">{`${estimate.distanceKm} km`}</p>
            </div>
          )}

          <Button type="submit" disabled={!ready || submitting} className="w-full">
            {submitting ? 'Requesting…' : 'Request ride'}
          </Button>
        </form>
        <InlineError message={error} />
      </Card>
    </div>
  );
}
