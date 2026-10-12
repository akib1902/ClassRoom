import { AUTH_API_URL } from "./constants";

/**
 * API-backed session manager (production sign-in).
 *
 * Threat model notes:
 * - The access token lives **in memory only** — never localStorage, so an XSS
 *   bug cannot read a long-lived credential out of storage.
 * - The refresh token is an httpOnly cookie the browser attaches automatically
 *   (`credentials: "include"`); JavaScript cannot read it.
 * - A reload therefore starts with no access token and bootstraps by calling
 *   `/auth/refresh`, which is why `ensureSession` never trusts a cache unless an
 *   access token is already in memory for this page load.
 */

export type AuthRole = "admin" | "instructor" | "student";

/** Wire shape of `GET /api/auth/me`. */
export type ApiUser = {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  role: AuthRole;
  lastLoginAt: string | null;
  createdAt: string;
};

/**
 * Identity shape the app shell already expects (`UserAvatar`, `UserInfo` read
 * `fullName`), plus the server-authoritative `role`.
 */
export type SessionProfile = {
  id: number;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatar?: string;
  role: AuthRole;
  emailVerified: boolean;
};

const PROFILE_CACHE_KEY = "classroom.api.profile";
/** Re-validating more often than this would rotate the token needlessly. */
const FRESHNESS_MS = 10_000;

let accessToken: string | null = null;
let profile: SessionProfile | null = null;
let lastValidatedAt = 0;
let refreshInFlight: Promise<SessionProfile | null> | null = null;

export class AuthApiError extends Error {
  statusCode: number;
  errors?: Record<string, string>;

  constructor(
    message: string,
    statusCode: number,
    errors?: Record<string, string>
  ) {
    super(message);
    this.name = "AuthApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

const splitName = (name: string, email: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    const local = email.split("@")[0] ?? "Student";
    return { firstName: local, lastName: "" };
  }
  const [first = "", ...rest] = trimmed.split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
};

const toProfile = (user: ApiUser): SessionProfile => {
  const { firstName, lastName } = splitName(user.name ?? "", user.email ?? "");
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || user.email,
    avatar: user.avatarUrl ?? undefined,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
  };
};

const cacheProfile = (value: SessionProfile | null) => {
  try {
    if (value) sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // Private mode / storage disabled — the in-memory copy is enough.
  }
};

export const readCachedProfile = (): SessionProfile | null => {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionProfile) : null;
  } catch {
    return null;
  }
};

profile = readCachedProfile();

const applySession = (payload: { accessToken: string; user: ApiUser }): SessionProfile => {
  accessToken = payload.accessToken;
  profile = toProfile(payload.user);
  lastValidatedAt = Date.now();
  cacheProfile(profile);
  return profile;
};

export const clearApiSession = () => {
  accessToken = null;
  profile = null;
  lastValidatedAt = 0;
  cacheProfile(null);
};

export const getAccessToken = () => accessToken;

const parseError = async (response: Response, fallback: string) => {
  let body: { message?: string; errors?: Record<string, string> } | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return new AuthApiError(body?.message ?? fallback, response.status, body?.errors);
};

/** `fetch` against the auth API, with one transparent refresh-and-retry on 401. */
export const apiFetch = async (
  path: string,
  init: RequestInit = {},
  { retry = true }: { retry?: boolean } = {}
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${AUTH_API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch(path, init, { retry: false });
  }

  return response;
};

/** Exchanges the httpOnly refresh cookie for a new access token (single-flight). */
export const refreshSession = (): Promise<SessionProfile | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${AUTH_API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        // Sending an empty JSON object keeps the request a simple same-origin
        // POST that the API's CSRF/origin check can validate.
        body: "{}",
      });

      if (!response.ok) {
        clearApiSession();
        return null;
      }

      return applySession(await response.json());
    } catch {
      // Network failure must not pretend the session is valid.
      clearApiSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

/**
 * Returns the current identity, refreshing when there is no in-memory access
 * token (every page load) or when the last check is older than `FRESHNESS_MS`.
 */
export const ensureSession = async (
  { force = false }: { force?: boolean } = {}
): Promise<SessionProfile | null> => {
  const fresh =
    accessToken && profile && Date.now() - lastValidatedAt < FRESHNESS_MS;
  if (!force && fresh) return profile;
  return refreshSession();
};

/**
 * Where to land after Google returns. Auth pages and the `?auth=` marker are
 * dropped so a sign-in never bounces back into `/login` with a stale error.
 */
const currentAppPath = () => {
  const params = new URLSearchParams(window.location.search);
  for (const key of ["auth", "via", "reason"]) params.delete(key);

  const path = window.location.pathname;
  if (path === "/login" || path === "/register" || path === "/forgot-password") {
    return "/";
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

/** Sends the browser to Google (server-initiated PKCE flow). */
export const startGoogleSignIn = (
  intent: "signin" | "signup",
  redirectTo?: string
) => {
  const target = new URL(`${AUTH_API_URL}/auth/google/start`);
  target.searchParams.set("intent", intent);
  target.searchParams.set("redirect", redirectTo ?? currentAppPath());
  window.location.assign(target.toString());
};

export const loginWithPassword = async (email: string, password: string) => {
  const response = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await parseError(response, "Sign in failed.");
  return applySession(await response.json());
};

export const registerAccount = async (input: {
  name: string;
  email: string;
  password: string;
}) => {
  const response = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response, "Could not create the account.");
  return applySession(await response.json());
};

export const logoutSession = async () => {
  try {
    await apiFetch(
      "/auth/logout",
      { method: "POST", body: "{}" },
      { retry: false }
    );
  } catch {
    // A failed logout still clears local state below; the cookie is revoked
    // server-side on the next successful call.
  }
  clearApiSession();
};

/** Which providers the running server actually has configured. */
export const fetchProviders = async (): Promise<{
  google: { enabled: boolean; hostedDomains: string[] };
  password: boolean;
}> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/auth/providers`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("providers unavailable");
    return await response.json();
  } catch {
    return { google: { enabled: false, hostedDomains: [] }, password: false };
  }
};
