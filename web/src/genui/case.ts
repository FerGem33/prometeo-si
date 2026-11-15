/** The user's case: up to MAX_CASE_VARIABLES selected variables and their values (owner: S2). STUB from F0. */
import type { Scenario } from "../engine";
import { MAX_CASE_VARIABLES } from "./types";
import type { CaseState } from "./types";

export function toggleVariable(c: CaseState, id: string): { next: CaseState; error?: "limit" } {
  if (c.selected.includes(id)) {
    const values = { ...c.values };
    delete values[id];
    return { next: { selected: c.selected.filter((x) => x !== id), values } };
  }
  if (c.selected.length >= MAX_CASE_VARIABLES) return { next: c, error: "limit" };
  return { next: { ...c, selected: [...c.selected, id] } };
}

export function setValue(c: CaseState, id: string, v: number | string | undefined): CaseState {
  const values = { ...c.values };
  if (v === undefined) delete values[id];
  else values[id] = v;
  return { ...c, values };
}

export function caseToScenario(c: CaseState): Scenario | null {
  const active = c.selected.filter((id) => c.values[id] !== undefined);
  if (!active.length) return null;
  const values: Scenario["values"] = {};
  for (const id of active) values[id] = c.values[id];
  return { values, active };
}
