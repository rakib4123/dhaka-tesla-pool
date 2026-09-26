import { describe, expect, it } from 'vitest';
import {
  canPassengerCancel,
  isJoinable,
  memberRideStatusAfter,
  nextPoolStatus,
  POOL_ACTIONS,
  POOL_STATUSES,
  type PoolAction,
  type PoolStatus,
} from '../../src/domain/transitions';

const ALLOWED: Record<PoolAction, Partial<Record<PoolStatus, PoolStatus>>> = {
  arrive: { OPEN: 'DRIVER_ARRIVED' },
  start: { DRIVER_ARRIVED: 'STARTED' },
  complete: { STARTED: 'COMPLETED' },
  cancel: { OPEN: 'CANCELLED', DRIVER_ARRIVED: 'CANCELLED' },
};

const cases = POOL_ACTIONS.flatMap((action) =>
  POOL_STATUSES.map((status) => [action, status, ALLOWED[action][status] ?? null] as const),
);

describe('pool state machine', () => {
  it.each(cases)('%s from %s → %s', (action, status, expected) => {
    expect(nextPoolStatus(status, action)).toBe(expected);
  });

  it('moves member rides along with the pool; a driver cancel re-queues them', () => {
    expect(memberRideStatusAfter('arrive')).toBe('DRIVER_ARRIVED');
    expect(memberRideStatusAfter('start')).toBe('STARTED');
    expect(memberRideStatusAfter('complete')).toBe('COMPLETED');
    expect(memberRideStatusAfter('cancel')).toBe('REQUESTED');
  });

  it('accepts new riders only until the trip starts', () => {
    expect(POOL_STATUSES.filter(isJoinable)).toEqual(['OPEN', 'DRIVER_ARRIVED']);
  });
});

describe('passenger cancellation', () => {
  it.each([
    ['REQUESTED', true],
    ['MATCHED', true],
    ['DRIVER_ARRIVED', true],
    ['STARTED', false],
    ['COMPLETED', false],
    ['CANCELLED', false],
  ] as const)('%s → cancellable: %s', (status, expected) => {
    expect(canPassengerCancel(status)).toBe(expected);
  });
});
