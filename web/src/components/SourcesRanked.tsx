import { useMemo, useState } from "react";
import type { AxisScore, NumVariable, Pack, Scenario, StudyResult } from "../engine";
import { Src, useData } from "./ctx";
import { Grade, REASON, SortTh } from "./Tables";
import { doiOf, num, plural, scenarioValueText, studyShort, varOf } from "../report/format";
import { explainAll, nextSort, sortKeyOf, sortStable, valueWithUnit } from "../report/ranking";
import type { Dir, RankKey, StudyExplain, VarExplain } from "../report/ranking";
import { whyText } from "../report/text";

function VarLine({ pack, v }: { pack: Pack; v: VarExplain }) {
  const def = varOf(pack, v.variable);
  const unit = def.type === "num" ? def.unit : "";
  const scn = scenarioValueText(pack, v.variable, v.scenarioValue as number | string);
  const rec = v.nearestRecord ? pack.records.find((r) => r.id === v.nearestRecord) : undefined;
  const cite = rec ? (
    <>
      {" "}
      (<Src id={rec.id}>{rec.label}, row {rec.source.row}</Src>)
    </>
  ) : null;
  const head = <b>{def.label}: </b>;
  if (v.status === "missing") return <li>{head}scenario {scn}; this source has no value to compare ({v.reason ? REASON[v.reason] : "not recorded"}). Counted as missing, not as zero.</li>;
  if (v.status === "tested" || v.status === "not_tested")
    return (
      <li>
        {head}scenario {scn}; {v.status === "tested" ? "appears in the comparable records" : "does not appear in the comparable records"}
        {cite}. Closeness {v.score}/100.
      </li>
    );
  const near = valueWithUnit(v.nearestValue, unit);
  const du = (def as NumVariable).delta_unit ?? unit;
  return (
    <li>
      {head}
      <span className="nowrap">{scn} vs {near}</span>
      {cite}
      {v.status === "covered" ? ": a record covers the scenario value" : `: nearest record is ${num(v.gap ?? 0)} ${du} away`}
      {v.tested ? `; tested range ${valueWithUnit(v.tested, unit)}` : ""}. Closeness {v.score}/100.
    </li>
  );
}

export function SourcesRanked({ n, ranking, closeness, scenario }: { n: number; ranking: StudyResult[]; closeness: Record<string, Record<string, AxisScore>>; scenario: Scenario }) {
  const { pack, lens } = useData();
  const [sort, setSort] = useState<{ k: RankKey; dir: Dir }>({ k: "rank", dir: 1 });
  const all = useMemo(() => explainAll(pack, scenario, ranking, closeness), [pack, scenario, ranking, closeness]);
  const rows = useMemo(() => sortStable(all, (e) => sortKeyOf(e, sort.k, (id) => studyShort(pack, id)), sort.dir), [all, sort, pack]);
  const unit = lens.unit_of_study ?? "study";
  const total = scenario.active.filter((id) => scenario.values[id] !== undefined).length;
  const th = (k: RankKey, label: string, cls = "") => <SortTh label={label} className={cls} active={sort.k === k} dir={sort.dir} onSort={() => setSort((s) => nextSort(s, k))} />;
  const missingLabel = (e: StudyExplain) => (e.missing.length ? e.missing.map((id) => varOf(pack, id).label).join(", ") : "none");
  return (
    <table id="tbl-sources-ranked" className="sranked">
      <caption>
        <b>Table {n} |</b> Sources ranked for the scenario, with the values behind each position. Open a row to compare the scenario value with the nearest record of that source, variable by variable.
      </caption>
      <thead>
        <tr>
          {th("rank", "#")}
          {th("study", unit[0].toUpperCase() + unit.slice(1))}
          {th("grade", "Grade")}
          {th("distance", "d", "r")}
          {th("reported", `Active variables reported (of ${total})`, "r")}
          <th>Missing</th>
          {th("overall", "Overall closeness", "r")}
          <th>Why and values</th>
          <th>Dataset DOI</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const st = pack.studies.find((s) => s.id === e.study)!;
          const doi = doiOf(pack, e.study);
          return (
            <tr key={e.study}>
              <td>{e.rank}</td>
              <td title={st.title}>
                <b>{st.short}</b> <span className="hint">{st.id}</span>
              </td>
              <td>
                <Grade g={e.result.grade} />
              </td>
              <td className="r">{e.result.distance === null ? "—" : num(e.result.distance)}</td>
              <td className="r">
                {e.reported.length} of {e.vars.length}
              </td>
              <td>{missingLabel(e)}</td>
              <td className="r">{e.overall === null ? "—" : num(e.overall, 1)}</td>
              <td className="why">
                <details>
                  <summary>{e.result.why.map((w) => whyText(pack, lens, w)).join("; ")}</summary>
                  <ul>
                    {e.vars.map((v) => (
                      <VarLine key={v.variable} pack={pack} v={v} />
                    ))}
                    {e.vars.length === 0 && <li>No active variable to compare.</li>}
                  </ul>
                  <div className="hint">
                    {plural(e.result.comparable, "comparable record")}
                    {e.result.nearest ? "; d is measured at the single nearest comparable record" : ""}.
                  </div>
                </details>
              </td>
              <td className="src">{doi ? <a href={doi.url} target="_blank" rel="noreferrer">{doi.label}</a> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={9} className="hint">
            Default order (as in Table 1), fixed by the engine: (1) grade A, B, C, D; (2) for grades A to C, fewer missing active variables first (grade D rows skip this step); (3) smaller normalised distance <i>d</i> of the nearest comparable record first, rows without a distance last; (4) order of the {unit}s in the corpus. The column buttons re-sort the table (stable; ties keep the default order; empty values last) without changing the engine ranking. Overall closeness is the mean closeness score (0–100) over the active variables the source records; unrecorded variables are excluded from the mean, not scored as zero. Closeness 0 means the nearest record is at least {pack.schema.thresholds.closeness_reach}σ from the scenario value. This compares conditions; it does not predict behaviour.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
