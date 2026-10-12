'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');

const { createTestContext, createJar } = require('./helpers');

const APP_ORIGIN = 'http://localhost:5173';

/** Registers a password account and returns a jar holding its refresh cookie. */
const signInWithPassword = async (ctx, { jar = createJar() } = {}) => {
  const response = await request(ctx.app)
    .post('/api/auth/register')
    .send({ name: 'Ada Student', email: 'ada@university.edu', password: 'correct-horse-1' });
  jar.store(response);
  return { jar, response };
};

const refresh = (ctx, jar, { origin = APP_ORIGIN, body = {} } = {}) => {
  const pending = request(ctx.app).post('/api/auth/refresh').set('Cookie', jar.header());
  if (origin) pending.set('Origin', origin);
  return pending.send(body);
};

describe('session lifecycle', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => ctx.close());

  it('rotates the refresh token on every use', async () => {
    const { jar } = await signInWithPassword(ctx);
    const first = jar.get('classroom_rt');

    const rotated = await refresh(ctx, jar);
    expect(rotated.status).toBe(200);
    jar.store(rotated);

    const second = jar.get('classroom_rt');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    const rows = ctx.db.prepare('SELECT * FROM refresh_tokens ORDER BY id').all();
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1].revoked_at).toBeNull();
    expect(rows[1].family_id).toBe(rows[0].family_id);
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const { jar } = await signInWithPassword(ctx);
    const stolen = jar.get('classroom_rt');

    const rotated = await refresh(ctx, jar);
    jar.store(rotated);
    const current = jar.get('classroom_rt');

    // The attacker presents the old (already rotated) token.
    const replay = await refresh(ctx, { header: () => `classroom_rt=${stolen}` });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('refresh_reuse');
    expect(replay.body.message).toMatch(/revoked/i);

    // ...and the legitimate token is dead too: the session is gone.
    const afterwards = await refresh(ctx, { header: () => `classroom_rt=${current}` });
    expect(afterwards.status).toBe(401);

    const active = ctx.db
      .prepare('SELECT COUNT(*) AS total FROM refresh_tokens WHERE revoked_at IS NULL')
      .get().total;
    expect(active).toBe(0);
  });

  it('rejects refresh when no cookie is presented', async () => {
    const response = await refresh(ctx, { header: () => '' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('refresh_missing');
  });

  it('rejects refresh from a foreign origin even with a valid cookie', async () => {
    const { jar } = await signInWithPassword(ctx);

    const response = await refresh(ctx, jar, { origin: 'https://evil.example.com' });
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/origin/i);

    // The session itself is untouched.
    const after = await refresh(ctx, jar);
    expect(after.status).toBe(200);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const { jar } = await signInWithPassword(ctx);

    const logout = await request(ctx.app)
      .post('/api/auth/logout')
      .set('Cookie', jar.header())
      .set('Origin', APP_ORIGIN)
      .send({});
    expect(logout.status).toBe(204);

    const cleared = (logout.headers['set-cookie'] ?? []).find((entry) =>
      entry.startsWith('classroom_rt=')
    );
    expect(cleared).toBeTruthy();

    jar.store(logout);
    const after = await refresh(ctx, jar);
    expect(after.status).toBe(401);
  });

  it('logout is idempotent and safe without a cookie', async () => {
    const response = await request(ctx.app)
      .post('/api/auth/logout')
      .set('Origin', APP_ORIGIN)
      .send({});
    expect(response.status).toBe(204);
  });
});

describe('access tokens', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => ctx.close());

  const withSession = async () => {
    const { jar } = await signInWithPassword(ctx);
    const rotated = await refresh(ctx, jar);
    return rotated.body.accessToken;
  };

  it('rejects /me without a token', async () => {
    const response = await request(ctx.app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects /me with a garbage token', async () => {
    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('token_invalid');
  });

  it('rejects /me with an expired token', async () => {
    const expired = jwt.sign({ role: 'student', email: 'ada@university.edu', name: 'Ada' }, ctx.config.jwtSecret, {
      subject: '1',
      expiresIn: '-10s',
      issuer: ctx.config.jwtIssuer,
      audience: ctx.config.jwtAudience,
      algorithm: 'HS256',
    });

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('token_expired');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ role: 'admin', email: 'attacker@example.com', name: 'Mallory' }, 'a-different-secret-that-is-long-enough', {
      subject: '1',
      expiresIn: '15m',
      issuer: ctx.config.jwtIssuer,
      audience: ctx.config.jwtAudience,
      algorithm: 'HS256',
    });

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);
    expect(response.status).toBe(401);
  });

  it('rejects a token carrying an admin claim for a student account', async () => {
    const token = await withSession();

    // Same subject/issuer/audience, but escalated role and re-signed with the
    // real secret — the DB row must still win.
    const escalated = jwt.sign(
      { role: 'admin', email: 'ada@university.edu', name: 'Ada Student' },
      ctx.config.jwtSecret,
      {
        subject: '1',
        expiresIn: '15m',
        issuer: ctx.config.jwtIssuer,
        audience: ctx.config.jwtAudience,
        algorithm: 'HS256',
      }
    );

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${escalated}`);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('student');
    expect(response.body.role).not.toBe('admin');
    expect(token).toBeTruthy();
  });

  it('reflects a role change immediately, without waiting for token expiry', async () => {
    const accessToken = await withSession();
    ctx.db.prepare("UPDATE users SET role = 'instructor' WHERE email = 'ada@university.edu'").run();

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(200);
    expect(response.body.role).toBe('instructor');
  });

  it('rejects the token of a deleted account', async () => {
    const accessToken = await withSession();
    ctx.db.prepare("DELETE FROM users WHERE email = 'ada@university.edu'").run();

    const response = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(401);
  });

  it('answers unknown routes with the standard error shape', async () => {
    const response = await request(ctx.app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      message: expect.stringContaining('/api/nope'),
    });
  });

  it('reports health and provider availability', async () => {
    const health = await request(ctx.app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', google: 'configured' });

    const providers = await request(ctx.app).get('/api/auth/providers');
    expect(providers.body.google.enabled).toBe(true);
    expect(providers.body.password).toBe(true);
  });
});
