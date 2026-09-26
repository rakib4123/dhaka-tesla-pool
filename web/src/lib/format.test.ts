import { describe, expect, it } from 'vitest';
import { formatTaka } from './format';

describe('formatTaka (integer paisa → taka text)', () => {
  it.each([
    [5250, '৳52.50'], // Nusrat, pooled
    [6750, '৳67.50'], // Rafiq, pooled
    [7000, '৳70.00'],
    [13500, '৳135.00'],
    [123456, '৳1,234.56'],
    [5, '৳0.05'],
    [0, '৳0.00'],
  ])('%i paisa → %s', (paisa, text) => {
    expect(formatTaka(paisa)).toBe(text);
  });

  it('shows a discount as negative', () => {
    expect(formatTaka(-1750)).toBe('-৳17.50');
  });
});
