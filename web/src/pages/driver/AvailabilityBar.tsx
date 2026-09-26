import { useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Vehicle } from '../../api/types';
import { Button, Card } from '../../components/Button';
import { InlineError } from '../../components/StateViews';
import { ZoneSelect } from '../../components/ZoneSelect';
import { useApi } from '../../hooks/useApi';

export function AvailabilityBar({ vehicle, hasActivePool, onChanged }: {
  vehicle: Vehicle;
  hasActivePool: boolean;
  onChanged: () => Promise<void>;
}) {
  const zones = useApi(api.zones);
  const [zoneId, setZoneId] = useState<number | ''>(vehicle.currentZone?.id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setOnline(online: boolean) {
    if (pending || (online && zoneId === '')) return;
    setPending(true);
    setError(null);
    try {
      await api.setAvailability(online ? { online, zoneId: zoneId as number } : { online });
      await onChanged();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{`${vehicle.name} · ${vehicle.plate} · ${vehicle.capacity} seats`}</p>
          <p className="font-medium">{vehicle.isOnline ? `Online in ${vehicle.currentZone?.name ?? ''}` : 'Offline'}</p>
        </div>
        {vehicle.isOnline ? (
          <div className="text-right">
            <Button variant="secondary" disabled={pending || hasActivePool} onClick={() => void setOnline(false)}>
              Go offline
            </Button>
            {hasActivePool && <p className="mt-1 text-xs text-stone-500">Finish or cancel your trip first.</p>}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <ZoneSelect id="driver-zone" label="Your zone" zones={zones.data ?? []} value={zoneId} onChange={setZoneId}
              disabled={!zones.data} />
            <Button disabled={pending || zoneId === ''} onClick={() => void setOnline(true)}>
              {pending ? 'Going online…' : 'Go online'}
            </Button>
          </div>
        )}
      </div>
      {!vehicle.isOnline && zones.error && !zones.data && <InlineError message={zones.error.message} />}
      <InlineError message={error} />
    </Card>
  );
}
