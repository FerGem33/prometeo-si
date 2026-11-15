/** Histogram of one numeric variable over the corpus records (owner: D2). */
import { useState } from "react";
import type { Histogram, ModuleOf } from "../../genui/types";
import { count, t } from "../../i18n";
import { num } from "../../report/format";
import { Src, useData } from "../ctx";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/distribution.css";

export interface DistributionModuleProps {
  spec: ModuleOf<"distribution">;
  histogram: Histogram | null;
  figure: number;
}

const W = 640;
const H = 280;
const M = { left: 56, right: 16, top: 16, bottom: 56 };
const MAX_RECORDS = 12;

/** Compact axis label: 1200 -> "1.2k", 2100000 -> "2.1M", else rounded. */
function fmtAxis(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${num(v / 1e6, 1)}M`;
  if (a >= 1e3) return `${num(v / 1e3, 1)}k`;
  return num(v, a !== 0 && a < 1 ? 2 : 1);
}

function fmtVal(v: number): string {
  return num(v, 2);
}

/** Integer count ticks from 0 up to max, at a nice step. */
function countTicks(max: number): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rawStep = max / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const mult = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const step = Math.max(1, Math.round(mult * mag));
  const out: number[] = [];
  for (let i = 0; i * step <= max; i++) out.push(i * step);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/** Bin edges used as x-axis ticks, decimated so they stay readable at 360px. */
function edgeTicks(bins: Histogram["bins"], maxTicks = 8): number[] {
  const edges = [bins[0].from, ...bins.map((b) => b.to)];
  if (edges.length <= maxTicks) return edges;
  const step = Math.ceil(edges.length / maxTicks);
  const out: number[] = [];
  for (let i = 0; i < edges.length; i += step) out.push(edges[i]);
  if (out[out.length - 1] !== edges[edges.length - 1]) out.push(edges[edges.length - 1]);
  return out;
}

export function DistributionModule({ spec, histogram, figure }: DistributionModuleProps) {
  const { pack } = useData();
  const [sel, setSel] = useState<number | null>(null);

  const variable = pack.schema.variables.find((v) => v.id === spec.variable);
  const label = variable?.label ?? spec.variable;
  const unit = histogram?.unit ?? (variable && variable.type === "num" ? variable.unit : null);

  if (!histogram) {
    return (
      <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
        <p className="gx-dist-empty">{t("No numeric values are recorded for this variable.")}</p>
      </ModuleFrame>
    );
  }

  const chipLabel = (id: string): string => {
    const rec = pack.records.find((r) => r.id === id);
    if (!rec) return id;
    const study = pack.studies.find((s) => s.id === rec.study);
    return `${study?.short ?? rec.study} · ${rec.label}`;
  };

  const selected = sel !== null ? histogram.bins[sel] : null;

  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <div className="gx-dist">
        <p className="gx-dist-n">
          {t("n = {0}", count(histogram.n, "record"))} · {fmtVal(histogram.min)} – {fmtVal(histogram.max)}
          {unit ? ` ${unit}` : ""}
        </p>
        <HistogramChart histogram={histogram} unit={unit} label={label} sel={sel} setSel={setSel} />
        {selected && selected.records.length > 0 && (
          <div className="gx-dist-detail">
            <p className="gx-dist-sel-heading">{t("Records in the selected bin")}</p>
            <ul className="gx-dist-records">
              {selected.records.slice(0, MAX_RECORDS).map((id) => (
                <li key={id} className="gx-dist-chip">
                  <Src id={id}>{chipLabel(id)}</Src>
                </li>
              ))}
              {selected.records.length > MAX_RECORDS && (
                <li className="gx-dist-more">{t("and {0} more", selected.records.length - MAX_RECORDS)}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </ModuleFrame>
  );
}

function HistogramChart({
  histogram,
  unit,
  label,
  sel,
  setSel,
}: {
  histogram: Histogram;
  unit: string | null;
  label: string;
  sel: number | null;
  setSel: (i: number | null) => void;
}) {
  const { bins } = histogram;
  const x0 = M.left;
  const x1 = W - M.right;
  const y0 = M.top;
  const y1 = H - M.bottom;

  const yMax = Math.max(1, ...bins.map((b) => b.count));
  const yTicks = countTicks(yMax);

  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const span = hi - lo || 1;
  const sx = (v: number) => x0 + ((v - lo) / span) * (x1 - x0);
  const sy = (c: number) => y1 - (c / yMax) * (y1 - y0);
  const xTicks = edgeTicks(bins);

  const slotW = (x1 - x0) / bins.length;
  const unitText = unit ? ` ${unit}` : "";

  return (
    <svg
      className="gx-dist-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${label} histogram`}
    >
      <title>{t("Histogram of {0}", label)}</title>
      <desc>
        {t("Distribution of {0} records over {1} bins.", histogram.n, bins.length)}
      </desc>
      {yTicks.map((v) => (
        <line key={`gy${v}`} className="gx-dist-grid" x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} />
      ))}
      <line className="gx-dist-axis" x1={x0} x2={x1} y1={y1} y2={y1} />
      <line className="gx-dist-axis" x1={x0} x2={x0} y1={y0} y2={y1} />
      {yTicks.map((v) => (
        <g key={`ty${v}`} className="gx-dist-tick">
          <line x1={x0 - 4} x2={x0} y1={sy(v)} y2={sy(v)} />
          <text x={x0 - 8} y={sy(v) + 3.5} textAnchor="end">
            {fmtAxis(v)}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`tx${v}`} className="gx-dist-tick">
          <line x1={sx(v)} x2={sx(v)} y1={y1} y2={y1 + 4} />
          <text x={sx(v)} y={y1 + 17} textAnchor="middle">
            {fmtAxis(v)}
          </text>
        </g>
      ))}
      <text className="gx-dist-label" x={x0 + (x1 - x0) / 2} y={H - 8} textAnchor="middle">
        {label}
        {unitText && ` (${unit})`}
      </text>
      <text className="gx-dist-label" transform={`translate(14 ${y0 + (y1 - y0) / 2}) rotate(-90)`} textAnchor="middle">
        {t("Records")}
      </text>
      {bins.map((b, i) => {
        const h = b.count === 0 ? 0 : (b.count / yMax) * (y1 - y0);
        const focusable = b.count > 0;
        const barTitle = `${fmtAxis(b.from)}–${fmtAxis(b.to)}${unitText}: ${count(b.count, "record")}`;
        return (
          <g
            key={`b${i}`}
            className={sel === i ? "gx-dist-bar is-sel" : "gx-dist-bar"}
            role={focusable ? "button" : undefined}
            tabIndex={focusable ? 0 : undefined}
            aria-label={barTitle}
            aria-pressed={focusable ? sel === i : undefined}
            onClick={focusable ? () => setSel(sel === i ? null : i) : undefined}
            onKeyDown={
              focusable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSel(sel === i ? null : i);
                    }
                  }
                : undefined
            }
          >
            <title>{barTitle}</title>
            <rect x={x0 + i * slotW} y={y1 - h} width={Math.max(0, slotW - 1)} height={h} />
          </g>
        );
      })}
    </svg>
  );
}
