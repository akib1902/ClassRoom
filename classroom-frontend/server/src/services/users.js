'use strict';

/**
 * Account provisioning.
 *
 * Roles are assigned **server-side only**. The SPA's role picker is a demo
 * affordance and is ignored here on purpose: trusting a client-supplied role
 * would let any visitor claim `admin`. `ADMIN_EMAILS` is the explicit bootstrap
 * for the first administrators; everybody else starts as `student` and is
 * promoted by changing the row (ops) rather than by asking the API.
 */

const bcrypt = require('bcryptjs');
const { ApiError } = require('../errors');
const { toPublicUser } = require('../repositories/users');

const BCRYPT_COST = 12;

const createUsersService = ({ users, config }) => {
  const iso = () => new Date().toISOString();

  const roleForEmail = (email) =>
    config.adminEmails.includes(String(email).toLowerCase()) ? 'admin' : 'student';

  /** Promotes (never demotes) accounts listed in ADMIN_EMAILS. */
  const syncBootstrapRole = (user) => {
    const desired = roleForEmail(user.email);
    if (desired === 'admin' && user.role !== 'admin') {
      users.updateRoleIfDifferent({ id: user.id, role: 'admin', now: iso() });
      return { ...user, role: 'admin' };
    }
    return user;
  };

  return {
    /**
     * Login or sign-up for a verified Google identity. Links to an existing
     * account when the verified email already exists, so a user who registered
     * with a password keeps one identity.
     */
    upsertFromGoogle: ({ profile }) => {
      const now = iso();

      let user = users.findByGoogleSub(profile.sub);

      if (!user) {
        const byEmail = users.findByEmail(profile.email);
        user = byEmail
          ? users.linkGoogle({
              id: byEmail.id,
              googleSub: profile.sub,
              avatarUrl: profile.picture,
              name: profile.name,
              now,
            })
          : users.create({
              name: profile.name,
              email: profile.email,
              emailVerified: true,
              googleSub: profile.sub,
              avatarUrl: profile.picture,
              role: roleForEmail(profile.email),
              now,
            });
      }

      user = syncBootstrapRole(user);
      users.touchLastLogin({ id: user.id, now });
      return { ...user, last_login_at: now };
    },

    createWithPassword: ({ name, email, password }) => {
      const normalized = String(email).toLowerCase();
      if (users.findByEmail(normalized)) {
        // Same shape as a successful response — registration must not become a
        // user-enumeration oracle.
        throw ApiError.conflict('Could not create an account with those details.', {
          code: 'registration_failed',
        });
      }

      const now = iso();
      const user = users.create({
        name,
        email: normalized,
        emailVerified: false,
        passwordHash: bcrypt.hashSync(password, BCRYPT_COST),
        role: roleForEmail(normalized),
        now,
      });
      users.touchLastLogin({ id: user.id, now });
      return { ...user, last_login_at: now };
    },

    verifyPassword: ({ user, password }) => {
      if (!user?.password_hash) return false;
      return bcrypt.compareSync(password, user.password_hash);
    },

    findByEmail: (email) => users.findByEmail(email),
    findById: (id) => users.findById(id),
    toPublicUser,
  };
};

module.exports = { createUsersService, BCRYPT_COST };
