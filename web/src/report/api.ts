import type { Finding, Pack, Scenario } from "../engine";

export type Sentence = { finding: string; text: string; sources: string[] };
export type Analysis = { mode: "ai" | "template"; sentences: Sentence[]; dropped: number };
const object = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

export function parseAsk(x: unknown, pack: Pack): Scenario | { unsupported: string } {
  if (!object(x)) throw new Error("Invalid response");
  if (Object.keys(x).length === 1 && typeof x.unsupported === "string") return { unsupported: "Only scenario changes are supported." };
  if (Object.keys(x).sort().join() !== "active,filters,values" || !object(x.values) || !strings(x.active) || !object(x.filters) || Object.keys(x.filters).length) throw new Error("Invalid scenario");
  if (!x.active.length || new Set(x.active).size !== x.active.length || x.active.some((id) => !object(x.values) || !(id in x.values))) throw new Error("Invalid variables");
  const values: Scenario["values"] = {};
  for (const [id, value] of Object.entries(x.values)) {
    const v = pack.schema.variables.find((item) => item.id === id);
    if (!v) throw new Error("Unknown variable");
    if (v.type === "num") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < v.range[0] || value > v.range[1]) throw new Error("Invalid number");
    } else if (typeof value !== "string" || !pack.records.some((r) => r.values[id] === value)) throw new Error("Unknown category");
    values[id] = value as number | string;
  }
  return { values, active: x.active };
}

export function parseAnalysis(x: unknown, finds: Finding[], pack: Pack): Analysis {
  if (!object(x) || (x.mode !== "ai" && x.mode !== "template") || !Array.isArray(x.sentences) || x.sentences.length > 8 || typeof x.dropped !== "number" || !Number.isInteger(x.dropped) || x.dropped < 0) throw new Error("Invalid analysis");
  const known = new Set([...pack.records.map((r) => r.id), ...pack.studies.map((s) => s.id)]);
  const seen = new Set<string>();
  const sentences = x.sentences.map((s: unknown): Sentence => {
    if (!object(s) || typeof s.finding !== "string" || typeof s.text !== "string" || !s.text || s.text.length > 2000 || !strings(s.sources) || !s.sources.length || seen.has(s.finding)) throw new Error("Invalid sentence");
    const finding = finds.find((f) => f.id === s.finding);
    if (!finding || s.sources.some((id) => !known.has(id) || !finding.sources.includes(id))) throw new Error("Invalid provenance");
    seen.add(s.finding);
    return { finding: s.finding, text: s.text, sources: s.sources };
  });
  return { mode: x.mode, sentences, dropped: x.dropped };
}

/** Deployed builds get VITE_API_URL at build time. The dev server has no CORS access to the API, so it forwards /api (vite.config.ts). */
export const API_BASE: string = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "/api" : "");

export async function postApi(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const base = API_BASE;
  if (!base) throw new Error("API not configured");
  const response = await fetch(`${base.replace(/\/$/, "")}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
