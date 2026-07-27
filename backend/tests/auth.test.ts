import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { UserModel } from '../src/models/User';
import { signAccessToken, signRefreshToken } from '../src/auth/tokens';

let mongod: MongoMemoryServer;

// ── Test DB lifecycle ──────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function createUser(email: string, password: string, role: 'researcher' | 'clinician' | 'admin' = 'researcher') {
  const hash = await bcrypt.hash(password, 1); // low cost for speed in tests
  return UserModel.create({ email, role, passwordHash: hash });
}

// ── POST /auth/register ────────────────────────────────────────────────────────
describe('POST /auth/register', () => {
  it('registers a new researcher user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@test.io', password: 'SecurePass1!' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('researcher');
    expect(res.body.user.email).toBe('new@test.io');
  });

  it('rejects duplicate email with 409', async () => {
    await createUser('dup@test.io', 'pass1234!');

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@test.io', password: 'SecurePass1!' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });

  it('rejects weak passwords with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'weak@test.io', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});

// ── POST /auth/login ───────────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  it('logs in with correct credentials and returns accessToken', async () => {
    await createUser('login@test.io', 'GoodPassword1!');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@test.io', password: 'GoodPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toBe('login@test.io');
  });

  it('returns 401 on wrong password', async () => {
    await createUser('wrongpass@test.io', 'CorrectPassword1!');

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpass@test.io', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 for non-existent user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@test.io', password: 'AnyPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});

// ── GET /auth/me ───────────────────────────────────────────────────────────────
describe('GET /auth/me', () => {
  it('returns user profile with a valid token', async () => {
    const user = await createUser('me@test.io', 'pass1234!', 'clinician');
    const token = signAccessToken({ sub: user._id.toString(), email: user.email, role: user.role });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.io');
    expect(res.body.user.passwordHash).toBeUndefined(); // must not expose hash
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 with an expired token', async () => {
    const user = await createUser('expired@test.io', 'pass1234!');
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { sub: user._id.toString(), email: user.email, role: user.role, type: 'access' },
      process.env.JWT_SECRET || 'dev-secret-change-me',
      { expiresIn: -1 },
    );

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TokenExpired');
  });

  it('returns 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer this.is.garbage');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});

// ── Role-based access control ──────────────────────────────────────────────────
describe('RBAC — requireRole middleware', () => {
  it('allows an admin to reach /auth/admin/users', async () => {
    const admin = await createUser('admin@test.io', 'pass1234!', 'admin');
    const token = signAccessToken({ sub: admin._id.toString(), email: admin.email, role: admin.role });

    const res = await request(app)
      .get('/auth/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('returns 403 when a researcher calls an admin-only endpoint', async () => {
    const researcher = await createUser('researcher@test.io', 'pass1234!', 'researcher');
    const token = signAccessToken({ sub: researcher._id.toString(), email: researcher.email, role: researcher.role });

    const res = await request(app)
      .get('/auth/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('returns 403 when a clinician calls an admin-only endpoint', async () => {
    const clinician = await createUser('clinician@test.io', 'pass1234!', 'clinician');
    const token = signAccessToken({ sub: clinician._id.toString(), email: clinician.email, role: clinician.role });

    const res = await request(app)
      .get('/auth/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });
});

// ── POST /auth/refresh ─────────────────────────────────────────────────────────
describe('POST /auth/refresh', () => {
  it('returns 401 when no refresh token cookie is sent', async () => {
    const res = await request(app).post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('issues a new access token with a valid refresh token cookie', async () => {
    const user = await createUser('refresh@test.io', 'pass1234!', 'clinician');
    const refreshToken = signRefreshToken(user._id.toString());

    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('returns 401 with an expired refresh token', async () => {
    const user = await createUser('expref@test.io', 'pass1234!');
    const expiredRefresh = jwt.sign(
      { sub: user._id.toString(), type: 'refresh' },
      process.env.JWT_SECRET || 'dev-secret-change-me',
      { expiresIn: -1 },
    );

    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `refreshToken=${expiredRefresh}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TokenExpired');
  });
});
