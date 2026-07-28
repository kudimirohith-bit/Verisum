"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = require("jsonwebtoken");
const tokens_js_1 = require("./tokens.js");
/**
 * requireAuth — validates the JWT from `Authorization: Bearer <token>`.
 * Attaches the decoded payload to `req.user` on success.
 * Responds with 401 on missing / invalid / expired tokens.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed Authorization header.' });
        return;
    }
    const token = authHeader.slice(7); // strip "Bearer "
    try {
        const payload = (0, tokens_js_1.verifyToken)(token);
        if (payload.type !== 'access') {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid token type.' });
            return;
        }
        req.user = payload;
        next();
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.TokenExpiredError) {
            res.status(401).json({ error: 'TokenExpired', message: 'Access token has expired.' });
            return;
        }
        if (err instanceof jsonwebtoken_1.JsonWebTokenError) {
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
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated.' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({
                error: 'Forbidden',
                message: `This endpoint requires one of the following roles: ${roles.join(', ')}.`,
            });
            return;
        }
        next();
    };
}
