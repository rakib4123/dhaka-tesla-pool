import type { DriverPool, DriverRider, Me, RelevantRequest, Ride, RidePool, Zone, ZoneRef } from '../api/types';

// The story cast, as the API returns them.

export const ZONES: Zone[] = [
  { id: 1, name: 'Banani', gridX: 0, gridY: 0 },
  { id: 2, name: 'Mohakhali', gridX: 0, gridY: -2 },
  { id: 3, name: 'Gulshan 1', gridX: 1, gridY: -2 },
  { id: 4, name: 'Gulshan 2', gridX: 1, gridY: 0 },
  { id: 9, name: 'Uttara', gridX: -3, gridY: 9 },
];

export function zoneRef(name: string): ZoneRef {
  const zone = ZONES.find((z) => z.name === name);
  if (!zone) throw new Error(`Unknown zone in fixture: ${name}`);
  return { id: zone.id, name: zone.name };
}

export const nusrat: Me = {
  id: 'user-nusrat', name: 'Nusrat', email: 'nusrat@teslapool.test', phone: '+8801711000001', role: 'PASSENGER', vehicle: null,
};

/** A new passenger who registers through the app. */
export const tania: Me = {
  id: 'user-tania', name: 'Tania', email: 'tania@teslapool.test', phone: null, role: 'PASSENGER', vehicle: null,
};

export const jashim: Me = {
  id: 'user-jashim', name: 'Jashim', email: 'jashim@teslapool.test', phone: '+8801811000001', role: 'DRIVER',
  vehicle: { id: 'vehicle-bullet', name: 'Bullet', plate: 'DHK-TESLA-11', capacity: 3, isOnline: false, currentZone: null },
};

export const jashimOnline: Me = {
  ...jashim,
  vehicle: { ...jashim.vehicle!, isOnline: true, currentZone: zoneRef('Banani') },
};

export const bulletPool = (overrides: Partial<RidePool> = {}): RidePool => ({
  id: 'pool-1', status: 'OPEN', driverName: 'Jashim', vehicleName: 'Bullet', vehiclePlate: 'DHK-TESLA-11', coRiderCount: 0,
  ...overrides,
});

/** Nusrat's Banani → Mohakhali trip: 2 km, ৳70.00 solo, ৳52.50 pooled. */
export const nusratRide = (overrides: Partial<Ride> = {}): Ride => ({
  id: 'ride-nusrat', status: 'REQUESTED', seats: 1, pickupZone: zoneRef('Banani'), dropoffZone: zoneRef('Mohakhali'),
  distanceKm: 2, estimate: { soloPaisa: 7000, pooledPaisa: 5250 }, fare: null, cancelledBy: null,
  createdAt: '2026-09-26T02:41:00.000Z', pool: null,
  ...overrides,
});

export const NUSRAT_POOLED_FARE = { basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250 };

export const rider = (overrides: Partial<DriverRider> = {}): DriverRider => ({
  rideId: 'ride-nusrat', firstName: 'Nusrat', seats: 1, dropoffZone: zoneRef('Mohakhali'), status: 'MATCHED',
  estimatePaisa: 7000, fareTotalPaisa: null, leftReason: null,
  ...overrides,
});

export const rafiqRider = (overrides: Partial<DriverRider> = {}): DriverRider =>
  rider({ rideId: 'ride-rafiq', firstName: 'Rafiq', dropoffZone: zoneRef('Gulshan 1'), estimatePaisa: 6750, ...overrides });

export const driverPool = (overrides: Partial<DriverPool> = {}): DriverPool => ({
  id: 'pool-1', status: 'OPEN', capacity: 3, seatsTaken: 1, isFull: false, pickupZone: zoneRef('Banani'),
  vehicle: { name: 'Bullet', plate: 'DHK-TESLA-11' }, riders: [rider()],
  createdAt: '2026-09-26T02:42:00.000Z', startedAt: null, completedAt: null,
  ...overrides,
});

export const waitingRequest = (overrides: Partial<RelevantRequest> = {}): RelevantRequest => ({
  rideId: 'ride-nusrat', firstName: 'Nusrat', seats: 1, pickupZone: zoneRef('Banani'), dropoffZone: zoneRef('Mohakhali'),
  distanceKm: 2, estimateSoloPaisa: 7000, estimatePooledPaisa: 5250, requestedAt: '2026-09-26T02:41:00.000Z',
  ...overrides,
});
