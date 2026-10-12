const env = import.meta.env;

/**
 * Data-provider base URL. Unchanged default so the mock provider keeps working
 * with zero configuration (README §5.5 step 2 switches this to the real API).
 */
export const API_URL = env.VITE_API_URL ?? "https://api.fake-rest.refine.dev";

/**
 * `mock` (default) keeps the offline demo auth in `src/providers/auth.ts`.
 * `api` sends sign-in through the Express server in `server/`, where Google
 * OAuth, JWT sessions and role assignment actually happen.
 */
export const AUTH_MODE: "api" | "mock" = env.VITE_AUTH_MODE === "api" ? "api" : "mock";

export const IS_API_AUTH = AUTH_MODE === "api";

/** Base URL of the auth API (`server/`), no trailing slash. */
export const AUTH_API_URL = (
  env.VITE_AUTH_API_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");
