import { describe, expect, it } from 'vitest';
import { checkJoin, type PoolSnapshot } from '../../src/domain/matching';

const BANANI = 1;
const GULSHAN_2 = 4;
const Mohakhali = { gridX: 0, gridY: -2 };
const Gulshan1 = { gridX: 1, gridY: -2 };
const Uttara = { gridX: -3, gridY: 9 };

const bulletWithNusrat: PoolSnapshot = {
  pickupZoneId: BANANI, status: 'OPEN', capacity: 3, seatsTaken: 1, memberDropoffs: [Mohakhali],
};

describe('checkJoin', () => {
  it("lets Rafiq (Banani → Gulshan 1) join Nusrat's pool", () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Gulshan1, seats: 1 }, bulletWithNusrat)).toBe('OK');
  });
  it('rejects a Banani → Uttara rider as INCOMPATIBLE', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Uttara, seats: 1 }, bulletWithNusrat)).toBe('INCOMPATIBLE');
  });
  it('rejects a rider waiting in another zone as INCOMPATIBLE', () => {
    expect(checkJoin({ pickupZoneId: GULSHAN_2, dropoff: Mohakhali, seats: 1 }, bulletWithNusrat)).toBe('INCOMPATIBLE');
  });
  it('rejects anyone once the trip has STARTED', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 1 }, { ...bulletWithNusrat, status: 'STARTED' })).toBe('POOL_CLOSED');
  });
  it('still accepts riders while Jashim waits at pickup (DRIVER_ARRIVED)', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 1 }, { ...bulletWithNusrat, status: 'DRIVER_ARRIVED' })).toBe('OK');
  });
  it('rejects a 2-seat request when one seat is left', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Mohakhali, seats: 2 }, { ...bulletWithNusrat, seatsTaken: 2 })).toBe('NO_SEATS');
  });
  it('accepts anyone who fits into an empty pool', () => {
    expect(checkJoin({ pickupZoneId: BANANI, dropoff: Uttara, seats: 3 }, { ...bulletWithNusrat, seatsTaken: 0, memberDropoffs: [] })).toBe('OK');
  });
});
