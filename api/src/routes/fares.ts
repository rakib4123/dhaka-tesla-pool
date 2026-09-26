import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import { estimateTrip } from '../services/fareService';
import { TripSchema } from './schemas';

export const faresRouter = Router();

faresRouter.post('/estimate', authenticate, requireRole('PASSENGER'), async (req, res) => {
  res.json(await estimateTrip(parseBody(TripSchema, req.body)));
});
