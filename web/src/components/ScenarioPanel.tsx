import { useMemo, useState } from "react";
import type { NumVariable, Scenario, VariableEvidence } from "../engine";
import { useData, Src } from "./ctx";
import { LEVELS, levelBasis } from "../report/text";
import { num, scenarioValueText } from "../report/format";
import { ChangeSummary } from "./ChangeSummary";
import { NumField } from "./NumField";
import type { Extra } from "../state";
import { AddExtra, EXTRA_BASIS, ExtraTag } from "./ExtraVars";
import { allHabitatPresets, HabitatFigure, habitatScenario, matchingHabitatPreset } from "./HabitatFigure";
import { BASELINE_PROFILES, computeWhatIfDelta } from "../report/whatif";
import { t } from "../i18n";
import { NasaApparatus, ReferenceScenarios, type NasaInfo } from "./NasaApparatus";

export function LevelTag({ level }: { level: VariableEvidence["level"] }) {
  const l = LEVELS[level];
  return (
    <span className={`level level-${level}`} title={l.def}>
      <span aria-hidden="true">{l.icon}</span> {l.label}
    </span>
  );
}

/** Mini editorial range strip showing the corpus tested range and the proposed scenario value marker. */
function CoverageStrip({ v, lv, value }: { v: NumVariable; lv?: VariableEvidence; value: number }) {
  const [min, max] = v.range;
  const span = Math.max(1e-9, max - min);
  const clampPct = (x: number) => Math.max(0, Math.min(100, ((x - min) / span) * 100));
  const valPct = clampPct(value);
  const hasTested = lv?.tested && lv.tested[1] >= lv.tested[0];
  const t0 = hasTested ? clampPct(lv!.tested![0]) : 0;
  const t1 = hasTested ? clampPct(lv!.tested![1]) : 0;

  return (
    <span className="cov-strip noprint" aria-hidden="true" title={hasTested ? t("Tested range: {0}–{1} {2}", num(lv!.tested![0]), num(lv!.tested![1]), v.unit) : t("No comparable tested range")}>
      {hasTested && (
        <span
          className="cov-band"
          style={{ left: `${t0.toFixed(1)}%`, width: `${Math.max(2, t1 - t0).toFixed(1)}%` }}
        />
      )}
      <span className="cov-pin" style={{ left: `${valPct.toFixed(1)}%` }} />
    </span>
  );
}

