import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { useApi } from './useApi';

const offline = () => new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");

describe('useApi', () => {
  it('starts loading, then shows the data', async () => {
    const fetcher = vi.fn().mockResolvedValue(['Banani', 'Mohakhali']);
    const { result } = renderHook(() => useApi(fetcher));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['Banani', 'Mohakhali']));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports an error, then recovers when retried', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValueOnce(['Banani']);
    const { result } = renderHook(() => useApi(fetcher));

    await waitFor(() => expect(result.current.error?.code).toBe('NETWORK'));
    expect(result.current.data).toBeUndefined();

    await act(() => result.current.refetch());
    expect(result.current.data).toEqual(['Banani']);
    expect(result.current.error).toBeNull();
  });

  it('keeps the last good data on screen while polls fail, then recovers', async () => {
    let online = true;
    let status = 'Matched';
    const fetcher = vi.fn(async () => {
      if (!online) throw offline();
      return status;
    });
    const { result } = renderHook(() => useApi(fetcher, { pollMs: 20 }));
    await waitFor(() => expect(result.current.data).toBe('Matched'));

    online = false; // the connection drops
    await waitFor(() => expect(result.current.error?.code).toBe('NETWORK'));
    expect(result.current.data).toBe('Matched');

    status = 'Bullet is here';
    online = true; // and comes back
    await waitFor(() => expect(result.current.data).toBe('Bullet is here'));
    expect(result.current.error).toBeNull();
  });

  it('stops polling after the screen is closed', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { unmount } = renderHook(() => useApi(fetcher, { pollMs: 20 }));
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2));

    unmount();
    const callsAtUnmount = fetcher.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fetcher.mock.calls.length).toBe(callsAtUnmount);
  });

  it('runs a refetch that was asked for mid-load right after it, instead of dropping it', async () => {
    let answer = 'no ride yet';
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return answer;
    });
    const { result } = renderHook(() => useApi(fetcher));
    answer = 'Waiting for a Tesla'; // Nusrat just booked while the first load was still running
    await act(() => result.current.refetch());
    // awaiting refetch means the fresh data is already on screen, not merely queued
    expect(result.current.data).toBe('Waiting for a Tesla');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('never runs two polls at once when the server is slow', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetcher = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 60));
      inFlight -= 1;
      return 'ok';
    });
    const { unmount } = renderHook(() => useApi(fetcher, { pollMs: 10 }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    unmount();
    expect(maxInFlight).toBe(1);
  });
});
