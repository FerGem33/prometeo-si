import type { CatVariable, NumVariable, Pack, Scenario, Variable } from "../engine";
import { applyConversion, getConversion } from "./buildPack";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const BILINGUAL_SYNONYMS: Record<string, string[]> = {
  temperature: ["temperatura", "temp"],
  temperatura: ["temperature", "temp"],
  temp: ["temperature", "temperatura"],
  voltage: ["voltaje", "volt"],
  voltaje: ["voltage", "volt"],
  volt: ["voltage", "voltaje"],
  pressure: ["presión", "presion"],
  presión: ["pressure"],
  presion: ["pressure"],
  oxygen: ["oxígeno", "oxigeno", "o2"],
  oxígeno: ["oxygen", "o2"],
  oxigeno: ["oxygen", "o2"],
  o2: ["oxygen", "oxígeno", "oxigeno"],
  material: ["material"],
  current: ["corriente"],
  corriente: ["current"],
  capacity: ["capacidad"],
  capacidad: ["capacity"],
  density: ["densidad"],
  densidad: ["density"],
  concentration: ["concentración", "concentracion"],
  concentración: ["concentration"],
  concentracion: ["concentration"],
  flow: ["flujo"],
  flujo: ["flow"],
  power: ["potencia"],
  potencia: ["power"],
  energy: ["energía", "energia"],
  energía: ["energy"],
  energia: ["energy"],
};

/**
 * Extracts variable aliases (label, id, long, synonyms) for case-insensitive matching.
 */
function getAliases(v: Variable): string[] {
  const set = new Set<string>();
  const add = (s: string | undefined | null) => {
    if (!s || !s.trim()) return;
    const trimmed = s.trim();
    set.add(trimmed);
    const norm = stripAccents(trimmed.toLowerCase());
    set.add(norm);
    const syns = BILINGUAL_SYNONYMS[norm];
    if (syns) {
      for (const syn of syns) {
        set.add(syn);
      }
    }
  };

  add(v.label);
  add(v.id);
  if ("long" in v && v.long) add(v.long);

  return Array.from(set).sort((a, b) => b.length - a.length);
}

/**
 * Retrieves all known category values for a categorical variable from pack records.
 */
function getKnownCategories(pack: Pack, catId: string): string[] {
  const set = new Set<string>();
  for (const r of pack.records) {
    const val = r.values[catId];
    if (typeof val === "string" && val.trim()) {
      set.add(val.trim());
    }
  }
  return Array.from(set);
}

/**
 * Parses natural language questions locally and extracts scenario values without remote API calls.
 * Supports English and Spanish syntax (e.g., "Set Temperature to 350 K and Voltage 4.1 V", "Cambia Temperatura a 350").
 */
