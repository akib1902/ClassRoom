'use strict';

/**
 * Refresh-token repository.
 *
 * Only the SHA-256 hash of a refresh token is stored, so a database leak cannot
 * be replayed against the API. Tokens are grouped into a `family_id`: rotating a
 * token revokes its predecessor and records the successor, which lets a replayed
 * (already-rotated) token be detected and the whole family killed.
 */

const plain = (row) => (row ? { ...row } : null);

const createRefreshTokensRepository = (db) => ({
  insert: ({ userId, tokenHash, familyId, expiresAt, userAgent, ip, now }) => {
    db.prepare(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, family_id, expires_at, user_agent, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, tokenHash, familyId, expiresAt, userAgent ?? null, ip ?? null, now);
  },

  findByHash: (tokenHash) =>
    plain(db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash)),

  /** Marks a token as rotated/revoked and points at its successor. */
  revoke: ({ tokenHash, replacedByHash = null, now }) => {
    db.prepare(
      `UPDATE refresh_tokens
          SET revoked_at = ?, replaced_by_hash = ?
        WHERE token_hash = ? AND revoked_at IS NULL`
    ).run(now, replacedByHash, tokenHash);
  },

  /** Theft response: revoke every descendant of the compromised token. */
  revokeFamily: ({ familyId, now }) => {
    const info = db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL')
      .run(now, familyId);
    return Number(info.changes);
  },

  revokeAllForUser: ({ userId, now }) => {
    const info = db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(now, userId);
    return Number(info.changes);
  },

  countActiveForUser: (userId) =>
    Number(
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM refresh_tokens
            WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?`
        )
        .get(userId, new Date().toISOString()).total
    ),

  deleteExpired: (before) => {
    db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(before);
  },
});

module.exports = { createRefreshTokensRepository };
