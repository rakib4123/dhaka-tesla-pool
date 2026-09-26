import { describe, expect, it } from 'vitest';
import { calculateFare, estimateFares } from '../../src/domain/fare';

describe('calculateFare: the README worked example', () => {
  it("Nusrat, Banani → Mohakhali (2 km), pooled: ৳52.50", () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: true })).toEqual({
      basePaisa: 3000, distancePaisa: 4000, discountPaisa: 1750, totalPaisa: 5250,
    });
  });
  it("Rafiq, Banani → Gulshan 1 (3 km), pooled: ৳67.50", () => {
    expect(calculateFare({ distanceKm: 3, seats: 1, pooled: true })).toEqual({
      basePaisa: 3000, distancePaisa: 6000, discountPaisa: 2250, totalPaisa: 6750,
    });
  });
  it('solo rides get no discount: Nusrat ৳70.00, Rafiq ৳90.00', () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: false }).totalPaisa).toBe(7000);
    expect(calculateFare({ distanceKm: 3, seats: 1, pooled: false })).toMatchObject({ discountPaisa: 0, totalPaisa: 9000 });
  });
  it('multiplies by seats: Rafiq with 2 seats, pooled, pays ৳135.00', () => {
    expect(calculateFare({ distanceKm: 3, seats: 2, pooled: true })).toEqual({
      basePaisa: 6000, distancePaisa: 12000, discountPaisa: 4500, totalPaisa: 13500,
    });
  });
  it.each([
    [{ distanceKm: -1, seats: 1, pooled: false }],
    [{ distanceKm: 1.5, seats: 1, pooled: false }],
    [{ distanceKm: 2, seats: 0, pooled: false }],
  ])('rejects impossible input %o', (input) => {
    expect(() => calculateFare(input)).toThrow(RangeError);
  });
});

describe('estimateFares', () => {
  it('shows Nusrat both prices before she books', () => {
    expect(estimateFares(2, 1)).toEqual({ soloPaisa: 7000, pooledPaisa: 5250 });
  });
});
