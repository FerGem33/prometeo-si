/** Local passage search over uploaded documents or the pack texts (owner: S4). */
import type { Pack } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import type { Snippet } from "./types";

const CHUNK = 600;
const MAX_ROWS = 400;
const K1 = 1.2;
const B = 0.75;

const STOP = new Set(("a an and are as at be by for from has have in is it its of on or that the this to was were with which what who how " +
  "do does did can could should would will not no than then there these those their they them we you your i me my " +
  "el la los las un una unos unas y o de del en que es son por para con se su sus al lo como mas pero si ya muy sobre entre cual cuales " +
  "fue ser hay este esta estos estas").split(/\s+/));

export function tokenize(text: string): string[] {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return (plain.match(/[\p{L}\p{N}]+(?:[.,][\p{N}]+)?/gu) ?? []).filter((w) => !STOP.has(w) && w.length > 0);
}

function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)\s*/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    if (cur && cur.length + 1 + s.length > CHUNK) { chunks.push(cur); cur = ""; }
    if (s.length > CHUNK * 1.5) {
      // A very long sentence is cut on word boundaries.
      if (cur) { chunks.push(cur); cur = ""; }
      let piece = "";
      for (const w of s.split(" ")) {
        if (piece && piece.length + 1 + w.length > CHUNK) { chunks.push(piece); piece = ""; }
        piece = piece ? `${piece} ${w}` : w;
      }
      cur = piece;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function chunkDocs(docs: UploadedDoc[], pack: Pack): Snippet[] {
  const out: Snippet[] = [];
  const usable = docs.filter((d) => d.status === "done" || d.paper || d.table);
  for (const d of usable) {
    if (d.paper) {
      for (const p of d.paper.pages) {
        for (const text of splitSentences(p.text)) out.push({ docId: d.id, docName: d.name, page: p.page, text, score: 0 });
      }
    }
    if (d.table) {
      const { headers, rows } = d.table;
      for (const r of rows.slice(0, MAX_ROWS)) {
        const text = headers.map((h, i) => ({ h, v: (r.values[i] ?? "").trim() })).filter((x) => x.v).map((x) => `${x.h}: ${x.v}`).join("; ");
        if (text) out.push({ docId: d.id, docName: d.name, row: r.row, text, score: 0 });
      }
    }
  }
  if (usable.length > 0 || docs.length > 0) return out;
  for (const s of pack.studies ?? []) {
    const fields = [s.title, s.summary?.objective, s.summary?.conditions, s.summary?.instruments, s.summary?.subjects?.join(", ")]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    for (const f of fields) for (const text of splitSentences(f)) out.push({ docId: s.id, docName: s.short || s.title, text, score: 0 });
  }
  for (const src of pack.sources ?? []) {
    const fields = [src.name, src.note].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    const text = fields.join(". ");
    if (text) out.push({ docId: src.id, docName: src.name, text, score: 0 });
  }
  return out;
}

/** BM25 over the chunks; zero-score chunks are dropped and ties keep the corpus order. */
export function retrieve(q: string, chunks: Snippet[], k = 5): Snippet[] {
  const terms = [...new Set(tokenize(q))];
  if (!terms.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokenize(c.text));
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = chunks.length;
  const scored = chunks.map((c, i) => {
    const tf = new Map<string, number>();
    for (const w of docs[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const w of terms) {
      const f = tf.get(w);
      if (!f) continue;
      const n = df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * docs[i].length) / avg)));
    }
    return { c, i, score };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, k)
    .map((x) => ({ ...x.c, score: Math.round(x.score * 1e6) / 1e6 }));
}
