import { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { verifyToken, AccessTokenPayload } from './tokens.js';
import type { UserRole } from '../models/User.js';

// ── Augment Express Request ────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * requireAuth — validates the JWT from `Authorization: Bearer <token>`.
 * Attaches the decoded payload to `req.user` on success.
 * Responds with 401 on missing / invalid / expired tokens.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = verifyToken(token);

    if (payload.type !== 'access') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token type.' });
      return;
    }

    req.user = payload as AccessTokenPayload;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ error: 'TokenExpired', message: 'Access token has expired.' });
      return;
    }
    if (err instanceof JsonWebTokenError) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid access token.' });
      return;
    }
    next(err);
  }
}

/**
 * requireRole — middleware factory that restricts access to specific roles.
 * Must be used *after* requireAuth so that req.user is populated.
 *
 * @example
 *   router.get('/admin-only', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated.' });
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `This endpoint requires one of the following roles: ${roles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}
