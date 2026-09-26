import type { PoolStatus, RideStatus } from '../api/types';

// The API enforces these rules. The UI mirrors them only to decide which buttons to show.

export const RIDE_STEPS: { status: RideStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'Requested' },
  { status: 'MATCHED', label: 'Matched' },
  { status: 'DRIVER_ARRIVED', label: 'Arrived' },
  { status: 'STARTED', label: 'On the way' },
  { status: 'COMPLETED', label: 'Done' },
];

export function rideStatusLabel(status: RideStatus, vehicleName = 'Your Tesla'): string {
  switch (status) {
    case 'REQUESTED':
      return 'Waiting for a Tesla';
    case 'MATCHED':
      return 'Matched';
    case 'DRIVER_ARRIVED':
      return `${vehicleName} is here`;
    case 'STARTED':
      return 'On the way';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

export function isActiveRide(status: RideStatus): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}

export function canCancelRide(status: RideStatus): boolean {
  return status === 'REQUESTED' || status === 'MATCHED' || status === 'DRIVER_ARRIVED';
}

export const NEXT_POOL_ACTION: Partial<Record<PoolStatus, { action: 'arrive' | 'start' | 'complete'; label: string }>> = {
  OPEN: { action: 'arrive', label: "I've arrived" },
  DRIVER_ARRIVED: { action: 'start', label: 'Start trip' },
  STARTED: { action: 'complete', label: 'Complete trip' },
};

export function canCancelPool(status: PoolStatus): boolean {
  return status === 'OPEN' || status === 'DRIVER_ARRIVED';
}

export function isAcceptingRiders(pool: { status: PoolStatus; isFull: boolean }): boolean {
  return canCancelPool(pool.status) && !pool.isFull;
}
