import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

export const zonesRouter = Router();

zonesRouter.get('/', authenticate, async (_req, res) => {
  const zones = await prisma.zone.findMany({ orderBy: { name: 'asc' } });
  res.json(zones.map(({ id, name, gridX, gridY }) => ({ id, name, gridX, gridY })));
});
