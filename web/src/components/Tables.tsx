import { useMemo, useState } from "react";
import type { AxisScore, Finding, GapGrid, NumVariable, Scenario, StudyResult } from "../engine";
import { useData, Src } from "./ctx";
import { doiOf, num, partitionName, rangeText, studyShort, valueText, varOf } from "../report/format";
import { FINDING_LEVEL, findingText, findingTitle, whyText } from "../report/text";

export function Grade({ g }: { g: string }) {
  return <span className={`grade g${g}`}>{g}</span>;
}

export function KeyFindings({ findings }: { findings: Finding[] }) {
  const { pack, lens } = useData();
  const top = findings.slice(0, 4);
  return (
    <section className="keys" aria-label="Key findings">
      <h2>Key findings</h2>
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
                {studyShort(pack, rec.study)} {rec.label}, row {rec.source.row}
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
        <b>Table 2 |</b> All findings for the scenario, computed by rule (Methods). Levels: attention, caution, context, support.
      </caption>
      <thead>
        <tr>
          <th>Level</th>
          <th>Finding</th>
          <th className="r">Metric</th>
          <th>Statement</th>
          <th>Sources</th>
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
              {f.sources.length > 6 && ` and ${f.sources.length - 6} more`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type SortKey = "rank" | "study" | "distance" | "tests";

export function RankingTable({ results, scenario }: { results: StudyResult[]; scenario: Scenario }) {
  const { pack, lens } = useData();
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "rank", dir: 1 });
  const rows = useMemo(() => {
    const withRank = results.map((r, i) => ({ r, i }));
    const key = (x: { r: StudyResult; i: number }) =>
      sort.k === "rank" ? x.i : sort.k === "study" ? studyShort(pack, x.r.study) : sort.k === "distance" ? (x.r.distance ?? Infinity) : x.r.comparable;
    return [...withRank].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return (typeof ka === "string" ? ka.localeCompare(kb as string) : (ka as number) - (kb as number)) * sort.dir || a.i - b.i;
    });
  }, [results, sort, pack]);
  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`sort ${cls} ${sort.k === k ? (sort.dir === 1 ? "asc" : "desc") : ""}`} onClick={() => setSort((s) => ({ k, dir: s.k === k && s.dir === 1 ? -1 : 1 }))}>
      {label}
    </th>
  );
  const actives = scenario.active.map((id) => varOf(pack, id));
  return (
    <table id="tbl-rank">
      <caption>
        <b>Table 1 |</b> {lens.unit_of_study ? lens.unit_of_study[0].toUpperCase() + lens.unit_of_study.slice(1) : "Study"} ranking for the scenario: grade A–D, then number of missing variables, then normalised distance <i>d</i> of the nearest comparable record. <span className="hint">Click a column to sort; click a test for its source row.</span>
      </caption>
      <thead>
        <tr>
          {th("rank", "#")}
          {th("study", lens.unit_of_study ? lens.unit_of_study[0].toUpperCase() + lens.unit_of_study.slice(1) : "Study")}
          <th>Grade</th>
          {th("distance", "d", "r")}
          <th>Nearest record</th>
          {actives.map((v) => (
            <th key={v.id} className="r">
              {v.label}
              {v.type === "num" ? ` (${v.unit})` : ""}
            </th>
          ))}
          <th>Why</th>
          {th("tests", "Comparable records", "r")}
          <th>Dataset DOI</th>
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
              <td>{rec ? <Src id={rec.id}>{rec.label}, row {rec.source.row}</Src> : "—"}</td>
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

const REASON: Record<string, string> = {
  not_recorded: "not recorded",
  not_comparable: "not comparable",
  no_records: "no table",
  no_evidence: "no data",
};

export function HeatTable({ results, closeness, scenario, figure }: { results: StudyResult[]; closeness: Record<string, Record<string, AxisScore>>; scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
  const [all, setAll] = useState(false);
  const actives = scenario.active.map((id) => varOf(pack, id));
  const comparableRows = results.filter((r) => r.comparable > 0);
  const rest = results.filter((r) => r.comparable === 0);
  const rows = all ? results : comparableRows;
  return (
    <figure className="fig wide" id="fig-heat">
      <table className="heat">
        <thead>
          <tr>
            <th>{(lens.unit_of_study ?? "study").replace(/^./, (c) => c.toUpperCase())}</th>
            <th>Grade</th>
            {actives.map((v) => (
              <th key={v.id} className="c">
                {v.label}
                <small>
                  {" "}
                  {typeof scenario.values[v.id] === "number" ? `${num(scenario.values[v.id] as number)} ${(v as NumVariable).unit}` : String(scenario.values[v.id] ?? "")}
                </small>
              </th>
            ))}
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
                {actives.map((v) => {
                  const a = closeness[r.study]?.[v.id];
                  if (!a) return <td key={v.id} />;
                  if (a.reason) return <td key={v.id} className="c miss">— <small>{REASON[a.reason]}</small></td>;
                  const rec = a.nearest ? pack.records.find((x) => x.id === a.nearest) : null;
                  const tip =
                    v.type === "num"
                      ? `Tested range in this source: ${a.tested ? rangeText(a.tested, v) : "—"}. Nearest record: ${rec ? `${rec.label} (${valueText(rec, v)}), row ${rec.source.row}` : "—"}. Gap to scenario: ${num(a.gap ?? 0)} ${v.unit}.`
                      : a.score === 100
                        ? `${scenario.values[v.id]} appears in this source${rec ? ` (first: ${rec.label}, row ${rec.source.row})` : ""}.`
                        : `${scenario.values[v.id]} does not appear in the comparable records of this source.`;
                  return (
                    <td key={v.id} className="c cell" title={tip}>
                      <span className="bar" style={{ width: `${a.score}%` }} />
                      <Src id={rec?.id} title={tip}>
                        <b>{a.score}</b>
                        <small> {rec && v.type === "num" ? valueText(rec, v) : v.type === "cat" ? (a.score === 100 ? "tested" : "not tested") : ""}</small>
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
          Figure {figure} | Closeness of each {lens.unit_of_study ?? "study"} to the scenario, by variable.
        </b>{" "}
        Each cell gives the closeness score (0–100; 100 means a record covers the scenario value, 0 means the nearest record is at least {pack.schema.thresholds.closeness_reach}σ away) and, in small type, the value of the nearest record. A dash means the variable is not recorded: it is reported as missing, never as zero evidence.{" "}
        {rest.length > 0 && (
          <>
            {all ? "All sources are shown. " : `${rest.length} ${lens.unit_of_study ?? "study"}s without comparable records are not shown (${rest.map((r) => studyShort(pack, r.study)).join(", ")}). `}
            <button type="button" className="link noprint" onClick={() => setAll((x) => !x)}>
              {all ? "show comparable only" : "show all"}
            </button>
          </>
        )}{" "}
        <span className="hint">Hover a cell for the tested range; click it for the source row.</span>
      </figcaption>
    </figure>
  );
}

export function GapFigure({ grid, scenario, figure }: { grid: GapGrid; scenario: Scenario; figure: number }) {
  const { pack, lens } = useData();
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
  const name = grid.partition ? partitionName(lens, grid.partition) : "all tests";
  const otherTotal = grid.cells.flat().reduce((a, c) => a + c.other, 0);
  return (
    <figure className="fig wide" id="fig-gaps">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Coverage of ${vx.label} by ${vy.label}`}>
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
            const isScn = grid.scenarioCell?.xi === xi && grid.scenarioCell?.yi === yi;
            return (
              <g key={`${xi}-${yi}`}>
                <rect x={x} y={y} width={cw} height={ch} fill={c.n ? "var(--ink)" : "url(#hatch)"} fillOpacity={c.n ? 0.1 + 0.75 * (c.n / max) : 1} stroke="var(--paper)" strokeWidth="2">
                  <title>
                    {`${vx.label} ${num(grid.xEdges[xi])}–${num(grid.xEdges[xi + 1])} ${vx.unit}, ${vy.label} ${num(grid.yEdges[yi])}–${num(grid.yEdges[yi + 1])} ${vy.unit}\n${c.n} comparable tests (${name})${c.studies.length ? ": " + c.studies.map((s) => studyShort(pack, s)).join(", ") : ""}\n${c.other} tests in other partitions`}
                  </title>
                </rect>
                <text x={x + cw / 2} y={y + ch / 2 + 1} textAnchor="middle" className="lab" style={{ fontSize: 13, fontWeight: 600, fill: dark ? "var(--paper)" : "var(--ink)" }}>
                  {c.n}
                </text>
                {c.other > 0 && (
                  <text x={x + cw / 2} y={y + ch - 5} textAnchor="middle" className="lab" style={{ fontSize: 10, fill: dark ? "var(--paper)" : "var(--ink-3)" }}>
                    other partitions: {c.other}
                  </text>
                )}
                {isScn && <rect x={x + 1.5} y={y + 1.5} width={cw - 3} height={ch - 3} fill="none" stroke="var(--accent)" strokeWidth="2.5" />}
                {isScn && (
                  <text x={x + 6} y={y + 12} className="scn-txt" style={{ fontSize: 10 }}>
                    scenario
                  </text>
                )}
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
      <figcaption>
        <b>
          Figure {figure} | Coverage and gaps: {(vx.long ?? vx.label).toLowerCase()} × {(vy.long ?? vy.label).toLowerCase()}, {name}.
        </b>{" "}
        Large number: comparable tests in the cell ({name}). Small number: tests of other partitions in the same cell, shown as context. Hatched cells have no comparable test. Cell edges are quantiles of the values observed in the whole corpus, so cells are not equally wide.{" "}
        {grid.both === 0 ? (
          <b>
            None of the {grid.total} comparable tests records both variables: {grid.no_x} lack {vx.label} and {grid.no_y} lack {vy.label}, so the map has no comparable coverage at all.
          </b>
        ) : (
          <>
            {grid.both} of {grid.total} comparable tests record both variables ({grid.no_x} lack {vx.label}, {grid.no_y} lack {vy.label}).
            {grid.scenarioCell && grid.cells[grid.scenarioCell.yi][grid.scenarioCell.xi].n === 0 && " The scenario cell is empty."}
          </>
        )}{" "}
        {otherTotal > 0 && `${otherTotal.toLocaleString("en-US")} tests of other partitions record both.`}
        {scenario.active.includes(grid.x) && scenario.active.includes(grid.y) ? " The red outline is the scenario cell." : ""}
      </figcaption>
    </figure>
  );
}

export function SourcesTable({ n }: { n: number }) {
  const { pack, lens } = useData();
  return (
    <table id="tbl-sources">
      <caption>
        <b>Table {n} |</b> {pack.studies.length} {lens.unit_of_study ?? "study"}s synthesised in this report (metadata from the repository records).
      </caption>
      <thead>
        <tr>
          <th>Id</th>
          <th>Acronym</th>
          <th>Title</th>
          <th>Platform · hardware</th>
          <th>Period</th>
          <th className="r">Tests</th>
          <th className="r">Campaign rows</th>
          <th className="r">Publications</th>
          <th>Dataset DOI</th>
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
