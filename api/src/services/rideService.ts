import type { PoolMember, Prisma } from '@prisma/client';
import { estimateFares } from '../domain/fare';
import { canPassengerCancel, type RideStatus } from '../domain/transitions';
import { conflict, notFound } from '../lib/AppError';
import { prisma, type Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import type { TripInput } from '../routes/schemas';
import { recordEvent } from './events';
import { resolveTrip } from './fareService';
import { lockPool } from './locks';
import { tryAutoJoin } from './matchingService';
import { toZoneRef, type RideDetailView, type RideView } from './views';

const rideInclude = {
  pickupZone: true,
  dropoffZone: true,
  memberships: {
    where: { leftAt: null },
    include: {
      pool: {
        include: {
          vehicle: { include: { driver: true } },
          _count: { select: { members: { where: { leftAt: null } } } },
        },
      },
    },
  },
} satisfies Prisma.RideRequestInclude;

type RideWithRelations = Prisma.RideRequestGetPayload<{ include: typeof rideInclude }>;

function toRideView(ride: RideWithRelations): RideView {
  const pool = ride.memberships[0]?.pool;
  return {
    id: ride.id,
    status: ride.status,
    seats: ride.seats,
    pickupZone: toZoneRef(ride.pickupZone),
    dropoffZone: toZoneRef(ride.dropoffZone),
    distanceKm: ride.distanceKm,
    estimate: { soloPaisa: ride.estimateSoloPaisa, pooledPaisa: ride.estimatePooledPaisa },
    fare:
      ride.fareTotalPaisa === null
        ? null
        : {
            basePaisa: ride.fareBasePaisa ?? 0,
            distancePaisa: ride.fareDistancePaisa ?? 0,
            discountPaisa: ride.fareDiscountPaisa ?? 0,
            totalPaisa: ride.fareTotalPaisa,
          },
    cancelledBy: ride.cancelledBy,
    createdAt: ride.createdAt.toISOString(),
    pool: pool
      ? {
          id: pool.id,
          status: pool.status,
          driverName: pool.vehicle.driver.name,
          vehicleName: pool.vehicle.name,
          vehiclePlate: pool.vehicle.plate,
          coRiderCount: Math.max(pool._count.members - 1, 0),
        }
      : null,
  };
}

export async function createRide(passengerId: string, input: TripInput): Promise<RideView> {
  const trip = await resolveTrip(input);
  const estimate = estimateFares(trip.distanceKm, input.seats);

  let rideId: string;
  try {
    rideId = await prisma.$transaction(async (tx) => {
      const ride = await tx.rideRequest.create({
        data: {
          passengerId,
          pickupZoneId: trip.pickup.id,
          dropoffZoneId: trip.dropoff.id,
          seats: input.seats,
          distanceKm: trip.distanceKm,
          estimateSoloPaisa: estimate.soloPaisa,
          estimatePooledPaisa: estimate.pooledPaisa,
        },
      });
      await recordEvent(tx, {
        type: 'RIDE_REQUESTED',
        rideRequestId: ride.id,
        actorUserId: passengerId,
        toStatus: 'REQUESTED',
        metadata: { distanceKm: trip.distanceKm, ...estimate },
      });
      return ride.id;
    });
  } catch (err) {
    // The partial unique index is the source of truth, including for double-clicks racing each other.
    if (isUniqueViolation(err)) throw conflict('ACTIVE_RIDE_EXISTS', 'You already have an active ride. Cancel it or wait until it completes');
    throw err;
  }

  // "Figure it out in about a second": try to seat the rider right away.
  await tryAutoJoin(rideId);
  return getRideForPassenger(rideId, passengerId);
}

async function findOwnRide(rideId: string, passengerId: string): Promise<RideWithRelations> {
  const ride = await prisma.rideRequest.findFirst({ where: { id: rideId, passengerId }, include: rideInclude });
  if (!ride) throw notFound('Ride'); // someone else's ride is indistinguishable from a missing one
  return ride;
}

export async function getRideForPassenger(rideId: string, passengerId: string): Promise<RideView> {
  return toRideView(await findOwnRide(rideId, passengerId));
}

export async function getRideDetail(rideId: string, passengerId: string): Promise<RideDetailView> {
  const ride = await findOwnRide(rideId, passengerId);
  const events = await prisma.rideEvent.findMany({
    where: { rideRequestId: rideId, type: { startsWith: 'RIDE_' } },
    orderBy: { id: 'asc' },
    include: { actor: { select: { role: true } } },
  });
  return {
    ...toRideView(ride),
    events: events.map((event) => ({
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor?.role ?? 'SYSTEM',
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function listRides(passengerId: string): Promise<RideView[]> {
  const rides = await prisma.rideRequest.findMany({
    where: { passengerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: rideInclude,
  });
  return rides.map(toRideView);
}

const RETRY_MESSAGE = 'Your ride changed while you were cancelling. Refresh and try again';

export async function cancelRide(rideId: string, passengerId: string): Promise<RideView> {
  const ride = await findOwnRide(rideId, passengerId); // ownership (404) and a fast, friendly status check
  if (!canPassengerCancel(ride.status)) {
    throw conflict('INVALID_TRANSITION', `A ride that is ${ride.status.toLowerCase().replace('_', ' ')} can no longer be cancelled`);
  }

  await prisma.$transaction(async (tx) => {
    // Decide from ONE statement so status and membership come from the same snapshot. The read
    // above is two SELECTs and may be torn (e.g. MATCHED but no membership), so it is not trusted.
    const [snapshot] = await tx.$queryRaw<CancelSnapshot[]>`
      SELECT r.status, m.id AS membership_id, m.pool_id, m.seats
        FROM ride_requests r
        LEFT JOIN pool_members m ON m.ride_request_id = r.id AND m.left_at IS NULL
       WHERE r.id = ${rideId}::uuid`;
    if (!snapshot || !canPassengerCancel(snapshot.status)) throw conflict('INVALID_TRANSITION', RETRY_MESSAGE);
    const membership = snapshot.membership_id && snapshot.pool_id && snapshot.seats !== null
      ? { id: snapshot.membership_id, poolId: snapshot.pool_id, rideRequestId: rideId, seats: snapshot.seats }
      : null;

    if (membership) await lockPool(tx, membership.poolId); // same lock order as claimSeats: pool first

    // Guarded update: only succeeds if the ride is still in the status we snapshotted.
    const { count } = await tx.rideRequest.updateMany({
      where: { id: rideId, status: snapshot.status },
      data: { status: 'CANCELLED', cancelledBy: 'PASSENGER' },
    });
    if (count === 0) throw conflict('INVALID_TRANSITION', RETRY_MESSAGE);

    await recordEvent(tx, {
      type: 'RIDE_CANCELLED',
      rideRequestId: rideId,
      poolId: membership?.poolId,
      actorUserId: passengerId,
      fromStatus: snapshot.status,
      toStatus: 'CANCELLED',
    });
    // Under the pool lock, releaseSeats re-checks that this exact membership is still active.
    if (membership) await releaseSeats(tx, membership, passengerId);
  });

  return getRideForPassenger(rideId, passengerId);
}

interface CancelSnapshot {
  status: RideStatus;
  membership_id: string | null;
  pool_id: string | null;
  seats: number | null;
}

/** Gives a leaving rider's seats back to the pool; an emptied pool is cancelled so the driver is free. */
async function releaseSeats(tx: Db, membership: Pick<PoolMember, 'id' | 'poolId' | 'rideRequestId' | 'seats'>, actorUserId: string): Promise<void> {
  const { count } = await tx.poolMember.updateMany({
    where: { id: membership.id, leftAt: null },
    data: { leftAt: new Date(), leftReason: 'PASSENGER_CANCELLED' },
  });
  if (count === 0) throw conflict('INVALID_TRANSITION', RETRY_MESSAGE); // membership changed under us

  const pool = await tx.pool.update({
    where: { id: membership.poolId },
    data: { seatsTaken: { decrement: membership.seats } },
  });
  await recordEvent(tx, {
    type: 'POOL_MEMBER_LEFT',
    poolId: pool.id,
    rideRequestId: membership.rideRequestId,
    actorUserId,
    metadata: { seats: membership.seats, seatsTaken: pool.seatsTaken, reason: 'PASSENGER_CANCELLED' },
  });

  if (pool.seatsTaken === 0) {
    await tx.pool.update({ where: { id: pool.id }, data: { status: 'CANCELLED' } });
    await recordEvent(tx, {
      type: 'POOL_STATUS_CHANGED',
      poolId: pool.id,
      actorUserId: null,
      fromStatus: pool.status,
      toStatus: 'CANCELLED',
      metadata: { reason: 'EMPTY' },
    });
  }
}
