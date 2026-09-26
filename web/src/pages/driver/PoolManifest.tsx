import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { DriverPool, PoolAction } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { SeatMeter } from '../../components/SeatMeter';
import { InlineError } from '../../components/StateViews';
import { formatTaka } from '../../lib/format';
import { canCancelPool, NEXT_POOL_ACTION } from '../../lib/status';

function heading(pool: DriverPool): string {
  switch (pool.status) {
    case 'OPEN':
      return `Picking up in ${pool.pickupZone.name}`;
    case 'DRIVER_ARRIVED':
      return `Waiting at ${pool.pickupZone.name}`;
    case 'STARTED':
      return 'On the way';
    case 'COMPLETED':
      return 'Trip completed';
    case 'CANCELLED':
      return 'Trip cancelled';
  }
}

export function PoolManifest({ pool, onChanged }: { pool: DriverPool; onChanged: () => Promise<void> | void }) {
  const [pending, setPending] = useState<PoolAction | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const next = NEXT_POOL_ACTION[pool.status];
  const fareLocked = pool.status === 'STARTED';
  const cashToCollect = pool.riders.reduce((sum, r) => sum + (r.fareTotalPaisa ?? r.estimatePaisa), 0);

  async function run(action: PoolAction) {
    if (inFlight.current) return; // one request per double click
    inFlight.current = true;
    setPending(action);
    setError(null);
    try {
      await api.poolAction(pool.id, action);
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      inFlight.current = false;
      setPending(null);
      setConfirmingCancel(false);
      await onChanged(); // show what the API says now, not what we hoped
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{heading(pool)}</h1>
        <SeatMeter taken={pool.seatsTaken} capacity={pool.capacity} />
      </div>

      {pool.isFull && canCancelPool(pool.status) && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          {`${pool.vehicle.name} is full — ready to go`}
        </p>
      )}

      <ul className="divide-y divide-stone-100">
        {pool.riders.map((rider) => (
          <li key={rider.rideId} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">{rider.firstName}</p>
              <p className="text-sm text-stone-500">{`${rider.seats} ${rider.seats === 1 ? 'seat' : 'seats'} · to ${rider.dropoffZone.name}`}</p>
            </div>
            <span className="tabular-nums">
              {rider.fareTotalPaisa === null ? `${formatTaka(rider.estimatePaisa)} (est.)` : formatTaka(rider.fareTotalPaisa)}
            </span>
          </li>
        ))}
      </ul>

      {fareLocked && <p className="text-sm font-medium">{`Collect ${formatTaka(cashToCollect)} in cash at drop-off`}</p>}

      <div className="flex flex-wrap gap-2">
        {next && (
          <Button disabled={pending !== null} onClick={() => void run(next.action)}>
            {pending === next.action ? 'Saving…' : next.label}
          </Button>
        )}
        {canCancelPool(pool.status) &&
          (confirmingCancel ? (
            <>
              <Button variant="danger" disabled={pending !== null} onClick={() => void run('cancel')}>
                Yes, cancel trip
              </Button>
              <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirmingCancel(false)}>
                Keep trip
              </Button>
            </>
          ) : (
            <Button variant="danger" disabled={pending !== null} onClick={() => setConfirmingCancel(true)}>
              Cancel trip
            </Button>
          ))}
      </div>
      {confirmingCancel && (
        <p className="text-sm text-stone-600">Your riders go back in the queue so another Tesla can pick them up.</p>
      )}

      <InlineError message={error} />
    </Card>
  );
}
