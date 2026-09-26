import { fitsDestinationCluster } from '../domain/geo';
import { isJoinable } from '../domain/transitions';
import { prisma, type Db } from '../lib/prisma';
import { recordEvent } from './events';

export type ClaimFailure = 'NO_SEATS' | 'POOL_CLOSED' | 'INCOMPATIBLE' | 'ALREADY_MATCHED';

export class ClaimRejected extends Error {
  constructor(readonly reason: ClaimFailure) {
    super(`Seat claim rejected: ${reason}`);
    this.name = 'ClaimRejected';
  }
}

export const CLAIM_MESSAGES: Record<ClaimFailure, string> = {
  NO_SEATS: 'Not enough free seats for this request',
  POOL_CLOSED: 'This trip has already started. No new riders',
  INCOMPATIBLE: "This rider's trip doesn't fit the current pool",
  ALREADY_MATCHED: 'Another Tesla already picked up this rider',
};

export interface ClaimArgs {
  poolId: string;
  rideRequestId: string;
  actorUserId: string | null;
  via: 'AUTO_JOIN' | 'DRIVER_ACCEPT';
}

/**
 * Seats a REQUESTED ride in a pool. Must run inside a transaction. Throws ClaimRejected
 * (so the caller's transaction rolls back) when the ride can't be seated.
 * This function is the only place seats are ever taken.
 */
export async function claimSeatsInTx(tx: Db, args: ClaimArgs): Promise<void> {
  const ride = await tx.rideRequest.findUniqueOrThrow({ where: { id: args.rideRequestId }, include: { dropoffZone: true } });

  // 1. Take the seats atomically. This UPDATE locks the pool row. A concurrent claim waits here,
  //    and once we commit, Postgres re-checks its WHERE against the new seats_taken.
  const claimed = await tx.$queryRaw<{ id: string }[]>`
    UPDATE pools
       SET seats_taken = seats_taken + ${ride.seats}::int
     WHERE id = ${args.poolId}::uuid
       AND status IN ('OPEN', 'DRIVER_ARRIVED')
       AND seats_taken + ${ride.seats}::int <= capacity
    RETURNING id`;
  if (claimed.length === 0) {
    const pool = await tx.pool.findUniqueOrThrow({ where: { id: args.poolId } });
    throw new ClaimRejected(isJoinable(pool.status) ? 'NO_SEATS' : 'POOL_CLOSED');
  }

  // 2. We hold the pool lock, so nobody else can join right now. This compatibility check is race-free.
  const pool = await tx.pool.findUniqueOrThrow({
    where: { id: args.poolId },
    include: { members: { where: { leftAt: null }, include: { rideRequest: { include: { dropoffZone: true } } } } },
  });
  const memberDropoffs = pool.members.map((member) => member.rideRequest.dropoffZone);
  if (ride.pickupZoneId !== pool.pickupZoneId || !fitsDestinationCluster(ride.dropoffZone, memberDropoffs)) {
    throw new ClaimRejected('INCOMPATIBLE');
  }

  // 3. Guarded status change: exactly one pool can win this ride.
  const { count } = await tx.rideRequest.updateMany({
    where: { id: ride.id, status: 'REQUESTED' },
    data: { status: 'MATCHED' },
  });
  if (count === 0) throw new ClaimRejected('ALREADY_MATCHED');

  await tx.poolMember.create({ data: { poolId: pool.id, rideRequestId: ride.id, seats: ride.seats } });
  await recordEvent(tx, {
    type: 'RIDE_MATCHED',
    rideRequestId: ride.id,
    poolId: pool.id,
    actorUserId: args.actorUserId,
    fromStatus: 'REQUESTED',
    toStatus: 'MATCHED',
    metadata: { via: args.via },
  });
  await recordEvent(tx, {
    type: 'POOL_MEMBER_JOINED',
    rideRequestId: ride.id,
    poolId: pool.id,
    actorUserId: args.actorUserId,
    metadata: { seats: ride.seats, seatsTaken: pool.seatsTaken, capacity: pool.capacity },
  });
}

/** Standalone claim in its own transaction; reports failure instead of throwing. */
export async function claimSeats(args: ClaimArgs): Promise<{ ok: true } | { ok: false; reason: ClaimFailure }> {
  try {
    await prisma.$transaction((tx) => claimSeatsInTx(tx, args));
    return { ok: true };
  } catch (err) {
    if (err instanceof ClaimRejected) return { ok: false, reason: err.reason };
    throw err;
  }
}