export function ScenarioPanel({
  scenario,
  onChange,
  levels,
  extras,
  onExtras,
  isCustomCorpus,
  nasa,
}: {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  levels: VariableEvidence[];
  extras: Extra[];
  onExtras: (e: Extra[]) => void;
  isCustomCorpus?: boolean;
  nasa?: NasaInfo;
}) {
  const { pack, lens } = useData();
  const [selectedBaseline, setSelectedBaseline] = useState<string>("earth_std");
  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const presets = useMemo(() => allHabitatPresets(lens), [lens]);
  const preset = matchingHabitatPreset(lens, scenario);
  const activePresetObj = presets.find((p) => p.id === preset);

  const baselineObj = BASELINE_PROFILES.find((b) => b.id === selectedBaseline) ?? BASELINE_PROFILES[0];
  const delta = useMemo(() => computeWhatIfDelta(scenario, baselineObj.scenario), [scenario, baselineObj]);

  const catOptions = useMemo(() => {
    const out: Record<string, { value: string; n: number }[]> = {};
    for (const v of vars) {
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
  }, [pack]); // eslint-disable-line

  const defaults = useMemo(() => {
    const out: Record<string, number | string> = {};
    for (const v of vars) {
      const fromPreset = lens.presets.map((p) => p.values[v.id]).find((x) => x !== undefined);
      if (fromPreset !== undefined) out[v.id] = fromPreset;
      else if (v.type === "num") {
        const xs = pack.records
          .flatMap((r) => {
            const x = r.values[v.id];
            return Array.isArray(x) ? [(x[0] + x[1]) / 2] : [];
          })
          .sort((a, b) => a - b);
        out[v.id] = xs.length ? xs[Math.floor(xs.length / 2)] : v.range[0];
      } else out[v.id] = catOptions[v.id]?.[0]?.value ?? "";
    }
    return out;
  }, [pack, lens]); // eslint-disable-line

  const set = (id: string, x: number | string) =>
    onChange({ ...scenario, values: { ...scenario.values, [id]: x } });
  const toggle = (id: string) => {
    const on = scenario.active.includes(id);
    const active = on
      ? scenario.active.filter((a) => a !== id)
      : vars.map((v) => v.id).filter((a) => a === id || scenario.active.includes(a));
    const values = { ...scenario.values };
    if (!on && (values[id] === undefined || values[id] === "")) values[id] = defaults[id];
    onChange({ ...scenario, active, values });
  };

  return (
    <section className="scenario" aria-label={t("Proposed scenario")}>
      <div className="scn-head">
        <h2>{t("Proposed scenario")}</h2>
        {!isCustomCorpus && presets.length > 0 && (
          <div className="presets" role="group" aria-label={t("Preset scenarios")}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                aria-pressed={preset === p.id}
                title={t("{0} Source: {1}.", p.blurb, p.source)}
                onClick={() => onChange(habitatScenario(lens, p.id))}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isCustomCorpus && nasa && (
        <div className="scn-design-stage noprint">
          {nasa.scenarios && <ReferenceScenarios scenarios={nasa.scenarios} />}
          <NasaApparatus {...nasa} compact />
        </div>
      )}

      {/* Large Selected-Design Interactive Animation Stage on the Final Report Interface */}
      {!isCustomCorpus && (
        <aside className="design-hero-stage scn-design-stage noprint" aria-label={t("Selected scenario isometric architecture")}>
          <div className="design-hero-visual">
            <HabitatFigure name={preset || "custom"} size="xl" />
          </div>
          <div className="design-hero-info">
            <span className="design-hero-kicker">{t("Active Scenario Architecture · Interactive Isometric Model")}</span>
            <h3>{activePresetObj ? activePresetObj.label : t("Custom Operating Scenario")}</h3>
            <p>
              {activePresetObj
                ? activePresetObj.blurb
                : t("Custom experimental conditions defined via scenario sliders. Select any reference habitat above or adjust sliders below to see the architecture respond in real time.")}
            </p>
            <div className="design-hero-pills">
              {scenario.active.map((id) => (
                <span key={id} className="design-pill">
                  <b>{vars.find((v) => v.id === id)?.label ?? id}:</b>{" "}
                  {scenarioValueText(pack, id, scenario.values[id])}
                </span>
              ))}
            </div>
            {activePresetObj?.source && <small className="design-hero-src">{t("Reference:")} {activePresetObj.source}</small>}
          </div>
        </aside>
      )}

      {/* Real-time What-If Delta Simulation against baseline */}
      {!isCustomCorpus && (
        <div className="whatif-panel noprint" role="region" aria-label={t("What-if baseline comparison")}>
          <div className="whatif-head">
            <div className="whatif-title-group">
              <span className="whatif-kicker">{t("NASA Comparative Flammability Engine")}</span>
              <h4>{t("What-If Simulator vs. Baseline Atmosphere")}</h4>
            </div>
            <div className="whatif-selector">
              <label htmlFor="whatif-base-select">{t("Compare against:")}</label>
              <select
                id="whatif-base-select"
                value={selectedBaseline}
                onChange={(e) => setSelectedBaseline(e.target.value)}
              >
                {BASELINE_PROFILES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.description})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="whatif-cards">
            <div className="whatif-card">
              <span className="whatif-label">{t("Δ O₂ Concentration")}</span>
              <span className={`whatif-val ${delta.o2Delta > 0 ? "whatif-up" : delta.o2Delta < 0 ? "whatif-down" : ""}`}>
                {delta.o2Delta > 0 ? `+${delta.o2Delta.toFixed(1)}%` : `${delta.o2Delta.toFixed(1)}%`}
              </span>
            </div>
            <div className="whatif-card">
              <span className="whatif-label">{t("Δ Cabin Pressure")}</span>
              <span className={`whatif-val ${delta.pDelta > 0 ? "whatif-up" : delta.pDelta < 0 ? "whatif-down" : ""}`}>
                {delta.pDelta > 0 ? t("+{0} atm", delta.pDelta.toFixed(2)) : t("{0} atm", delta.pDelta.toFixed(2))}
              </span>
            </div>
            <div className="whatif-card">
              <span className="whatif-label">{t("Δ Flammability Index")}</span>
              <span className={`whatif-val ${delta.flammabilityIndexChangePct > 0 ? "whatif-risk-high" : "whatif-risk-low"}`}>
                {delta.flammabilityIndexChangePct > 0 ? `+${delta.flammabilityIndexChangePct}%` : `${delta.flammabilityIndexChangePct}%`}
              </span>
            </div>
            <div className={`whatif-summary-badge whatif-badge-${delta.riskTendency}`}>
              <span className="whatif-icon" aria-hidden="true">
                {delta.riskTendency === "elevated" ? "⚠️" : delta.riskTendency === "reduced" ? "🛡️" : "⚖️"}
              </span>
              <span>{delta.riskSummary}</span>
            </div>
          </div>
        </div>
      )}

      <div className="scn-layout">
        <div className="scn-table-col">
          <table className="scn" aria-label={t("Proposed scenario values and evidence")}>
            <thead>
              <tr>
                <th scope="col">{t("Variable")}</th>
                <th scope="col">{t("Proposed value")}</th>
                <th scope="col">{t("Evidence level")}</th>
                <th scope="col">{t("Basis (comparable tests)")}</th>
              </tr>
            </thead>
            <tbody>
              {vars.map((v) => {
                const on = scenario.active.includes(v.id);
                const x = scenario.values[v.id];
                const lv = levels.find((l) => l.variable === v.id);
                const numVal = typeof x === "number" ? x : (defaults[v.id] as number);
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
                            value={numVal}
                            onChange={(e) => set(v.id, Number(e.target.value))}
                          />
                          <NumField label={t("{0} value", v.label)} disabled={!on} min={v.range[0]} max={v.range[1]} step={v.step} value={typeof x === "number" ? x : undefined} onCommit={(n) => set(v.id, n)} />
                          {on && typeof x === "number" && v.display_units?.[0] && (
                            <span className="alt">
                              = {num(x * v.display_units[0].factor, 1)} {v.display_units[0].unit}
                            </span>
                          )}
                        </>
                      ) : (
                        <select
                          aria-label={v.label}
                          disabled={!on}
                          value={typeof x === "string" ? x : ""}
                          onChange={(e) => set(v.id, e.target.value)}
                        >
                          {typeof x === "string" && x !== "" && !catOptions[v.id].some((o) => o.value === x) && (
                            <option value={x}>{x} {t("· 0 tests")}</option>
                          )}
                          {catOptions[v.id].map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.value} · {o.n} {t("tests")}
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="print-only">
                        {on && x !== undefined ? scenarioValueText(pack, v.id, x) : t("not part of the scenario")}
                      </span>
                    </td>
                    <td>{on && lv ? <LevelTag level={lv.level} /> : <span className="hint">{t("not part of the scenario")}</span>}</td>
                    <td className="basis">
                      {on && lv && (
                        <>
                          {v.type === "num" && typeof x === "number" && <CoverageStrip v={v} lv={lv} value={x} />}
                          <Src id={lv.source}>{levelBasis(pack, lens, lv)}</Src>
                        </>
                      )}
                    </td>
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
                    <span className="print-only">
                      {e.value} {e.unit}
                    </span>
                  </td>
                  <td>
                    <ExtraTag />
                  </td>
                  <td className="basis">
                    {t(EXTRA_BASIS)}{" "}
                    <button
                      type="button"
                      className="chip noprint"
                      onClick={() => onExtras(extras.filter((o) => o.id !== e.id))}
                      aria-label={t("Remove {0}", e.name)}
                    >
                      {t("Remove")}
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
        </div>
      </div>

      <ChangeSummary levels={levels} />
      <p className="tblnote">
        {t("Levels are computed by rule on the comparable tests (Methods).")}{" "}
        {Object.values(LEVELS)
          .map((l) => `${l.icon} ${l.label}`)
          .join(" · ")}
        {t(". Prometeo compares conditions; it does not predict outcomes.")}
      </p>
    </section>
  );
}
