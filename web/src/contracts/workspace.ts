// Local workspace (block B, T25 and T28): projects and saved proposal variants kept in the browser.
// Contract: docs/CONTRATOS_FASE2.md section 3. Pure functions; the storage is injected so they can be tested.
// This is a local mock of CU-03/CU-04: the interface must always say "Saved in this browser only".
import type { Pack, Scenario } from "../engine";

export const WORKSPACE_KEY = "prometeo.workspace/1";
export const LIMITS = { projects: 20, variantsPerProject: 30, name: 80, intent: 500, note: 300 } as const;

export type Variant = {
  id: string;
  name: string;
  scenario: Scenario;
  axes?: { x: string; y: string };
  note?: string;
  created_at: string; // ISO 8601
  updated_at: string;
};

export type LocalProject = {
  id: string;
  name: string;
  /** what the person wants to decide; free text, never sent anywhere in block B */
  intent: string;
  /** id of the pack the project reads: pack.meta.id. Block B only has the published demo pack. */
  pack: string;
  variants: Variant[];
  created_at: string;
  updated_at: string;
};

export type Workspace = { version: 1; projects: LocalProject[] };

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const emptyWorkspace = (): Workspace => ({ version: 1, projects: [] });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number): x is string => typeof x === "string" && x.length <= max;

/** A stored scenario is kept only if it is still valid for the pack: known variables, numbers in range. */
export function validScenario(pack: Pack, s: unknown): s is Scenario {
  if (!isObject(s) || !isObject(s.values) || !Array.isArray(s.active) || !s.active.every((a) => typeof a === "string")) return false;
  for (const [id, value] of Object.entries(s.values)) {
    const v = pack.schema.variables.find((x) => x.id === id);
    if (!v) return false;
    if (v.type === "num") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < v.range[0] || value > v.range[1]) return false;
    } else if (typeof value !== "string") return false;
  }
  return (s.active as string[]).every((id) => id in (s.values as object));
}

/** Reads the workspace. Anything malformed is dropped silently: local data never breaks the report. */
export function loadWorkspace(store: KeyValueStore, pack: Pack): Workspace {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(WORKSPACE_KEY) ?? "null");
  } catch {
    return emptyWorkspace();
  }
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.projects)) return emptyWorkspace();
  const projects: LocalProject[] = [];
  for (const p of raw.projects.slice(0, LIMITS.projects)) {
    if (!isObject(p) || !text(p.id, 64) || !text(p.name, LIMITS.name) || !text(p.intent, LIMITS.intent) || typeof p.pack !== "string") continue;
    const variants = (Array.isArray(p.variants) ? p.variants : [])
      .filter((v): v is Variant => isObject(v) && text(v.id, 64) && text(v.name, LIMITS.name) && validScenario(pack, v.scenario))
      .slice(0, LIMITS.variantsPerProject);
    projects.push({ ...(p as unknown as LocalProject), variants });
  }
  return { version: 1, projects };
}

export function saveWorkspace(store: KeyValueStore, ws: Workspace): boolean {
  try {
    store.setItem(WORKSPACE_KEY, JSON.stringify(ws));
    return true;
  } catch {
    return false; // quota exceeded or storage disabled: the interface says the change was not saved
  }
}

const stamp = (now: Date) => now.toISOString();
const newId = (prefix: string, now: Date, n: number) => `${prefix}_${now.getTime().toString(36)}${n.toString(36)}`;

export function createProject(ws: Workspace, input: { name: string; intent: string; pack: string }, now = new Date()): Workspace {
  if (ws.projects.length >= LIMITS.projects) return ws;
  const name = input.name.trim().slice(0, LIMITS.name);
  if (!name) return ws;
  const project: LocalProject = { id: newId("p", now, ws.projects.length), name, intent: input.intent.trim().slice(0, LIMITS.intent), pack: input.pack, variants: [], created_at: stamp(now), updated_at: stamp(now) };
  return { ...ws, projects: [...ws.projects, project] };
}

export function deleteProject(ws: Workspace, projectId: string): Workspace {
  return { ...ws, projects: ws.projects.filter((p) => p.id !== projectId) };
}

/** Saves a variant; with `id` it replaces that variant, otherwise it appends a new one. */
export function saveVariant(ws: Workspace, projectId: string, input: { id?: string; name: string; scenario: Scenario; axes?: Variant["axes"]; note?: string }, now = new Date()): Workspace {
  return {
    ...ws,
    projects: ws.projects.map((p) => {
      if (p.id !== projectId) return p;
      const name = input.name.trim().slice(0, LIMITS.name);
      if (!name) return p;
      const existing = input.id ? p.variants.find((v) => v.id === input.id) : undefined;
      if (!existing && p.variants.length >= LIMITS.variantsPerProject) return p;
      const variant: Variant = {
        id: existing?.id ?? newId("v", now, p.variants.length),
        name,
        scenario: { values: { ...input.scenario.values }, active: [...input.scenario.active], ...(input.scenario.sigma ? { sigma: { ...input.scenario.sigma } } : {}) },
        ...(input.axes ? { axes: input.axes } : {}),
        ...(input.note ? { note: input.note.slice(0, LIMITS.note) } : {}),
        created_at: existing?.created_at ?? stamp(now),
        updated_at: stamp(now),
      };
      const variants = existing ? p.variants.map((v) => (v.id === existing.id ? variant : v)) : [...p.variants, variant];
      return { ...p, variants, updated_at: stamp(now) };
    }),
  };
}

export function deleteVariant(ws: Workspace, projectId: string, variantId: string): Workspace {
  return { ...ws, projects: ws.projects.map((p) => (p.id === projectId ? { ...p, variants: p.variants.filter((v) => v.id !== variantId) } : p)) };
}
