import { z } from 'zod';
import { AppError, notFound } from '../lib/AppError';

/** Validates a request body against a Zod schema or throws 400 with per-field details. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Some fields are missing or invalid',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

const UuidSchema = z.uuid();

/** A malformed id can't match any row, so it is a 404 (and never reaches Prisma). */
export function parseId(value: unknown, what: string): string {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw notFound(what);
  return result.data;
}
