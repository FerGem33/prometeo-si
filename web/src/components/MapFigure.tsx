import { useMemo, useState } from "react";
import type { DataRecord, NumVariable, Partition, Scenario } from "../engine";
import { sigmaOf } from "../engine";
import { useData, useProv } from "./ctx";
import { num, partitionName, studyShort, valueText } from "../report/format";
import type { Axes } from "../state";

const W = 1060;
const L = 64;
const R = 16;
const T = 14;
const PLOT_H = 300;
const STRIP_H = 64;
const H = T + PLOT_H + 26 + STRIP_H + 44;

function ticks(lo: number, hi: number, n = 8): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let x = Math.ceil(lo / step) * step; x <= hi + 1e-9; x += step) out.push(Math.round(x * 1e6) / 1e6);
  return out;
}

const mid = (r: DataRecord, id: string): number | null => {
  const x = r.values[id];
  return Array.isArray(x) ? (x[0] + x[1]) / 2 : null;
};

// deterministic jitter so repeated conditions stay visible
const jit = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};

function Mark({ shape, x, y, own, onClick, title }: { shape: number; x: number; y: number; own: boolean; onClick: () => void; title: string }) {
  const common = {
    className: "pt",
    onClick,
    fill: own ? "var(--ink)" : "none",
    fillOpacity: own ? 0.55 : 1,
    stroke: own ? "none" : "var(--ink-3)",
    strokeWidth: 1,
  };
  const s = 3.2;
  const t = <title>{title}</title>;
  if (shape === 0) return <circle cx={x} cy={y} r={s} {...common}>{t}</circle>;
  if (shape === 1) return <rect x={x - s} y={y - s} width={2 * s} height={2 * s} {...common}>{t}</rect>;
  if (shape === 2) return <path d={`M${x},${y - s - 1} L${x + s + 1},${y + s} L${x - s - 1},${y + s} Z`} {...common}>{t}</path>;
  return <path d={`M${x},${y - s - 1} L${x + s + 1},${y} L${x},${y + s + 1} L${x - s - 1},${y} Z`} {...common}>{t}</path>;
}

