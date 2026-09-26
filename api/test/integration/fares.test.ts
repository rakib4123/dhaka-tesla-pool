import { beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase, zoneId } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';

describe('zones and fare estimates', () => {
  beforeAll(resetDatabase);

  it('lists all nine zones with grid coordinates', async () => {
    const res = await api().get('/api/zones').set(bearer(await loginAs('nusrat')));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(9);
    expect(res.body).toContainEqual({ id: await zoneId('Banani'), name: 'Banani', gridX: 0, gridY: 0 });
  });

  it("quotes Nusrat's Banani → Mohakhali trip: ৳70.00 solo, ৳52.50 pooled", async () => {
    const res = await api()
      .post('/api/fares/estimate')
      .set(bearer(await loginAs('nusrat')))
      .send({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ distanceKm: 2, soloPaisa: 7000, pooledPaisa: 5250 });
  });

  it.each([
    ['the same pickup and drop-off', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Banani'), seats: 1 })],
    ['more seats than any Tesla has', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 4 })],
    ['zero seats', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 0 })],
    ['an unknown zone', async () => ({ pickupZoneId: 99999, dropoffZoneId: await zoneId('Mohakhali'), seats: 1 })],
    ['a zone id beyond 32-bit range', async () => ({ pickupZoneId: 3_000_000_000, dropoffZoneId: await zoneId('Mohakhali'), seats: 1 })],
    ['a string seat count', async () => ({ pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: '1' })],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await api().post('/api/fares/estimate').set(bearer(await loginAs('nusrat'))).send(await body());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is for passengers only (403 for Jashim) and needs sign-in (401)', async () => {
    const body = { pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 };
    expect((await api().post('/api/fares/estimate').set(bearer(await loginAs('jashim'))).send(body)).status).toBe(403);
    expect((await api().post('/api/fares/estimate').send(body)).status).toBe(401);
  });
});
