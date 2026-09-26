import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma';
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

  describe('when the ownership read is stale', () => {
    afterEach(() => vi.restoreAllMocks());

    // Fault injection: cancelRide's first read runs outside the transaction and is made of two
    // SELECTs. We hand it the torn result the review found (ride MATCHED, membership missing,
    // e.g. read between a driver cancel and an auto-join). The transaction must not trust it.
    it('never leaves a cancelled ride holding a seat', async () => {
      const { nusratId, poolId } = await bulletWithNusratAndRafiq();
      const real = await prisma.rideRequest.findFirst({ where: { id: nusratId } });
      const findFirst = prisma.rideRequest.findFirst.bind(prisma.rideRequest);
      vi.spyOn(prisma.rideRequest, 'findFirst').mockImplementationOnce((async (args: Parameters<typeof findFirst>[0]) => {
        const fresh = await findFirst(args);
        return { ...fresh, ...real, memberships: [] };
      }) as never);

      await cancelRide('nusrat', nusratId);

      const ride = await prisma.rideRequest.findUniqueOrThrow({ where: { id: nusratId } });
      const heldSeats = await prisma.poolMember.count({ where: { rideRequestId: nusratId, leftAt: null } });
      if (ride.status === 'CANCELLED') expect(heldSeats).toBe(0);
      expect(await seatInvariant(poolId)).toEqual({ seatsTaken: ride.status === 'CANCELLED' ? 1 : 2, activeSeats: ride.status === 'CANCELLED' ? 1 : 2 });
    });
  });
});
