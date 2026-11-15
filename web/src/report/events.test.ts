// Keeps api/events/analysis_lunar.json (used by the API tests) identical to what the page sends for the
// default preset. Regenerate with: WRITE_EVENTS=1 npm test
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { evidenceLevels, findings } from "../engine";
import type { Lens, Pack } from "../engine";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const lens = JSON.parse(readFileSync("public/demo/lens.json", "utf-8")) as Lens;

test("sample /analysis event for the default preset matches the engine output", () => {
  const p = lens.presets.find((x) => x.id === lens.default_preset)!;
  const scenario = { values: p.values, active: p.active };
  const body = { scenario, levels: evidenceLevels(pack, lens, scenario), findings: findings(pack, lens, scenario) };
  const file = "../api/events/analysis_lunar.json";
  const text = JSON.stringify(body, null, 1) + "\n";
  if (process.env.WRITE_EVENTS || !existsSync(file)) writeFileSync(file, text);
  expect(readFileSync(file, "utf-8")).toBe(text);
});
