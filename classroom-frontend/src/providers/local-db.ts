/**
 * Local database (IndexedDB) backing the mock data provider.
 *
 * F9–F11 records (subjects, notices, materials, suggestions) and uploaded
 * material files are persisted here so data survives full page reloads
 * instead of resetting to the §5.4 seeds.
 *
 * Everything degrades gracefully: if IndexedDB is unavailable (private mode,
 * storage disabled) every helper resolves without effect and the provider
 * keeps running fully in memory, exactly as it did before.
 */

const DB_NAME = "classroom-local";
const DB_VERSION = 1;

const COLLECTIONS = ["subjects", "notices", "materials", "suggestions"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

const FILE_STORE = "files";
const META_STORE = "meta";

/** Object stores whose rows are keyed by their numeric `id`. */
const KEYED_BY_ID = new Set([...COLLECTIONS, FILE_STORE]);

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDb = (): Promise<IDBDatabase | null> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [...COLLECTIONS, FILE_STORE, META_STORE]) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, {
              keyPath: KEYED_BY_ID.has(name) ? "id" : undefined,
            });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
};

/** Runs `fn` against the DB, swallowing every failure (returns null). */
const withDb = async <T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T | null> => {
  const db = await openDb();
  if (!db) return null;
  try {
    return await fn(db);
  } catch {
    return null;
  }
};

const requestAsPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Reads every row of a collection; null when unavailable/empty store. */
export const loadCollection = async <T>(name: CollectionName): Promise<T[] | null> =>
  withDb((db) =>
    requestAsPromise(
      db.transaction(name, "readonly").objectStore(name).getAll() as IDBRequest<T[]>
    )
  );

/** Replaces a collection wholesale (clear + put) in a single transaction. */
export const saveCollection = async (name: CollectionName, rows: unknown[]): Promise<void> => {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(name, "readwrite");
        const store = tx.objectStore(name);
        store.clear();
        for (const row of rows) store.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
};

/** Persists an uploaded material file (Blob survives reload; URLs are rebuilt). */
export const putFile = async (id: number, blob: Blob): Promise<void> => {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).put({ id, blob });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
};

export const getFile = async (id: number): Promise<Blob | null> =>
  withDb(async (db) => {
    const row = await requestAsPromise<{ id: number; blob: Blob } | undefined>(
      db.transaction(FILE_STORE, "readonly").objectStore(FILE_STORE).get(id)
    );
    return row?.blob ?? null;
  });

export const deleteFile = async (id: number): Promise<void> => {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
};

/** `meta` store flag — distinguishes "never initialized" from "user deleted everything". */
export const isInitialized = async (): Promise<boolean> =>
  withDb(async (db) => {
    const row = await requestAsPromise<{ key: string; value: boolean } | undefined>(
      db.transaction(META_STORE, "readonly").objectStore(META_STORE).get("initialized")
    );
    return Boolean(row?.value);
  }).then((value) => value ?? false);

export const markInitialized = async (): Promise<void> => {
  await withDb(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readwrite");
        // The `meta` store is out-of-line (no keyPath), so the row key must be
        // passed explicitly — omitting it throws DataError, which would leave
        // the DB "uninitialized" and make every reload re-seed over user data.
        tx.objectStore(META_STORE).put({ key: "initialized", value: true }, "initialized");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
};
