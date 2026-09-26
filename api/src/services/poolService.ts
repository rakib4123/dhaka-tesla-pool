import type { PoolMember, RideRequest } from '@prisma/client';
import { calculateFare } from '../domain/fare';
import { memberRideStatusAfter, nextPoolStatus, type PoolAction, type PoolStatus } from '../domain/transitions';
import { conflict, notFound } from '../lib/AppError';
import { prisma, type Db } from '../lib/prisma';
import { getDriverPoolById } from './driverService';
import { recordEvent } from './events';
import { tryAutoJoin } from './matchingService';
import type { DriverPoolView } from './views';

type Member = PoolMember & { rideRequest: RideRequest };

/** arrive / start / complete / cancel. The pool and all of its current riders move together, in one transaction. */
export async function transitionPool(driverId: string, poolId: string, action: PoolAction): Promise<DriverPoolView> {
  const requeued: string[] = [];

  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: PoolStatus; driver_id: string }[]>`
      SELECT p.id, p.status, v.driver_id
        FROM pools p JOIN vehicles v ON v.id = p.vehicle_id
       WHERE p.id = ${poolId}::uuid
         FOR UPDATE OF p`;
    const locked = rows[0];
    if (!locked || locked.driver_id !== driverId) throw notFound('Pool');

    const next = nextPoolStatus(locked.status, action);
    if (!next) throw conflict('INVALID_TRANSITION', `You can't ${action} a trip that is ${locked.status.toLowerCase().replace('_', ' ')}`);

    const members = await tx.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    const now = new Date();

    if (action === 'cancel') {
      await cancelAndRequeue(tx, poolId, members, driverId, now);
      requeued.push(...members.map((member) => member.rideRequestId));
    } else {
      await tx.pool.update({
        where: { id: poolId },
        data: {
          status: next,
          ...(action === 'start' && { startedAt: now }),
          ...(action === 'complete' && { completedAt: now }),
        },
      });
      await moveRiders(tx, poolId, members, action, driverId);
    }

    await recordEvent(tx, {
      type: 'POOL_STATUS_CHANGED',
      poolId,
      actorUserId: driverId,
      fromStatus: locked.status,
      toStatus: next,
      metadata: { riders: members.length },
    });
  });

  // After the cancel commits, give each re-queued rider an immediate chance at another open pool.
  for (const rideId of requeued) await tryAutoJoin(rideId);

  return getDriverPoolById(poolId, { includeLeft: action === 'cancel' });
}

async function moveRiders(tx: Db, poolId: string, members: Member[], action: Exclude<PoolAction, 'cancel'>, driverId: string) {
  const rideStatus = memberRideStatusAfter(action);
  const pooled = members.length >= 2; // the discount depends on who is actually aboard at the start

  for (const member of members) {
    const ride = member.rideRequest;
    const fare = action === 'start' ? calculateFare({ distanceKm: ride.distanceKm, seats: ride.seats, pooled }) : null;
    await tx.rideRequest.update({
      where: { id: ride.id },
      data: {
        status: rideStatus,
        ...(fare && {
          fareBasePaisa: fare.basePaisa,
          fareDistancePaisa: fare.distancePaisa,
          fareDiscountPaisa: fare.discountPaisa,
          fareTotalPaisa: fare.totalPaisa,
        }),
      },
    });
    await recordEvent(tx, {
      type: 'RIDE_STATUS_CHANGED',
      rideRequestId: ride.id,
      poolId,
      actorUserId: driverId,
      fromStatus: ride.status,
      toStatus: rideStatus,
      ...(fare && { metadata: { ...fare, pooled } }),
    });
  }
}

async function cancelAndRequeue(tx: Db, poolId: string, members: Member[], driverId: string, now: Date) {
  await tx.pool.update({ where: { id: poolId }, data: { status: 'CANCELLED', seatsTaken: 0 } });
  for (const member of members) {
    await tx.poolMember.update({ where: { id: member.id }, data: { leftAt: now, leftReason: 'DRIVER_CANCELLED' } });
    await tx.rideRequest.update({ where: { id: member.rideRequestId }, data: { status: 'REQUESTED' } });
    await recordEvent(tx, {
      type: 'RIDE_REQUEUED',
      rideRequestId: member.rideRequestId,
      poolId,
      actorUserId: driverId,
      fromStatus: member.rideRequest.status,
      toStatus: 'REQUESTED',
    });
  }
}
