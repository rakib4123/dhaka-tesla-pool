import { describe, expect, it } from 'vitest';
import type { RideStatus } from '../api/types';
import {
  canCancelPool,
  canCancelRide,
  isAcceptingRiders,
  isActiveRide,
  NEXT_POOL_ACTION,
  RIDE_STEPS,
  rideStatusLabel,
} from './status';

describe('ride status labels (spec §3.4)', () => {
  it.each([
    ['REQUESTED', 'Waiting for a Tesla'],
    ['MATCHED', 'Matched'],
    ['STARTED', 'On the way'],
    ['COMPLETED', 'Completed'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('%s → %s', (status, label) => {
    expect(rideStatusLabel(status)).toBe(label);
  });

  it('names the Tesla when it has arrived', () => {
    expect(rideStatusLabel('DRIVER_ARRIVED', 'Bullet')).toBe('Bullet is here');
    expect(rideStatusLabel('DRIVER_ARRIVED')).toBe('Your Tesla is here');
  });

  it('lists the five progress steps in order', () => {
    expect(RIDE_STEPS.map((step) => step.status)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED']);
  });
});

describe('what a passenger can still do', () => {
  const all: RideStatus[] = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED'];

  it('treats everything before COMPLETED/CANCELLED as active', () => {
    expect(all.filter(isActiveRide)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED']);
  });

  it('allows cancelling only before the trip starts (mirrors the API rule)', () => {
    expect(all.filter(canCancelRide)).toEqual(['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED']);
  });
});

describe("what Jashim's next button is", () => {
  it('walks arrive → start → complete', () => {
    expect(NEXT_POOL_ACTION.OPEN).toEqual({ action: 'arrive', label: "I've arrived" });
    expect(NEXT_POOL_ACTION.DRIVER_ARRIVED).toEqual({ action: 'start', label: 'Start trip' });
    expect(NEXT_POOL_ACTION.STARTED).toEqual({ action: 'complete', label: 'Complete trip' });
    expect(NEXT_POOL_ACTION.COMPLETED).toBeUndefined();
  });

  it('allows cancelling the pool only before the start', () => {
    expect(canCancelPool('OPEN')).toBe(true);
    expect(canCancelPool('DRIVER_ARRIVED')).toBe(true);
    expect(canCancelPool('STARTED')).toBe(false);
  });

  it('takes more riders only while not started and not full', () => {
    expect(isAcceptingRiders({ status: 'OPEN', isFull: false })).toBe(true);
    expect(isAcceptingRiders({ status: 'OPEN', isFull: true })).toBe(false);
    expect(isAcceptingRiders({ status: 'STARTED', isFull: false })).toBe(false);
  });
});
