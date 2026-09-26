export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_TRANSITION'
  | 'NO_SEATS'
  | 'POOL_CLOSED'
  | 'ALREADY_MATCHED'
  | 'INCOMPATIBLE'
  | 'ACTIVE_RIDE_EXISTS'
  | 'ACTIVE_POOL_EXISTS'
  | 'DRIVER_OFFLINE'
  | 'WRONG_ZONE'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL';

/** An error we expect and can explain to the client. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message);
