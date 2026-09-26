import { useRef, useState } from 'react';
import { toApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import { Button, Card } from '../../components/Button';
import { EmptyState, ErrorState, InlineError, Loading } from '../../components/StateViews';
import { useApi } from '../../hooks/useApi';
import { singleClick } from '../../lib/clicks';
import { formatTaka } from '../../lib/format';
import { POLL_MS } from '../../lib/polling';

export function RequestList({ zoneName, onAccepted }: { zoneName: string; onAccepted: () => Promise<void> | void }) {
  const requests = useApi(api.relevantRequests, { pollMs: POLL_MS });
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function accept(rideId: string) {
    if (inFlight.current) return; // one accept per double click
    inFlight.current = true;
    setAcceptingId(rideId);
    setError(null);
    try {
      await api.acceptRequest(rideId);
      await onAccepted();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      await requests.refetch(); // the next rider may now sit where this one was
      inFlight.current = false;
      setAcceptingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{`Riders waiting in ${zoneName}`}</h2>
      <InlineError message={error} />
      {requests.loading && !requests.data ? (
        <Loading label="Looking for riders…" />
      ) : !requests.data ? (
        <ErrorState error={requests.error!} onRetry={() => void requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <EmptyState title={`No one in ${zoneName} needs a Tesla right now.`} hint="New requests appear here automatically." />
      ) : (
        requests.data.map((request) => (
          <Card key={request.rideId} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{request.firstName}</p>
              <p className="text-sm text-stone-600">
                {`${request.seats} ${request.seats === 1 ? 'seat' : 'seats'} · ${request.pickupZone.name} → ${request.dropoffZone.name} · ${request.distanceKm} km`}
              </p>
              <p className="text-sm text-stone-500">
                {`${formatTaka(request.estimateSoloPaisa)} solo · ${formatTaka(request.estimatePooledPaisa)} pooled`}
              </p>
            </div>
            <Button aria-label={`Accept ${request.firstName}`} disabled={acceptingId !== null} onClick={singleClick(() => void accept(request.rideId))}>
              {acceptingId === request.rideId ? 'Accepting…' : 'Accept'}
            </Button>
          </Card>
        ))
      )}
    </section>
  );
}
