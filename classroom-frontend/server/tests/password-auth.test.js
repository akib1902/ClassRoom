'use strict';

const bcrypt = require('bcryptjs');
const request = require('supertest');

const { createTestContext, createJar } = require('./helpers');

const register = (ctx, body, jar = createJar()) => {
  const pending = request(ctx.app).post('/api/auth/register').send(body);
  return pending.then((response) => (jar.store(response), response));
};

describe('password authentication', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });
  afterEach(() => ctx.close());

  const validBody = {
    name: 'Ada Student',
    email: 'Ada@University.edu',
    password: 'correct-horse-1',
  };

  it('registers an account, hashes the password and starts a session', async () => {
    const response = await register(ctx, validBody);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('ada@university.edu'); // normalized
    expect(response.body.user.role).toBe('student');
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.user.password_hash).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('correct-horse-1');

    const row = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get('ada@university.edu');
    expect(row.password_hash).not.toBe('correct-horse-1');
    expect(bcrypt.getRounds(row.password_hash)).toBe(12);
  });

  it('ignores a client-supplied role', async () => {
    const response = await register(ctx, { ...validBody, role: 'admin' });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe('student');
    expect(ctx.db.prepare('SELECT role FROM users WHERE email = ?').get('ada@university.edu').role).toBe(
      'student'
    );
  });

  it('enforces the password policy with field errors', async () => {
    const response = await register(ctx, { ...validBody, password: 'short1' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('validation_error');
    expect(response.body.errors.password).toMatch(/12 characters/);
  });

  it('requires a numeric and an alphabetic character in the password', async () => {
    const lettersOnly = await register(ctx, { ...validBody, password: 'onlylettershere' });
    expect(lettersOnly.status).toBe(400);
    expect(lettersOnly.body.errors.password).toMatch(/number/);

    const digitsOnly = await register(ctx, { ...validBody, password: '123456789012' });
    expect(digitsOnly.status).toBe(400);
    expect(digitsOnly.body.errors.password).toMatch(/letter/);
  });

  it('rejects a malformed email', async () => {
    const response = await register(ctx, { ...validBody, email: 'not-an-email' });
    expect(response.status).toBe(400);
    expect(response.body.errors.email).toBeDefined();
  });

  it('does not reveal that an email is already registered', async () => {
    await register(ctx, validBody);
    const duplicate = await register(ctx, validBody);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).not.toMatch(/already|exists/i);
  });

  it('logs in with the correct password', async () => {
    await register(ctx, validBody);
    const jar = createJar();

    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ada@university.edu', password: 'correct-horse-1' });
    jar.store(response);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.user.role).toBe('student');
  });

  it('rejects a wrong password and an unknown email with the same response', async () => {
    await register(ctx, validBody);

    const wrongPassword = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ada@university.edu', password: 'wrong-horse-1' });
    const unknownEmail = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@university.edu', password: 'wrong-horse-1' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.message).toMatch(/Incorrect email or password/);
  });

  it('cannot log in with a password on a Google-only account', async () => {
    ctx.db
      .prepare(
        `INSERT INTO users (name, email, email_verified, google_sub, role, created_at, updated_at)
         VALUES (?, ?, 1, ?, 'student', ?, ?)`
      )
      .run('Ada', 'ada@university.edu', 'sub-1', 'now', 'now');

    const response = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ada@university.edu', password: 'correct-horse-1' });

    expect(response.status).toBe(401);
  });
});
