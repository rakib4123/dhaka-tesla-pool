import type { Request, RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import { AppError } from '../lib/AppError';
import { verifyToken } from '../services/authService';

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired or is invalid. Please sign in again');
  }
  next();
};

export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      throw new AppError(403, 'FORBIDDEN_ROLE', `Only a ${role.toLowerCase()} can do this`);
    }
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return req.user;
}
