import type { Prisma } from '@prisma/client';
import { estimateFares } from '../domain/fare';
import { canPassengerCancel } from '../domain/transitions';
import { conflict, notFound } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import type { TripInput } from '../routes/schemas';
import { recordEvent } from './events';
import { resolveTrip } from './fareService';
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

export async function cancelRide(rideId: string, passengerId: string): Promise<RideView> {
  const ride = await findOwnRide(rideId, passengerId);
  if (!canPassengerCancel(ride.status)) {
    throw conflict('INVALID_TRANSITION', `A ride that is ${ride.status.toLowerCase().replace('_', ' ')} can no longer be cancelled`);
  }

  await prisma.$transaction(async (tx) => {
    // Guarded update: if the ride changed since we read it, touch nothing.
    const { count } = await tx.rideRequest.updateMany({
      where: { id: rideId, status: 'REQUESTED' },
      data: { status: 'CANCELLED', cancelledBy: 'PASSENGER' },
    });
    if (count === 0) throw conflict('INVALID_TRANSITION', 'Your ride changed while you were cancelling. Refresh and try again');
    await recordEvent(tx, {
      type: 'RIDE_CANCELLED',
      rideRequestId: rideId,
      actorUserId: passengerId,
      fromStatus: 'REQUESTED',
      toStatus: 'CANCELLED',
    });
  });

  return getRideForPassenger(rideId, passengerId);
}
