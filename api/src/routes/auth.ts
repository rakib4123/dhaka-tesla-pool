import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { authenticate, currentUser } from '../middleware/authenticate';
import { parseBody } from '../middleware/validate';
import * as authService from '../services/authService';

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email().max(120),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10–15 digits').optional(),
  password: z.string().min(8).max(72), // bcrypt ignores bytes after 72
});

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes' } });
  },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parseBody(RegisterSchema, req.body);
  res.status(201).json(await authService.registerPassenger(input));
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = parseBody(LoginSchema, req.body);
  res.json(await authService.login(input));
});

export const meRouter = Router();

meRouter.get('/', authenticate, async (req, res) => {
  res.json(await authService.getMe(currentUser(req).id));
});
