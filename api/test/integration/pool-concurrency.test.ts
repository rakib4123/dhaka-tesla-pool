import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';
import { api, bearer } from '../helpers/http';
import { acceptRide, cancelRide, getRide, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

/** Bullet with Rafiq holding 2 seats: exactly one seat left (spec §5 scenario). */
async function bulletWithOneSeatLeft(): Promise<string> {
  await goOnline('jashim', 'Banani');
  const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
  const pool = await acceptRide('jashim', rafiq.body.id);
  return pool.body.id as string;
}

describe('concurrency: two riders, one seat', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('gives the last seat to exactly one of Nusrat and Shirin (5 rounds)', async () => {
    for (let round = 0; round < 5; round++) {
      await resetRideData();
      const poolId = await bulletWithOneSeatLeft();

      const [nusrat, shirin] = await Promise.all([
        requestRide('nusrat', 'Banani', 'Mohakhali'),
        requestRide('shirin', 'Banani', 'Mohakhali'),
      ]);

      expect([nusrat.status, shirin.status]).toEqual([201, 201]);
      expect([nusrat.body.status, shirin.body.status].sort()).toEqual(['MATCHED', 'REQUESTED']);
      expect(await seatInvariant(poolId)).toEqual({ seatsTaken: 3, activeSeats: 3 });
    }
  });

  it('seats exactly two of ten commuters rushing for two free seats', async () => {
    await goOnline('jashim', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1');
    const pool = await acceptRide('jashim', rafiq.body.id);

    const tokens = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        const res = await api().post('/api/auth/register').send({
          name: `Banani Commuter ${i + 1}`, email: `commuter${i + 1}@teslapool.test`, password: 'bullet123',
        });
        return res.body.token as string;
      }),
    );
    const body = { pickupZoneId: await zoneId('Banani'), dropoffZoneId: await zoneId('Mohakhali'), seats: 1 };
    const results = await Promise.all(tokens.map((token) => api().post('/api/rides').set(bearer(token)).send(body)));

    const statuses = results.map((res) => res.body.status);
    expect(statuses.filter((s) => s === 'MATCHED')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'REQUESTED')).toHaveLength(8);
    expect(await seatInvariant(pool.body.id)).toEqual({ seatsTaken: 3, activeSeats: 3 });
  });

  it('lets only one of two drivers win the same rider', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');

    const [byJashim, byMonir] = await Promise.all([acceptRide('jashim', nusrat.body.id), acceptRide('monir', nusrat.body.id)]);

    expect([byJashim.status, byMonir.status].sort()).toEqual([200, 409]);
    const loser = byJashim.status === 409 ? byJashim : byMonir;
    expect(loser.body.error.code).toBe('ALREADY_MATCHED');
    const memberships = await prisma.poolMember.count({ where: { rideRequestId: nusrat.body.id, leftAt: null } });
    expect(memberships).toBe(1);
    expect(await prisma.pool.count({ where: { status: 'OPEN' } })).toBe(1); // the loser's new pool was rolled back
  });

  it('keeps seats consistent when Nusrat cancels while Jashim accepts her', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');

    const [accept, cancel] = await Promise.all([acceptRide('jashim', nusrat.body.id), cancelRide('nusrat', nusrat.body.id)]);

    const final = (await getRide('nusrat', nusrat.body.id)).body;
    const pool = await prisma.pool.findFirst({ where: { vehicle: { plate: 'DHK-TESLA-11' } }, orderBy: { createdAt: 'desc' } });
    if (final.status === 'CANCELLED') {
      expect(cancel.status).toBe(200);
      expect(accept.status).toBe(409);
      expect(pool ? (await seatInvariant(pool.id)).seatsTaken : 0).toBe(0);
    } else {
      expect(final.status).toBe('MATCHED');
      expect(accept.status).toBe(200);
      expect(cancel.status).toBe(409);
      expect(await seatInvariant(pool!.id)).toEqual({ seatsTaken: 1, activeSeats: 1 });
    }
  });
});
