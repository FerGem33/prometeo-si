import { beforeEach, describe, expect, it } from "vitest";
import { createProject, deleteProject, duplicateProject, listProjects, renameProject, sanitize, saveExploration } from "./workspace";
import { createMemoryCustomStore } from "./customStore";
import type { EvaluationDraft } from "../components/ScenarioStep";

function mockStorage(failWrites = false) {
  const m = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (failWrites) throw new Error("quota");
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    },
  };
  return m;
}
const sc = { values: { a: 1 }, active: ["a"] };
const ax = { x: "a", y: "b" };
const d = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n));

describe("workspace", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = mockStorage();
  });

  it("creates, saves explorations and lists by modified date", () => {
    const a = createProject("A", "goal a", "pk", d(1)).project!;
    createProject("B", "", "pk", d(2));
    expect(listProjects().map((p) => p.name)).toEqual(["B", "A"]);
    saveExploration(a.id, sc, ax, d(3));
    const l = listProjects();
    expect(l[0].id).toBe(a.id);
    expect(l[0].explorations).toHaveLength(1);
    expect(l[0].packId).toBe("pk");
  });

  it("renames", () => {
    const a = createProject("A", "", "pk", d(1)).project!;
    renameProject(a.id, "  New  ", d(2));
    expect(listProjects()[0].name).toBe("New");
  });

  it("duplicates with another intent and independent ids", () => {
    const a = createProject("A", "one", "pk", d(1)).project!;
    saveExploration(a.id, sc, ax, d(2));
    const c = duplicateProject(a.id, "two", d(3)).project!;
    expect(c.intent).toBe("two");
    expect(c.id).not.toBe(a.id);
    expect(c.explorations).toHaveLength(1);
    expect(listProjects()).toHaveLength(2);
    expect(listProjects().find((p) => p.id === a.id)!.intent).toBe("one");
  });

  it("deletes", () => {
    const a = createProject("A", "", "pk").project!;
    expect(deleteProject(a.id).projects).toHaveLength(0);
    expect(listProjects()).toHaveLength(0);
  });

  it("survives corrupt storage", () => {
    store.set("prometeo:v1:workspace", "{not json");
    expect(listProjects()).toEqual([]);
    store.set("prometeo:v1:workspace", JSON.stringify([1, null, { id: "x", name: "ok", explorations: [{ bad: true }] }, { id: 2 }]));
    const l = listProjects();
    expect(l).toHaveLength(1);
    expect(l[0].explorations).toEqual([]);
    expect(createProject("N", "", "pk").ok).toBe(true);
  });

  it("reports failed writes", () => {
    mockStorage(true);
    expect(createProject("A", "", "pk").ok).toBe(false);
  });
});

describe("custom evaluations in the workspace", () => {
  beforeEach(() => {
    mockStorage();
  });

  it("keeps the reference to a custom evaluation and drops a malformed one", () => {
    const p = createProject("Mine", "", "custom_pack").project!;
    saveExploration(p.id, sc, ax, d(1), [], { id: "eval-1", title: "Batch", docs: 23, variables: 135 });
    const ex = listProjects()[0].explorations[0];
    expect(ex.custom).toEqual({ id: "eval-1", title: "Batch", docs: 23, variables: 135 });
    expect(sanitize([{ id: "p", name: "n", explorations: [{ id: "e", scenario: sc, axes: ax, custom: { title: "no id" } }] }])[0].explorations[0].custom).toBeUndefined();
  });

  it("stores and returns a custom draft in the memory fallback store", async () => {
    const store = createMemoryCustomStore();
    const draft = { isCustomCorpus: true } as unknown as EvaluationDraft;
    await store.save({ id: "eval-1", savedAt: "2026-11-15T00:00:00Z", draft });
    expect(await store.list()).toEqual(["eval-1"]);
    expect((await store.get("eval-1"))?.draft).toBe(draft);
    expect(await store.get("missing")).toBeNull();
  });
});
