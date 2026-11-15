import { useMemo } from "react";
import type { Scenario, VariableEvidence } from "../engine";
import { useData, Src } from "./ctx";
import { LEVELS, levelBasis } from "../report/text";
import { num, scenarioValueText } from "../report/format";
import { ChangeSummary } from "./ChangeSummary";
import { matchingPreset, presetScenario } from "../state";
import { NumField } from "./NumField";
import type { Extra } from "../state";
import { AddExtra, EXTRA_BASIS, ExtraTag } from "./ExtraVars";

export function LevelTag({ level }: { level: VariableEvidence["level"] }) {
  const l = LEVELS[level];
  return (
    <span className={`level level-${level}`} title={l.def}>
      <span aria-hidden="true">{l.icon}</span> {l.label}
    </span>
  );
}

export function ScenarioPanel({
  scenario,
  onChange,
  levels,
  extras,
  onExtras,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  levels: VariableEvidence[];
  extras: Extra[];
  onExtras: (e: Extra[]) => void;
}) {
  const { pack, lens } = useData();
  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const preset = matchingPreset(lens, scenario);

  const catOptions = useMemo(() => {
    const out: Record<string, { value: string; n: number }[]> = {};
    for (const v of vars) {
      if (v.type !== "cat") continue;
      const c = new Map<string, number>();
      for (const r of pack.records) {
        const x = r.values[v.id];
        if (typeof x === "string" && r.kind === "test") c.set(x, (c.get(x) ?? 0) + 1);
      }
      out[v.id] = [...c].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
    }
    return out;
  }, [pack]); // eslint-disable-line

  const defaults = useMemo(() => {
    const out: Record<string, number | string> = {};
    for (const v of vars) {
      const fromPreset = lens.presets.map((p) => p.values[v.id]).find((x) => x !== undefined);
      if (fromPreset !== undefined) out[v.id] = fromPreset;
      else if (v.type === "num") {
        const xs = pack.records.flatMap((r) => { const x = r.values[v.id]; return Array.isArray(x) ? [(x[0] + x[1]) / 2] : []; }).sort((a, b) => a - b);
        out[v.id] = xs.length ? xs[Math.floor(xs.length / 2)] : v.range[0];
      } else out[v.id] = catOptions[v.id]?.[0]?.value ?? "";
    }
    return out;
  }, [pack, lens]); // eslint-disable-line

  const set = (id: string, x: number | string) => onChange({ ...scenario, values: { ...scenario.values, [id]: x } });
  const toggle = (id: string) => {
    const on = scenario.active.includes(id);
    const active = on ? scenario.active.filter((a) => a !== id) : vars.map((v) => v.id).filter((a) => a === id || scenario.active.includes(a));
    const values = { ...scenario.values };
    if (!on && (values[id] === undefined || values[id] === "")) values[id] = defaults[id];
    onChange({ ...scenario, active, values });
  };

  return (
    <section className="scenario" aria-label="Proposed scenario">
      <div className="scn-head">
        <h2>Proposed scenario</h2>
        <div className="presets" role="group" aria-label="Preset scenarios">
          {lens.presets.map((p) => (
            <button key={p.id} type="button" className="chip" aria-pressed={preset === p.id} title={`${p.blurb} Source: ${p.source}.`} onClick={() => onChange(presetScenario(lens, p.id))}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <table className="scn" aria-label="Proposed scenario values and evidence">
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Proposed value</th>
            <th scope="col">Evidence level</th>
            <th scope="col">Basis (comparable tests)</th>
          </tr>
        </thead>
        <tbody>
          {vars.map((v) => {
            const on = scenario.active.includes(v.id);
            const x = scenario.values[v.id];
            const lv = levels.find((l) => l.variable === v.id);
            return (
              <tr key={v.id} className={on ? "" : "off"}>
                <td className="v">
                  <label>
                    <input type="checkbox" checked={on} onChange={() => toggle(v.id)} /> {v.long ?? v.label}
                    {v.type === "num" && <small> ({v.unit})</small>}
                  </label>
                </td>
                <td className="ctl">
                  {v.type === "num" ? (
                    <>
                      <input
                        type="range"
                        aria-label={v.label}
                        disabled={!on}
                        min={v.range[0]}
                        max={v.range[1]}
                        step={v.step ?? (v.range[1] - v.range[0]) / 100}
                        value={typeof x === "number" ? x : (defaults[v.id] as number)}
                        onChange={(e) => set(v.id, Number(e.target.value))}
                      />
                      <NumField label={`${v.label} value`} disabled={!on} min={v.range[0]} max={v.range[1]} step={v.step} value={typeof x === "number" ? x : undefined} onCommit={(n) => set(v.id, n)} />
                      {on && typeof x === "number" && v.display_units?.[0] && (
                        <span className="alt">
                          = {num(x * v.display_units[0].factor, 1)} {v.display_units[0].unit}
                        </span>
                      )}
                    </>
                  ) : (
                    <select aria-label={v.label} disabled={!on} value={typeof x === "string" ? x : ""} onChange={(e) => set(v.id, e.target.value)}>
                      {typeof x === "string" && x !== "" && !catOptions[v.id].some((o) => o.value === x) && <option value={x}>{x} · 0 tests</option>}
                      {catOptions[v.id].map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.value} · {o.n} tests
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="print-only">{on && x !== undefined ? scenarioValueText(pack, v.id, x) : "not part of the scenario"}</span>
                </td>
                <td>{on && lv ? <LevelTag level={lv.level} /> : <span className="hint">not part of the scenario</span>}</td>
                <td className="basis">{on && lv && <Src id={lv.source}>{levelBasis(pack, lens, lv)}</Src>}</td>
              </tr>
            );
          })}
          {extras.map((e) => (
            <tr key={e.id}>
              <td className="v x">
                {e.name}
                {e.unit && <small> ({e.unit})</small>}
              </td>
              <td className="ctl">
                <input type="text" className="xval" aria-label={`${e.name} value`} maxLength={40} value={e.value} onChange={(ev) => onExtras(extras.map((o) => (o.id === e.id ? { ...o, value: ev.target.value } : o)))} />
                <span className="print-only">
                  {e.value} {e.unit}
                </span>
              </td>
              <td>
                <ExtraTag />
              </td>
              <td className="basis">
                {EXTRA_BASIS}{" "}
                <button type="button" className="chip noprint" onClick={() => onExtras(extras.filter((o) => o.id !== e.id))} aria-label={`Remove ${e.name}`}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          <tr className="addrow noprint">
            <td colSpan={4}>
              <AddExtra
                known={vars.flatMap((v) => [v.label, v.long ?? v.label].map((label) => ({ id: v.id, label })))}
                onKnown={(id) => {
                  if (!scenario.active.includes(id)) toggle(id);
                }}
                onAdd={(e) => onExtras([...extras, e])}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <ChangeSummary levels={levels} />
      <p className="tblnote">
        Levels are computed by rule on the comparable tests (Methods). {Object.values(LEVELS).map((l) => `${l.icon} ${l.label}`).join(" · ")}. Prometeo compares conditions; it does not predict outcomes.
      </p>
    </section>
  );
}
