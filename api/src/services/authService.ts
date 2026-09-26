import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User, UserRole } from '@prisma/client';
import { config } from '../config';
import { AppError, notFound } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { toVehicleView, type MeView, type UserView } from './views';

export interface TokenPayload {
  sub: string;
  role: UserRole;
  name: string;
}

export interface AuthResult {
  token: string;
  user: UserView;
}

const toUserView = (user: User): UserView => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
});

export function signToken(user: Pick<User, 'id' | 'role' | 'name'>): string {
  return jwt.sign({ role: user.role, name: user.name }, config.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Throws if the token is missing a subject, has an unknown role, is expired, or has a bad signature. */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || (decoded.role !== 'PASSENGER' && decoded.role !== 'DRIVER')) {
    throw new Error('Malformed token payload');
  }
  return { sub: decoded.sub, role: decoded.role, name: String(decoded.name) };
}

export async function registerPassenger(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<AuthResult> {
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: 'PASSENGER',
      },
    });
    return { token: signToken(user), user: toUserView(user) };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  const passwordOk = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !passwordOk) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  return { token: signToken(user), user: toUserView(user) };
}

export async function getMe(userId: string): Promise<MeView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { vehicle: { include: { currentZone: true } } } });
  if (!user) throw notFound('User');
  return { ...toUserView(user), vehicle: user.vehicle ? toVehicleView(user.vehicle) : null };
}
