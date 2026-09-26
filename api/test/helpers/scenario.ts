import type { ZoneName } from '../../src/db/cast';
import { prisma } from '../../src/lib/prisma';
import { zoneId } from './db';
import { api, bearer, loginAs } from './http';

export type PassengerKey = 'nusrat' | 'rafiq' | 'shirin';

export async function requestRide(who: PassengerKey, from: ZoneName, to: ZoneName, seats = 1) {
  return api()
    .post('/api/rides')
    .set(bearer(await loginAs(who)))
    .send({ pickupZoneId: await zoneId(from), dropoffZoneId: await zoneId(to), seats });
}

export async function cancelRide(who: PassengerKey, rideId: string) {
  return api().post(`/api/rides/${rideId}/cancel`).set(bearer(await loginAs(who)));
}

export async function getRide(who: PassengerKey, rideId: string) {
  return api().get(`/api/rides/${rideId}`).set(bearer(await loginAs(who)));
}

export type DriverKey = 'jashim' | 'monir';

export async function goOnline(driver: DriverKey, zone: ZoneName) {
  return api().put('/api/driver/availability').set(bearer(await loginAs(driver))).send({ online: true, zoneId: await zoneId(zone) });
}

export async function goOffline(driver: DriverKey) {
  return api().put('/api/driver/availability').set(bearer(await loginAs(driver))).send({ online: false });
}

export async function acceptRide(driver: DriverKey, rideId: string) {
  return api().post(`/api/driver/requests/${rideId}/accept`).set(bearer(await loginAs(driver)));
}

export async function driverPool(driver: DriverKey) {
  return api().get('/api/driver/pool').set(bearer(await loginAs(driver)));
}

/** seats_taken must always equal the seats of the pool's current members. */
export async function seatInvariant(poolId: string): Promise<{ seatsTaken: number; activeSeats: number }> {
  const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
  const active = await prisma.poolMember.aggregate({ where: { poolId, leftAt: null }, _sum: { seats: true } });
  return { seatsTaken: pool.seatsTaken, activeSeats: active._sum.seats ?? 0 };
}
