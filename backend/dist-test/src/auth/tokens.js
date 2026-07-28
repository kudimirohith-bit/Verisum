"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
/**
 * Signs a short-lived access token (15 min default).
 */
function signAccessToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, type: 'access' }, JWT_SECRET, {
        expiresIn: '15m',
        algorithm: 'HS256',
    });
}
/**
 * Signs a long-lived refresh token (7 days).
 */
function signRefreshToken(sub) {
    return jsonwebtoken_1.default.sign({ sub, type: 'refresh' }, JWT_SECRET, {
        expiresIn: '7d',
        algorithm: 'HS256',
    });
}
/**
 * Verifies any JWT and returns its decoded payload.
 * Throws jwt.JsonWebTokenError or jwt.TokenExpiredError on failure.
 */
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
