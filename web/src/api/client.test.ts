import { describe, expect, it, vi } from 'vitest';
import { nusratRide } from '../test/fixtures';
import { mockApi } from '../test/mockApi';
import { apiFetch, setUnauthorizedHandler, tokenStore } from './client';
import { api } from './endpoints';

describe('apiFetch', () => {
  it('sends JSON with the bearer token and returns the parsed body', async () => {
    tokenStore.set('token-nusrat');
    const { calls } = mockApi({ 'POST /rides': { status: 201, body: nusratRide() } });

    const ride = await apiFetch<{ id: string }>('/rides', { method: 'POST', body: { seats: 1 } });

    expect(ride.id).toBe('ride-nusrat');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer token-nusrat');
    expect(calls[0].headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].body).toEqual({ seats: 1 });
  });

  it("turns the API's error envelope into an ApiError", async () => {
    mockApi({
      'POST /rides': {
        status: 409,
        body: { error: { code: 'ACTIVE_RIDE_EXISTS', message: 'You already have an active ride. Cancel it or wait until it completes' } },
      },
    });
    await expect(apiFetch('/rides', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 409,
      code: 'ACTIVE_RIDE_EXISTS',
      message: 'You already have an active ride. Cancel it or wait until it completes',
    });
  });

  it('explains that the server is unreachable', async () => {
    mockApi({ 'GET /rides': { networkError: true } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK',
      message: "Can't reach the server. Check your connection and try again.",
    });
  });

  it('explains an HTML error page from a proxy (e.g. 502 during a cold start)', async () => {
    mockApi({ 'GET /rides': { status: 502, raw: '<html><body>Bad gateway</body></html>' } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({ status: 502, code: 'SERVER_UNAVAILABLE' });
  });

  it('refuses an HTML page returned with 200 (a misconfigured API URL), instead of treating it as data', async () => {
    mockApi({ 'GET /rides': { status: 200, raw: '<!doctype html><div id="root"></div>' } });
    await expect(apiFetch('/rides')).rejects.toMatchObject({ code: 'SERVER_UNAVAILABLE' });
  });

  it('reports an expired session once, when a signed-in request gets 401', async () => {
    tokenStore.set('stale-token');
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);
    mockApi({ 'GET /me': { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Your session has expired' } } } });

    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('does not treat a wrong password as an expired session', async () => {
    const onUnauthorized = vi.fn();
    const unregister = setUnauthorizedHandler(onUnauthorized);
    mockApi({ 'POST /auth/login': { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } } } });

    await expect(api.login('nusrat@teslapool.test', 'nope')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthorized).not.toHaveBeenCalled();
    unregister();
  });
});

describe('endpoints', () => {
  it("drives Jashim's pool through its own action endpoints", async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/start': { body: {} } });
    await api.poolAction('pool-1', 'start');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/pools/pool-1/start' });
  });
});
