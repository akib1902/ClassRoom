import type { AuthProvider } from "@refinedev/core";

import { AUTH_API_URL, IS_API_AUTH } from "./constants";
import {
  AuthApiError,
  clearApiSession,
  ensureSession,
  loginWithPassword,
  logoutSession,
  readCachedProfile,
  registerAccount,
  startGoogleSignIn,
  type AuthRole,
} from "./api-auth";

/**
 * Two auth providers behind one export.
 *
 * - `mock` (default): offline demo — any credentials sign in and a fake session
 *   is kept in localStorage (README §9.2). Zero configuration, no backend.
 * - `api` (`VITE_AUTH_MODE=api`): the real thing. Sign-in goes through the
 *   Express server in `server/`, which owns Google OAuth, JWT sessions and the
 *   authoritative role. Nothing about the session is client-decided: the role
 *   picker in the forms is hidden and ignored, and every protected route
 *   re-validates against the server.
 */

const SESSION_KEY = "classroom.mock.session";

type Role = AuthRole;

type MockSession = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
};

/* ------------------------------ demo provider ---------------------------- */

const nameFromEmail = (email: string): Omit<MockSession, "id" | "email" | "role"> => {
  const raw = email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!raw) {
    return { firstName: "Student", lastName: "", fullName: "Student" };
  }

  const [first = "Student", ...rest] = raw.split(" ");
  const capitalize = (part: string) =>
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();

  const firstName = capitalize(first);
  const lastName = rest.map(capitalize).join(" ");

  return {
    firstName,
    lastName,
    fullName: lastName ? `${firstName} ${lastName}` : firstName,
  };
};

const buildSession = (
  email: string,
  providerName?: string,
  role?: Role
): MockSession => {
  if (providerName) {
    return {
      id: "demo",
      email: `demo@${providerName}.local`,
      firstName: "Demo",
      lastName: "User",
      fullName: "Demo User",
      role: role ?? "student",
    };
  }

  return {
    id: String(Date.now()),
    email,
    ...nameFromEmail(email),
    role: role ?? "student",
  };
};

const readMockSession = (): MockSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
};

const writeMockSession = (session: MockSession) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearMockSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

const mockAuthProvider: AuthProvider = {
  login: async ({
    email,
    providerName,
    role,
  }: {
    email?: string;
    providerName?: string;
    role?: Role;
  }) => {
    const session = buildSession(email ?? "", providerName, role);
    writeMockSession(session);

    return {
      success: true,
      redirectTo: "/",
      successNotification: {
        type: "success",
        message: `Welcome, ${session.fullName}!`,
        description: "You are signed in to the local demo session.",
      },
    };
  },

  register: async ({ email, role }: { email?: string; role?: Role }) => {
    const session = buildSession(email ?? "", undefined, role);
    writeMockSession(session);

    return {
      success: true,
      redirectTo: "/",
      successNotification: {
        type: "success",
        message: "Account created",
        description: "Your local demo account is ready to use.",
      },
    };
  },

  logout: async () => {
    clearMockSession();

    return {
      success: true,
      redirectTo: "/login",
      successNotification: {
        type: "success",
        message: "Signed out",
      },
    };
  },

  check: async () =>
    readMockSession()
      ? { authenticated: true }
      : { authenticated: false, redirectTo: "/login" },

  getIdentity: async () => readMockSession() ?? buildSession("demo@classroom.local"),

  getPermissions: async () =>
    (readMockSession() ?? buildSession("demo@classroom.local")).role,

  forgotPassword: async () => ({
    success: true,
    successNotification: {
      type: "success",
      message: "Password reset instructions sent",
      description: "In demo mode no email is actually dispatched.",
    },
  }),

  updatePassword: async () => ({
    success: true,
    successNotification: {
      type: "success",
      message: "Password updated",
    },
  }),

  onError: async () => ({}),
};

/* ------------------------------ API provider ----------------------------- */

