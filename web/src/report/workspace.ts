import type { Scenario } from "../engine";
import { loadJson, newId, saveJson } from "./storage";
import { cleanExtras } from "../state";
import type { Axes, Extra } from "../state";

/** Browser-local projects. No accounts, no server: everything lives in this browser's storage. */
export type SavedExploration = { id: string; savedAt: string; scenario: Scenario; axes: Axes; extras?: Extra[] };
export type Project = {
  id: string;
  name: string;
  intent: string;
  packId: string;
  explorations: SavedExploration[];
  createdAt: string;
  modifiedAt: string;
};
export type Result = { ok: boolean; projects: Project[]; project?: Project };

const KEY = "workspace";
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function cleanExploration(x: unknown): SavedExploration | null {
  if (!isObj(x) || !isObj(x.scenario) || !isObj(x.axes)) return null;
  const sc = x.scenario;
  if (!isObj(sc.values) || !Array.isArray(sc.active)) return null;
  if (typeof x.id !== "string" || typeof x.axes.x !== "string" || typeof x.axes.y !== "string") return null;
  return {
    id: x.id,
    savedAt: typeof x.savedAt === "string" ? x.savedAt : "",
    scenario: { values: sc.values as Scenario["values"], active: sc.active.filter((a): a is string => typeof a === "string") },
    axes: { x: x.axes.x, y: x.axes.y },
    extras: cleanExtras(x.extras),
  };
}

/** Drops anything malformed so corrupt storage never breaks the screen. */
export function sanitize(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return [];
  const out: Project[] = [];
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== "string" || typeof p.name !== "string") continue;
    const ex = Array.isArray(p.explorations) ? p.explorations.map(cleanExploration).filter((e): e is SavedExploration => e !== null) : [];
    out.push({
      id: p.id,
      name: p.name,
      intent: typeof p.intent === "string" ? p.intent : "",
      packId: typeof p.packId === "string" ? p.packId : "",
      explorations: ex,
      createdAt: typeof p.createdAt === "string" ? p.createdAt : "",
      modifiedAt: typeof p.modifiedAt === "string" ? p.modifiedAt : "",
    });
  }
  return out;
}

export function sortByModified(ps: Project[]): Project[] {
  return [...ps].sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0));
}

function all(): Project[] {
  return sanitize(loadJson<unknown>(KEY, []));
}

export function listProjects(): Project[] {
  return sortByModified(all());
}

function commit(next: Project[], project?: Project): Result {
  const ok = saveJson(KEY, next);
  return { ok, projects: sortByModified(next), project };
}

const stamp = (now?: Date) => (now ?? new Date()).toISOString();

export function createProject(name: string, intent: string, packId: string, now?: Date): Result {
  const t = stamp(now);
  const p: Project = { id: newId("proj"), name: name.trim() || "Untitled project", intent: intent.trim(), packId, explorations: [], createdAt: t, modifiedAt: t };
  return commit([...all(), p], p);
}

function update(id: string, fn: (p: Project) => Project): Result {
  const list = all();
  let found: Project | undefined;
  const next = list.map((p) => (p.id === id ? (found = fn(p)) : p));
  if (!found) return { ok: false, projects: sortByModified(list) };
  return commit(next, found);
}

export function renameProject(id: string, name: string, now?: Date): Result {
  return update(id, (p) => ({ ...p, name: name.trim() || p.name, modifiedAt: stamp(now) }));
}

/** Same base (saved explorations, pack), different intent. */
export function duplicateProject(id: string, intent: string, now?: Date): Result {
  const list = all();
  const src = list.find((p) => p.id === id);
  if (!src) return { ok: false, projects: sortByModified(list) };
  const t = stamp(now);
  const copy: Project = {
    ...src,
    id: newId("proj"),
    name: `${src.name} (copy)`,
    intent: intent.trim(),
    explorations: src.explorations.map((e) => ({ ...e, id: newId("exp") })),
    createdAt: t,
    modifiedAt: t,
  };
  return commit([...list, copy], copy);
}

export function deleteProject(id: string): Result {
  return commit(all().filter((p) => p.id !== id));
}

export function saveExploration(id: string, scenario: Scenario, axes: Axes, now?: Date, extras: Extra[] = []): Result {
  const t = stamp(now);
  const e: SavedExploration = { id: newId("exp"), savedAt: t, scenario: { values: { ...scenario.values }, active: [...scenario.active] }, axes: { ...axes }, extras: extras.map((x) => ({ ...x })) };
  return update(id, (p) => ({ ...p, explorations: [...p.explorations, e], modifiedAt: t }));
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown date" : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
