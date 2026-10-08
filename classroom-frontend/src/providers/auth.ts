import type { AuthProvider } from "@refinedev/core";

/**
 * Mock auth provider (README F1 is Phase 2 — JWT + roles on the backend).
 * It keeps the three auth pages fully usable on a local device: any email and
 * password signs in, a demo session is persisted to localStorage so the header
 * shows an identity, and logout clears it.
 */
const SESSION_KEY = "classroom.mock.session";

type Role = "admin" | "instructor" | "student";

type Session = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
};

const nameFromEmail = (email: string): Omit<Session, "id" | "email" | "role"> => {
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
): Session => {
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

const readSession = (): Session | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
};

const writeSession = (session: Session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Role of the current demo session — used by the mock data provider to
 * enforce the PRD F9–F11 permission matrix (403 for insufficient roles).
 */
export const getCurrentRole = (): Role => readSession()?.role ?? "student";

/** Display name for `createdBy` / `uploadedBy` fields on new records. */
export const getCurrentUserName = (): string =>
  readSession()?.fullName ?? buildSession("demo@classroom.local").fullName;

export const authProvider: AuthProvider = {
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
    writeSession(session);

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
    writeSession(session);

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
    clearSession();

    return {
      success: true,
      redirectTo: "/login",
      successNotification: {
        type: "success",
        message: "Signed out",
      },
    };
  },

  check: async () => ({
    authenticated: true,
  }),

  getIdentity: async () => readSession() ?? buildSession("demo@classroom.local"),

  getPermissions: async () => (readSession() ?? buildSession("demo@classroom.local")).role,

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
