import { PrismaClient, type Prisma } from '@prisma/client';

// Generous transaction limits: concurrent seat claims wait on each other's row locks by design.
export const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 15_000 } });

/** Either the root client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient;
