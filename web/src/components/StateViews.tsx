import type { ApiError } from '../api/client';
import { Button, Card } from './Button';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p role="status" className="py-8 text-center text-sm text-stone-500">
      {label}
    </p>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError | Error; onRetry?: () => void }) {
  return (
    <Card className="border-red-200">
      <p role="alert" className="text-sm text-red-800">
        {error.message}
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="text-center">
      <p className="font-medium text-stone-800">{title}</p>
      {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
    </Card>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

/** Shown above live data when a poll fails: the data is the last good update, not current. */
export function StaleBanner() {
  return (
    <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
      Connection lost — showing the last update. Retrying…
    </p>
  );
}
