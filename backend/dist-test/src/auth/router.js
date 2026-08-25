"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = require("jsonwebtoken");
const zod_1 = require("zod");
const User_js_1 = require("../models/User.js");
const tokens_js_1 = require("./tokens.js");
const middleware_js_1 = require("./middleware.js");
const audit_js_1 = require("./audit.js");
const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refreshToken';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// ── Zod validation schemas ─────────────────────────────────────────────────────
const RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    role: zod_1.z.enum(['clinician', 'researcher', 'admin']).optional(),
});
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const AdminCreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(['clinician', 'researcher', 'admin']),
});
// ── Router ────────────────────────────────────────────────────────────────────
const router = (0, express_1.Router)();
exports.authRouter = router;
// ── POST /auth/register ────────────────────────────────────────────────────────
// Public: creates a researcher account only.
router.post('/register', async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
        return;
    }
    const { email, password } = parsed.data;
    // Public registration is always researcher — role field is ignored here.
    const role = 'researcher';
    const exists = await User_js_1.UserModel.findOne({ email: email.toLowerCase() });
    if (exists) {
        res.status(409).json({ error: 'Conflict', message: 'Email already registered.' });
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(password, BCRYPT_ROUNDS);
    const user = await User_js_1.UserModel.create({ email, role, passwordHash });
    res.status(201).json({
        message: 'Registration successful.',
        user: { id: user._id, email: user.email, role: user.role },
    });
});
// ── POST /auth/admin/create-user ───────────────────────────────────────────────
// Admin-only: creates any role (clinician, researcher, admin).
router.post('/admin/create-user', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (req, res) => {
    const parsed = AdminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
        return;
    }
    const { email, password, role } = parsed.data;
    const exists = await User_js_1.UserModel.findOne({ email: email.toLowerCase() });
    if (exists) {
        res.status(409).json({ error: 'Conflict', message: 'Email already registered.' });
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(password, BCRYPT_ROUNDS);
    const user = await User_js_1.UserModel.create({ email, role, passwordHash });
    await (0, audit_js_1.logEvent)({
        eventType: 'auth',
        actorId: req.user?.sub,
        payload: { action: 'admin_create_user', targetEmail: email, targetRole: role },
    });
    res.status(201).json({
        message: 'User created.',
        user: { id: user._id, email: user.email, role: user.role },
    });
});
// ── POST /auth/login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'ValidationError', details: parsed.error.flatten() });
        return;
    }
    const { email, password } = parsed.data;
    const user = await User_js_1.UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
        // Constant-time response to prevent user enumeration
        await bcryptjs_1.default.compare(password, '$2a$12$placeholder.hash.that.never.matches.anything');
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
        return;
    }
    const passwordMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!passwordMatch) {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password.' });
        return;
    }
    const accessToken = (0, tokens_js_1.signAccessToken)({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
    });
    const refreshToken = (0, tokens_js_1.signRefreshToken)(user._id.toString());
    await (0, audit_js_1.logEvent)({
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
router.post('/refresh', async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
        res.status(401).json({ error: 'Unauthorized', message: 'No refresh token provided.' });
        return;
    }
    try {
        const payload = (0, tokens_js_1.verifyToken)(token);
        if (payload.type !== 'refresh') {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid token type.' });
            return;
        }
        const user = await User_js_1.UserModel.findById(payload.sub);
        if (!user) {
            res.status(401).json({ error: 'Unauthorized', message: 'User no longer exists.' });
            return;
        }
        const newAccessToken = (0, tokens_js_1.signAccessToken)({
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
        });
        res.json({ accessToken: newAccessToken });
    }
    catch (err) {
        if (err instanceof jsonwebtoken_1.TokenExpiredError) {
            res.status(401).json({ error: 'TokenExpired', message: 'Refresh token has expired. Please log in again.' });
            return;
        }
        if (err instanceof jsonwebtoken_1.JsonWebTokenError) {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token.' });
            return;
        }
        throw err;
    }
});
// ── POST /auth/logout ──────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    if (req.user?.sub) {
        (0, audit_js_1.logEvent)({
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
router.get('/me', middleware_js_1.requireAuth, async (req, res) => {
    const user = await User_js_1.UserModel.findById(req.user.sub).select('-passwordHash');
    if (!user) {
        res.status(404).json({ error: 'NotFound', message: 'User not found.' });
        return;
    }
    res.json({ user });
});
// ── GET /admin/users ───────────────────────────────────────────────────────────
// Admin-only: list all users.
router.get('/admin/users', middleware_js_1.requireAuth, (0, middleware_js_1.requireRole)('admin'), async (_req, res) => {
    const users = await User_js_1.UserModel.find().select('-passwordHash').lean();
    res.json({ users });
});
