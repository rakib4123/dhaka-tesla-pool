import { Prisma } from '@prisma/client';

/** Postgres unique_violation (23505), surfaced by Prisma as P2002. Also covers our partial unique indexes. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
