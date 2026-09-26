import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import * as driverService from '../services/driverService';

const AvailabilitySchema = z
  .object({ online: z.boolean(), zoneId: z.number().int().positive().optional() })
  .refine((body) => !body.online || body.zoneId !== undefined, { message: 'Choose a zone to go online', path: ['zoneId'] });

export const driverRouter = Router();

driverRouter.use(authenticate, requireRole('DRIVER'));

driverRouter.put('/availability', async (req, res) => {
  res.json(await driverService.setAvailability(currentUser(req).id, parseBody(AvailabilitySchema, req.body)));
});
