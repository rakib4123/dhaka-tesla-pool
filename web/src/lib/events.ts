import type { RideEvent } from '../api/types';

/** Turns an audit event into a sentence a passenger understands. */
export function describeEvent(event: RideEvent): string {
  switch (event.type) {
    case 'RIDE_REQUESTED':
      return 'You requested the ride';
    case 'RIDE_MATCHED':
      return event.actor === 'SYSTEM' ? 'Matched into a shared Tesla automatically' : 'The driver accepted your ride';
    case 'RIDE_CANCELLED':
      return 'You cancelled the ride';
    case 'RIDE_REQUEUED':
      return 'The driver cancelled, so you went back in the queue';
    case 'RIDE_STATUS_CHANGED':
      if (event.toStatus === 'DRIVER_ARRIVED') return 'Your Tesla arrived at the pickup';
      if (event.toStatus === 'STARTED') return 'Trip started and your fare was locked';
      if (event.toStatus === 'COMPLETED') return 'Trip completed';
      return `Status changed to ${event.toStatus ?? 'unknown'}`;
    default:
      return event.type;
  }
}
