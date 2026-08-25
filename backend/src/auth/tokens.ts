import jwt from 'jsonwebtoken';
import { getSecret } from '../config/secrets.js';

function getJwtSecret(): string {
  return getSecret('JWT_SECRET', 'dev-secret-change-me');
}

export interface AccessTokenPayload {
  sub: string;        // User._id as string
  email: string;
  role: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

/**
 * Signs a short-lived access token (15 min default).
 */
export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, getJwtSecret(), {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

/**
 * Signs a long-lived refresh token (7 days).
 */
export function signRefreshToken(sub: string): string {
  return jwt.sign({ sub, type: 'refresh' }, getJwtSecret(), {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

/**
 * Verifies any JWT and returns its decoded payload.
 * Throws jwt.JsonWebTokenError or jwt.TokenExpiredError on failure.
 */
export function verifyToken(token: string): AccessTokenPayload | RefreshTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AccessTokenPayload | RefreshTokenPayload;
}
