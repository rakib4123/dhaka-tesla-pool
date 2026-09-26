import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import {
  acceptRide, cancelRide, driverPool, getRide, goOffline, goOnline, poolAction, requestRide,
} from '../helpers/scenario';

async function storyPool() {
  await goOnline('jashim', 'Banani');
  const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
  const pool = await acceptRide('jashim', nusrat.body.id);
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
  return { poolId: pool.body.id as string, nusratId: nusrat.body.id as string, rafiqId: rafiq.body.id as string };
}

describe('pool lifecycle', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('runs the whole story and locks the pooled fares: Nusrat ৳52.50, Rafiq ৳67.50', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();

    const arrived = await poolAction('jashim', poolId, 'arrive');
    expect(arrived.body.status).toBe('DRIVER_ARRIVED');
    expect((await getRide('nusrat', nusratId)).body.status).toBe('DRIVER_ARRIVED');

    const started = await poolAction('jashim', poolId, 'start');
    expect(started.body.status).toBe('STARTED');
    expect(started.body.riders.map((r: { fareTotalPaisa: number }) => r.fareTotalPaisa)).toEqual([5250, 6750]);
    expect((await getRide('nusrat', nusratId)).body.fare).toEqual({ basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250 });
    expect((await getRide('rafiq', rafiqId)).body.fare).toEqual({ basePaisa: 3000, distancePaisa: 6000, discountPaisa: 2250, totalPaisa: 6750 });

    const completed = await poolAction('jashim', poolId, 'complete');
    expect(completed.body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String) });
    expect((await getRide('rafiq', rafiqId)).body.status).toBe('COMPLETED');
    expect((await driverPool('jashim')).body.pool).toBeNull();
    expect((await goOffline('jashim')).status).toBe(200);
  });

  it('charges the solo fare when Rafiq cancels before the start', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    await cancelRide('rafiq', rafiqId);
    await poolAction('jashim', poolId, 'arrive');
    await poolAction('jashim', poolId, 'start');
    expect((await getRide('nusrat', nusratId)).body.fare).toMatchObject({ discountPaisa: 0, totalPaisa: 7000 });
  });

  it.each([
    ['start before arriving', ['start']],
    ['complete an open pool', ['complete']],
    ['arrive twice', ['arrive', 'arrive']],
    ['cancel a started trip', ['arrive', 'start', 'cancel']],
    ['restart a completed trip', ['arrive', 'start', 'complete', 'start']],
  ] as const)('rejects: %s (409 INVALID_TRANSITION)', async (_label, actions) => {
    const { poolId } = await storyPool();
    let res;
    for (const action of actions) res = await poolAction('jashim', poolId, action);
    expect(res!.status).toBe(409);
    expect(res!.body.error.code).toBe('INVALID_TRANSITION');
  });

  it("does not let a passenger drive (403) or Monir run Jashim's pool (404)", async () => {
    const { poolId } = await storyPool();
    expect((await poolAction('nusrat', poolId, 'start')).status).toBe(403);
    expect((await poolAction('monir', poolId, 'arrive')).status).toBe(404);
    expect((await poolAction('jashim', 'not-a-uuid', 'arrive')).status).toBe(404);
  });

  it('lets a passenger cancel after the driver arrives, but not after the start', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    expect((await cancelRide('rafiq', rafiqId)).body.status).toBe('CANCELLED');
    await poolAction('jashim', poolId, 'start');
    const late = await cancelRide('nusrat', nusratId);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('tells Shirin "Bullet is here" when she joins while Jashim is already waiting', async () => {
    const { poolId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    expect(shirin.body.status).toBe('DRIVER_ARRIVED');
    const events = (await getRide('shirin', shirin.body.id)).body.events.map((e: { toStatus: string }) => e.toStatus);
    expect(events).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']);
    await poolAction('jashim', poolId, 'start');
    expect((await getRide('shirin', shirin.body.id)).body).toMatchObject({ status: 'STARTED', fare: { totalPaisa: 5250 } });
  });

  it('refuses new riders once the trip has started', async () => {
    const { poolId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    await poolAction('jashim', poolId, 'start');
    expect((await requestRide('shirin', 'Banani', 'Mohakhali')).body.status).toBe('REQUESTED');
  });

  it('never leaves Shirin MATCHED in a started pool when she books as Jashim taps Start', async () => {
    const { poolId } = await storyPool();
    await poolAction('jashim', poolId, 'arrive');
    const [, shirin] = await Promise.all([poolAction('jashim', poolId, 'start'), requestRide('shirin', 'Banani', 'Mohakhali')]);
    const final = (await getRide('shirin', shirin.body.id)).body;
    expect(['REQUESTED', 'STARTED']).toContain(final.status);
    if (final.status === 'STARTED') expect(final.fare).not.toBeNull();
  });
});

describe('driver cancels the pool', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('puts Nusrat and Rafiq back in the queue instead of cancelling their rides', async () => {
    const { poolId, nusratId, rafiqId } = await storyPool();
    const res = await poolAction('jashim', poolId, 'cancel');
    expect(res.body).toMatchObject({ status: 'CANCELLED', seatsTaken: 0 });

    for (const [who, id] of [['nusrat', nusratId], ['rafiq', rafiqId]] as const) {
      const ride = (await getRide(who, id)).body;
      expect(ride).toMatchObject({ status: 'REQUESTED', cancelledBy: null, pool: null });
      expect(ride.events.at(-1)).toMatchObject({ type: 'RIDE_REQUEUED', actor: 'DRIVER' });
    }
    await goOnline('monir', 'Banani');
    const relevant = await api().get('/api/driver/requests').set(bearer(await loginAs('monir')));
    expect(relevant.body.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
  });

  it("re-seats riders straight into another open pool (Monir's Toofan)", async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    // Both request before any pool exists, so both wait. Order matters: if Bullet already held
    // Nusrat, Shirin's compatible request would auto-join Bullet instead of waiting for Monir.
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    const bullet = await acceptRide('jashim', nusrat.body.id); // Bullet: Nusrat
    await acceptRide('monir', shirin.body.id); // Toofan: Shirin, 1 seat free

    await poolAction('jashim', bullet.body.id, 'cancel');

    const ride = (await getRide('nusrat', nusrat.body.id)).body;
    expect(ride).toMatchObject({ status: 'MATCHED', pool: { vehicleName: 'Toofan', coRiderCount: 1 } });
  });
});
