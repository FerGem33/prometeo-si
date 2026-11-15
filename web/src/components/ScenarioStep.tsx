import { useMemo, useState } from "react";
import { evidenceLevels } from "../engine";
import type { Scenario } from "../engine";
import { useData } from "./ctx";
import { LevelTag } from "./ScenarioPanel";
import { num, scenarioValueText } from "../report/format";
import { matchingPreset, presetScenario } from "../state";
import type { Extra } from "../state";
import { AddExtra, EXTRA_BASIS, ExtraTag } from "./ExtraVars";

const STEPS = ["Setting", "Variables", "Question", "Documents"];

/** Four-step form: setting, variables, question, documents. One idea per screen. */
export function ScenarioStep({ scenario, onChange, extras, onExtras, goal, onGoal, onBack, onRun }: {
  scenario: Scenario; onChange: (s: Scenario) => void; extras: Extra[]; onExtras: (e: Extra[]) => void; goal: string; onGoal: (g: string) => void; onBack: () => void; onRun: () => void;
}) {
  const { pack, lens } = useData();
  const [step, setStep] = useState(0);
  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const preset = matchingPreset(lens, scenario);
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
      out[v.id] = [...c].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
    }
    return out;
  }, [pack]);

  const set = (id: string, x: number | string) => onChange({ ...scenario, values: { ...scenario.values, [id]: x } });
  const add = (id: string) => {
    const v = vars.find((x) => x.id === id)!;
    const values = { ...scenario.values };
    if (values[id] === undefined || values[id] === "") values[id] = v.type === "num" ? (v.range[0] + v.range[1]) / 2 : cats[id]?.[0]?.value ?? "";
    onChange({ ...scenario, active: vars.map((x) => x.id).filter((a) => a === id || scenario.active.includes(a)), values });
  };
  const remove = (id: string) => onChange({ ...scenario, active: scenario.active.filter((a) => a !== id) });
  const included = vars.filter((v) => scenario.active.includes(v.id));
  const available = vars.filter((v) => !scenario.active.includes(v.id));
  const last = step === STEPS.length - 1;

  return (
    <div className="screen step">
      <header className="screen-bar">
        <span>
          <b>Prometeo</b> · New evaluation
        </span>
        <button type="button" className="linkbtn" onClick={onBack}>
          Cancel
        </button>
      </header>

      <main className="step-main">
        <ol className="stepper" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? "now" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <button type="button" onClick={() => setStep(i)}>
                <i>{i + 1}</i>
                {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="step-panel">
            <h1>Where is this scenario set?</h1>
            <p className="step-lede">Pick a starting point. Each setting loads its own conditions, and you can change every one of them in the next step.</p>
            <div className="choices">
              {lens.presets.map((p) => (
                <button key={p.id} type="button" className="choice" aria-pressed={preset === p.id} onClick={() => onChange(presetScenario(lens, p.id))}>
                  <b>{p.label}</b>
                  <span>{p.blurb}</span>
                  <small>{p.active.map((id) => `${vars.find((v) => v.id === id)?.label ?? id} ${scenarioValueText(pack, id, p.values[id])}`).join(" · ")}</small>
                </button>
              ))}
              <button type="button" className="choice" aria-pressed={preset === ""} onClick={() => { onChange({ values: {}, active: [] }); setStep(1); }}>
                <b>Custom</b>
                <span>Start with no conditions and add the ones you need.</span>
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="step-panel">
            <h1>Choose your variables</h1>
            <p className="step-lede">Remove the ones that do not apply, change their values, or add another. A variable left out is not compared at all. You can also add a variable of your own: it stays in your scenario, marked as not in this corpus.</p>
            {included.length === 0 && extras.length === 0 && <p className="empty">No variable is included yet. Add one below.</p>}
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
                      <button type="button" className="rm" onClick={() => remove(v.id)} aria-label={`Remove ${v.long ?? v.label}`}>
                        Remove
                      </button>
                    </div>
                    {v.type === "num" ? (
                      <div className="cond-ctl">
                        <input type="range" aria-label={v.label} min={v.range[0]} max={v.range[1]} step={v.step ?? (v.range[1] - v.range[0]) / 100} value={typeof x === "number" ? x : v.range[0]} onChange={(e) => set(v.id, Number(e.target.value))} />
                        <input
                          type="number"
                          aria-label={`${v.label} value`}
                          min={v.range[0]}
                          max={v.range[1]}
                          step={v.step ?? "any"}
                          value={typeof x === "number" ? x : ""}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (e.target.value !== "" && Number.isFinite(n)) set(v.id, Math.min(v.range[1], Math.max(v.range[0], n)));
                          }}
                        />
                        {typeof x === "number" && v.display_units?.[0] && (
                          <span className="alt">
                            = {num(x * v.display_units[0].factor, 1)} {v.display_units[0].unit}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="cond-ctl">
                        <select aria-label={v.label} value={typeof x === "string" ? x : ""} onChange={(e) => set(v.id, e.target.value)}>
                          {typeof x === "string" && x !== "" && !cats[v.id].some((o) => o.value === x) && <option value={x}>{x} · 0 tests</option>}
                          {cats[v.id].map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.value} · {o.n} tests
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
                    <button type="button" className="rm" onClick={() => onExtras(extras.filter((o) => o.id !== e.id))} aria-label={`Remove ${e.name}`}>
                      Remove
                    </button>
                  </div>
                  <div className="cond-ctl">
                    <input type="text" className="xval" aria-label={`${e.name} value`} maxLength={40} value={e.value} onChange={(ev) => onExtras(extras.map((o) => (o.id === e.id ? { ...o, value: ev.target.value } : o)))} />
                    <span className="alt">{EXTRA_BASIS}</span>
                  </div>
                </li>
              ))}
            </ul>
            {available.length > 0 && (
              <div className="addvars">
                <span>Add a variable</span>
                {available.map((v) => (
                  <button key={v.id} type="button" className="chip add" onClick={() => add(v.id)}>
                    + {v.long ?? v.label}
                  </button>
                ))}
              </div>
            )}
            <div className="addvars">
              <AddExtra known={vars.flatMap((v) => [v.label, v.long ?? v.label].map((label) => ({ id: v.id, label })))} onKnown={(id) => { if (!scenario.active.includes(id)) add(id); }} onAdd={(e) => onExtras([...extras, e])} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="step-panel">
            <h1>What do you want to know?</h1>
            <p className="step-lede">Write your question or goal in your own words. It is optional; it appears at the top of the report. The levels and the ranking depend only on the conditions you set, never on this text.</p>
            <label htmlFor="goal" className="fieldlbl">
              Your question or goal
            </label>
            <textarea id="goal" className="goal" rows={4} maxLength={400} value={goal} onChange={(e) => onGoal(e.target.value)} placeholder="Example: is there enough evidence to choose this material for the setting above?" />
            {(lens.questions?.length ?? 0) > 0 && (
              <div className="addvars">
                <span>Examples</span>
                {lens.questions!.slice(0, 3).map((q) => (
                  <button key={q} type="button" className="chip" onClick={() => onGoal(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="step-panel">
            <h1>Your documents</h1>
            <p className="step-lede">The portal is built from a corpus of papers. This demo ships with one ready to use.</p>
            <div className="corpus">
              <div>
                <b>Example corpus</b>
                <span>
                  {lens.byline}: {pack.studies.length} {lens.unit_of_study ?? "study"}s, {(s.tests ?? 0).toLocaleString("en-US")} individual {lens.subject ?? "tests"}, {s.publications ?? 0} linked publications.
                </span>
              </div>
              <em>Included</em>
            </div>
            <div className="drop" aria-disabled="true">
              <b>Upload your own papers and tables</b>
              <span>PDF, CSV or Excel. Prometeo would propose the variables, you would review them, and the interface would be generated for your subject.</span>
              <em>Not available in this demo. Coming in the next phase.</em>
            </div>
            {included.length === 0 && <p className="empty">No variable is included. Go back to step 2 and include at least one.</p>}
          </section>
        )}

        <div className="step-actions">
          <button type="button" className="ghostbtn" onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
            {step === 0 ? "Back to start" : "Back"}
          </button>
          {!last ? (
            <button type="button" className="cta" onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button type="button" className="cta" disabled={included.length === 0} onClick={onRun}>
              Compare against the evidence
            </button>
          )}
        </div>
      </main>
      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
