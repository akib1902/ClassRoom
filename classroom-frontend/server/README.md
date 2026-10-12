# Classroom API — auth service

Express + SQLite service that owns authentication for the Classroom SPA. It
implements the F1 auth slice of the PRD ([README.MD](../README.MD) §5) with
**Google OAuth 2.0 (authorization code + PKCE)** replacing the old
"click Google → fake localStorage session" placeholder.

```
server/
├── src/
│   ├── index.js              # config validation → db → listen
│   ├── app.js                # middleware, rate limits, route wiring
│   ├── config.js             # env parsing + fail-fast production checks
│   ├── db.js                 # node:sqlite schema (users, refresh_tokens)
│   ├── errors.js             # ApiError + { statusCode, message, errors? }
│   ├── lib/cookies.js        # cookie policy, signed tx cookie, PKCE helpers
│   ├── middleware/           # requireAuth, requireRole, same-origin, zod
│   ├── repositories/         # users, refresh_tokens (parameterized SQL)
│   ├── routes/auth.js        # the endpoints below
│   └── services/             # google (OAuth + JWKS), tokens (sessions), users
└── tests/                    # jest + supertest (47 tests, no network)
```

## How sign-in works

The flow is **server-initiated**, because a confidential client secret can never
live in a browser:

```
SPA  ──GET /api/auth/google/start──▶ API        sets signed httpOnly tx cookie
                                     │          (PKCE verifier + state + nonce)
API  ──302──▶ accounts.google.com/o/oauth2/v2/auth?...&code_challenge_method=S256
Google ──302 (code, state)──▶ GET /api/auth/google/callback
       API exchanges the code with client_secret + code_verifier
       API verifies the ID token (RS256 via JWKS, iss, aud, exp, nonce)
       API upserts the user, sets an httpOnly refresh cookie
API  ──302──▶ APP_ORIGIN/<redirect>?auth=success&via=google
SPA  ──POST /api/auth/refresh──▶ API            returns the in-memory access token
```

Why this shape:

| Property | How it is achieved |
|---|---|
| Client secret never reaches the browser | Token exchange happens server-side |
| PKCE verifier never reaches the browser | Minted and stored in a signed httpOnly cookie; only the S256 challenge goes to Google |
| CSRF on the callback | `state` compared with `timingSafeEqual` |
| Replay of a captured ID token | `nonce` bound to this exact attempt |
| Forged/foreign ID tokens | RS256 signature verified against Google's JWKS, `aud` must equal the client ID |
| Stolen refresh token | Rotation + reuse detection revokes the whole token family |
| XSS token theft | Access token is memory-only; refresh token is httpOnly; no tokens in URLs or `localStorage` |
| Open redirect after callback | `resolveAllowedRedirect` only accepts relative paths or allowlisted origins |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Liveness + whether Google is configured |
| GET | `/api/auth/providers` | Which providers this server can offer |
| GET | `/api/auth/google/start` | 302 to Google; sets the PKCE transaction cookie |
| GET | `/api/auth/google/callback` | Exchanges + verifies, sets the refresh cookie, 302 back to the SPA |
| POST | `/api/auth/register` | Email + password (bcrypt, cost 12), role always `student` |
| POST | `/api/auth/login` | Password sign-in; identical error for unknown user and bad password |
| POST | `/api/auth/refresh` | Rotates the refresh cookie, returns a new access token |
| POST | `/api/auth/logout` | Revokes the token family, clears the cookie |
| GET | `/api/auth/me` | Current profile + role (`no-store`) |

Errors always use `{ statusCode, message, errors? }`. The Google **callback**
never returns JSON — it redirects to `/login?auth=error&reason=<code>`, where the
codes are `google_unconfigured`, `google_denied`, `oauth_state`,
`google_exchange_failed`, `google_id_token`, `not_allowed`, `server_error`.

## Roles

Roles are assigned **server-side only**: the SPA's role picker is a demo
affordance and is hidden and ignored in API mode. Everyone starts as `student`.
To create the first administrator, list the address in `ADMIN_EMAILS` and sign in
with that Google account — it is promoted on first sign-in. To change a role
later, edit the `users.role` column:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('./classroom.db');d.prepare('UPDATE users SET role=? WHERE email=?').run('instructor','ada@university.edu');"
```

## Run it

```bash
# from the repository root
npm run server          # nodemon, http://localhost:4000
npm run server:test     # jest + supertest (no network)
npm run server:start    # production start
```

Or from `server/`: `npm install && cp .env.example .env && npm run dev`.

`npm run smoke --prefix server` boots the app on a free loopback port and drives
the real HTTP surface (redirects, cookies, rate limits, and — when credentials
are present — a genuine call to Google's token endpoint), printing a pass/fail
list. It is a good post-deploy check too.

Two optional knobs worth knowing: `HOST` pins the bind address (empty = every
interface, which is the right default behind a managed proxy), and in
development a missing `JWT_SECRET` is generated per boot with a warning —
production refuses to start without a real one.

Then, in the root `.env`, switch the SPA over:

```
VITE_AUTH_MODE=api
VITE_AUTH_API_URL=http://localhost:4000/api
```

The frontend keeps working in demo mode (`VITE_AUTH_MODE=mock`, the default) when
no API is running.

## Google Cloud Console setup

1. Open <https://console.cloud.google.com/> and create/select a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app
   name, support email and developer contact, then save. While the app is in
   *Testing*, add each account you want to sign in under **Test users**
   (otherwise Google returns `access_denied`). When you are ready for real users,
   publish it and complete verification if Google asks for it.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:5173` (and your
     deployed SPA origin, e.g. `https://classroom.example.com`)
   - **Authorized redirect URIs**: `http://localhost:4000/api/auth/google/callback`
     — this must equal `API_ORIGIN` + `/api/auth/google/callback` **exactly**, with
     no trailing slash. Add the production equivalent too
     (`https://api.classroom.example.com/api/auth/google/callback`).
4. Copy the **Client ID** and **Client secret** into `server/.env`:

   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
   API_ORIGIN=http://localhost:4000
   APP_ORIGIN=http://localhost:5173
   JWT_SECRET=<generated secret>
   ```

5. Restart the API. `GET /api/health` should report `"google": "configured"`, and
   the Google button becomes enabled on `/login`.

Optional hardening:

- `GOOGLE_ALLOWED_DOMAINS=university.edu` — only that Workspace domain may sign in
  (matched against the ID token's `hd` claim).
- `ADMIN_EMAILS=you@university.edu` — bootstrap the first administrator.

## Security notes and known gaps

`JWT_SECRET` also keys the HMAC on the OAuth transaction cookie, so rotating it
invalidates pending sign-in attempts as well as sessions.

Implemented: bcrypt cost 12, refresh rotation with reuse detection, helmet,
allowlisted CORS with credentials, rate limits on the credential and OAuth
endpoints, Zod-validated bodies, parameterized SQL only, CSRF origin checks on
cookie-authenticated endpoints, `no-store` on personalized responses, and
production config validation that refuses to boot on `http://` origins or a short
`JWT_SECRET`.

Not implemented yet (deliberately out of scope for the Google slice):

- **`/api/auth/forgot-password`** and `/api/auth/reset-password`. There is no
  mailer, so the SPA reports the feature as unavailable rather than claiming an
  email was sent. `POST /api/auth/forgot-password` currently 404s.
- Password login is not rate-limited per *account* (only per IP).
- No delete-account or "sign out everywhere" endpoint (the latter is a one-line
  call to `revokeAllForUser`).
- Google's ID token is verified but no revocation check (`/tokeninfo`) is made;
  access tokens are short-lived and unused downstream.
