import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { acceptRide, driverPool, getRide, goOnline, requestRide } from '../helpers/scenario';

async function relevantFor(driver: 'jashim' | 'monir') {
  const res = await api().get('/api/driver/requests').set(bearer(await loginAs(driver)));
  return res.body.map((r: { firstName: string }) => r.firstName);
}

describe('auto-join: the Banani rush-hour story', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('seats Rafiq in Bullet the moment he books, beside Nusrat', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);

    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    expect(rafiq.status).toBe(201);
    expect(rafiq.body).toMatchObject({ status: 'MATCHED', pool: { vehicleName: 'Bullet', coRiderCount: 1 } });

    const pool = (await driverPool('jashim')).body.pool;
    expect(pool.seatsTaken).toBe(2);
    expect(pool.riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
    expect(pool.riders.map((r: { estimatePaisa: number }) => r.estimatePaisa)).toEqual([5250, 6750]);

    const events = (await getRide('rafiq', rafiq.body.id)).body.events;
    expect(events[1]).toMatchObject({ type: 'RIDE_MATCHED', actor: 'SYSTEM' });
  });

  it("keeps Rafiq's identity away from Nusrat: she only sees a count", async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const view = await getRide('nusrat', nusrat.body.id);
    expect(view.body.pool.coRiderCount).toBe(1);
    const body = JSON.stringify(view.body);
    expect(body).not.toContain('Rafiq');
    expect(body).not.toContain('Gulshan 1');
    expect(body).not.toContain('6750');
  });

  it('gives Shirin the last seat 30 seconds later, and Bullet is full', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    expect(shirin.body.status).toBe('MATCHED');
    expect((await driverPool('jashim')).body.pool).toMatchObject({ seatsTaken: 3, isFull: true });
  });

  it('leaves an incompatible or elsewhere-waiting rider in the queue', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    expect((await requestRide('shirin', 'Banani', 'Uttara')).body.status).toBe('REQUESTED');
    expect((await requestRide('rafiq', 'Gulshan 2', 'Mohakhali')).body.status).toBe('REQUESTED');
  });

  it('prefers the fuller pool', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    // Both wait (no pools exist yet). Jashim takes Rafiq (Bullet 2/3), Monir takes Nusrat (Toofan 1/2).
    await acceptRide('jashim', rafiq.body.id);
    await acceptRide('monir', nusrat.body.id);
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    expect(shirin.body.pool.vehicleName).toBe('Bullet');
  });
});

describe("the driver's relevant-requests list", () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('shows riders waiting in his zone that fit Bullet, and only compatible ones once he has a pool', async () => {
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await requestRide('rafiq', 'Banani', 'Uttara');
    await requestRide('shirin', 'Gulshan 2', 'Mohakhali');

    expect(await relevantFor('jashim')).toEqual([]); // offline
    await goOnline('jashim', 'Banani');
    expect(await relevantFor('jashim')).toEqual(['Nusrat', 'Rafiq']); // not Shirin: she waits in Gulshan 2

    await acceptRide('jashim', nusrat.body.id);
    expect(await relevantFor('jashim')).toEqual([]); // Rafiq's Uttara trip doesn't fit Nusrat's
  });

  it("hides requests bigger than the driver's free seats", async () => {
    await requestRide('rafiq', 'Banani', 'Gulshan 1', 3);
    await goOnline('monir', 'Banani');
    expect(await relevantFor('monir')).toEqual([]); // Toofan has 2 seats
    await goOnline('jashim', 'Banani');
    expect(await relevantFor('jashim')).toEqual(['Rafiq']);
  });
});
