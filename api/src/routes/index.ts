import { Router } from 'express';
import { authRouter, meRouter } from './auth';
import { healthRouter } from './health';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
