import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { cancelRide, getRide, requestRide } from '../helpers/scenario';

describe('ride requests', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('lets Nusrat request Banani → Mohakhali and shows both price estimates', async () => {
    const res = await requestRide('nusrat', 'Banani', 'Mohakhali');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'REQUESTED',
      seats: 1,
      pickupZone: { name: 'Banani' },
      dropoffZone: { name: 'Mohakhali' },
      distanceKm: 2,
      estimate: { soloPaisa: 7000, pooledPaisa: 5250 },
      fare: null,
      pool: null,
      cancelledBy: null,
    });
  });

  it('allows only one active ride at a time (409 ACTIVE_RIDE_EXISTS)', async () => {
    await requestRide('nusrat', 'Banani', 'Mohakhali');
    const second = await requestRide('nusrat', 'Banani', 'Gulshan 1');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('survives a double-clicked Request button: exactly one ride is created', async () => {
    const [a, b] = await Promise.all([
      requestRide('shirin', 'Banani', 'Mohakhali'),
      requestRide('shirin', 'Banani', 'Mohakhali'),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const list = await api().get('/api/rides').set(bearer(await loginAs('shirin')));
    expect(list.body).toHaveLength(1);
  });

  it('lists only my own rides, newest first', async () => {
    const first = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    await cancelRide('rafiq', first.body.id);
    const second = await requestRide('rafiq', 'Banani', 'Mohakhali');
    await requestRide('nusrat', 'Banani', 'Mohakhali');
    const list = await api().get('/api/rides').set(bearer(await loginAs('rafiq')));
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([second.body.id, first.body.id]);
  });

  it('shows the event history on the ride detail', async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const detail = await getRide('nusrat', ride.body.id);
    expect(detail.status).toBe(200);
    expect(detail.body.events).toEqual([
      expect.objectContaining({ type: 'RIDE_REQUESTED', fromStatus: null, toStatus: 'REQUESTED', actor: 'PASSENGER' }),
    ]);
  });

  it("hides Nusrat's ride from Rafiq: 404 on read and on cancel, and the ride is untouched", async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    expect((await getRide('rafiq', ride.body.id)).status).toBe(404);
    expect((await cancelRide('rafiq', ride.body.id)).status).toBe(404);
    expect((await getRide('nusrat', ride.body.id)).body.status).toBe('REQUESTED');
  });

  it('answers malformed ride ids with 404, not 500', async () => {
    expect((await getRide('nusrat', 'not-a-uuid')).status).toBe(404);
    expect((await cancelRide('nusrat', '123')).status).toBe(404);
  });

  it('lets Nusrat cancel a waiting ride exactly once, then book again', async () => {
    const ride = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const cancelled = await cancelRide('nusrat', ride.body.id);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PASSENGER' });
    const again = await cancelRide('nusrat', ride.body.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');
    expect((await requestRide('nusrat', 'Banani', 'Mohakhali')).status).toBe(201);
  });

  it('does not let a driver book rides (403)', async () => {
    const res = await api()
      .post('/api/rides')
      .set(bearer(await loginAs('jashim')))
      .send({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 });
    expect(res.status).toBe(403);
  });
});
