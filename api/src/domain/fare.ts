import { BASE_FARE_PAISA, PER_KM_PAISA, POOL_DISCOUNT_PCT } from './constants';

export interface FareBreakdown {
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
}

/**
 * passengerFare = (base + perKm × km) × seats − poolDiscount
 * Every value is integer paisa. The only rounding step is the percentage discount.
 */
export function calculateFare({ distanceKm, seats, pooled }: { distanceKm: number; seats: number; pooled: boolean }): FareBreakdown {
  if (!Number.isInteger(distanceKm) || distanceKm < 0) throw new RangeError('distanceKm must be a non-negative integer');
  if (!Number.isInteger(seats) || seats < 1) throw new RangeError('seats must be a positive integer');

  const basePaisa = BASE_FARE_PAISA * seats;
  const distancePaisa = PER_KM_PAISA * distanceKm * seats;
  const subtotal = basePaisa + distancePaisa;
  const discountPaisa = pooled ? Math.round((subtotal * POOL_DISCOUNT_PCT) / 100) : 0;
  return { basePaisa, distancePaisa, discountPaisa, totalPaisa: subtotal - discountPaisa };
}

/** What a passenger sees before booking: the solo price and the price if the ride ends up pooled. */
export function estimateFares(distanceKm: number, seats: number): { soloPaisa: number; pooledPaisa: number } {
  return {
    soloPaisa: calculateFare({ distanceKm, seats, pooled: false }).totalPaisa,
    pooledPaisa: calculateFare({ distanceKm, seats, pooled: true }).totalPaisa,
  };
}
