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
  pack: Pack
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
        if (matchedUnit && numVar.unit) {
          const conv = getConversion(matchedUnit, numVar.unit);
          if (conv) {
            finalNum = applyConversion(finalNum, conv);
          }
        }

        // Clamp to variable range
        if (Array.isArray(numVar.range) && numVar.range.length === 2) {
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
      if (m) {
        const candidate = m[1].trim();
        const matchedKnown = known.find(
          (k) => k.toLowerCase() === candidate.toLowerCase()
        );
        if (matchedKnown) {
          values[catVar.id] = matchedKnown;
        } else if (known.length === 0) {
          values[catVar.id] = candidate;
        }
      } else {
        // Direct mention of a known category along with variable name anywhere
        for (const k of known) {
          const kPattern = new RegExp(`\\b${escapeRegex(k)}\\b`, "i");
          const vPattern = new RegExp(`\\b(?:${aliasRegexPart})\\b`, "i");
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
