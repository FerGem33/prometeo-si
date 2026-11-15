import { describe, expect, it } from "vitest";
import { caseToScenario, setValue, toggleVariable } from "./case";
import { MAX_CASE_VARIABLES } from "./types";
import type { CaseState } from "./types";

const ids = Array.from({ length: MAX_CASE_VARIABLES + 1 }, (_, i) => `v${i + 1}`);
const empty: CaseState = { selected: [], values: {} };

function fill(n: number): CaseState {
  return ids.slice(0, n).reduce((c, id) => toggleVariable(c, id).next, empty);
}

describe("case", () => {
  it("allows 10 variables and rejects the 11th with limit, leaving the state unchanged", () => {
    const full = fill(MAX_CASE_VARIABLES);
    expect(full.selected).toHaveLength(10);
    const r = toggleVariable(full, ids[10]);
    expect(r.error).toBe("limit");
    expect(r.next).toBe(full);
  });

  it("removing a variable clears its value and frees a slot", () => {
    let c = fill(MAX_CASE_VARIABLES);
    c = setValue(c, "v1", 21);
    c = setValue(c, "v2", "gas");
    const r = toggleVariable(c, "v1");
    expect(r.error).toBeUndefined();
    expect(r.next.selected).not.toContain("v1");
    expect("v1" in r.next.values).toBe(false);
    expect(r.next.values.v2).toBe("gas");
    expect(toggleVariable(r.next, ids[10]).error).toBeUndefined();
  });

  it("setValue with undefined clears the value", () => {
    const c = setValue(setValue(fill(2), "v1", 5), "v1", undefined);
    expect("v1" in c.values).toBe(false);
  });

  it("caseToScenario is null without values", () => {
    expect(caseToScenario(fill(3))).toBeNull();
    expect(caseToScenario(empty)).toBeNull();
  });

  it("uses only selected variables that have a value, in selection order, deterministically", () => {
    let c = fill(4);
    c = setValue(c, "v3", 30);
    c = setValue(c, "v1", "gas");
    c = setValue(c, "ghost", 1);
    const s = caseToScenario(c);
    expect(s).toEqual({ values: { v3: 30, v1: "gas" }, active: ["v1", "v3"] });
    expect(caseToScenario(c)).toEqual(s);
  });
});
