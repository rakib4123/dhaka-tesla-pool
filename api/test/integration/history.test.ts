import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDemoHistory } from '../../src/db/seedData';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData } from '../helpers/db';
import { api, bearer, loginAs } from '../helpers/http';
import { acceptRide, goOnline, poolAction, requestRide } from '../helpers/scenario';

describe('history', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it("lists Jashim's finished trips with the riders who left", async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const pool = await acceptRide('jashim', nusrat.body.id);
    await requestRide('rafiq', 'Banani', 'Gulshan 1');
    await poolAction('jashim', pool.body.id, 'arrive');
    await poolAction('jashim', pool.body.id, 'start');
    await poolAction('jashim', pool.body.id, 'complete');

    const res = await api().get('/api/driver/history').set(bearer(await loginAs('jashim')));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ status: 'COMPLETED', seatsTaken: 2 });
    expect(res.body[0].riders.map((r: { fareTotalPaisa: number }) => r.fareTotalPaisa)).toEqual([5250, 6750]);
  });

  it("gives Nusrat a full, explainable timeline of yesterday's seeded ride", async () => {
    expect(await seedDemoHistory(prisma)).toBe(true);
    expect(await seedDemoHistory(prisma)).toBe(false); // idempotent

    const rides = await api().get('/api/rides').set(bearer(await loginAs('nusrat')));
    expect(rides.body).toHaveLength(1);
    expect(rides.body[0]).toMatchObject({ status: 'COMPLETED', fare: { totalPaisa: 5250 } });

    const detail = await api().get(`/api/rides/${rides.body[0].id}`).set(bearer(await loginAs('nusrat')));
    expect(detail.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      'REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED',
    ]);

    const history = await api().get('/api/driver/history').set(bearer(await loginAs('jashim')));
    expect(history.body[0].riders.map((r: { firstName: string }) => r.firstName)).toEqual(['Nusrat', 'Rafiq']);
  });
});
