import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { z } from 'zod';
import { UserModel } from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyToken, RefreshTokenPayload } from './tokens.js';
import { requireAuth, requireRole } from './middleware.js';
import { logEvent } from './audit.js';
import type { UserRole } from '../models/User.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Zod validation schemas ─────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['clinician', 'researcher', 'admin']).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const AdminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['clinician', 'researcher', 'admin']),
});

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

// ── POST /auth/register ────────────────────────────────────────────────────────
// Public: creates a researcher account only.
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  // Public registration is always researcher — role field is ignored here.
  const role: UserRole = 'researcher';

  const exists = await UserModel.findOne({ email: email.toLowerCase() });
  if (exists) {
    res.status(409).json({ error: 'Conflict', message: 'Email already registered.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await UserModel.create({ email, role, passwordHash });

  res.status(201).json({
    message: 'Registration successful.',
    user: { id: user._id, email: user.email, role: user.role },
  });
});

// ── POST /auth/admin/create-user ───────────────────────────────────────────────
// Admin-only: creates any role (clinician, researcher, admin).
router.post(
  '/admin/create-user',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
      return;
    }

    const { email, password, role } = parsed.data;

    const exists = await UserModel.findOne({ email: email.toLowerCase() });
    if (exists) {
      res.status(409).json({ error: 'Conflict', message: 'Email already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await UserModel.create({ email, role, passwordHash });

    await logEvent({
      eventType: 'auth',
      actorId: req.user?.sub,
      payload: { action: 'admin_create_user', targetEmail: email, targetRole: role },
    });

    res.status(201).json({
      message: 'User created.',
      user: { id: user._id, email: user.email, role: user.role },
    });
  },
);

// ── POST /auth/login ───────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await UserModel.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Constant-time response to prevent user enumeration
    await bcrypt.compare(password, '$2a$12$placeholder.hash.that.never.matches.anything');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
    return;
  }

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken(user._id.toString());

  await logEvent({
    eventType: 'auth',
    actorId: user._id.toString(),
    payload: { action: 'login', role: user.role },
  });

  // Store refresh token as httpOnly cookie
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/auth/refresh',
  });

  res.json({
    accessToken,
    user: { id: user._id, email: user.email, role: user.role },
  });
});

// ── POST /auth/refresh ─────────────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[REFRESH_COOKIE];

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'No refresh token provided.' });
    return;
  }

  try {
    const payload = verifyToken(token) as RefreshTokenPayload;

    if (payload.type !== 'refresh') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token type.' });
      return;
    }

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User no longer exists.' });
      return;
    }

    const newAccessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ error: 'TokenExpired', message: 'Refresh token has expired. Please log in again.' });
      return;
    }
    if (err instanceof JsonWebTokenError) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token.' });
      return;
    }
    throw err;
  }
});

// ── POST /auth/logout ──────────────────────────────────────────────────────────
router.post('/logout', (req: Request, res: Response): void => {
  if (req.user?.sub) {
    logEvent({
      eventType: 'auth',
      actorId: req.user.sub,
      payload: { action: 'logout' },
    });
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/auth/refresh' });
  res.json({ message: 'Logged out successfully.' });
});

// ── GET /me ────────────────────────────────────────────────────────────────────
// Protected: returns the authenticated user's profile.
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await UserModel.findById(req.user!.sub).select('-passwordHash');
  if (!user) {
    res.status(404).json({ error: 'NotFound', message: 'User not found.' });
    return;
  }
  res.json({ user });
});

// ── GET /admin/users ───────────────────────────────────────────────────────────
// Admin-only: list all users.
router.get(
  '/admin/users',
  requireAuth,
  requireRole('admin'),
  async (_req: Request, res: Response): Promise<void> => {
    const users = await UserModel.find().select('-passwordHash').lean();
    res.json({ users });
  },
);

export { router as authRouter };
