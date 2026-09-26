import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, resetRideData } from '../helpers/db';
import { acceptRide, driverPool, getRide, goOffline, goOnline, requestRide, seatInvariant } from '../helpers/scenario';

describe('driver accepts rides into a pool', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('opens a pool in Bullet when Jashim accepts Nusrat', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const accepted = await acceptRide('jashim', nusrat.body.id);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      status: 'OPEN', capacity: 3, seatsTaken: 1, isFull: false, pickupZone: { name: 'Banani' },
      vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11' },
      riders: [{ firstName: 'Nusrat', seats: 1, dropoffZone: { name: 'Mohakhali' }, status: 'MATCHED', estimatePaisa: 7000 }],
    });
    const ride = await getRide('nusrat', nusrat.body.id);
    expect(ride.body).toMatchObject({ status: 'MATCHED', pool: { driverName: 'Jashim', vehicleName: 'Bullet', coRiderCount: 0 } });
    expect(ride.body.events.map((e: { type: string }) => e.type)).toEqual(['RIDE_REQUESTED', 'RIDE_MATCHED']);
    expect((await driverPool('jashim')).body.pool.id).toBe(accepted.body.id);
  });

  it('fills Bullet to exactly three seats and refuses a fourth', async () => {
    await goOnline('jashim', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 2);
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Mohakhali');
    await acceptRide('jashim', rafiq.body.id);
    const full = await acceptRide('jashim', nusrat.body.id);
    expect(full.body).toMatchObject({ seatsTaken: 3, isFull: true });
    const overflow = await acceptRide('jashim', shirin.body.id);
    expect(overflow.status).toBe(409);
    expect(overflow.body.error.code).toBe('NO_SEATS');
    expect(await seatInvariant(full.body.id)).toEqual({ seatsTaken: 3, activeSeats: 3 });
    expect((await getRide('shirin', shirin.body.id)).body.status).toBe('REQUESTED');
  });

  it('refuses an incompatible rider into an existing pool', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const shirin = await requestRide('shirin', 'Banani', 'Uttara');
    await acceptRide('jashim', nusrat.body.id);
    const res = await acceptRide('jashim', shirin.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INCOMPATIBLE');
  });

  it('refuses when the driver is offline', async () => {
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const res = await acceptRide('jashim', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DRIVER_OFFLINE');
  });

  it('refuses a rider waiting in a different zone', async () => {
    await goOnline('jashim', 'Gulshan 2');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    const res = await acceptRide('jashim', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_ZONE');
  });

  it('leaves no empty pool behind when Toofan (2 seats) cannot fit a 3-seat request', async () => {
    await goOnline('monir', 'Banani');
    const rafiq = await requestRide('rafiq', 'Banani', 'Gulshan 1', 3);
    const res = await acceptRide('monir', rafiq.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SEATS');
    expect((await driverPool('monir')).body.pool).toBeNull();
  });

  it('tells a second driver the rider is already taken', async () => {
    await goOnline('jashim', 'Banani');
    await goOnline('monir', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    const res = await acceptRide('monir', nusrat.body.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MATCHED');
  });

  it('keeps Jashim online while he has riders', async () => {
    await goOnline('jashim', 'Banani');
    const nusrat = await requestRide('nusrat', 'Banani', 'Mohakhali');
    await acceptRide('jashim', nusrat.body.id);
    const res = await goOffline('jashim');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_POOL_EXISTS');
  });

  it('answers unknown or malformed request ids with 404', async () => {
    await goOnline('jashim', 'Banani');
    expect((await acceptRide('jashim', '7d3c1b7e-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await acceptRide('jashim', 'nope')).status).toBe(404);
  });
});
