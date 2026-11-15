/** Local passage search over uploaded documents (owner: S4). STUB from F0. */
import type { Pack } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import type { Snippet } from "./types";

export function chunkDocs(_docs: UploadedDoc[], _pack: Pack): Snippet[] {
  return [];
}

export function retrieve(_q: string, _chunks: Snippet[], _k = 5): Snippet[] {
  return [];
}
