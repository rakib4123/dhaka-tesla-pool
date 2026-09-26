import { Router } from 'express';
import { authRouter, meRouter } from './auth';
import { faresRouter } from './fares';
import { healthRouter } from './health';
import { ridesRouter } from './rides';
import { zonesRouter } from './zones';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/zones', zonesRouter);
apiRouter.use('/fares', faresRouter);
apiRouter.use('/rides', ridesRouter);
