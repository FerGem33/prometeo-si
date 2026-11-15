import { useMemo, useState } from "react";
import type { AxisScore, Finding, GapGrid, NumVariable, Scenario, StudyResult } from "../engine";
import { useData, Src } from "./ctx";
import { ariaSort, nextSort, overallCloseness, sortStable } from "../report/ranking";
import type { Dir, SortValue } from "../report/ranking";
import { doiOf, num, partitionName, rangeText, studyShort, valueText, varOf } from "../report/format";
import { FINDING_LEVEL, findingText, findingTitle, whyText } from "../report/text";
import { t, tx, many, lazy, count } from "../i18n";

export function Grade({ g }: { g: string }) {
  return <span className={`grade g${g}`}>{g}</span>;
}

export function KeyFindings({ findings }: { findings: Finding[] }) {
  const { pack, lens } = useData();
  const top = findings.slice(0, 4);
  return (
    <section className="keys" aria-label={t("Key findings")}>
      <h2>{t("Key findings")}</h2>
      <ol>
        {top.map((f) => (
          <li key={f.id}>
            <div className={`big ${f.level === "attention" ? "zero" : ""}`}>
              {f.metric.value}
              {f.metric.unit && <small> {f.metric.unit}</small>}
            </div>
            <p className="t">{findingText(pack, lens, f)}</p>
            <p className="meta">
              {FINDING_LEVEL[f.level]} · {findingTitle(pack, f)}
              <FindingSources f={f} />
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FindingSources({ f, lead = true }: { f: Finding; lead?: boolean }) {
  const { pack } = useData();
  if (!f.sources.length) return null;
  return (
    <>
      {lead && " · "}
      {f.sources.map((s, i) => {
        const rec = pack.records.find((r) => r.id === s);
        return (
          <span key={s}>
            {i > 0 && ", "}
            {rec ? (
              <Src id={rec.id}>
                {studyShort(pack, rec.study)} {rec.label}{t(", row")} {rec.source.row}
              </Src>
            ) : (
              <a href={`#ref-${s}`}>{studyShort(pack, s)}</a>
            )}
          </span>
        );
      })}
    </>
  );
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  const { pack, lens } = useData();
  return (
    <table className="findings">
      <caption>
        <b>{t("Table 2 |")}</b> {t("All findings for the scenario, computed by rule (Methods). Levels: attention, caution, context, support.")}
      </caption>
      <thead>
        <tr>
          <th>{t("Level")}</th>
          <th>{t("Finding")}</th>
          <th className="r">{t("Metric")}</th>
          <th>{t("Statement")}</th>
          <th>{t("Sources")}</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id}>
            <td>
              <span className={`flevel f-${f.level}`}>{FINDING_LEVEL[f.level]}</span>
            </td>
            <td>{findingTitle(pack, f)}</td>
            <td className="r">
              {f.metric.value} {f.metric.unit ?? ""}
            </td>
            <td className="stmt">
              {findingText(pack, lens, f)}
              {f.note && f.code !== "known_gap" && (
                <>
                  {" "}
                  <i>
                    {f.note.text} ({f.note.source})
                  </i>
                </>
              )}
              {f.note && f.code === "known_gap" && <i> ({f.note.source})</i>}
            </td>
            <td className="srcs">
              <FindingSources lead={false} f={{ ...f, sources: f.sources.slice(0, 6) }} />
              {f.sources.length > 6 && t(" and {0} more", f.sources.length - 6)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SortKey = "rank" | "study" | "grade" | "distance" | "tests";

/** Column header that sorts: a real button inside the th, with aria-sort on the th. */
export function SortTh({ label, active, dir, onSort, className = "" }: { label: React.ReactNode; active: boolean; dir: Dir; onSort: () => void; className?: string }) {
  return (
    <th className={className} aria-sort={ariaSort(active, dir)}>
      <button type="button" className={`sorth ${active ? (dir === 1 ? "asc" : "desc") : ""}`} onClick={onSort}>
        {label}
      </button>
    </th>
  );
}

export function RankingTable({ results, scenario }: { results: StudyResult[]; scenario: Scenario }) {
  const { pack, lens } = useData();
  const [sort, setSort] = useState<{ k: SortKey; dir: Dir }>({ k: "rank", dir: 1 });
  const rows = useMemo(() => {
    const withRank = results.map((r, i) => ({ r, i }));
    const key = (x: { r: StudyResult; i: number }): SortValue =>
      sort.k === "rank" ? x.i : sort.k === "study" ? studyShort(pack, x.r.study) : sort.k === "grade" ? x.r.grade : sort.k === "distance" ? x.r.distance : x.r.comparable;
    return sortStable(withRank, key, sort.dir);
  }, [results, sort, pack]);
  const th = (k: SortKey, label: string, cls = "") => <SortTh key={k} label={label} className={cls} active={sort.k === k} dir={sort.dir} onSort={() => setSort((s) => nextSort(s, k))} />;
  const actives = scenario.active.map((id) => varOf(pack, id));
  return (
    <table id="tbl-rank">
      <caption>
        <b>{t("Table 1 |")}</b> {lens.unit_of_study ? lens.unit_of_study[0].toUpperCase() + lens.unit_of_study.slice(1) : t("Study")} {t("ranking for the scenario: grade A–D, then number of missing variables, then normalised distance")} <i>d</i> {t("of the nearest comparable record.")} <span className="hint">{t("Use the column buttons to sort (stable; ties keep the default order); click a test for its source row.")}</span>
      </caption>
      <thead>
        <tr>
          {th("rank", "#")}
          {th("study", lens.unit_of_study ? lens.unit_of_study[0].toUpperCase() + lens.unit_of_study.slice(1) : "Study")}
          {th("grade", "Grade")}
          {th("distance", "d", "r")}
          <th>{t("Nearest record")}</th>
          {actives.map((v) => (
            <th key={v.id} className="r">
              {v.label}
              {v.type === "num" ? ` (${v.unit})` : ""}
            </th>
          ))}
          <th>{t("Why")}</th>
          {th("tests", t("Comparable records"), "r")}
          <th>{t("Dataset DOI")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ r, i }) => {
          const rec = r.nearest ? pack.records.find((x) => x.id === r.nearest) : null;
          const doi = doiOf(pack, r.study);
          const st = pack.studies.find((s) => s.id === r.study)!;
          return (
            <tr key={r.study}>
              <td>{i + 1}</td>
              <td title={st.title}>
                <b>{st.short}</b> <span className="hint">{st.id}</span>
              </td>
              <td>
                <Grade g={r.grade} />
              </td>
              <td className="r">{r.distance === null ? "—" : num(r.distance)}</td>
              <td>{rec ? <Src id={rec.id}>{rec.label}{t(", row")} {rec.source.row}</Src> : "—"}</td>
              {actives.map((v) => (
                <td key={v.id} className="r">
                  {rec ? valueText(rec, v) : "—"}
                </td>
              ))}
              <td className="why">{r.why.map((w) => whyText(pack, lens, w)).join("; ")}</td>
              <td className="r">{r.comparable}</td>
              <td className="src">{doi ? <a href={doi.url} target="_blank" rel="noreferrer">{doi.label}</a> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const REASON: Record<string, string> = lazy({
  not_recorded: tx("not recorded"),
  not_comparable: tx("not comparable"),
  no_records: tx("no table"),
  no_evidence: tx("no data"),
});

export function HeatTable({ results, closeness, scenario, figure }: { results: StudyResult[]; closeness: Record<string, Record<string, AxisScore>>; scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<{ k: string; dir: Dir }>({ k: "default", dir: 1 });
  const actives = scenario.active.map((id) => varOf(pack, id));
  const activeIds = actives.map((v) => v.id);
  const comparableRows = results.filter((r) => r.comparable > 0);
  const rest = results.filter((r) => r.comparable === 0);
  const shown = all ? results : comparableRows;
  const rows = useMemo(() => {
    const key = (r: StudyResult): SortValue => {
      if (sort.k === "study") return studyShort(pack, r.study);
      if (sort.k === "grade") return r.grade;
      if (sort.k === "overall") return overallCloseness(closeness[r.study], activeIds);
      const a = closeness[r.study]?.[sort.k.slice(4)];
      return a && !a.reason && !a.missing ? a.score : null;
    };
    return sort.k === "default" ? shown : sortStable(shown, key, sort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, sort, closeness, pack, activeIds.join("|")]);
  const hth = (k: string, label: React.ReactNode, cls = "") => <SortTh key={k} label={label} className={cls} active={sort.k === k} dir={sort.dir} onSort={() => setSort((s) => nextSort(s, k))} />;
  return (
    <figure className="fig wide" id="fig-heat">
      <table className="heat">
        <thead>
          <tr>
            {hth("study", (lens.unit_of_study ?? "study").replace(/^./, (c) => c.toUpperCase()))}
            {hth("grade", "Grade")}
            {hth("overall", t("Overall closeness"), "c")}
            {actives.map((v) =>
              hth(
                `var:${v.id}`,
                <>
                  {v.label}
                  <small>
                    {" "}
                    {typeof scenario.values[v.id] === "number" ? `${num(scenario.values[v.id] as number)} ${(v as NumVariable).unit}` : String(scenario.values[v.id] ?? "")}
                  </small>
                </>,
                "c",
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = pack.studies.find((s) => s.id === r.study)!;
            return (
              <tr key={r.study}>
                <td title={st.title}>
                  <b>{st.short}</b> <span className="hint">{st.id}</span>
                </td>
                <td>
                  <Grade g={r.grade} />
                </td>
                <td className="c">{(() => { const o = overallCloseness(closeness[r.study], activeIds); return o === null ? "—" : <b>{num(o, 1)}</b>; })()}</td>
                {actives.map((v) => {
                  const a = closeness[r.study]?.[v.id];
                  if (!a) return <td key={v.id} />;
                  if (a.reason) return <td key={v.id} className="c miss">— <small>{REASON[a.reason]}</small></td>;
                  const rec = a.nearest ? pack.records.find((x) => x.id === a.nearest) : null;
                  const tip =
                    v.type === "num"
                      ? t("Tested range in this source: {0}. Nearest record: {1}. Gap to scenario: {2} {3}.", a.tested ? rangeText(a.tested, v) : "—", rec ? t("{0} ({1}), row {2}", rec.label, valueText(rec, v), rec.source.row) : "—", num(a.gap ?? 0), v.unit)
                      : a.score === 100
                        ? t("{0} appears in this source{1}.", scenario.values[v.id], rec ? t(" (first: {0}, row {1})", rec.label, rec.source.row) : "")
                        : t("{0} does not appear in the comparable records of this source.", scenario.values[v.id]);
                  return (
                    <td key={v.id} className="c cell" title={tip}>
                      <span className="bar" style={{ width: `${a.score}%` }} />
                      <Src id={rec?.id} title={tip}>
                        <b>{a.score}</b>
                        <small> {rec && v.type === "num" ? valueText(rec, v) : v.type === "cat" ? (a.score === 100 ? t("tested") : t("not tested")) : ""}</small>
                      </Src>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <figcaption>
        <b>
          {t("Figure")} {figure} {t("| Closeness of each")} {lens.unit_of_study ?? t("study")} {t("to the scenario, by variable.")}
        </b>{" "}
        {t("Column buttons sort the rows (stable; empty values last); the default order is the ranking of Table 1. Overall closeness is the mean of the cell scores over the variables the source records; unrecorded variables are left out of the mean, not counted as zero. Each cell gives the closeness score (0–100; 100 means a record covers the scenario value, 0 means the nearest record is at least")} {pack.schema.thresholds.closeness_reach}{t("σ away) and, in small type, the value of the nearest record. A dash means the variable is not recorded: it is reported as missing, never as zero evidence.")}{" "}
        {rest.length > 0 && (
          <>
            {all ? t("All sources are shown. ") : t("{0} {1} without comparable records are not shown ({2}). ", rest.length, many(lens.unit_of_study ?? "study"), rest.map((r) => studyShort(pack, r.study)).join(", "))}
            <button type="button" className="link noprint" onClick={() => setAll((x) => !x)}>
              {all ? t("show comparable only") : t("show all")}
            </button>
          </>
        )}{" "}
        <span className="hint">{t("Hover a cell for the tested range; click it for the source row.")}</span>
      </figcaption>
    </figure>
  );
}

type CellKey = { x: string; y: string; xi: number; yi: number };

/** Middle of the cell on each axis, kept inside the range the variable allows and rounded to its step. */
function cellCentre(v: NumVariable, lo: number, hi: number): number {
  const mid = (lo + hi) / 2;
  const clamped = Math.min(v.range[1], Math.max(v.range[0], mid));
  const step = v.step ?? 0;
  const snapped = step > 0 ? Math.round(clamped / step) * step : clamped;
  return Number(Math.min(v.range[1], Math.max(v.range[0], snapped)).toFixed(4));
}

export function GapFigure({ grid, scenario, figure, axes, onAxes, onPick }: {
  grid: GapGrid;
  scenario: Scenario;
  figure: number;
  axes: { x: string; y: string };
  onAxes: (a: { x: string; y: string }) => void;
  onPick: (values: Record<string, number>) => void;
}) {
  const { pack, lens } = useData();
  const nums = pack.schema.variables.filter((v): v is NumVariable => v.type === "num");

  if (nums.length < 2 || !grid || !pack.schema.variables.some((v) => v.id === grid.x) || !pack.schema.variables.some((v) => v.id === grid.y)) {
    return (
      <figure className="fig wide gap" id="fig-gaps">
        <figcaption>
          <b>{t("Figure")} {figure} |</b> {t("Coverage and gaps.")}
        </figcaption>
        <div className="fig-fallback-note" style={{ padding: "2.5rem 1.5rem", textAlign: "center", color: "var(--ink-2)", background: "var(--bg-subtle, rgba(0,0,0,0.02))", borderRadius: "4px", margin: "1rem 0" }}>
          <p>{t("At least two numeric variables are required to display coverage and gaps.")}</p>
        </div>
      </figure>
    );
  }

  const vx = varOf(pack, grid.x) as NumVariable;
  const vy = varOf(pack, grid.y) as NumVariable;
  const nx = grid.xEdges.length - 1;
  const ny = grid.yEdges.length - 1;
  const W = 1060;
  const L = 78;
  const cw = (W - L - 16) / Math.max(1, nx);
  const ch = 40;
  const H = ny * ch + 58;
  const max = Math.max(1, ...grid.cells.flat().map((c) => c.n));
  const name = grid.partition ? partitionName(lens, grid.partition) : t("all tests");
  const otherTotal = grid.cells.flat().reduce((a, c) => a + c.other, 0);

  const [pinned, setPinned] = useState<CellKey | null>(null);
  const [hover, setHover] = useState<{ xi: number; yi: number } | null>(null);
  const [showOther, setShowOther] = useState(true);
  // A selection belongs to one pair of axes; changing the axes drops it.
  const pin = pinned && pinned.x === grid.x && pinned.y === grid.y && grid.cells[pinned.yi]?.[pinned.xi] ? pinned : null;
  const shown = hover ?? pin;

  const range = (xi: number, yi: number) => ({
    x: `${num(grid.xEdges[xi])}–${num(grid.xEdges[xi + 1])} ${vx.unit}`,
    y: `${num(grid.yEdges[yi])}–${num(grid.yEdges[yi + 1])} ${vy.unit}`,
  });
  const moveHere = (xi: number, yi: number) =>
    onPick({
      [vx.id]: cellCentre(vx, grid.xEdges[xi], grid.xEdges[xi + 1]),
      [vy.id]: cellCentre(vy, grid.yEdges[yi], grid.yEdges[yi + 1]),
    });
  const describe = (xi: number, yi: number) => {
    const c = grid.cells[yi][xi];
    const r = range(xi, yi);
    return t("{0} {1}, {2} {3}: {4}{5}; {6} in other partitions", vx.label, r.x, vy.label, r.y, count(c.n, "comparable test"), c.studies.length ? t(" from {0}", c.studies.map((s) => studyShort(pack, s)).join(", ")) : "", c.other);
  };
  const near = grid.nearestCell;
  const scn = grid.scenarioCell;
  const scnEmpty = scn ? grid.cells[scn.yi][scn.xi].n === 0 : false;
  const both = scenario.active.includes(grid.x) && scenario.active.includes(grid.y);
  const select = (xi: number, yi: number) => setPinned(pin && pin.xi === xi && pin.yi === yi ? null : { x: grid.x, y: grid.y, xi, yi });

  return (
    <figure className="fig wide gap" id="fig-gaps">
      <div className="figctl noprint">
        <label>
          {t("Horizontal")}
          <select value={axes.x} onChange={(e) => onAxes({ ...axes, x: e.target.value })}>
            {nums.filter((v) => v.id !== axes.y).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Vertical")}
          <select value={axes.y} onChange={(e) => onAxes({ ...axes, y: e.target.value })}>
            {nums.filter((v) => v.id !== axes.x).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} ({v.unit})
              </option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <button type="button" className="chip" aria-pressed={showOther} onClick={() => setShowOther(!showOther)}>
          {t("Other partitions")}
        </button>
        {near && scnEmpty && both && (
          <button type="button" className="chip accent" onClick={() => moveHere(near.xi, near.yi)}>
            {t("Move the scenario to the nearest covered cell")}
          </button>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("Coverage of {0} by {1}. Each cell can be selected.", vx.label, vy.label)}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--rule)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {grid.cells.map((row, yi) =>
          row.map((c, xi) => {
            const x = L + xi * cw;
            const y = (ny - 1 - yi) * ch + 8;
            const dark = c.n / max > 0.55;
            const isScn = scn?.xi === xi && scn?.yi === yi;
            const isNear = near && scnEmpty && near.xi === xi && near.yi === yi;
            const isPin = pin?.xi === xi && pin?.yi === yi;
            const isHot = hover?.xi === xi && hover?.yi === yi;
            return (
              <g
                key={`${xi}-${yi}`}
                className={`gcell${isPin ? " pin" : ""}${isHot ? " hot" : ""}`}
                tabIndex={0}
                role="button"
                aria-pressed={isPin}
                aria-label={describe(xi, yi)}
                onClick={() => select(xi, yi)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(xi, yi);
                  }
                }}
                onMouseEnter={() => setHover({ xi, yi })}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover({ xi, yi })}
                onBlur={() => setHover(null)}
              >
                <rect x={x} y={y} width={cw} height={ch} fill={c.n ? "var(--ink)" : "url(#hatch)"} fillOpacity={c.n ? 0.1 + 0.75 * (c.n / max) : 1} stroke="var(--paper)" strokeWidth="2" />
                <text x={x + cw / 2} y={y + ch / 2 + 1} textAnchor="middle" className="lab" style={{ fontSize: 13, fontWeight: 600, fill: dark ? "var(--paper)" : "var(--ink)" }}>
                  {c.n}
                </text>
                {showOther && c.other > 0 && (
                  <text x={x + cw / 2} y={y + ch - 5} textAnchor="middle" className="lab" style={{ fontSize: 10, fill: dark ? "var(--paper)" : "var(--ink-3)" }}>
                    {t("other partitions:")} {c.other}
                  </text>
                )}
                {isNear && <rect x={x + 2} y={y + 2} width={cw - 4} height={ch - 4} fill="none" stroke="var(--paper)" strokeWidth="4" />}
                {isNear && <rect x={x + 2} y={y + 2} width={cw - 4} height={ch - 4} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeDasharray="5 3" />}
                {isScn && <rect x={x + 1.5} y={y + 1.5} width={cw - 3} height={ch - 3} fill="none" stroke="var(--accent)" strokeWidth="2.5" />}
                {isScn && (
                  <text x={x + 6} y={y + 10} className="scn-txt" style={{ fontSize: 10, paintOrder: "stroke", stroke: "var(--paper)", strokeWidth: 3, strokeLinejoin: "round" }}>
                    {t("scenario")}
                  </text>
                )}
                {isNear && (
                  <text x={x + 6} y={y + 10} className="scn-txt" style={{ fontSize: 10, paintOrder: "stroke", stroke: "var(--paper)", strokeWidth: 3, strokeLinejoin: "round" }}>
                    {t("nearest covered")}
                  </text>
                )}
                <rect className="gsel" x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} fill="none" />
              </g>
            );
          }),
        )}
        <g className="ax">
          {grid.xEdges.map((e, i) => (
            <text key={`x${i}`} x={L + i * cw} y={ny * ch + 24} textAnchor="middle">
              {num(e)}
            </text>
          ))}
          {grid.yEdges.map((e, i) => (
            <text key={`y${i}`} x={L - 8} y={(ny - i) * ch + 12} textAnchor="end">
              {num(e)}
            </text>
          ))}
          <text x={L + (nx * cw) / 2} y={H - 6} textAnchor="middle">
            {vx.long ?? vx.label} ({vx.unit})
          </text>
          <text transform={`translate(14 ${(ny * ch) / 2 + 8}) rotate(-90)`} textAnchor="middle">
            {vy.long ?? vy.label} ({vy.unit})
          </text>
        </g>
      </svg>

      <div className="gap-detail" aria-live="polite">
        {!shown ? (
          <p className="hint">{t("Hover a cell to read it, select one to pin it and to move the scenario there.")}{near && scnEmpty && both ? t(" The dashed outline marks the covered cell nearest to the scenario.") : ""}</p>
        ) : (
          (() => {
            const c = grid.cells[shown.yi][shown.xi];
            const r = range(shown.xi, shown.yi);
            const pinnedNow = pin && pin.xi === shown.xi && pin.yi === shown.yi;
            return (
              <>
                <p>
                  <b>
                    {vx.label} {r.x} · {vy.label} {r.y}
                  </b>
                  {pinnedNow ? "" : t(" (hover)")}
                </p>
                <p>
                  {c.n === 0 ? (
                    <>{t("No comparable test was recorded in this cell. An empty cell states that nothing was recorded there; it does not state what would happen.")}</>
                  ) : (
                    <>
                      {count(c.n, "comparable test")} {t("from")} {count(c.studies.length, lens.unit_of_study ?? "study")}:{" "}
                      {c.studies.map((s) => studyShort(pack, s)).join(", ")}.
                    </>
                  )}{" "}
                  {c.other > 0 ? t("{0} tests of other partitions fall here, as context.", c.other) : ""}
                </p>
                {pinnedNow && (
                  <p className="gap-actions noprint">
                    <button type="button" className="chip accent" onClick={() => moveHere(shown.xi, shown.yi)}>
                      {t("Move the scenario to this cell")}
                    </button>
                    <button type="button" className="chip" onClick={() => setPinned(null)}>
                      {t("Unpin")}
                    </button>
                  </p>
                )}
              </>
            );
          })()
        )}
      </div>

      <figcaption>
        <b>
          {t("Figure")} {figure} {t("| Coverage and gaps:")} {(vx.long ?? vx.label).toLowerCase()} × {(vy.long ?? vy.label).toLowerCase()}, {name}.
        </b>{" "}
        {t("Large number: comparable tests in the cell (")}{name}{t("). Small number: tests of other partitions in the same cell, shown as context. Hatched cells have no comparable test. Cell edges are quantiles of the values observed in the whole corpus, so cells are not equally wide.")}{" "}
        {grid.both === 0 ? (
          <b>
            {t("None of the")} {grid.total} {t("comparable tests records both variables:")} {grid.no_x} {t("lack")} {vx.label} {t("and")} {grid.no_y} {t("lack")} {vy.label}{t(", so the map has no comparable coverage at all.")}
          </b>
        ) : (
          <>
            {grid.both} {t("of")} {grid.total} {t("comparable tests record both variables (")}{grid.no_x} {t("lack")} {vx.label}, {grid.no_y} {t("lack")} {vy.label}).
            {scn && scnEmpty && t(" The scenario cell is empty.")}
          </>
        )}{" "}
        {otherTotal > 0 && t("{0} tests of other partitions record both.", otherTotal.toLocaleString("en-US"))}
        {both ? t(" The red outline is the scenario cell.") : ""}
      </figcaption>
    </figure>
  );
}

export function SourcesTable({ n }: { n: number }) {
  const { pack, lens } = useData();
  return (
    <table id="tbl-sources">
      <caption>
        <b>{t("Table")} {n} |</b> {pack.studies.length} {many(lens.unit_of_study ?? "study")} {t("synthesised in this report (metadata from the repository records).")}
      </caption>
      <thead>
        <tr>
          <th>{t("Id")}</th>
          <th>{t("Acronym")}</th>
          <th>{t("Title")}</th>
          <th>{t("Platform · hardware")}</th>
          <th>{t("Period")}</th>
          <th className="r">{t("Tests")}</th>
          <th className="r">{t("Campaign rows")}</th>
          <th className="r">{t("Publications")}</th>
          <th>{t("Dataset DOI")}</th>
        </tr>
      </thead>
      <tbody>
        {pack.studies.map((s) => {
          const doi = doiOf(pack, s.id);
          const a = s.attributes;
          const yr = (d: unknown) => (typeof d === "string" && d ? d.slice(-4) : "");
          return (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>
                <b>{s.short}</b>
              </td>
              <td>{s.title}</td>
              <td>{[a.program, ...(Array.isArray(a.hardware) ? a.hardware : [])].filter(Boolean).join(" · ") || (a.project_type as string) || "—"}</td>
              <td>{yr(a.start) ? `${yr(a.start)}–${yr(a.end)}` : "—"}</td>
              <td className="r">{s.counts.tests ?? 0}</td>
              <td className="r">{s.counts.records - (s.counts.tests ?? 0)}</td>
              <td className="r">{s.counts.publications}</td>
              <td className="src">{doi ? <a href={doi.url} target="_blank" rel="noreferrer">{doi.label}</a> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
