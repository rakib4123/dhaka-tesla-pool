import { Router } from 'express';
import { POOL_ACTIONS } from '../domain/transitions';
import { authenticate, currentUser, requireRole } from '../middleware/authenticate';
import { parseId } from '../middleware/validate';
import { transitionPool } from '../services/poolService';

export const poolsRouter = Router();

poolsRouter.use(authenticate, requireRole('DRIVER'));

// Transitions are commands with rules, so each is its own action endpoint, not a PATCH of `status`.
for (const action of POOL_ACTIONS) {
  poolsRouter.post(`/:id/${action}`, async (req, res) => {
    res.json(await transitionPool(currentUser(req).id, parseId(req.params.id, 'Pool'), action));
  });
}
