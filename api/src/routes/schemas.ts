import { z } from 'zod';
import { MAX_SEATS_PER_REQUEST } from '../domain/constants';

export const TripSchema = z
  .object({
    // int32: ids are Postgres INTEGER columns, so anything larger can't exist (and would crash Prisma).
    pickupZoneId: z.int32().positive(),
    dropoffZoneId: z.int32().positive(),
    seats: z.number().int().min(1).max(MAX_SEATS_PER_REQUEST),
  })
  .refine((trip) => trip.pickupZoneId !== trip.dropoffZoneId, {
    message: 'Pickup and drop-off must be different zones',
    path: ['dropoffZoneId'],
  });

export type TripInput = z.output<typeof TripSchema>;