export function interpretLocalQuestion(
  question: string,
  pack: Pack,
  strict = false,
): Scenario | { unsupported: string } {
  const trimmed = question.trim();
  if (!trimmed || !pack.schema?.variables?.length) {
    return { unsupported: "Only scenario changes are supported." };
  }

  const values: Scenario["values"] = {};

  // Sort variables by longest label/id to avoid premature prefix matches
  const sortedVars = [...pack.schema.variables].sort((a, b) => {
    const lenA = Math.max(a.label?.length || 0, a.id?.length || 0);
    const lenB = Math.max(b.label?.length || 0, b.id?.length || 0);
    return lenB - lenA;
  });

  for (const v of sortedVars) {
    const aliases = getAliases(v);
    if (!aliases.length) continue;

    const aliasRegexPart = aliases.map(escapeRegex).join("|");

    if (v.type === "num") {
      const numVar = v as NumVariable;
      // Pattern 1: [Var Name] [to/is/a/:/=]? [Value] [Unit]?
      // e.g., "Temperature to 350 K", "Voltage = 4.1 V", "volt 3.8", "Temperatura a 350"
      const p1 = new RegExp(
        `(?:^|[^a-zA-Z0-9_])(?:${aliasRegexPart})\\b(?:\\s*(?:to|is|a|=|:|de|en|set|cambia)\\s*|\\s+)(-?\\d+(?:\\.\\d+)?)(?:\\s*([a-zA-Z°µΩ%][a-zA-Z0-9°µΩ%/·-]*))?`,
        "i"
      );

      // Pattern 2: [Value] [Unit]? of [Var Name]
      // e.g., "350 K of Temperature", "4.1 V for Voltage"
      const p2 = new RegExp(
        `(-?\\d+(?:\\.\\d+)?)(?:\\s*([a-zA-Z°µΩ%][a-zA-Z0-9°µΩ%/·-]*))?\\s*(?:of|de|en|for|para)\\s*(?:${aliasRegexPart})\\b`,
        "i"
      );

      let matchedNum: number | null = null;
      let matchedUnit: string | null = null;

      const m1 = trimmed.match(p1);
      if (m1) {
        matchedNum = parseFloat(m1[1]);
        matchedUnit = m1[2] ? m1[2].trim() : null;
      } else {
        const m2 = trimmed.match(p2);
        if (m2) {
          matchedNum = parseFloat(m2[1]);
          matchedUnit = m2[2] ? m2[2].trim() : null;
        }
      }

      if (matchedNum !== null && !isNaN(matchedNum)) {
        let finalNum = matchedNum;
        if (matchedUnit && /^(and|y|with|con|for|para|at|en)$/i.test(matchedUnit)) matchedUnit = null;
        if (matchedUnit && numVar.unit) {
          const conv = getConversion(matchedUnit, numVar.unit);
          if (conv) {
            finalNum = applyConversion(finalNum, conv);
          } else if (strict && matchedUnit !== numVar.unit) continue;
        }

        // Clamp to variable range
        if (Array.isArray(numVar.range) && numVar.range.length === 2) {
          if (strict && (finalNum < numVar.range[0] || finalNum > numVar.range[1])) continue;
          finalNum = Math.min(numVar.range[1], Math.max(numVar.range[0], finalNum));
        }

        // Clean floating precision
        values[numVar.id] = Math.round(finalNum * 1e6) / 1e6;
      }
    } else if (v.type === "cat") {
      const catVar = v as CatVariable;
      const known = getKnownCategories(pack, catVar.id);

      // Look for [Var Name] [to/is/a/:/=]? [Value]
      const pCat = new RegExp(
        `(?:^|[^a-zA-Z0-9_])(?:${aliasRegexPart})\\b(?:\\s*(?:to|is|a|=|:|de|en|set|cambia)\\s*|\\s+)([a-zA-Z0-9_\\-]+)`,
        "i"
      );

      const m = trimmed.match(pCat);
      let matchedCat = false;
      if (m) {
        const candidate = m[1].trim();
        const matchedKnown = known.find(
          (k) => k.toLowerCase() === candidate.toLowerCase()
        );
        if (matchedKnown) {
          values[catVar.id] = matchedKnown;
          matchedCat = true;
        } else if (known.length === 0) {
          values[catVar.id] = candidate;
          matchedCat = true;
        }
      }
      if (!matchedCat) {
        // Direct mention of a known category (including multi-word categories) along with variable name
        for (const k of known) {
          const kPattern = new RegExp(`(?:^|[^a-zA-Z0-9_])${escapeRegex(k)}(?=$|[^a-zA-Z0-9_])`, "i");
          const vPattern = new RegExp(`(?:^|[^a-zA-Z0-9_])(?:${aliasRegexPart})\\b`, "i");
          if (kPattern.test(trimmed) && vPattern.test(trimmed)) {
            values[catVar.id] = k;
            break;
          }
        }
      }
    }
  }

  const active = pack.schema.variables
    .map((v) => v.id)
    .filter((id) => id in values);

  if (active.length === 0) {
    return { unsupported: "Only scenario changes are supported." };
  }

  return {
    values,
    active,
  };
}

export type LocalStat = "max" | "min" | "mean" | "count";
export type LocalOp = "<" | ">" | "<=" | ">=" | "between";
export type LocalAnswer =
  | { kind: "stat"; variable: string; stat: LocalStat; value: number; unit: string | null; n: number; records: string[] }
  | { kind: "filter"; variable: string; op: LocalOp; bounds: number[]; unit: string | null; studies: string[]; records: string[] };

const NUM = "(-?\\d+(?:[.,]\\d+)?)";
const UNIT = "(?:\\s*([a-zA-Z°µΩ%][a-zA-Z0-9°µΩ%/·-]*))?";
// Order matters: inclusive forms before strict ones, and comparisons before "mayor/menor" as max/min words.
const OPS: [LocalOp, string][] = [
  ["<=", "at most|no more than|<=|≤|como máximo|como maximo|hasta"],
  [">=", "at least|no less than|>=|≥|como mínimo|como minimo|al menos"],
  ["<", "below|under|less than|lower than|smaller than|<|menor(?:es)? (?:a|que)|por debajo de|inferior(?:es)? a"],
  [">", "above|over|greater than|more than|higher than|larger than|>|mayor(?:es)? (?:a|que)|por encima de|superior(?:es)? a"],
];
const STATS: [LocalStat, RegExp][] = [
  ["count", /\b(how many|number of|count)\b|cu[aá]nt[oa]s/i],
  ["mean", /\b(mean|average|promedio|media)\b/i],
  ["max", /\b(max(imum)?|highest|largest|greatest|peak)\b|m[aá]xim[oa]|\bmayor\b|m[aá]s alt[oa]/i],
  ["min", /\b(min(imum)?|lowest|smallest)\b|m[ií]nim[oa]|\bmenor\b|m[aá]s baj[oa]/i],
];

const toNum = (s: string) => parseFloat(s.replace(",", "."));

