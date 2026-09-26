import { Router } from 'express';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseBody, parseId } from '../middleware/validate';
import * as rideService from '../services/rideService';
import { TripSchema } from './schemas';

export const ridesRouter = Router();

ridesRouter.use(authenticate, requireRole('PASSENGER'));

ridesRouter.post('/', async (req, res) => {
  const input = parseBody(TripSchema, req.body);
  res.status(201).json(await rideService.createRide(currentUser(req).id, input));
});

ridesRouter.get('/', async (req, res) => {
  res.json(await rideService.listRides(currentUser(req).id));
});

ridesRouter.get('/:id', async (req, res) => {
  res.json(await rideService.getRideDetail(parseId(req.params.id, 'Ride'), currentUser(req).id));
});

ridesRouter.post('/:id/cancel', async (req, res) => {
  res.json(await rideService.cancelRide(parseId(req.params.id, 'Ride'), currentUser(req).id));
});