const apiAuthProvider: AuthProvider = {
  login: async ({ email, password, providerName }: {
    email?: string;
    password?: string;
    providerName?: string;
  }) => {
    // Google is a full-page redirect (the server holds the PKCE verifier and the
    // client secret), so this promise never resolves — the browser leaves.
    if (providerName === "google") {
      startGoogleSignIn("signin");
      return { success: true };
    }

    if (providerName) {
      return {
        success: false,
        error: {
          name: "ProviderUnavailable",
          message: `Sign in with ${providerName} is not available.`,
        },
      };
    }

    try {
      const identity = await loginWithPassword(email ?? "", password ?? "");
      return {
        success: true,
        redirectTo: "/",
        successNotification: {
          type: "success",
          message: `Welcome back, ${identity.fullName}!`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message:
            error instanceof AuthApiError
              ? error.message
              : "Could not reach the sign-in service. Is the API running?",
        },
      };
    }
  },

  register: async ({ name, email, password, providerName }: {
    name?: string;
    email?: string;
    password?: string;
    providerName?: string;
  }) => {
    if (providerName === "google") {
      startGoogleSignIn("signup");
      return { success: true };
    }

    try {
      // The account starts as `student`; elevated roles are granted server-side
      // (see ADMIN_EMAILS), never by the sign-up form.
      const identity = await registerAccount({
        name: name?.trim() || (email ?? "").split("@")[0] || "Student",
        email: email ?? "",
        password: password ?? "",
      });

      return {
        success: true,
        redirectTo: "/",
        successNotification: {
          type: "success",
          message: "Account created",
          description: `Signed in as ${identity.email}.`,
        },
      };
    } catch (error) {
      if (error instanceof AuthApiError) {
        // Surface the first field error ("Password must be at least 12
        // characters.") rather than the generic "correct the highlighted
        // fields" summary, so the toast is actionable.
        const detail = error.errors ? Object.values(error.errors)[0] : undefined;
        return {
          success: false,
          error: {
            name: "RegisterError",
            message: detail ?? error.message,
          },
        };
      }
      return {
        success: false,
        error: {
          name: "RegisterError",
          message: "Could not reach the sign-up service. Is the API running?",
        },
      };
    }
  },

  logout: async () => {
    await logoutSession();
    return {
      success: true,
      redirectTo: "/login",
      successNotification: { type: "success", message: "Signed out" },
    };
  },

  /**
   * Runs on every protected route. It always validates against the server, so a
   * cached profile or an expired access token cannot keep a route open.
   */
  check: async () => {
    const identity = await ensureSession();
    return identity
      ? { authenticated: true }
      : { authenticated: false, redirectTo: "/login" };
  },

  getIdentity: async () => (await ensureSession()) ?? undefined,

  getPermissions: async () => (await ensureSession())?.role ?? undefined,

  forgotPassword: async ({ email }: { email?: string }) => {
    try {
      const response = await fetch(`${AUTH_API_URL}/auth/forgot-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email ?? "" }),
      });

      if (response.ok) {
        // Deliberately identical for known and unknown addresses — the API is
        // the one that must avoid revealing whether an account exists.
        return {
          success: true,
          successNotification: {
            type: "success",
            message: "Check your inbox",
            description:
              "If that address has an account, reset instructions are on the way.",
          },
        };
      }

      // The endpoint is not implemented yet, so say so instead of pretending an
      // email was sent.
      const message =
        response.status === 404 || response.status === 501
          ? "Password resets are not available yet — sign in with Google, or ask an admin to reset your password."
          : "Could not send reset instructions. Please try again.";

      return { success: false, error: { name: "ResetFailed", message } };
    } catch {
      return {
        success: false,
        error: {
          name: "ResetFailed",
          message: "Could not reach the auth service. Is the API running?",
        },
      };
    }
  },

  updatePassword: async () => ({
    success: true,
    successNotification: { type: "success", message: "Password updated" },
  }),

  /** A 401 from any API call ends the session and returns to sign-in. */
  onError: async (error) => {
    const status = (error as { statusCode?: number } | undefined)?.statusCode;
    if (status === 401) {
      clearApiSession();
      return { logout: true, redirectTo: "/login" };
    }
    return {};
  },
};

export const authProvider: AuthProvider = IS_API_AUTH ? apiAuthProvider : mockAuthProvider;

/* --------------------------------- helpers -------------------------------- */

/**
 * Role of the current session — used by the mock data provider to enforce the
 * PRD F9–F11 permission matrix. In API mode it is the role the server assigned
 * and the data layer is expected to enforce it server-side too.
 */
export const getCurrentRole = (): Role =>
  IS_API_AUTH
    ? readCachedProfile()?.role ?? "student"
    : readMockSession()?.role ?? "student";

/** Display name for `createdBy` / `uploadedBy` fields on new records. */
export const getCurrentUserName = (): string => {
  if (IS_API_AUTH) {
    return readCachedProfile()?.fullName ?? "Signed-in user";
  }
  return readMockSession()?.fullName ?? buildSession("demo@classroom.local").fullName;
};
