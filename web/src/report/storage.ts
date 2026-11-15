/** Browser-local persistence. Everything here lives only in this browser; nothing is sent to a server. */
const NS = "prometeo:v1:";

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(NS + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refuses the write (private mode, quota, blocked storage). */
export function saveJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(NS + key);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
