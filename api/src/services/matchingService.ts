import type { Prisma } from '@prisma/client';
import { checkJoin, type PoolSnapshot } from '../domain/matching';
import { ACTIVE_POOL_STATUSES, JOINABLE_POOL_STATUSES, isJoinable } from '../domain/transitions';
import { prisma } from '../lib/prisma';
import { claimSeats } from './claimSeats';
import { toZoneRef, type RelevantRequestView } from './views';

const withMemberDropoffs = {
  members: { where: { leftAt: null }, include: { rideRequest: { include: { dropoffZone: true } } } },
} satisfies Prisma.PoolInclude;

type PoolWithDropoffs = Prisma.PoolGetPayload<{ include: typeof withMemberDropoffs }>;

function toSnapshot(pool: PoolWithDropoffs): PoolSnapshot {
  return {
    pickupZoneId: pool.pickupZoneId,
    status: pool.status,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    memberDropoffs: pool.members.map((member) => member.rideRequest.dropoffZone),
  };
}

/**
 * Tries to seat a waiting ride in an open, compatible pool: fullest pool first, then oldest.
 * Each attempt is its own transaction, so losing a race on one pool never undoes the ride itself.
 */
export async function tryAutoJoin(rideRequestId: string): Promise<boolean> {
  const ride = await prisma.rideRequest.findUniqueOrThrow({ where: { id: rideRequestId }, include: { dropoffZone: true } });
  if (ride.status !== 'REQUESTED') return false;

  const pools = await prisma.pool.findMany({
    where: { status: { in: JOINABLE_POOL_STATUSES }, pickupZoneId: ride.pickupZoneId },
    include: withMemberDropoffs,
    orderBy: [{ seatsTaken: 'desc' }, { createdAt: 'asc' }],
  });
  const request = { pickupZoneId: ride.pickupZoneId, dropoff: ride.dropoffZone, seats: ride.seats };
  const candidates = pools.filter((pool) => checkJoin(request, toSnapshot(pool)) === 'OK');

  for (const pool of candidates) {
    const result = await claimSeats({ poolId: pool.id, rideRequestId: ride.id, actorUserId: null, via: 'AUTO_JOIN' });
    if (result.ok) return true;
    if (result.reason === 'ALREADY_MATCHED') return false; // someone else seated this ride
  }
  return false;
}

/** Waiting riders a driver could accept right now: same zone, fits free seats, compatible with his pool. */
export async function listRelevantRequests(driverId: string): Promise<RelevantRequestView[]> {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId } });
  if (!vehicle || !vehicle.isOnline || vehicle.currentZoneId === null) return [];

  const pool = await prisma.pool.findFirst({
    where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } },
    include: withMemberDropoffs,
  });
  if (pool && !isJoinable(pool.status)) return [];

  const snapshot: PoolSnapshot = pool
    ? toSnapshot(pool)
    : { pickupZoneId: vehicle.currentZoneId, status: 'OPEN', capacity: vehicle.capacity, seatsTaken: 0, memberDropoffs: [] };

  const waiting = await prisma.rideRequest.findMany({
    where: { status: 'REQUESTED', pickupZoneId: snapshot.pickupZoneId },
    include: { passenger: true, pickupZone: true, dropoffZone: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return waiting
    .filter((ride) => checkJoin({ pickupZoneId: ride.pickupZoneId, dropoff: ride.dropoffZone, seats: ride.seats }, snapshot) === 'OK')
    .map((ride) => ({
      rideId: ride.id,
      firstName: ride.passenger.name.split(' ')[0] ?? ride.passenger.name,
      seats: ride.seats,
      pickupZone: toZoneRef(ride.pickupZone),
      dropoffZone: toZoneRef(ride.dropoffZone),
      distanceKm: ride.distanceKm,
      estimateSoloPaisa: ride.estimateSoloPaisa,
      estimatePooledPaisa: ride.estimatePooledPaisa,
      requestedAt: ride.createdAt.toISOString(),
    }));
}
