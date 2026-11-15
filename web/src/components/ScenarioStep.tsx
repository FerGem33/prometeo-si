import { useMemo, useRef, useState } from "react";
import { evidenceLevels } from "../engine";
import type { Scenario } from "../engine";
import { useData } from "./ctx";
import { LevelTag } from "./ScenarioPanel";
import { num, scenarioValueText } from "../report/format";
import { NumField } from "./NumField";
import type { Extra } from "../state";
import { AddExtra, EXTRA_BASIS, ExtraTag } from "./ExtraVars";
import { allHabitatPresets, HabitatFigure, habitatScenario, matchingHabitatPreset } from "./HabitatFigure";
import { NASA_MISSION_PRESETS } from "./presets";
import { Prefs } from "./Prefs";
import { t, many } from "../i18n";

const STEPS = ["Documents", "Question", "Setting", "Variables"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Four-step form: documents, question, setting (with animated isometric habitats), variables. The corpus comes first because the variables are read from it. */
export function ScenarioStep({
  scenario,
  onChange,
  extras,
  onExtras,
  goal,
  onGoal,
  onBack,
  onRun,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  extras: Extra[];
  onExtras: (e: Extra[]) => void;
  goal: string;
  onGoal: (g: string) => void;
  onBack: () => void;
  onRun: (fileCount?: number) => void;
}) {
  const { pack, lens } = useData();
  const [step, setStep] = useState(0);
  const [stagedFiles, setStagedFiles] = useState<{ name: string; size: number }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const presets = useMemo(() => allHabitatPresets(lens), [lens]);
  const preset = matchingHabitatPreset(lens, scenario);
  const levels = useMemo(() => evidenceLevels(pack, lens, scenario), [pack, lens, scenario]);
  const s = pack.meta.stats;

  const cats = useMemo(() => {
    const out: Record<string, { value: string; n: number }[]> = {};
    for (const v of pack.schema.variables) {
      if (v.type !== "cat") continue;
      const c = new Map<string, number>();
      for (const r of pack.records) {
        const x = r.values[v.id];
        if (typeof x === "string" && r.kind === "test") c.set(x, (c.get(x) ?? 0) + 1);
      }
      out[v.id] = [...c]
        .map(([value, n]) => ({ value, n }))
        .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
    }
    return out;
  }, [pack]);

  const set = (id: string, x: number | string) =>
    onChange({ ...scenario, values: { ...scenario.values, [id]: x } });
  const add = (id: string) => {
    const v = vars.find((x) => x.id === id)!;
    const values = { ...scenario.values };
    if (values[id] === undefined || values[id] === "")
      values[id] = v.type === "num" ? (v.range[0] + v.range[1]) / 2 : (cats[id]?.[0]?.value ?? "");
    onChange({
      ...scenario,
      active: vars.map((x) => x.id).filter((a) => a === id || scenario.active.includes(a)),
      values,
    });
  };
  const remove = (id: string) =>
    onChange({ ...scenario, active: scenario.active.filter((a) => a !== id) });
  const included = vars.filter((v) => scenario.active.includes(v.id));
  const available = vars.filter((v) => !scenario.active.includes(v.id));
  const last = step === STEPS.length - 1;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list).map((f) => ({ name: f.name, size: f.size }));
    setStagedFiles((prev) => {
      const seen = new Set(prev.map((p) => p.name));
      return [...prev, ...incoming.filter((x) => !seen.has(x.name))];
    });
  };

  return (
    <div className="screen step">
      <header className="screen-bar">
        <span>
          <b>{t("Prometeo")}</b> {t("· New evaluation")}
        </span>
        <span className="bar-links">
          <Prefs />
          <button type="button" className="linkbtn" onClick={onBack}>
          {t("Cancel")}
        </button>
        </span>
      </header>

      <main className="step-main">
        <ol className="stepper" aria-label={t("Progress")}>
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={i === step ? "now" : i < step ? "done" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <button type="button" onClick={() => setStep(i)}>
                <i>{i + 1}</i>
                {t(label)}
              </button>
            </li>
          ))}
        </ol>

        <div className="quick-mission-bar noprint">
          <span className="quick-mission-title">{t("🚀 1-Click NASA Missions:")}</span>
          {NASA_MISSION_PRESETS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="quick-mission-chip"
              onClick={() => {
                onChange({
                  values: { ...m.scenario },
                  active: ["o2", "p", ...(m.scenario.flow !== undefined ? ["flow"] : []), "material"],
                });
              }}
            >
              <span className="chip-badge">{m.badge.split(" ")[0]}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>

        {STEPS[step] === "Setting" && (
          <section className="step-panel">
            <h1>{t("Where is this scenario set?")}</h1>
            <p className="step-lede">
              {t("Pick a starting point. Each setting loads its own conditions, and you can change every one of them in the next step.")}
            </p>

            <div className="choices choices-iso">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="choice choice-iso"
                  aria-pressed={preset === p.id}
                  onClick={() => onChange(habitatScenario(lens, p.id))}
                >
                  <div className="choice-fig-wrap">
                    <HabitatFigure name={p.id} size="md" />
                  </div>
                  <b>{p.label}</b>
                  <span>{p.blurb}</span>
                  <small>
                    {p.active
                      .map((id) => `${vars.find((v) => v.id === id)?.label ?? id} ${scenarioValueText(pack, id, p.values[id])}`)
                      .join(" · ")}
                  </small>
                </button>
              ))}
              <button
                type="button"
                className="choice choice-iso"
                aria-pressed={preset === ""}
                onClick={() => {
                  onChange({ values: {}, active: [] });
                  setStep(STEPS.indexOf("Variables"));
                }}
              >
                <div className="choice-fig-wrap">
                  <HabitatFigure name="custom" size="md" />
                </div>
                <b>{t("Custom")}</b>
                <span>{t("Start with an open control bench and add the variables you need.")}</span>
                <small>{t("Manual variable selection · Full corpus comparison")}</small>
              </button>
            </div>
          </section>
        )}

        {STEPS[step] === "Variables" && (
          <section className="step-panel">
            <div className="step-head-with-iso">
              <div>
                <h1>{t("Choose your variables")}</h1>
                <p className="step-lede">
                  {t("Remove the ones that do not apply, change their values, or add another. A variable left out is not compared at all. These are the variables the corpus of step 1 records. You can also add one of your own: no document of this corpus records it, so it stays in your scenario marked as not in this corpus.")}
                </p>
              </div>
              <div className="step-mini-iso" aria-hidden="true">
                <HabitatFigure name={preset || "custom"} size="lg" />
                <span>{presets.find((p) => p.id === preset)?.label ?? t("Custom bench")}</span>
              </div>
            </div>
            {included.length === 0 && extras.length === 0 && (
              <p className="empty">{t("No variable is included yet. Add one below.")}</p>
            )}
            <ul className="vlist">
              {included.map((v) => {
                const x = scenario.values[v.id];
                const lv = levels.find((l) => l.variable === v.id);
                return (
                  <li key={v.id} className="vrow">
                    <div className="vrow-head">
                      <b>{v.long ?? v.label}</b>
                      {v.type === "num" && <small>{v.unit}</small>}
                      {lv && <LevelTag level={lv.level} />}
                      <button
                        type="button"
                        className="rm"
                        onClick={() => remove(v.id)}
                        aria-label={t("Remove {0}", v.long ?? v.label)}
                      >
                        {t("Remove")}
                      </button>
                    </div>
                    {v.type === "num" ? (
                      <div className="cond-ctl">
                        <input
                          type="range"
                          aria-label={v.label}
                          min={v.range[0]}
                          max={v.range[1]}
                          step={v.step ?? (v.range[1] - v.range[0]) / 100}
                          value={typeof x === "number" ? x : v.range[0]}
                          onChange={(e) => set(v.id, Number(e.target.value))}
                        />
                        <NumField label={t("{0} value", v.label)} min={v.range[0]} max={v.range[1]} step={v.step} value={typeof x === "number" ? x : undefined} onCommit={(n) => set(v.id, n)} />
                        {typeof x === "number" && v.display_units?.[0] && (
                          <span className="alt">
                            = {num(x * v.display_units[0].factor, 1)} {v.display_units[0].unit}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="cond-ctl">
                        <select
                          aria-label={v.label}
                          value={typeof x === "string" ? x : ""}
                          onChange={(e) => set(v.id, e.target.value)}
                        >
                          {typeof x === "string" && x !== "" && !cats[v.id].some((o) => o.value === x) && (
                            <option value={x}>{x} {t("· 0 tests")}</option>
                          )}
                          {cats[v.id].map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.value} · {o.n} {t("tests")}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </li>
                );
              })}
              {extras.map((e) => (
                <li key={e.id} className="vrow">
                  <div className="vrow-head">
                    <b>{e.name}</b>
                    {e.unit && <small>{e.unit}</small>}
                    <ExtraTag />
                    <button
                      type="button"
                      className="rm"
                      onClick={() => onExtras(extras.filter((o) => o.id !== e.id))}
                      aria-label={t("Remove {0}", e.name)}
                    >
                      {t("Remove")}
                    </button>
                  </div>
                  <div className="cond-ctl">
                    <input
                      type="text"
                      className="xval"
                      aria-label={t("{0} value", e.name)}
                      maxLength={40}
                      value={e.value}
                      onChange={(ev) =>
                        onExtras(extras.map((o) => (o.id === e.id ? { ...o, value: ev.target.value } : o)))
                      }
                    />
                    <span className="alt">{t(EXTRA_BASIS)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {available.length > 0 && (
              <div className="addvars">
                <span>{t("Add a variable")}</span>
                {available.map((v) => (
                  <button key={v.id} type="button" className="chip add" onClick={() => add(v.id)}>
                    + {v.long ?? v.label}
                  </button>
                ))}
              </div>
            )}
            <div className="addvars">
              <AddExtra
                known={vars.flatMap((v) => [v.label, v.long ?? v.label].map((label) => ({ id: v.id, label })))}
                onKnown={(id) => {
                  if (!scenario.active.includes(id)) add(id);
                }}
                onAdd={(e) => onExtras([...extras, e])}
              />
            </div>
          </section>
        )}

        {STEPS[step] === "Question" && (
          <section className="step-panel">
            <h1>{t("What do you want to know?")}</h1>
            <p className="step-lede">
              {t("Write your question or goal in your own words. It is optional; it appears at the top of the report. The levels and the ranking depend only on the conditions you set, never on this text.")}
            </p>
            <label htmlFor="goal" className="fieldlbl">
              {t("Your question or goal")}
            </label>
            <textarea
              id="goal"
              className="goal"
              rows={4}
              maxLength={400}
              value={goal}
              onChange={(e) => onGoal(e.target.value)}
              placeholder={t("Example: is there enough evidence to choose this material for the setting above?")}
            />
            {(lens.questions?.length ?? 0) > 0 && (
              <div className="addvars">
                <span>{t("Examples")}</span>
                {lens.questions!.slice(0, 3).map((q) => (
                  <button key={q} type="button" className="chip" onClick={() => onGoal(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {STEPS[step] === "Documents" && (
          <section className="step-panel">
            <h1>{t("Your documents")}</h1>
            <p className="step-lede">
              {t("Everything starts from a corpus of papers and tables: the variables you can compare are the ones those documents record. This demo ships with one corpus, already processed and reviewed, and you can stage local files to inspect how document ingestion accompanies the harmonization step.")}
            </p>
            <div className="corpus">
              <div>
                <b>{t("Example corpus")}</b>
                <span>
                  {lens.byline}: {pack.studies.length} {many(lens.unit_of_study ?? "study")},{" "}
                  {(s.tests ?? 0).toLocaleString("en-US")} {t("individual {0}", lens.subject ?? t("tests"))},{" "}
                  {s.publications ?? 0} {t("linked publications.")}
                </span>
              </div>
              <em>{t("Included")}</em>
            </div>
            <div
              className={`drop drop-interactive ${dragOver ? "dragover" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.xlsx,.xls,.json,.txt"
                style={{ display: "none" }}
                onChange={(e) => addFiles(e.target.files)}
              />
              <b>{t("Stage your own papers and tables")}</b>
              <span>
                {t("Drop PDF, CSV, Excel or JSON tables here (or click to browse). Prometeo stages them alongside the")} {pack.studies.length}{t("-study NASA PSI reference pack.")}
              </span>
              <em>{stagedFiles.length > 0 ? t("{0} file(s) staged", stagedFiles.length) : t("Browse or drop files")}</em>
            </div>
            {stagedFiles.length > 0 && (
              <ul className="staged-files" aria-label={t("Staged files")}>
                {stagedFiles.map((f) => (
                  <li key={f.name}>
                    <span>
                      <b>{f.name}</b> <small>({formatSize(f.size)})</small>
                    </span>
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => setStagedFiles((prev) => prev.filter((x) => x.name !== f.name))}
                    >
                      {t("Remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="step-actions">
          <button
            type="button"
            className="ghostbtn"
            onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
          >
            {step === 0 ? t("Back to start") : t("Back")}
          </button>
          {!last ? (
            <button type="button" className="cta" onClick={() => setStep(step + 1)}>
              {t("Continue")}
            </button>
          ) : (
            <button
              type="button"
              className="cta"
              disabled={included.length === 0}
              onClick={() => onRun(stagedFiles.length)}
            >
              {t("Compare against the evidence")}
            </button>
          )}
        </div>
      </main>
      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
