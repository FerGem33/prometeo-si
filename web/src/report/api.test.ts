import { describe, expect, it } from "vitest";
import packJson from "../../public/demo/pack.json";
import type { Finding, Pack } from "../engine";
import { parseAnalysis, parseAsk } from "./api";
const pack = packJson as Pack;

describe("API response validation", () => {
  it("accepts the real scenario query", () => {
    expect(parseAsk({ values: { o2: 25, p: .5, material: "Nomex" }, active: ["o2", "p", "material"], filters: {} }, pack)).toEqual({ values: { o2: 25, p: .5, material: "Nomex" }, active: ["o2", "p", "material"] });
  });
  it.each([
    { values: { o2: 999 }, active: ["o2"], filters: {} },
    { values: { material: "Invented" }, active: ["material"], filters: {} },
    { values: { p: .5 }, active: ["o2"], filters: {} },
    { values: { p: .5 }, active: ["p", "p"], filters: {} },
    { values: { p: .5 }, active: ["p"], filters: { arbitrary: true } },
    { values: { p: true }, active: ["p"], filters: {} },
  ])("rejects invalid scenarios", (value) => expect(() => parseAsk(value, pack)).toThrow());
  it("does not display unsupported prose from the model", () => {
    expect(parseAsk({ unsupported: "Untrusted prose" }, pack)).toEqual({ unsupported: "Only scenario changes are supported." });
  });
  const finding: Finding = { id: "never_measured:p", code: "never_measured", level: "attention", variable: "p", params: { n: 268 }, sources: ["PSI-25"], metric: { value: "0 / 268" } };
  it("preserves verified source IDs", () => {
    expect(parseAnalysis({ mode: "ai", sentences: [{ finding: finding.id, text: "Verified sentence.", sources: ["PSI-25"] }], dropped: 0 }, [finding], pack).sentences[0].sources).toEqual(["PSI-25"]);
  });
  it("rejects a real source attached to the wrong finding", () => {
    expect(() => parseAnalysis({ mode: "ai", sentences: [{ finding: finding.id, text: "Wrong citation.", sources: ["PSI-100"] }], dropped: 0 }, [finding], pack)).toThrow();
  });
});
