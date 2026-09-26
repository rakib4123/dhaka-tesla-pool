import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { acceptRide, cancelRide, driverPool, getRide, goOffline, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

async function bulletWithNusratAndRafiq() {
  await goOnline('jashim', 'Banani');
  const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
  await acceptRide('jashim', nusrat.body.id);
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
  return { nusratId: nusrat.body.id as string, rafiqId: rafiq.body.id as string, poolId: rafiq.body.pool.id as string };
}

describe('passenger cancels a matched ride', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it("frees Rafiq's seat and leaves Nusrat riding alone", async () => {
    const { nusratId, rafiqId, poolId } = await bulletWithNusratAndRafiq();
    const res = await cancelRide('rafiq', rafiqId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PASSENGER', pool: null });

    expect((await getRide('nusrat', nusratId)).body).toMatchObject({ status: 'MATCHED', pool: { coRiderCount: 0 } });
    const pool = (await driverPool('jashim')).body.pool;
    expect(pool.riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat']);
    expect(await seatInvariant(poolId)).toEqual({ seatsTaken: 1, activeSeats: 1 });
  });

  it('makes the freed seat available to the next rider', async () => {
    const { rafiqId } = await bulletWithNusratAndRafiq();
    await requestRide('shirin', 'Banani', 'Mohakhali'); // Bullet is now full
    await cancelRide('rafiq', rafiqId);
    const rafiqAgain = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    expect(rafiqAgain.body.status).toBe('MATCHED');
  });

  it('cancels the pool when the last rider leaves, freeing Jashim', async () => {
    const { nusratId, rafiqId } = await bulletWithNusratAndRafiq();
    await cancelRide('rafiq', rafiqId);
    await cancelRide('nusrat', nusratId);
    expect((await driverPool('jashim')).body.pool).toBeNull();
    expect((await goOffline('jashim')).status).toBe(200);
  });

  it('records the cancellation in the ride history', async () => {
    const { rafiqId } = await bulletWithNusratAndRafiq();
    await cancelRide('rafiq', rafiqId);
    const events = (await getRide('rafiq', rafiqId)).body.events.map((e: { type: string }) => e.type);
    expect(events).toEqual(['RIDE_REQUESTED', 'RIDE_MATCHED', 'RIDE_CANCELLED']);
  });
});
