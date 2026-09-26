import type { Prisma } from '@prisma/client';
import { ACTIVE_POOL_STATUSES } from '../domain/transitions';
import { AppError, conflict, notFound } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { CLAIM_MESSAGES, ClaimRejected, claimSeatsInTx } from './claimSeats';
import { recordEvent } from './events';
import { lockVehicleForDriver } from './locks';
import { toVehicleView, toZoneRef, type DriverPoolView, type VehicleView } from './views';

export async function setAvailability(driverId: string, input: { online: boolean; zoneId?: number }): Promise<VehicleView> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await lockVehicleForDriver(tx, driverId);

    const activePool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } } });
    if (activePool) throw conflict('ACTIVE_POOL_EXISTS', 'Finish or cancel your current trip before changing availability');

    if (input.online) {
      const zone = input.zoneId === undefined ? null : await tx.zone.findUnique({ where: { id: input.zoneId } });
      if (!zone) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown zone', [{ path: 'zoneId', message: 'Unknown zone' }]);
    }

    const updated = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: input.online ? { isOnline: true, currentZoneId: input.zoneId } : { isOnline: false, currentZoneId: null },
      include: { currentZone: true },
    });
    return toVehicleView(updated);
  });
}

export const driverPoolInclude = {
  pickupZone: true,
  vehicle: true,
  members: {
    orderBy: { joinedAt: 'asc' },
    include: { rideRequest: { include: { passenger: true, dropoffZone: true } } },
  },
} satisfies Prisma.PoolInclude;

type PoolWithRiders = Prisma.PoolGetPayload<{ include: typeof driverPoolInclude }>;

export function toDriverPoolView(pool: PoolWithRiders, includeLeft = false): DriverPoolView {
  const current = pool.members.filter((member) => member.leftAt === null);
  const shown = includeLeft ? pool.members : current;
  const pooled = current.length >= 2;
  return {
    id: pool.id,
    status: pool.status,
    capacity: pool.capacity,
    seatsTaken: pool.seatsTaken,
    isFull: pool.seatsTaken >= pool.capacity,
    pickupZone: toZoneRef(pool.pickupZone),
    vehicle: { name: pool.vehicle.name, plate: pool.vehicle.plate },
    riders: shown.map(({ rideRequest: ride, leftReason }) => ({
      rideId: ride.id,
      firstName: ride.passenger.name.split(' ')[0] ?? ride.passenger.name,
      seats: ride.seats,
      dropoffZone: toZoneRef(ride.dropoffZone),
      status: ride.status,
      estimatePaisa: pooled ? ride.estimatePooledPaisa : ride.estimateSoloPaisa,
      fareTotalPaisa: ride.fareTotalPaisa,
      leftReason,
    })),
    createdAt: pool.createdAt.toISOString(),
    startedAt: pool.startedAt?.toISOString() ?? null,
    completedAt: pool.completedAt?.toISOString() ?? null,
  };
}

export async function getDriverPool(driverId: string): Promise<DriverPoolView | null> {
  const pool = await prisma.pool.findFirst({
    where: { vehicle: { driverId }, status: { in: ACTIVE_POOL_STATUSES } },
    include: driverPoolInclude,
  });
  return pool ? toDriverPoolView(pool) : null;
}

export async function getDriverPoolById(poolId: string, opts: { includeLeft?: boolean } = {}): Promise<DriverPoolView> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId }, include: driverPoolInclude });
  if (!pool) throw notFound('Pool');
  return toDriverPoolView(pool, opts.includeLeft ?? false);
}

/** Jashim accepts a waiting rider: into his open pool, or into a new pool if he has none. */
export async function acceptRequest(driverId: string, rideRequestId: string): Promise<DriverPoolView> {
  let poolId: string;
  try {
    poolId = await prisma.$transaction(async (tx) => {
      const vehicle = await lockVehicleForDriver(tx, driverId); // lock order: vehicle → pool → ride
      if (!vehicle.isOnline || vehicle.currentZoneId === null) throw conflict('DRIVER_OFFLINE', 'Go online before accepting rides');

      const ride = await tx.rideRequest.findUnique({ where: { id: rideRequestId } });
      if (!ride) throw notFound('Ride request');
      if (ride.status !== 'REQUESTED') throw conflict('ALREADY_MATCHED', CLAIM_MESSAGES.ALREADY_MATCHED);

      let pool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } } });
      if (!pool) {
        if (ride.pickupZoneId !== vehicle.currentZoneId) throw conflict('WRONG_ZONE', 'This rider is waiting in a different zone');
        pool = await tx.pool.create({
          data: { vehicleId: vehicle.id, pickupZoneId: ride.pickupZoneId, capacity: vehicle.capacity },
        });
        await recordEvent(tx, {
          type: 'POOL_OPENED',
          poolId: pool.id,
          actorUserId: driverId,
          toStatus: 'OPEN',
          metadata: { vehicle: vehicle.name, capacity: vehicle.capacity },
        });
      }

      await claimSeatsInTx(tx, { poolId: pool.id, rideRequestId, actorUserId: driverId, via: 'DRIVER_ACCEPT' });
      return pool.id;
    });
  } catch (err) {
    // A rejected claim rolled everything back, including a freshly opened pool.
    if (err instanceof ClaimRejected) throw conflict(err.reason, CLAIM_MESSAGES[err.reason]);
    throw err;
  }
  return getDriverPoolById(poolId);
}
