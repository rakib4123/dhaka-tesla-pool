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
  const current = useRef<Promise<void> | null>(null);
  const next = useRef<Promise<void> | null>(null);
  const [state, setState] = useState<{ data: T | undefined; error: ApiError | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });

  const load = useCallback(async () => {
    setState((prev) => (prev.data === undefined ? { ...prev, loading: true } : prev));
    try {
      const data = await fetcherRef.current();
      if (mounted.current) setState({ data, error: null, loading: false });
    } catch (err) {
      if (mounted.current) setState((prev) => ({ ...prev, error: toApiError(err), loading: false }));
    }
  }, []);

  /**
   * Starts a load, or, if one is running, joins the single load queued behind it. Either way the
   * promise resolves only once fresh data is in state, so "refresh after booking" really shows the new ride.
   */
  const refetch = useCallback((): Promise<void> => {
    if (!current.current) {
      current.current = load().finally(() => {
        current.current = null;
      });
      return current.current;
    }
    next.current ??= current.current.then(() => {
      next.current = null;
      return mounted.current ? refetch() : undefined;
    });
    return next.current;
  }, [load]);

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
