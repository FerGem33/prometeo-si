/** Drag & drop of whole folders: walks webkitGetAsEntry() trees and keeps supported files only. */

export const DROP_EXTENSIONS = [".csv", ".tsv", ".json", ".pdf"];

/** The subset of FileSystemEntry the walk needs; lets tests pass plain objects. */
export interface DropEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fail?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (list: DropEntry[]) => void, fail?: (e: unknown) => void) => void };
}

const supported = (name: string) => DROP_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

async function walk(entry: DropEntry, out: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    if (!supported(entry.name)) return;
    out.push(await new Promise<File>((ok, fail) => entry.file!(ok, fail)));
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    // readEntries returns at most ~100 entries per call; keep reading until it returns none.
    for (;;) {
      const batch = await new Promise<DropEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (batch.length === 0) break;
      for (const child of batch) await walk(child, out);
    }
  }
}

/** Files of a drop, folders read recursively. Falls back to dataTransfer.files when entries are unavailable. */
export async function filesFromDrop(dt: { items?: ArrayLike<{ webkitGetAsEntry?: () => unknown }>; files: ArrayLike<File> }): Promise<File[]> {
  const entries = Array.from(dt.items ?? [])
    .map((it) => (it.webkitGetAsEntry ? (it.webkitGetAsEntry() as DropEntry | null) : null))
    .filter((e): e is DropEntry => e !== null);
  if (entries.length === 0) return Array.from(dt.files);
  const out: File[] = [];
  for (const e of entries) await walk(e, out);
  return out;
}
