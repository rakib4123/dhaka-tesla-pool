import type { Zone } from '@prisma/client';
import { estimateFares } from '../domain/fare';
import { distanceKm } from '../domain/geo';
import { AppError } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import type { TripInput } from '../routes/schemas';

export async function resolveTrip(input: TripInput): Promise<{ pickup: Zone; dropoff: Zone; distanceKm: number }> {
  const [pickup, dropoff] = await Promise.all([
    prisma.zone.findUnique({ where: { id: input.pickupZoneId } }),
    prisma.zone.findUnique({ where: { id: input.dropoffZoneId } }),
  ]);
  if (!pickup || !dropoff) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Unknown pickup or drop-off zone', [
      ...(pickup ? [] : [{ path: 'pickupZoneId', message: 'Unknown zone' }]),
      ...(dropoff ? [] : [{ path: 'dropoffZoneId', message: 'Unknown zone' }]),
    ]);
  }
  return { pickup, dropoff, distanceKm: distanceKm(pickup, dropoff) };
}

export async function estimateTrip(input: TripInput): Promise<{ distanceKm: number; soloPaisa: number; pooledPaisa: number }> {
  const trip = await resolveTrip(input);
  return { distanceKm: trip.distanceKm, ...estimateFares(trip.distanceKm, input.seats) };
}
