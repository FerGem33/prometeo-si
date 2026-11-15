import { useState } from "react";
import type { Scenario } from "../engine";
import type { Axes } from "../state";
import { useData } from "./ctx";
import { createProject, deleteProject, duplicateProject, formatDate, listProjects, renameProject, saveExploration } from "../report/workspace";
import type { Project, Result, SavedExploration } from "../report/workspace";

const NEW = "__new__";
const WARN = "This browser refused to store the change (private mode, full or blocked storage). It was not saved.";

/** Local projects screen. Everything is stored in this browser only; there are no accounts and no server. */
export function Workspace({ onBack, onOpen }: { onBack: () => void; onOpen: (p: Project, last: SavedExploration | null) => void }) {
  const { pack } = useData();
  const [projects, setProjects] = useState<Project[]>(() => listProjects());
  const [warn, setWarn] = useState(false);
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [edit, setEdit] = useState<{ id: string; mode: "rename" | "duplicate" | "delete"; text: string } | null>(null);

  const apply = (r: Result) => {
    setProjects(r.projects);
    setWarn(!r.ok);
    return r.ok;
  };

  return (
    <div className="screen workspace">
      <header className="screen-bar">
        <span>
          <b>Prometeo</b> · Workspace
        </span>
        <button type="button" className="linkbtn" onClick={onBack}>
          Back
        </button>
      </header>
      <main className="ws-main">
        <h1>Your projects</h1>
        <p className="ws-note">
          Projects are saved only in this browser. There are no accounts and no sync: clearing site data, or opening Prometeo on another device, will not bring them back. Each project refers to the example evidence pack ({pack.meta.id}).
        </p>
        {warn && (
          <p className="ws-warn" role="alert">
            {WARN}
          </p>
        )}

        <section className="ws-new">
          <h2>New project</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label>
            Intention
            <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={2} maxLength={600} />
          </label>
          <button
            type="button"
            className="cta"
            disabled={!name.trim()}
            onClick={() => {
              if (apply(createProject(name, intent, pack.meta.id))) {
                setName("");
                setIntent("");
              }
            }}
          >
            Create project
          </button>
        </section>

        <section>
          <h2>Saved projects ({projects.length})</h2>
          {projects.length === 0 && <p className="ws-empty">No projects yet. Create one above, or save an exploration from the report.</p>}
          <ul className="ws-list">
            {projects.map((p) => {
              const e = edit?.id === p.id ? edit : null;
              return (
                <li key={p.id}>
                  <div className="ws-head">
                    <b>{p.name}</b>
                    <span className="ws-meta">
                      {p.explorations.length} saved {p.explorations.length === 1 ? "scenario" : "scenarios"} · modified {formatDate(p.modifiedAt)}
                    </span>
                  </div>
                  <p className="ws-intent">{p.intent || "No intention written."}</p>
                  {p.packId !== pack.meta.id && <p className="ws-warn">This project was made with a different evidence pack ({p.packId || "unknown"}); it will open against {pack.meta.id}.</p>}
                  {!e && (
                    <div className="ws-actions">
                      <button type="button" className="chip" onClick={() => onOpen(p, p.explorations[p.explorations.length - 1] ?? null)}>
                        Open
                      </button>
                      <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "rename", text: p.name })}>
                        Rename
                      </button>
                      <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "duplicate", text: p.intent })}>
                        Duplicate
                      </button>
                      <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "delete", text: "" })}>
                        Delete
                      </button>
                    </div>
                  )}
                  {e && e.mode !== "delete" && (
                    <div className="ws-edit">
                      <label>
                        {e.mode === "rename" ? "New name" : "Intention for the copy"}
                        <input value={e.text} onChange={(ev) => setEdit({ ...e, text: ev.target.value })} maxLength={e.mode === "rename" ? 120 : 600} />
                      </label>
                      <button
                        type="button"
                        className="chip"
                        disabled={e.mode === "rename" && !e.text.trim()}
                        onClick={() => {
                          if (apply(e.mode === "rename" ? renameProject(p.id, e.text) : duplicateProject(p.id, e.text))) setEdit(null);
                        }}
                      >
                        {e.mode === "rename" ? "Save name" : "Create copy"}
                      </button>
                      <button type="button" className="chip" onClick={() => setEdit(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                  {e && e.mode === "delete" && (
                    <div className="ws-edit">
                      <span>Delete “{p.name}” and its saved scenarios from this browser? This cannot be undone.</span>
                      <button
                        type="button"
                        className="chip ws-danger"
                        onClick={() => {
                          apply(deleteProject(p.id));
                          setEdit(null);
                        }}
                      >
                        Delete permanently
                      </button>
                      <button type="button" className="chip" onClick={() => setEdit(null)}>
                        Keep project
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="ws-upload">
          <h2>Your own papers</h2>
          <button type="button" className="ghostbtn" disabled aria-describedby="ws-upload-why">
            Upload papers
          </button>
          <p id="ws-upload-why">Uploading your own papers needs the server pipeline, which is not built yet.</p>
        </section>
      </main>
    </div>
  );
}

/** "Save this exploration" control for the report bar: stores the current scenario and axes in a local project. */
export function SaveExploration({ packId, scenario, axes, goal, projectId }: { packId: string; scenario: Scenario; axes: Axes; goal: string; projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [target, setTarget] = useState(NEW);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  const start = () => {
    const l = listProjects();
    setProjects(l);
    setTarget(projectId && l.some((p) => p.id === projectId) ? projectId : l[0]?.id ?? NEW);
    setName("");
    setMsg(null);
    setOpen(true);
  };
  const save = () => {
    let id = target;
    if (target === NEW) {
      const c = createProject(name, goal, packId);
      if (!c.ok || !c.project) return setMsg({ text: WARN, bad: true });
      id = c.project.id;
    }
    const r = saveExploration(id, scenario, axes);
    if (!r.ok) return setMsg({ text: WARN, bad: true });
    setOpen(false);
    setMsg({ text: `Saved to “${r.project?.name}” in this browser only.`, bad: false });
  };

  return (
    <span className="ws-save noprint">
      {!open && (
        <button type="button" className="chip" onClick={start}>
          Save this exploration
        </button>
      )}
      {open && (
        <span className="ws-edit">
          <label>
            Project
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={NEW}>New project…</option>
            </select>
          </label>
          {target === NEW && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
          )}
          <button type="button" className="chip" disabled={target === NEW && !name.trim()} onClick={save}>
            Save
          </button>
          <button type="button" className="chip" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </span>
      )}
      {msg && (
        <span className={msg.bad ? "ws-warn" : "ws-ok"} role={msg.bad ? "alert" : "status"}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
