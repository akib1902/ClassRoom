'use strict';

/**
 * User repository — parameterized SQL only (README §5.1 layering).
 *
 * `node:sqlite` returns null-prototype rows, so every row is copied into a
 * plain object before it leaves this module.
 */

const COLUMNS = `id, name, email, email_verified, password_hash, google_sub,
  avatar_url, role, last_login_at, created_at, updated_at`;

const plain = (row) => (row ? { ...row } : null);

/** Columns safe to send to a client. Never includes `password_hash`. */
const toPublicUser = (row) => {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    avatarUrl: row.avatar_url ?? null,
    role: row.role,
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
  };
};

const createUsersRepository = (db) => ({
  findById: (id) => plain(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id)),

  findByEmail: (email) =>
    plain(db.prepare(`SELECT ${COLUMNS} FROM users WHERE email = ?`).get(String(email).toLowerCase())),

  findByGoogleSub: (sub) =>
    plain(db.prepare(`SELECT ${COLUMNS} FROM users WHERE google_sub = ?`).get(String(sub))),

  create: ({
    name,
    email,
    emailVerified = false,
    passwordHash = null,
    googleSub = null,
    avatarUrl = null,
    role = 'student',
    now,
  }) => {
    const emailVerifiedFlag = emailVerified ? 1 : 0;
    const info = db
      .prepare(
        `INSERT INTO users
           (name, email, email_verified, password_hash, google_sub, avatar_url, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        String(email).toLowerCase(),
        emailVerifiedFlag,
        passwordHash,
        googleSub,
        avatarUrl,
        role,
        now,
        now
      );

    return plain(
      db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(Number(info.lastInsertRowid))
    );
  },

  /** Attaches a Google identity to an existing account (matched by email). */
  linkGoogle: ({ id, googleSub, avatarUrl, name, now }) => {
    db.prepare(
      `UPDATE users
         SET google_sub = ?, avatar_url = COALESCE(?, avatar_url),
             name = COALESCE(?, name), email_verified = 1, updated_at = ?
       WHERE id = ?`
    ).run(googleSub, avatarUrl, name, now, id);

    return plain(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id));
  },

  setRole: ({ id, role, now }) => {
    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);
    return plain(db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id));
  },

  /** Applies the server-side role bootstrap to accounts that changed tier. */
  updateRoleIfDifferent: ({ id, role, now }) => {
    const info = db
      .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND role <> ?')
      .run(role, now, id, role);
    return Number(info.changes) > 0;
  },

  touchLastLogin: ({ id, now }) => {
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, id);
  },

  count: () => Number(db.prepare('SELECT COUNT(*) AS total FROM users').get().total),
});

module.exports = { createUsersRepository, toPublicUser };
