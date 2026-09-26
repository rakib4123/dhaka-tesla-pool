import type { ZoneName } from '../../src/db/cast';
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
