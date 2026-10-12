/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST API base URL used by the data provider. */
  readonly VITE_API_URL?: string;
  /**
   * `api` routes sign-in through the Express server in `server/` (real sessions,
   * Google OAuth). Anything else keeps the offline demo provider.
   */
  readonly VITE_AUTH_MODE?: string;
  /** Base URL of the auth API, e.g. `http://localhost:4000/api`. */
  readonly VITE_AUTH_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
