import { z } from 'zod';
import { MAX_SEATS_PER_REQUEST } from '../domain/constants';

export const TripSchema = z
  .object({
    pickupZoneId: z.number().int().positive(),
    dropoffZoneId: z.number().int().positive(),
    seats: z.number().int().min(1).max(MAX_SEATS_PER_REQUEST),
  })
  .refine((trip) => trip.pickupZoneId !== trip.dropoffZoneId, {
    message: 'Pickup and drop-off must be different zones',
    path: ['dropoffZoneId'],
  });

export type TripInput = z.output<typeof TripSchema>;
