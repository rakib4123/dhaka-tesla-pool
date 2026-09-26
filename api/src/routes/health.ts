import { Router } from 'express';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    logger.warn({ err }, 'Health check: database unreachable');
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});
