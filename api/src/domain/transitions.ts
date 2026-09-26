/** Ride request = one passenger's ticket. Pool = one Tesla's trip. See spec §3.4. */
export const RIDE_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const POOL_STATUSES = ['OPEN', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'] as const;
export type PoolStatus = (typeof POOL_STATUSES)[number];

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED'];
export const PASSENGER_CANCELLABLE_STATUSES: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'];
export const ACTIVE_POOL_STATUSES: PoolStatus[] = ['OPEN', 'DRIVER_ARRIVED', 'STARTED'];
export const JOINABLE_POOL_STATUSES: PoolStatus[] = ['OPEN', 'DRIVER_ARRIVED'];

export type PoolAction = 'arrive' | 'start' | 'complete' | 'cancel';
export const POOL_ACTIONS: PoolAction[] = ['arrive', 'start', 'complete', 'cancel'];

const POOL_TRANSITIONS: Record<PoolAction, { from: PoolStatus[]; to: PoolStatus }> = {
  arrive: { from: ['OPEN'], to: 'DRIVER_ARRIVED' },
  start: { from: ['DRIVER_ARRIVED'], to: 'STARTED' },
  complete: { from: ['STARTED'], to: 'COMPLETED' },
  cancel: { from: ['OPEN', 'DRIVER_ARRIVED'], to: 'CANCELLED' },
};

const MEMBER_RIDE_STATUS: Record<PoolAction, RideStatus> = {
  arrive: 'DRIVER_ARRIVED',
  start: 'STARTED',
  complete: 'COMPLETED',
  cancel: 'REQUESTED', // a driver cancelling puts riders back in the queue
};

/** The status a pool moves to, or null if the action isn't allowed from `current`. */
export function nextPoolStatus(current: PoolStatus, action: PoolAction): PoolStatus | null {
  const rule = POOL_TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : null;
}

export function memberRideStatusAfter(action: PoolAction): RideStatus {
  return MEMBER_RIDE_STATUS[action];
}

export function canPassengerCancel(status: RideStatus): boolean {
  return PASSENGER_CANCELLABLE_STATUSES.includes(status);
}

export function isJoinable(status: PoolStatus): boolean {
  return JOINABLE_POOL_STATUSES.includes(status);
}
