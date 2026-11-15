import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Lens, Pack } from "../engine";
import { compileUiBlueprint } from "../ingest/blueprint";
import { variablesFromPack } from "../ingest/relevance";
import { DataCtx, type Mapping } from "./ctx";
import { PurposeModules } from "./PurposeModules";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf8")) as Lens;
const mapping = JSON.parse(readFileSync("public/demo/mapping.json", "utf8")) as Mapping;
const vars = variablesFromPack(pack).map(v => ({ ...v, include: ["o2", "p", "material"].includes(v.id) }));

describe("purpose module rendering", () => {
  it("renders only selected case fields with empty values and a confirmation step for notes", () => {
    const blueprint = compileUiBlueprint("Compare conditions for my case", [], vars);
    const html = renderToStaticMarkup(createElement(DataCtx.Provider, { value: { pack, lens, mapping } },
      createElement(PurposeModules, { blueprint, scenario: { values: {}, active: [] },
        onChange: () => { throw new Error("Rendering must never apply conditions"); } })));
    const values = [...html.matchAll(/<input[^>]*value="([^"]*)"/g)].map(m => m[1]);
    expect(values).toHaveLength(3);
    expect(values.every(v => v === "")).toBe(true);
    expect(html).not.toContain('id="case-scenario_input-flow"');
    expect(html).toContain("Compare confirmed conditions");
    expect(html).toContain("Interpret conditions locally");
    expect(html).not.toContain("Confirm and apply these conditions");
    expect(html).toContain("Template-based source summaries");
  });
});
