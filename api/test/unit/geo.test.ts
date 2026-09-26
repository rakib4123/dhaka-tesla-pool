import { describe, expect, it } from 'vitest';
import { distanceKm, fitsDestinationCluster } from '../../src/domain/geo';

const Banani = { gridX: 0, gridY: 0 };
const Mohakhali = { gridX: 0, gridY: -2 };
const Gulshan1 = { gridX: 1, gridY: -2 };
const Gulshan2 = { gridX: 1, gridY: 0 };
const Uttara = { gridX: -3, gridY: 9 };

describe('distanceKm (Manhattan distance on the 1 km zone grid)', () => {
  it.each([
    ['Banani → Mohakhali (Nusrat)', Banani, Mohakhali, 2],
    ['Banani → Gulshan 1 (Rafiq)', Banani, Gulshan1, 3],
    ['Mohakhali ↔ Gulshan 1', Mohakhali, Gulshan1, 1],
    ['Mohakhali → Uttara', Mohakhali, Uttara, 14],
    ['Banani → Banani', Banani, Banani, 0],
  ])('%s = %i km', (_label, from, to, km) => {
    expect(distanceKm(from, to)).toBe(km);
    expect(distanceKm(to, from)).toBe(km);
  });
});

describe('fitsDestinationCluster (drop-offs within 2 km of every existing drop-off)', () => {
  it("lets Rafiq (Gulshan 1) share with Nusrat (Mohakhali): 1 km apart", () => {
    expect(fitsDestinationCluster(Gulshan1, [Mohakhali])).toBe(true);
  });
  it('rejects an Uttara drop-off next to Mohakhali: 14 km apart', () => {
    expect(fitsDestinationCluster(Uttara, [Mohakhali])).toBe(false);
  });
  it('checks against every member, not just the first', () => {
    expect(fitsDestinationCluster(Gulshan2, [Gulshan1, Mohakhali])).toBe(false); // 2 km and 3 km
  });
  it('accepts anyone into an empty pool', () => {
    expect(fitsDestinationCluster(Uttara, [])).toBe(true);
  });
});
