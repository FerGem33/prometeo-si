// Pure comparison of two evidence-level lists computed by the engine. No level is derived here.
import type { EvidenceLevel, VariableEvidence } from "../engine";
import { tx, lazy } from "../i18n";

/** Order of the four engine levels, from best covered to least covered. Used only to tell up from down. */
export const LEVEL_RANK: Record<EvidenceLevel, number> = { studied: 3, scarce: 2, near: 1, not_studied: 0 };

export type LevelChange = {
  variable: string;
  from: EvidenceLevel | null;
  to: EvidenceLevel | null;
  /** up: better covered; down: less covered; added/removed: variable entered or left the scenario */
  direction: "up" | "down" | "added" | "removed";
};

/** Variables whose level changed between two scenarios, in the order of `after` then `before`. */
export function diffLevels(before: VariableEvidence[], after: VariableEvidence[]): LevelChange[] {
  const b = new Map(before.map((l) => [l.variable, l.level]));
  const a = new Map(after.map((l) => [l.variable, l.level]));
  const out: LevelChange[] = [];
  for (const [variable, to] of a) {
    const from = b.get(variable) ?? null;
    if (from === null) out.push({ variable, from, to, direction: "added" });
    else if (from !== to) out.push({ variable, from, to, direction: LEVEL_RANK[to] > LEVEL_RANK[from] ? "up" : "down" });
  }
  for (const [variable, from] of b) if (!a.has(variable)) out.push({ variable, from, to: null, direction: "removed" });
  return out;
}

export const DIRECTION_ARROW: Record<LevelChange["direction"], string> = { up: "▲", down: "▼", added: "+", removed: "−" };
export const DIRECTION_WORD: Record<LevelChange["direction"], string> = lazy({ up: tx("moved up"), down: tx("moved down"), added: tx("added"), removed: tx("removed") });