export function MapFigure({
  scenario,
  partition,
  axes,
  onAxes,
  onPick,
  figure,
}: {
  scenario: Scenario;
  partition: Partition;
  axes: Axes;
  onAxes: (a: Axes) => void;
  onPick: (values: Record<string, number>) => void;
  figure: number;
}) {
  const { pack, lens } = useData();
  const open = useProv();
  const nums = pack.schema.variables.filter((v): v is NumVariable => v.type === "num");
  const vx = nums.find((v) => v.id === axes.x)!;
  const vy = nums.find((v) => v.id === axes.y)!;
  const pv = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  const [hidden, setHidden] = useState<string[]>([]);

  const tests = useMemo(() => pack.records.filter((r) => r.kind === "test"), [pack]);
  const groups = useMemo(() => {
    const c = new Map<string, number>();
    if (pv) for (const r of tests) c.set(r.values[pv.id] as string, (c.get(r.values[pv.id] as string) ?? 0) + 1);
    return [...c].map(([value, n]) => ({ value, n }));
  }, [tests, pv]);
  const shapeOf = (r: DataRecord) => (pv ? Math.max(0, groups.findIndex((g) => g.value === r.values[pv.id])) % 4 : 0);
  const own = (r: DataRecord) => !partition || r.values[partition.variable] === partition.value;

  const sx = scenario.active.includes(vx.id) && typeof scenario.values[vx.id] === "number" ? (scenario.values[vx.id] as number) : null;
  const sy = scenario.active.includes(vy.id) && typeof scenario.values[vy.id] === "number" ? (scenario.values[vy.id] as number) : null;

  const dom = (v: NumVariable, s: number | null): [number, number] => {
    const xs = tests.map((r) => mid(r, v.id)).filter((x): x is number => x !== null);
    if (s !== null) xs.push(s);
    if (!xs.length) return v.range;
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    const pad = (hi - lo || 1) * 0.04;
    return [Math.max(v.range[0], lo - pad), hi + pad];
  };
  const dx = dom(vx, sx);
  const dy = dom(vy, sy);
  const X = (x: number) => L + ((x - dx[0]) / (dx[1] - dx[0])) * (W - L - R);
  const Y = (y: number) => T + PLOT_H - ((y - dy[0]) / (dy[1] - dy[0])) * PLOT_H;
  const stripTop = T + PLOT_H + 26;

  const visible = tests.filter((r) => !pv || !hidden.includes(r.values[pv.id] as string));
  const both = visible.filter((r) => mid(r, vx.id) !== null && mid(r, vy.id) !== null);
  const xOnly = visible.filter((r) => mid(r, vx.id) !== null && mid(r, vy.id) === null);
  const yOnly = visible.filter((r) => mid(r, vx.id) === null && mid(r, vy.id) !== null);
  const neither = visible.filter((r) => mid(r, vx.id) === null && mid(r, vy.id) === null);
  const title = (r: DataRecord) =>
    `${studyShort(pack, r.study)} · test ${r.label}\n${vx.label}: ${valueText(r, vx)} · ${vy.label}: ${valueText(r, vy)}${pv ? `\n${partitionName(lens, r.values[pv.id] as string)}` : ""}\nClick for file, row and DOI`;

  const tolX = pack.schema.thresholds.tolerance * sigmaOf(vx, scenario);
  const tolY = pack.schema.thresholds.tolerance * sigmaOf(vy, scenario);
  const ownName = partition ? partitionName(lens, partition.value) : "all tests";

  const pick = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const py = ((e.clientY - box.top) / box.height) * H;
    const snap = (x: number, v: NumVariable) => {
      const st = v.step ?? 0.01;
      return Math.min(v.range[1], Math.max(v.range[0], Math.round(x / st) * st));
    };
    const x = dx[0] + ((px - L) / (W - L - R)) * (dx[1] - dx[0]);
    const y = dy[0] + ((T + PLOT_H - py) / PLOT_H) * (dy[1] - dy[0]);
    onPick({ [vx.id]: Number(snap(x, vx).toFixed(4)), [vy.id]: Number(snap(y, vy).toFixed(4)) });
  };

  return (
    <figure className="fig wide" id="fig-map">
      <div className="figctl">
        <label>
          Horizontal
          <select value={axes.x} onChange={(e) => onAxes({ ...axes, x: e.target.value })}>
            {nums.map((v) => (
              <option key={v.id} value={v.id} disabled={v.id === axes.y}>
                {v.long ?? v.label} ({v.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          Vertical
          <select value={axes.y} onChange={(e) => onAxes({ ...axes, y: e.target.value })}>
            {nums.map((v) => (
              <option key={v.id} value={v.id} disabled={v.id === axes.x}>
                {v.long ?? v.label} ({v.unit})
              </option>
            ))}
          </select>
        </label>
        <span className="sep" />
        {groups.map((g, i) => (
          <button
            key={g.value}
            type="button"
            className="chip"
            aria-pressed={!hidden.includes(g.value)}
            onClick={() => setHidden((h) => (h.includes(g.value) ? h.filter((x) => x !== g.value) : [...h, g.value]))}
          >
            <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
              <Mark shape={i % 4} x={0} y={0} own={!partition || partition.value === g.value} onClick={() => {}} title="" />
            </svg>
            {partitionName(lens, g.value)} · {g.n}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tests by ${vx.label} and ${vy.label}`}>
        <g className="grid">
          {ticks(dx[0], dx[1]).map((t) => (
            <line key={`gx${t}`} x1={X(t)} x2={X(t)} y1={T} y2={T + PLOT_H} />
          ))}
          {ticks(dy[0], dy[1], 6).map((t) => (
            <line key={`gy${t}`} x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} />
          ))}
        </g>
        <rect className="plot-bg" x={L} y={T} width={W - L - R} height={PLOT_H} onClick={pick} />
        <rect x={L} y={stripTop} width={W - L - R} height={STRIP_H} fill="none" stroke="var(--rule)" strokeDasharray="3 3" />
        <text className="lab" x={L + 6} y={stripTop + 12}>
          {vy.label} not recorded: {xOnly.length} tests, placed by {vx.label} only
        </text>
        {sx !== null && sy !== null && <rect className="hood" x={X(sx - tolX)} y={Y(sy + tolY)} width={X(sx + tolX) - X(sx - tolX)} height={Y(sy - tolY) - Y(sy + tolY)} />}
        {sx !== null && <rect className="hood" x={X(sx - tolX)} y={stripTop} width={X(sx + tolX) - X(sx - tolX)} height={STRIP_H} />}
        <g>
          {both.map((r, i) => (
            <Mark key={r.id} shape={shapeOf(r)} own={own(r)} x={X(mid(r, vx.id)!) + jit(i, 1) * 5} y={Y(mid(r, vy.id)!) + jit(i, 2) * 5} onClick={() => open(r.id)} title={title(r)} />
          ))}
          {xOnly.map((r, i) => (
            <Mark key={r.id} shape={shapeOf(r)} own={own(r)} x={X(mid(r, vx.id)!) + jit(i, 3) * 6} y={stripTop + 22 + (jit(i, 4) + 0.5) * (STRIP_H - 30)} onClick={() => open(r.id)} title={title(r)} />
          ))}
        </g>
        <g className="ax">
          <line x1={L} x2={W - R} y1={T + PLOT_H} y2={T + PLOT_H} />
          <line x1={L} x2={L} y1={T} y2={T + PLOT_H} />
          {ticks(dx[0], dx[1]).map((t) => (
            <text key={`tx${t}`} x={X(t)} y={T + PLOT_H + 15} textAnchor="middle">
              {num(t)}
            </text>
          ))}
          {ticks(dy[0], dy[1], 6).map((t) => (
            <text key={`ty${t}`} x={L - 8} y={Y(t) + 4} textAnchor="end">
              {num(t)}
            </text>
          ))}
          <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle">
            {vx.long ?? vx.label} ({vx.unit})
          </text>
          <text transform={`translate(14 ${T + PLOT_H / 2}) rotate(-90)`} textAnchor="middle">
            {vy.long ?? vy.label} ({vy.unit})
          </text>
        </g>
        {sx !== null && <line className="scn" x1={X(sx)} x2={X(sx)} y1={T} y2={stripTop + STRIP_H} />}
        {sy !== null && <line className="scn" x1={L} x2={W - R} y1={Y(sy)} y2={Y(sy)} />}
        {sx !== null && (
          <text className="scn-txt" x={X(sx) + (X(sx) > W - 220 ? -6 : 6)} y={T + 12} textAnchor={X(sx) > W - 220 ? "end" : "start"}>
            Scenario: {num(sx)} {vx.unit}
            {sy !== null ? ` · ${num(sy)} ${vy.unit}` : ""}
          </text>
        )}
        {sx === null && sy !== null && (
          <text className="scn-txt" x={W - R - 6} y={Y(sy) - 5} textAnchor="end">
            Scenario: {num(sy)} {vy.unit}
          </text>
        )}
      </svg>
      <figcaption>
        <b>
          Figure {figure} | Individual tests by {(vx.long ?? vx.label).toLowerCase()} and {(vy.long ?? vy.label).toLowerCase()}.
        </b>{" "}
        Upper panel: the {both.length.toLocaleString("en-US")} tests that record both variables. Lower strip: the {xOnly.length.toLocaleString("en-US")} tests that record {vx.label} but not {vy.label}, placed by {vx.label} only.{" "}
        {yOnly.length + neither.length > 0 && `Not drawn: ${yOnly.length} tests without ${vx.label} and ${neither.length} with neither variable. `}
        Filled marks are comparable with the scenario ({ownName}); hollow marks belong to other partitions and are shown as context only. The red lines mark the scenario and the shaded box its tolerance (±{num(tolX)} {vx.unit}, ±{num(tolY)} {vy.unit}). Marks are jittered slightly so repeated conditions stay visible.{" "}
        <span className="hint">Click a mark for its source row; click the upper panel to move the scenario there.</span>
      </figcaption>
    </figure>
  );
}