/** Value given by the user, converted to the unit of the variable when the unit is known. */
function inVarUnit(raw: string, unit: string | undefined, v: NumVariable): number {
  const n = toNum(raw);
  const conv = unit && v.unit ? getConversion(unit, v.unit) : null;
  return Math.round(applyConversion(n, conv) * 1e6) / 1e6;
}

// Questions that ask for an outcome or a verdict. Prometeo compares conditions; it answers with evidence levels instead.
const PREDICTION = /\b(is it safe|safe|unsafe|danger\w*|hazard\w*|will (it|this|that|the \w+) (burn|ignite|fail|work|explode|catch)|would (it|this) (burn|ignite|fail)|predict\w*|burns?|ignites?|explodes?|fails?|risk of|es seguro|seguro|peligros\w*|arder[áa]?|arde|prender[áa]?|explotar[áa]?|fallar[áa]?|predec\w*)\b/i;

/** True when the question asks for a prediction or a safety verdict rather than for the evidence. */
export function isPredictionQuestion(question: string): boolean {
  return PREDICTION.test(question);
}

/**
 * Read-only questions over the records of the pack (max, min, mean, count; studies under a numeric condition).
 * Deterministic: every answer lists the records it was computed from so the interface can open their sources.
 */
export function answerLocalQuery(question: string, pack: Pack): LocalAnswer | { unsupported: string } {
  const q = question.trim();
  const unsupported = { unsupported: "Ask for the maximum, minimum, mean or count of a variable, or which studies tested a variable below, above or between values." };
  const nums = (pack.schema?.variables ?? []).filter((v): v is NumVariable => v.type === "num");
  const plain = stripAccents(q);
  const mentions = (a: string) => {
    const re = new RegExp(`(?:^|[^\\p{L}\\d_])${escapeRegex(a)}(?=$|[^\\p{L}\\d_])`, "iu");
    return re.test(q) || re.test(plain);
  };
  // The longest alias mentioned wins, so "gravity level" beats "gravity".
  const v = nums
    .map((x) => ({ x, len: Math.max(0, ...getAliases(x).filter(mentions).map((a) => a.length)) }))
    .filter((m) => m.len > 0)
    .sort((a, b) => b.len - a.len)[0]?.x;
  if (!v) return unsupported;

  const measured = pack.records.flatMap((r) => {
    const x = r.values[v.id];
    return Array.isArray(x) ? [{ r, lo: x[0], hi: x[1] }] : [];
  });
  const unit = v.unit ?? null;

  const between = q.match(new RegExp(`(?:between|entre)\\s*${NUM}${UNIT}\\s*(?:and|y|-)\\s*${NUM}${UNIT}`, "i"));
  let filter: { op: LocalOp; bounds: number[] } | null = null;
  if (between) {
    const a = inVarUnit(between[1], between[2] ?? between[4], v);
    const b = inVarUnit(between[3], between[4] ?? between[2], v);
    filter = { op: "between", bounds: [Math.min(a, b), Math.max(a, b)] };
  } else {
    for (const [op, words] of OPS) {
      const m = q.match(new RegExp(`(?:${words})\\s*${NUM}${UNIT}`, "i"));
      if (m) {
        filter = { op, bounds: [inVarUnit(m[1], m[2], v)] };
        break;
      }
    }
  }

  if (filter) {
    const [a, b] = filter.bounds;
    // A record counts when any part of its tested range meets the condition.
    const hit = measured.filter(({ lo, hi }) =>
      filter!.op === "<" ? lo < a : filter!.op === "<=" ? lo <= a : filter!.op === ">" ? hi > a : filter!.op === ">=" ? hi >= a : lo <= b && hi >= a,
    );
    return {
      kind: "filter", variable: v.id, op: filter.op, bounds: filter.bounds, unit,
      studies: [...new Set(hit.map((h) => h.r.study))],
      records: hit.map((h) => h.r.id),
    };
  }

  const stat = STATS.find(([, re]) => re.test(q))?.[0];
  if (!stat || measured.length === 0) return stat ? { kind: "stat", variable: v.id, stat, value: 0, unit, n: 0, records: [] } : unsupported;
  if (stat === "count") return { kind: "stat", variable: v.id, stat, value: measured.length, unit, n: measured.length, records: measured.map((m) => m.r.id) };
  if (stat === "mean") {
    const mean = measured.reduce((s, m) => s + (m.lo + m.hi) / 2, 0) / measured.length;
    return { kind: "stat", variable: v.id, stat, value: Math.round(mean * 1e6) / 1e6, unit, n: measured.length, records: measured.map((m) => m.r.id) };
  }
  const value = stat === "max" ? Math.max(...measured.map((m) => m.hi)) : Math.min(...measured.map((m) => m.lo));
  const at = measured.filter((m) => (stat === "max" ? m.hi : m.lo) === value).map((m) => m.r.id);
  return { kind: "stat", variable: v.id, stat, value, unit, n: measured.length, records: at };
}
