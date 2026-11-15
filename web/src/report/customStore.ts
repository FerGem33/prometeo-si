import type { EvaluationDraft } from "../components/ScenarioStep";

/** A custom evaluation (pack, lens, mapping, blueprint built from uploaded documents) kept in this browser's IndexedDB. */
export type SavedCustom = { id: string; savedAt: string; draft: EvaluationDraft };

export interface CustomStore {
  save(c: SavedCustom): Promise<void>;
  get(id: string): Promise<SavedCustom | null>;
  list(): Promise<string[]>;
  remove(id: string): Promise<void>;
}

const DB_NAME = "prometeo-custom-db";
const STORE = "evaluations";

export function createMemoryCustomStore(): CustomStore {
  const m = new Map<string, SavedCustom>();
  return {
    async save(c) {
      m.set(c.id, c);
    },
    async get(id) {
      return m.get(id) ?? null;
    },
    async list() {
      return [...m.keys()];
    },
    async remove(id) {
      m.delete(id);
    },
  };
}

function createIndexedDbCustomStore(factory: IDBFactory): CustomStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
    });
  // One transaction per call; the database is closed when it finishes or fails.
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve((req ? req.result : undefined) as T);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
    });
  };
  return {
    save: (c) => run<void>("readwrite", (s) => void s.put(c)),
    get: async (id) => ((await run<SavedCustom | undefined>("readonly", (s) => s.get(id))) ?? null),
    list: async () => ((await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? []).map(String),
    remove: (id) => run<void>("readwrite", (s) => void s.delete(id)),
  };
}

/** Falls back to memory when IndexedDB is unavailable (tests, some private modes). */
export function createCustomStore(factory?: IDBFactory): CustomStore {
  const f = factory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  return f ? createIndexedDbCustomStore(f) : createMemoryCustomStore();
}

/** Shared instance for the app. */
export const customStore = createCustomStore();
