/** Range plot: lowest to highest tested value and the median of a numeric variable inside each group. */
import { useState } from "react";
import type { GroupRanges, ModuleOf } from "../../genui/types";
import { count, t } from "../../i18n";
import { Src } from "../ctx";
import { fmt } from "./format";
import { ModuleFrame } from "./ModuleFrame";
import { niceTicks } from "./ScatterModule";
import "../../styles/genui/forms.css";

export interface GroupRangesModuleProps {
  spec: ModuleOf<"group_ranges">;
  ranges: GroupRanges | null;
  /** Axis label with its unit. */
  label: string;
  /** Value of the case for this variable, drawn as a reference line when given. */
  caseValue?: number;
  figure: number;
}

const W = 640;
const ROW = 26;
const M = { left: 168, right: 60, top: 28, bottom: 46 };
const NAME_MAX = 24;

export function GroupRangesModule({ spec, ranges, label, caseValue, figure }: GroupRangesModuleProps) {
  const [sel, setSel] = useState<string | null>(null);
  if (!ranges) {
    return (
      <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
        <p className="gx-empty">{t("No record gives a value for this variable.")}</p>
      </ModuleFrame>
    );
  }
  const { groups } = ranges;
  const hasCase = typeof caseValue === "number" && Number.isFinite(caseValue);
  let lo = hasCase ? Math.min(ranges.min, caseValue) : ranges.min;
  let hi = hasCase ? Math.max(ranges.max, caseValue) : ranges.max;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const x0 = M.left;
  const x1 = W - M.right;
  const y1 = M.top + groups.length * ROW;
  const H = y1 + M.bottom;
  const sx = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const ticks = niceTicks(lo, hi, 6);
  const unit = ranges.unit ? ` ${ranges.unit}` : "";
  const selected = groups.find((g) => g.key === sel);
  const toggle = (key: string) => setSel(sel === key ? null : key);

  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <div className="gx-gr">
        <p className="gx-n">
          {t("n = {0} records in {1} groups", ranges.n, groups.length)}
          {ranges.omitted > 0 ? ` · ${t("{0} more groups are not shown", ranges.omitted)}` : ""}
        </p>
        <svg className="gx-gr-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
          <title>{spec.title}</title>
          <desc>{t("Tested range and median of {0} groups.", groups.length)}</desc>
          {ticks.map((v) => (
            <line key={`g${v}`} className="gx-gr-grid" x1={sx(v)} x2={sx(v)} y1={M.top} y2={y1} />
          ))}
          <line className="gx-gr-axis" x1={x0} x2={x1} y1={y1} y2={y1} />
          {ticks.map((v) => (
            <g key={`t${v}`} className="gx-gr-tick">
              <line x1={sx(v)} x2={sx(v)} y1={y1} y2={y1 + 4} />
              <text x={sx(v)} y={y1 + 17} textAnchor="middle">
                {fmt(v)}
              </text>
            </g>
          ))}
          <text className="gx-gr-label" x={x0 + (x1 - x0) / 2} y={H - 8} textAnchor="middle">
            {label}
          </text>
          {groups.map((g, i) => {
            const y = M.top + i * ROW + ROW / 2;
            const name = g.label.length > NAME_MAX ? `${g.label.slice(0, NAME_MAX - 1)}…` : g.label;
            const about = `${g.label}: ${fmt(g.min)}–${fmt(g.max)}${unit}, ${t("median")} ${fmt(g.median)}, ${count(g.n, "record")}`;
            return (
              <g
                key={g.key}
                className={sel === g.key ? "gx-gr-row is-sel" : "gx-gr-row"}
                role="button"
                tabIndex={0}
                aria-label={about}
                aria-pressed={sel === g.key}
                onClick={() => toggle(g.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(g.key);
                  }
                }}
              >
                <title>{about}</title>
                <rect className="gx-gr-hit" x={0} y={y - ROW / 2} width={W} height={ROW} />
                <text className="gx-gr-name" x={x0 - 10} y={y + 4} textAnchor="end">
                  {name}
                </text>
                <line className="gx-gr-range" x1={sx(g.min)} x2={sx(g.max)} y1={y} y2={y} />
                <line className="gx-gr-range" x1={sx(g.min)} x2={sx(g.min)} y1={y - 4} y2={y + 4} />
                <line className="gx-gr-range" x1={sx(g.max)} x2={sx(g.max)} y1={y - 4} y2={y + 4} />
                <circle className="gx-gr-median" cx={sx(g.median)} cy={y} r={4} />
                <text className="gx-gr-count" x={x1 + 8} y={y + 4}>
                  {`n = ${g.n}`}
                </text>
              </g>
            );
          })}
          {hasCase && (
            <g className="gx-gr-case">
              <line x1={sx(caseValue)} x2={sx(caseValue)} y1={M.top - 6} y2={y1} />
              <text x={Math.min(x1, Math.max(x0, sx(caseValue)))} y={M.top - 11} textAnchor="middle">
                {t("Your case")} · {fmt(caseValue)}
              </text>
            </g>
          )}
        </svg>
        {selected && (
          <p className="gx-detail">
            <b>{selected.label}</b>: {t("lowest")} <Src id={selected.minRecord}>{fmt(selected.min)}</Src> · {t("median")}{" "}
            {fmt(selected.median)} · {t("highest")} <Src id={selected.maxRecord}>{fmt(selected.max)}</Src>
            {unit} · {count(selected.n, "record")}
          </p>
        )}
      </div>
    </ModuleFrame>
  );
}
