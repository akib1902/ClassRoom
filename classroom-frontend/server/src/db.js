'use strict';

/**
 * SQLite access layer (README §5.2). Uses Node's built-in `node:sqlite`, so the
 * server has no native build step — the PRD's `better-sqlite3` choice is kept
 * behind the same synchronous prepared-statement shape.
 *
 * Every statement is parameterized. `node:sqlite` only binds
 * null/number/string/bigint/Uint8Array, so booleans are stored as 0/1 and
 * converted at the repository boundary.
 */

const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  password_hash  TEXT,
  google_sub     TEXT    UNIQUE,
  avatar_url     TEXT,
  role           TEXT    NOT NULL DEFAULT 'student'
                          CHECK (role IN ('admin', 'instructor', 'student')),
  last_login_at  TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

-- At most one Google identity per account; SQLite allows many NULLs in a
-- UNIQUE column, so local password-only users coexist with Google users.
CREATE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash       TEXT    NOT NULL UNIQUE,
  family_id        TEXT    NOT NULL,
  expires_at       TEXT    NOT NULL,
  revoked_at       TEXT,
  replaced_by_hash TEXT,
  user_agent       TEXT,
  ip               TEXT,
  created_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
`;

const createDb = (databasePath) => {
  const db = new DatabaseSync(databasePath);

  // WAL keeps readers from blocking writers (README §4 "Reliability"); it is a
  // no-op for in-memory databases used by tests.
  if (databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  return db;
};

module.exports = { createDb };
