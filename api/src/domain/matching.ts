import { fitsDestinationCluster, type GridPoint } from './geo';
import { isJoinable, type PoolStatus } from './transitions';

export interface JoinRequest {
  pickupZoneId: number;
  dropoff: GridPoint;
  seats: number;
}

export interface PoolSnapshot {
  pickupZoneId: number;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  memberDropoffs: GridPoint[];
}

export type JoinVerdict = 'OK' | 'POOL_CLOSED' | 'INCOMPATIBLE' | 'NO_SEATS';

/** The spec §3.2 compatibility rule. Pure: used to pick candidates and to list relevant requests. */
export function checkJoin(request: JoinRequest, pool: PoolSnapshot): JoinVerdict {
  if (!isJoinable(pool.status)) return 'POOL_CLOSED';
  if (request.pickupZoneId !== pool.pickupZoneId) return 'INCOMPATIBLE';
  if (!fitsDestinationCluster(request.dropoff, pool.memberDropoffs)) return 'INCOMPATIBLE';
  if (pool.seatsTaken + request.seats > pool.capacity) return 'NO_SEATS';
  return 'OK';
}
