import { useMemo, useState } from "react";
import { corpusSummary } from "../engine";
import type { AxisScore, Grade, NumVariable, Scenario, StudyResult, VariableEvidence } from "../engine";
import { Src, useData, useProv } from "./ctx";
import { LevelTag } from "./ScenarioPanel";
import { REASON } from "./Tables";
import { levelBasis, whyText } from "../report/text";
import { doiOf, num, scenarioValueText, studyShort, varOf } from "../report/format";
import { explainStudy, valueWithUnit } from "../report/ranking";
import { t, many } from "../i18n";

const GRADES: Grade[] = ["A", "B", "C", "D"];

/** Grade as shape and letter, never colour alone: A circle, B square, C diamond, D dashed circle. */
export function GradeGlyph({ grade, size = 20 }: { grade: Grade; size?: number }) {
  return (
    <svg className={`gl g${grade}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {grade === "A" && <circle className="shape" cx="12" cy="12" r="10" />}
      {grade === "B" && <rect className="shape" x="2.5" y="2.5" width="19" height="19" />}
      {grade === "C" && <polygon className="shape" points="12,1 23,12 12,23 1,12" />}
      {grade === "D" && <circle className="shape dash" cx="12" cy="12" r="10" />}
      <text x="12" y="16" textAnchor="middle">
        {grade}
      </text>
    </svg>
  );
}

type Axis = { id: string; label: string; value: string; best: number; score: AxisScore | undefined };

const missingText = (a: AxisScore | undefined) => (a?.reason ? REASON[a.reason] : t("not recorded"));
const isMissing = (a: AxisScore | undefined) => !a || a.missing || !!a.reason;

/** Closeness 0–100 per variable. A variable the source does not record is a dashed spoke, not a zero. */
function Radar({ axes, name, onVertex }: { axes: Axis[]; name: string | null; onVertex: (recordId: string) => void }) {
  const W = 420;
  const H = 330;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 104;
  const n = axes.length;
  const ang = (i: number) => (2 * Math.PI * i) / n;
  const pt = (i: number, f: number): [number, number] => [cx + R * f * Math.sin(ang(i)), cy - R * f * Math.cos(ang(i))];
  const poly = (fs: number[]) => fs.map((f, i) => pt(i, f).map((x) => x.toFixed(1)).join(",")).join(" ");
  const label = name
    ? t("Closeness of {0} to the scenario: {1}.", name, axes.map((a) => `${a.label} ${isMissing(a.score) ? missingText(a.score) : t("{0} of 100", Math.round(a.score!.score))}`).join("; "))
    : t("Best closeness reached by any source: {0}.", axes.map((a) => t("{0} {1} of 100", a.label, Math.round(a.best))).join("; "));
  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} className="radar-ring" points={poly(axes.map(() => f))} />
      ))}
      {[25, 50, 75, 100].map((v) => (
        <text key={v} className="radar-tick" x={cx + 3} y={cy - (R * v) / 100 - 2}>
          {v}
        </text>
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1);
        return <line key={a.id} className={name && isMissing(a.score) ? "radar-spoke miss" : "radar-spoke"} x1={cx} y1={cy} x2={x} y2={y} />;
      })}
      <polygon className="radar-best" points={poly(axes.map((a) => a.best / 100))} />
      {name && <polygon className="radar-sel" points={poly(axes.map((a) => (isMissing(a.score) ? 0 : a.score!.score / 100)))} />}
      {name &&
        axes.map((a, i) => {
          if (isMissing(a.score)) return null;
          const [x, y] = pt(i, a.score!.score / 100);
          const rec = a.score!.nearest;
          return (
            <circle key={a.id} className={rec ? "radar-dot link" : "radar-dot"} cx={x} cy={y} r={4.5} onClick={rec ? () => onVertex(rec) : undefined}>
              <title>{t("{0} · {1}: closeness {2} of 100 against {3}{4}", name, a.label, Math.round(a.score!.score), a.value, rec ? t(". Click for the source row.") : "")}</title>
            </circle>
          );
        })}
      {axes.map((a, i) => {
        const s = Math.sin(ang(i));
        const c = Math.cos(ang(i));
        const x = cx + (R + 14) * s;
        const lines = [a.label, a.value, ...(name && isMissing(a.score) ? [missingText(a.score)] : [])];
        const y = cy - (R + 14) * c + (c > 0.3 ? -(lines.length - 1) * 13 - 2 : c < -0.3 ? 12 : -((lines.length - 1) * 13) / 2 + 4);
        return (
          <text key={a.id} className="radar-lab" x={x} y={y} textAnchor={Math.abs(s) < 0.25 ? "middle" : s > 0 ? "start" : "end"}>
            {lines.map((t, k) => (
              <tspan key={k} x={x} dy={k === 0 ? 0 : 13} className={k === 0 ? "l0" : k === 1 ? "l1" : "l2"}>
                {t}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

/** With fewer than three variables a polygon has no area, so the same numbers are drawn as bars. */
function Bars({ axes, name }: { axes: Axis[]; name: string | null }) {
  return (
    <ul className="ga-bars">
      {axes.map((a) => (
        <li key={a.id}>
          <span className="ga-bars-lab">
            <b>{a.label}</b> {a.value}
          </span>
          <span className="ga-bars-track">
            {name && !isMissing(a.score) && <span className="ga-bars-fill" style={{ width: `${a.score!.score}%` }} />}
            <span className="ga-bars-best" style={{ left: `${a.best}%` }} />
          </span>
          <span className="ga-bars-num">{name ? (isMissing(a.score) ? missingText(a.score) : Math.round(a.score!.score)) : Math.round(a.best)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Each active variable once: its value, the range covered by comparable tests, its level and the basis of that level. */
export function ScenarioRanges({ scenario, onChange, levels }: { scenario: Scenario; onChange: (s: Scenario) => void; levels: VariableEvidence[] }) {
  const { pack, lens } = useData();

  const moveTo = (v: NumVariable, e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const step = v.step ?? (v.range[1] - v.range[0]) / 100;
    const x = Number((Math.round((v.range[0] + f * (v.range[1] - v.range[0])) / step) * step).toFixed(6));
    onChange({ ...scenario, values: { ...scenario.values, [v.id]: Math.min(v.range[1], Math.max(v.range[0], x)) } });
  };

  return (
    <figure className="ga ga-why" id="summary">
      <section className="ga-a" aria-label={t("Scenario against the tested range")}>
        {levels.length === 0 && <p className="hint">{t("No variable is part of the scenario.")}</p>}
        {levels.map((lv) => {
          const v = varOf(pack, lv.variable);
          const numeric = v.type === "num" && typeof lv.value === "number";
          const pos = (x: number) => (numeric ? Math.min(100, Math.max(0, ((x - (v as NumVariable).range[0]) / ((v as NumVariable).range[1] - (v as NumVariable).range[0])) * 100)) : 0);
          return (
            <div className="ga-var" key={lv.variable}>
              <div className="ga-var-head">
                <span className="ga-var-name">{v.long ?? v.label}</span>
                <b className="val">{scenarioValueText(pack, lv.variable, lv.value)}</b>
              </div>
              <div className="ga-var-scale">
                {numeric && (
                  <>
                    <div className={lv.tested ? "ga-track" : "ga-track none"} title={t("Click to move the scenario value here")} onClick={(e) => moveTo(v as NumVariable, e)}>
                      {lv.tested && <span className="ga-band" style={{ left: `${pos(lv.tested[0])}%`, width: `${Math.max(0.8, pos(lv.tested[1]) - pos(lv.tested[0]))}%` }} />}
                      <span className="ga-mark" style={{ left: `${pos(lv.value as number)}%` }} />
                    </div>
                    <div className="ga-scale">
                      <span>{num((v as NumVariable).range[0])}</span>
                      <span>
                        {num((v as NumVariable).range[1])} {(v as NumVariable).unit}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="ga-var-level">
                <LevelTag level={lv.level} />
                <p className="ga-basis">
                  <Src id={lv.source}>{levelBasis(pack, lens, lv)}</Src>
                </p>
              </div>
            </div>
          );
        })}
        <p className="ga-key">
          <span className="k-band" /> {t("range covered by comparable tests")} <span className="k-mark" /> {t("scenario value")}
        </p>
      </section>
    </figure>
  );
}

/** Closeness of one source to the scenario on each variable, and every source by grade to choose from. */
export function ClosenessPanels({ scenario, ranking, close }: {
  scenario: Scenario;
  ranking: StudyResult[];
  close: Record<string, Record<string, AxisScore>>;
}) {
  const { pack, lens } = useData();
  const openProv = useProv();
  const unit = lens.unit_of_study ?? "study";
  const top = ranking.find((r) => r.grade !== "D") ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const selId = picked ?? top?.study ?? null;
  const selIndex = ranking.findIndex((r) => r.study === selId);
  const sel = selIndex >= 0 ? ranking[selIndex] : null;
  const selName = sel ? studyShort(pack, sel.study) : null;
  const explain = useMemo(() => (sel ? explainStudy(pack, scenario, sel, selIndex, close) : null), [pack, scenario, sel, selIndex, close]);

  const axes: Axis[] = useMemo(
    () =>
      corpusSummary(pack, scenario).map((b) => ({
        id: b.variable,
        label: varOf(pack, b.variable).label,
        value: scenarioValueText(pack, b.variable, scenario.values[b.variable]),
        best: b.best,
        score: selId ? close[selId]?.[b.variable] : undefined,
      })),
    [pack, scenario, close, selId],
  );

  const study = sel ? pack.studies.find((s) => s.id === sel.study) : undefined;
  const doi = sel ? doiOf(pack, sel.study) : null;

  return (
    <figure className="ga ga-close">
      <div className="ga-grid">
        <section className="ga-c" aria-label={t("The {0} by grade", many(unit))}>
          <h3>
            <i>a</i> {t("The")} {ranking.length} {many(unit)} {t("by grade")}
          </h3>
          {GRADES.map((g) => {
            const members = ranking.filter((r) => r.grade === g);
            return (
              <div className="ga-group" key={g}>
                <span className="ga-group-lab">
                  <GradeGlyph grade={g} size={18} /> {t("Grade")} {g} · {members.length}
                </span>
                {members.length === 0 && <span className="hint">{t("none")}</span>}
                {members.map((r) => (
                  <button key={r.study} type="button" className={`ga-st g${g}`} aria-pressed={r.study === selId} onClick={() => setPicked(r.study)}>
                    {studyShort(pack, r.study)}
                  </button>
                ))}
              </div>
            );
          })}
          {sel && explain && (
            <div className="ga-sheet" aria-live="polite">
              <h4>
                <GradeGlyph grade={sel.grade} size={20} /> {selName}
                {study && <small>{study.title}</small>}
              </h4>
              <p>
                {t("Rank")} {selIndex + 1} {t("of")} {ranking.length}
                {sel.distance !== null && (
                  <>
                    {" · "}
                    <Src id={sel.nearest}>{t("distance d =")} {sel.distance} {t("at its nearest record")}</Src>
                  </>
                )}
                {" · "}
                {sel.comparable.toLocaleString("en-US")} {t("comparable records ·")} {sel.why.map((w) => whyText(pack, lens, w)).join("; ")}.
              </p>
              {explain.vars.length > 0 && (
                <ul>
                  {explain.vars.map((x) => {
                    const v = varOf(pack, x.variable);
                    const u = v.type === "num" ? v.unit : "";
                    return (
                      <li key={x.variable}>
                        <b>{v.label}</b>{" "}
                        {x.status === "missing" ? (
                          <span className="hint">{x.reason ? REASON[x.reason] : t("not recorded")}</span>
                        ) : x.status === "not_tested" ? (
                          <span>{scenarioValueText(pack, x.variable, x.scenarioValue as number | string)} {t("is not among the values it tested · closeness 0 of 100")}</span>
                        ) : (
                          <>
                            <Src id={x.nearestRecord}>{valueWithUnit(x.nearestValue, u)}</Src> {t("against")} {scenarioValueText(pack, x.variable, x.scenarioValue as number | string)} {t("· closeness")} {Math.round(x.score ?? 0)} {t("of 100")}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {doi && (
                <p>
                  <a href={doi.url} target="_blank" rel="noreferrer">
                    {t("Dataset DOI:")} {doi.label}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>

        <section className="ga-b" aria-label={t("Closeness by variable")}>
          <h3>
            <i>b</i> {t("Closeness by variable")}{selName ? ` · ${selName}` : ""}
          </h3>
          {axes.length >= 3 ? <Radar axes={axes} name={selName} onVertex={openProv} /> : <Bars axes={axes} name={selName} />}
          <p className="ga-key">
            {selName && (
              <>
                <span className="k-sel" /> {selName}{" "}
              </>
            )}
            <span className="k-best" /> {t("best reached by any")} {unit}
          </p>
        </section>
      </div>

      <figcaption>
        <b>a</b>{t(", every")} {unit} {t("by grade; select one to see its values and sources. All values are computed by rule from the evidence pack; nothing here predicts an outcome.")} <b>b</b>{t(", closeness (0–100) of the selected")} {unit} {t("to the scenario on each variable, with the best value reached by any")} {unit} {t("as a dashed outline. A dashed spoke means the")} {unit} {t("does not record that variable: it is absent, not zero. The order of the axes changes the shape of the polygon, so read each axis on its own.")}
      </figcaption>
    </figure>
  );
}
