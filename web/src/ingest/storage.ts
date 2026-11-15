import {
  D3_LIMITS,
  type DocErrorCode,
  type DocStore,
  type StoredDocRecord,
  type SupportedMediaType,
  type UploadedDoc,
} from "./types";

const DB_NAME = "prometeo-docs-db";
const DB_VERSION = 1;
const STORE_NAME = "docs";

/**
 * Detects supported media type from file name or MIME type.
 * Returns null for unsupported files.
 */
export function detectMediaType(name: string, mime: string): SupportedMediaType | null {
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase().trim();

  if (
    lowerMime === "text/csv" ||
    lowerMime === "application/csv" ||
    (!lowerMime && lowerName.endsWith(".csv")) ||
    lowerName.endsWith(".csv")
  ) {
    return "text/csv";
  }

  if (
    lowerMime === "text/tab-separated-values" ||
    lowerMime === "text/tsv" ||
    (!lowerMime && lowerName.endsWith(".tsv")) ||
    lowerName.endsWith(".tsv")
  ) {
    return "text/tab-separated-values";
  }

  if (
    lowerMime === "application/json" ||
    lowerMime === "text/json" ||
    (!lowerMime && lowerName.endsWith(".json")) ||
    lowerName.endsWith(".json")
  ) {
    return "application/json";
  }

  if (
    lowerMime === "application/pdf" ||
    (!lowerMime && lowerName.endsWith(".pdf")) ||
    lowerName.endsWith(".pdf")
  ) {
    return "application/pdf";
  }

  return null;
}

/**
 * Validates file metadata before ingestion against D3 limits and supported types.
 */
export function validateFileMeta(
  file: { name: string; type: string; size: number },
  existingCount: number
): DocErrorCode | null {
  if (existingCount >= D3_LIMITS.maxDocuments) {
    return "limit_exceeded";
  }

  const mediaType = detectMediaType(file.name, file.type);
  if (!mediaType) {
    return "unsupported_type";
  }

  if (file.size <= 0) {
    return "unreadable";
  }

  if (file.size > D3_LIMITS.maxBytes) {
    return "too_large";
  }

  return null;
}

/**
 * Computes lowercase 64-character SHA-256 hex digest using Web Crypto API.
 */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const bufferSource = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bufferSource as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * In-memory document store used for testing and fallback.
 */
export function createMemoryDocStore(): DocStore {
  const items = new Map<string, { doc: UploadedDoc; blob?: Blob | Uint8Array | ArrayBuffer }>();

  return {
    async save(doc: UploadedDoc, blob?: Blob | Uint8Array | ArrayBuffer): Promise<void> {
      items.set(doc.id, { doc, blob });
    },
    async list(): Promise<UploadedDoc[]> {
      return Array.from(items.values()).map((entry) => entry.doc);
    },
    async get(id: string): Promise<StoredDocRecord | null> {
      const entry = items.get(id);
      if (!entry) return null;
      return Object.assign({}, entry.doc, { doc: entry.doc, blob: entry.blob });
    },
    async remove(id: string): Promise<void> {
      items.delete(id);
    },
    async clear(): Promise<void> {
      items.clear();
    },
  };
}

/**
 * Creates IndexedDB-backed document store using the given IDBFactory.
 */
function createIndexedDbStore(factory: IDBFactory): DocStore {
  function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  }

  return {
    async save(doc: UploadedDoc, blob?: Blob | Uint8Array | ArrayBuffer): Promise<void> {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put({ id: doc.id, doc, blob });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Failed to save document"));
        };
      });
    },

    async list(): Promise<UploadedDoc[]> {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          db.close();
          const results = (request.result || []) as { doc: UploadedDoc }[];
          resolve(results.map((r) => r.doc));
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error("Failed to list documents"));
        };
      });
    },

    async get(id: string): Promise<StoredDocRecord | null> {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
          db.close();
          const entry = request.result as
            | { id: string; doc: UploadedDoc; blob?: Blob | Uint8Array | ArrayBuffer }
            | undefined;
          if (!entry) {
            resolve(null);
            return;
          }
          resolve(Object.assign({}, entry.doc, { doc: entry.doc, blob: entry.blob }));
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error("Failed to get document"));
        };
      });
    },

    async remove(id: string): Promise<void> {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Failed to delete document"));
        };
      });
    },

    async clear(): Promise<void> {
      const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("Failed to clear store"));
        };
      });
    },
  };
}

/**
 * Creates document store. Falls back to in-memory store when IndexedDB is unavailable
 * (e.g. Node.js vitest environment or environments without IndexedDB support).
 */
export function createDocStore(dbFactory?: IDBFactory): DocStore {
  const factory = dbFactory ?? (typeof indexedDB !== "undefined" ? indexedDB : undefined);
  if (!factory) {
    return createMemoryDocStore();
  }
  return createIndexedDbStore(factory);
}

/**
 * Merges incoming documents with existing documents, deduplicating identical SHA-256 hashes
 * and respecting D3_LIMITS.maxDocuments.
 */
export function mergeUploadedDocs(
  existing: UploadedDoc[],
  incoming: UploadedDoc[]
): { docs: UploadedDoc[]; duplicates: string[] } {
  const seenSha256 = new Set<string>();
  const mergedDocs: UploadedDoc[] = [];

  for (const doc of existing) {
    if (mergedDocs.length < D3_LIMITS.maxDocuments) {
      mergedDocs.push(doc);
      if (doc.sha256) {
        seenSha256.add(doc.sha256);
      }
    }
  }

  const duplicates: string[] = [];

  for (const doc of incoming) {
    if (doc.sha256 && seenSha256.has(doc.sha256)) {
      duplicates.push(doc.name);
      continue;
    }

    if (mergedDocs.length < D3_LIMITS.maxDocuments) {
      mergedDocs.push(doc);
      if (doc.sha256) {
        seenSha256.add(doc.sha256);
      }
    }
  }

  return { docs: mergedDocs, duplicates };
}
