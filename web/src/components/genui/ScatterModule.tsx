/** Scatter of two numeric variables; each point opens its record (owner: D3). */
import { useState } from "react";
import type { ModuleOf, ScatterPoint } from "../../genui/types";
import { num } from "../../report/format";
import { t } from "../../i18n";
import { Src } from "../ctx";
import { ModuleFrame } from "./ModuleFrame";
import "./../../styles/genui/scatter.css";

export interface ScatterModuleProps {
  spec: ModuleOf<"scatter">;
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  figure: number;
}

const W = 640;
const H = 360;
const M = { left: 56, right: 20, top: 20, bottom: 48 };

/** Nice, human-readable tick values spanning [min, max] (rounded to the step's precision). Pure. */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) return [min];
  const target = Math.max(2, Math.floor(count));
  const rawStep = (max - min) / (target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const mult = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const step = mult * mag;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const f = Math.pow(10, decimals);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const v = Math.round((start + i * step) * f) / f;
    if (v > max + step / 2) break;
    out.push(v);
  }
  return out;
}

function fmt(v: number): string {
  const a = Math.abs(v);
  const digits = a !== 0 && a < 1 ? 3 : a >= 100 ? 1 : 2;
  return num(v, digits);
}

export function ScatterModule({ spec, points, xLabel, yLabel, figure }: ScatterModuleProps) {
  const [sel, setSel] = useState<number | null>(null);

  const body =
    points.length < 2 ? (
      <p className="gx-sc-empty">{t("Fewer than two records give values for both variables.")}</p>
    ) : (
      <ScatterChart points={points} xLabel={xLabel} yLabel={yLabel} sel={sel} setSel={setSel} />
    );

  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <div className="gx-sc">
        <p className="gx-sc-n">{t("n = {0} records with both values", points.length)}</p>
        {body}
        {sel !== null && points[sel] && (
          <p className="gx-sc-detail">
            {points[sel].label}: x = {fmt(points[sel].x)}, y = {fmt(points[sel].y)}{" "}
            <Src id={points[sel].record}>{t("Source")}</Src>
          </p>
        )}
      </div>
    </ModuleFrame>
  );
}

function ScatterChart({
  points,
  xLabel,
  yLabel,
  sel,
  setSel,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  sel: number | null;
  setSel: (i: number | null) => void;
}) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const x0 = M.left;
  const x1 = W - M.right;
  const y0 = M.top;
  const y1 = H - M.bottom;
  const sx = (x: number) => x0 + ((x - xMin) / (xMax - xMin)) * (x1 - x0);
  const sy = (y: number) => y1 - ((y - yMin) / (yMax - yMin)) * (y1 - y0);
  const xTicks = niceTicks(xMin, xMax, 6);
  const yTicks = niceTicks(yMin, yMax, 5);

  return (
    <svg className="gx-sc-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <title>{`${yLabel} against ${xLabel}`}</title>
      <desc>{t("Scatter of {0} records that give values for both variables.", points.length)}</desc>
      {yTicks.map((v) => (
        <line key={`gy${v}`} className="gx-sc-grid" x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} />
      ))}
      {xTicks.map((v) => (
        <line key={`gx${v}`} className="gx-sc-grid" x1={sx(v)} x2={sx(v)} y1={y0} y2={y1} />
      ))}
      <line className="gx-sc-axis" x1={x0} x2={x1} y1={y1} y2={y1} />
      <line className="gx-sc-axis" x1={x0} x2={x0} y1={y0} y2={y1} />
      {xTicks.map((v) => (
        <g key={`tx${v}`} className="gx-sc-tick">
          <line x1={sx(v)} x2={sx(v)} y1={y1} y2={y1 + 4} />
          <text x={sx(v)} y={y1 + 17} textAnchor="middle">
            {fmt(v)}
          </text>
        </g>
      ))}
      {yTicks.map((v) => (
        <g key={`ty${v}`} className="gx-sc-tick">
          <line x1={x0 - 4} x2={x0} y1={sy(v)} y2={sy(v)} />
          <text x={x0 - 8} y={sy(v) + 3.5} textAnchor="end">
            {fmt(v)}
          </text>
        </g>
      ))}
      <text className="gx-sc-label" x={x0 + (x1 - x0) / 2} y={H - 8} textAnchor="middle">
        {xLabel}
      </text>
      <text className="gx-sc-label" transform={`translate(14 ${y0 + (y1 - y0) / 2}) rotate(-90)`} textAnchor="middle">
        {yLabel}
      </text>
      {points.map((p, i) => (
        <g
          key={p.record}
          className={sel === i ? "gx-sc-pt is-sel" : "gx-sc-pt"}
          role="button"
          tabIndex={0}
          aria-label={`${p.label}: x = ${fmt(p.x)}, y = ${fmt(p.y)}`}
          aria-pressed={sel === i}
          onClick={() => setSel(sel === i ? null : i)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSel(sel === i ? null : i);
            }
          }}
        >
          <circle cx={sx(p.x)} cy={sy(p.y)} r={4} />
        </g>
      ))}
    </svg>
  );
}
