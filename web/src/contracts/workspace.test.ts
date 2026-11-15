import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { Pack } from "../engine";
import { createProject, deleteProject, deleteVariant, emptyWorkspace, loadWorkspace, saveVariant, saveWorkspace, WORKSPACE_KEY } from "./workspace";

const pack = JSON.parse(readFileSync("public/demo/pack.json", "utf-8")) as Pack;
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const now = new Date("2026-11-15T06:00:00Z");

test("create a project, save two variants, reload", () => {
  const store = memory();
  let ws = createProject(emptyWorkspace(), { name: "  Habitat study ", intent: "Choose a cabin atmosphere", pack: pack.meta.id }, now);
  const pid = ws.projects[0].id;
  ws = saveVariant(ws, pid, { name: "Lunar base", scenario: { values: { o2: 30, p: 0.694, material: "PMMA" }, active: ["o2", "p", "material"] } }, now);
  ws = saveVariant(ws, pid, { name: "Lower oxygen", scenario: { values: { o2: 25, p: 0.5, material: "Nomex" }, active: ["o2", "p", "material"] } }, now);
  expect(saveWorkspace(store, ws)).toBe(true);
  const back = loadWorkspace(store, pack);
  expect(back).toEqual(ws);
  expect(back.projects[0].name).toBe("Habitat study");
  expect(back.projects[0].variants.map((v) => v.name)).toEqual(["Lunar base", "Lower oxygen"]);
  expect(new Set(back.projects[0].variants.map((v) => v.id)).size).toBe(2);
});

test("saving with an id replaces the variant and keeps its creation time", () => {
  let ws = createProject(emptyWorkspace(), { name: "P", intent: "", pack: pack.meta.id }, now);
  const pid = ws.projects[0].id;
  ws = saveVariant(ws, pid, { name: "A", scenario: { values: { o2: 30 }, active: ["o2"] } }, now);
  const id = ws.projects[0].variants[0].id;
  ws = saveVariant(ws, pid, { id, name: "A2", scenario: { values: { o2: 21 }, active: ["o2"] } }, new Date("2026-11-15T07:00:00Z"));
  expect(ws.projects[0].variants).toHaveLength(1);
  expect(ws.projects[0].variants[0]).toMatchObject({ id, name: "A2", created_at: "2026-11-15T06:00:00.000Z", updated_at: "2026-11-15T07:00:00.000Z" });
  expect(deleteVariant(ws, pid, id).projects[0].variants).toEqual([]);
  expect(deleteProject(ws, pid).projects).toEqual([]);
});

test("malformed or outdated local data is dropped, never thrown", () => {
  const store = memory();
  store.setItem(WORKSPACE_KEY, "{not json");
  expect(loadWorkspace(store, pack)).toEqual(emptyWorkspace());
  store.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, projects: [{ id: "p1", name: "P", intent: "", pack: "x", variants: [
    { id: "v1", name: "ok", scenario: { values: { o2: 30 }, active: ["o2"] } },
    { id: "v2", name: "out of range", scenario: { values: { o2: 900 }, active: ["o2"] } },
    { id: "v3", name: "unknown variable", scenario: { values: { humidity: 1 }, active: ["humidity"] } },
  ] }, { name: "no id" }] }));
  const ws = loadWorkspace(store, pack);
  expect(ws.projects).toHaveLength(1);
  expect(ws.projects[0].variants.map((v) => v.id)).toEqual(["v1"]);
  expect(createProject(emptyWorkspace(), { name: "   ", intent: "", pack: "x" }).projects).toEqual([]);
});
