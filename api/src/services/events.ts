import type { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import type { Db } from '../lib/prisma';

export type RideEventType =
  | 'RIDE_REQUESTED'
  | 'RIDE_MATCHED'
  | 'RIDE_STATUS_CHANGED'
  | 'RIDE_CANCELLED'
  | 'RIDE_REQUEUED'
  | 'POOL_OPENED'
  | 'POOL_STATUS_CHANGED'
  | 'POOL_MEMBER_JOINED'
  | 'POOL_MEMBER_LEFT';

export interface NewRideEvent {
  type: RideEventType;
  rideRequestId?: string;
  poolId?: string;
  /** null = the system acted (e.g. auto-join) */
  actorUserId: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/** Append-only audit trail. Always call inside the same transaction as the change it describes. */
export async function recordEvent(db: Db, event: NewRideEvent): Promise<void> {
  await db.rideEvent.create({
    data: {
      type: event.type,
      rideRequestId: event.rideRequestId ?? null,
      poolId: event.poolId ?? null,
      actorUserId: event.actorUserId,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      metadata: event.metadata,
    },
  });
  // Every state change also goes to the structured log (spec §7). If the surrounding
  // transaction later rolls back, the error log that follows explains why.
  logger.info(
    { event: event.type, rideRequestId: event.rideRequestId, poolId: event.poolId, from: event.fromStatus, to: event.toStatus },
    'state change',
  );
}
