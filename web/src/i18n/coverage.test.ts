// Every sentence the interface passes to t(), tx(), count() or plural() has a Spanish entry, and every
// placeholder of the English sentence survives in the translation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ES } from "./es";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return /^(engine|iso|contracts|i18n)$/.test(f) ? [] : sources(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

const KEY = /(?<![\w.])(?:t|tx|count|plural)\(\s*(?:[\w.?! ()]+,\s*)?("(?:[^"\\]|\\.)*")/g;
const keys = new Set<string>();
for (const file of sources("src")) for (const m of readFileSync(file, "utf-8").matchAll(KEY)) keys.add(JSON.parse(m[1]) as string);

test("every interface sentence has a Spanish translation", () => {
  expect([...keys].filter((k) => !(k in ES))).toEqual([]);
});

test("translations keep the placeholders of the English sentence", () => {
  const holes = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
  expect(Object.keys(ES).filter((k) => holes(k) !== holes(ES[k]))).toEqual([]);
});
