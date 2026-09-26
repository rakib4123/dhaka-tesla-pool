import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseBody, parseId } from '../middleware/validate';
import * as driverService from '../services/driverService';

const AvailabilitySchema = z
  .object({ online: z.boolean(), zoneId: z.number().int().positive().optional() })
  .refine((body) => !body.online || body.zoneId !== undefined, { message: 'Choose a zone to go online', path: ['zoneId'] });

export const driverRouter = Router();

driverRouter.use(authenticate, requireRole('DRIVER'));

driverRouter.put('/availability', async (req, res) => {
  res.json(await driverService.setAvailability(currentUser(req).id, parseBody(AvailabilitySchema, req.body)));
});

driverRouter.post('/requests/:id/accept', async (req, res) => {
  res.json(await driverService.acceptRequest(currentUser(req).id, parseId(req.params.id, 'Ride request')));
});

driverRouter.get('/pool', async (req, res) => {
  res.json({ pool: await driverService.getDriverPool(currentUser(req).id) });
});
