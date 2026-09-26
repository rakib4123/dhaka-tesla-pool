import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, toApiError } from '../api/client';

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Loads data once, and optionally polls it. A failed poll keeps the last good data (so the screen
 * never blanks on a network blip) and sets `error`; the next successful poll clears it.
 * Loads never overlap: a refetch asked for mid-load runs once, right after the current one.
 */
export function useApi<T>(fetcher: () => Promise<T>, options: { pollMs?: number } = {}): ApiState<T> {
  const { pollMs } = options;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const [state, setState] = useState<{ data: T | undefined; error: ApiError | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });

  const refetch = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true; // never overlap, but don't drop it: e.g. "refresh after booking" must show the new ride
      return;
    }
    inFlight.current = true;
    setState((prev) => (prev.data === undefined ? { ...prev, loading: true } : prev));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (mounted.current) setState((prev) => ({ ...prev, error: toApiError(err), loading: false }));
    } finally {
      inFlight.current = false;
      if (queued.current && mounted.current) {
        queued.current = false;
        void refetch();
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refetch();
    const timer = pollMs ? setInterval(() => void refetch(), pollMs) : undefined;
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [refetch, pollMs]);

  return { ...state, refetch };
}
