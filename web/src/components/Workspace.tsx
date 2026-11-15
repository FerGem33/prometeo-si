import { useRef, useState } from "react";
import type { Scenario } from "../engine";
import type { Axes, Extra } from "../state";
import { useData } from "./ctx";
import { createProject, deleteProject, duplicateProject, formatDate, listProjects, renameProject, saveExploration } from "../report/workspace";
import type { Project, Result, SavedExploration } from "../report/workspace";
import { count, t, tx } from "../i18n";
import { Prefs } from "./Prefs";

const NEW = "__new__";
const WARN = tx("This browser refused to store the change (private mode, full or blocked storage). It was not saved.");

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
          <b>{t("Prometeo")}</b> {t("· Workspace")}
        </span>
        <span className="bar-links">
          <Prefs />
          <button type="button" className="linkbtn" onClick={onBack}>
          {t("Back")}
        </button>
        </span>
      </header>
      <main className="ws-main">
        <div className="ws-intro">
          <h1>{t("Your projects")}</h1>
          <p className="ws-note">
            {t("Projects are saved only in this browser. There are no accounts and no sync: clearing site data, or opening Prometeo on another device, will not bring them back. Each project refers to the example evidence pack (")}{pack.meta.id}).
          </p>
          {warn && (
            <p className="ws-warn" role="alert">
              {t(WARN)}
            </p>
          )}
        </div>

        <div className="ws-cols">
          <aside className="ws-side" aria-label={t("Saved projects")}>
            <h2>{t("Saved projects (")}{projects.length})</h2>
            {projects.length === 0 && <p className="ws-empty">{t("No projects yet. Create one with the form, or save an exploration from the report.")}</p>}
            <ul className="ws-list">
              {projects.map((p) => {
                const e = edit?.id === p.id ? edit : null;
                return (
                  <li key={p.id}>
                    <div className="ws-head">
                      <b>{p.name}</b>
                      <span className="ws-meta">
                        {count(p.explorations.length, "saved scenario")} {t("· modified")} {formatDate(p.modifiedAt)}
                      </span>
                    </div>
                    <p className="ws-intent">{p.intent || t("No intention written.")}</p>
                    {p.packId !== pack.meta.id && <p className="ws-warn">{t("This project was made with a different evidence pack (")}{p.packId || t("unknown")}{t("); it will open against")} {pack.meta.id}.</p>}
                    {!e && (
                      <div className="ws-actions">
                        <button type="button" className="chip accent" onClick={() => onOpen(p, p.explorations[p.explorations.length - 1] ?? null)}>
                          {t("Open")}
                        </button>
                        <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "rename", text: p.name })}>
                          {t("Rename")}
                        </button>
                        <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "duplicate", text: p.intent })}>
                          {t("Duplicate")}
                        </button>
                        <button type="button" className="chip" onClick={() => setEdit({ id: p.id, mode: "delete", text: "" })}>
                          {t("Delete")}
                        </button>
                      </div>
                    )}
                    {e && e.mode !== "delete" && (
                      <div className="ws-edit">
                        <label>
                          {e.mode === "rename" ? t("New name") : t("Intention for the copy")}
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
                          {e.mode === "rename" ? t("Save name") : t("Create copy")}
                        </button>
                        <button type="button" className="chip" onClick={() => setEdit(null)}>
                          {t("Cancel")}
                        </button>
                      </div>
                    )}
                    {e && e.mode === "delete" && (
                      <div className="ws-edit">
                        <span>{t("Delete “")}{p.name}{t("” and its saved scenarios from this browser? This cannot be undone.")}</span>
                        <button
                          type="button"
                          className="chip ws-danger"
                          onClick={() => {
                            apply(deleteProject(p.id));
                            setEdit(null);
                          }}
                        >
                          {t("Delete permanently")}
                        </button>
                        <button type="button" className="chip" onClick={() => setEdit(null)}>
                          {t("Keep project")}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="ws-form">
            <section className="ws-new">
              <h2>{t("New project")}</h2>
              <label>
                {t("Name")}
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </label>
              <label>
                {t("Intention")}
                <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={3} maxLength={600} />
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
                {t("Create project")}
              </button>
            </section>

            <section className="ws-upload">
              <h2>{t("Your own papers")}</h2>
              <button type="button" className="ghostbtn" disabled aria-describedby="ws-upload-why">
                {t("Upload papers")}
              </button>
              <p id="ws-upload-why">{t("Uploading your own papers needs the server pipeline, which is not built yet.")}</p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** "Save to workspace" in the report bar: opens a dialog that stores the current scenario and axes in a local project. */
export function SaveExploration({ packId, scenario, axes, extras, goal, projectId, summary }: {
  packId: string; scenario: Scenario; axes: Axes; extras: Extra[]; goal: string; projectId: string | null; summary: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [target, setTarget] = useState(NEW);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const start = () => {
    const l = listProjects();
    setProjects(l);
    setTarget(projectId && l.some((p) => p.id === projectId) ? projectId : l[0]?.id ?? NEW);
    setName("");
    setFailed(false);
    setSaved(null);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const save = () => {
    let id = target;
    if (target === NEW) {
      const c = createProject(name, goal, packId);
      if (!c.ok || !c.project) return setFailed(true);
      id = c.project.id;
    }
    const r = saveExploration(id, scenario, axes, undefined, extras);
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setSaved(r.project?.name ?? "");
  };

  return (
    <>
      <button type="button" className="chip accent noprint" onClick={start}>
        {t("Save to workspace")}
      </button>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="save-title"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!saved) save();
          }}
        >
          <h2 id="save-title">{t("Save this exploration")}</h2>
          {saved !== null ? (
            <>
              <p role="status">{t("Saved to “")}{saved}{t("”. It is stored in this browser only; open it again from the Workspace.")}</p>
              <div className="modal-actions">
                <button type="button" className="cta" onClick={close}>
                  {t("Done")}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-note">{t("The scenario below and the axes of Figure 1 are stored in a project. Projects live in this browser only: no account, no server, no sync.")}</p>
              <p className="modal-what">{summary || t("No variable is included in the scenario.")}</p>
              <label>
                {t("Project")}
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value={NEW}>{t("New project…")}</option>
                </select>
              </label>
              {target === NEW && (
                <label>
                  {t("Name of the new project")}
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
                </label>
              )}
              {failed && (
                <p className="ws-warn" role="alert">
                  {t(WARN)}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="ghostbtn" onClick={close}>
                  {t("Cancel")}
                </button>
                <button type="submit" className="cta" disabled={target === NEW && !name.trim()}>
                  {t("Save")}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
