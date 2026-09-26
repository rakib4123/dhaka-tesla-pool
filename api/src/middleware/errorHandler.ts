import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { isUniqueViolation } from '../lib/prismaErrors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

interface HttpLayerError extends Error {
  type?: string;
  status?: number;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isUniqueViolation(err)) return new AppError(409, 'CONFLICT', 'That conflicts with existing data');
  const bodyError = err as HttpLayerError | undefined;
  if (bodyError?.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
  }
  if (bodyError?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  // Any other client error raised by Express or body-parser (bad charset, bad encoding,
  // undecodable URL params) keeps its 4xx status instead of turning into a 500.
  const status = bodyError?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new AppError(status, 'BAD_REQUEST', 'The request could not be understood');
  }
  return new AppError(500, 'INTERNAL', 'Something went wrong on our side');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
    },
  });
};
