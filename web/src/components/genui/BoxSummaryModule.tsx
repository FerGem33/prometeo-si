/** Five-number summary of several numeric variables, with a small box plot per row. */
import type { BoxRow, BoxSummary, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { Src } from "../ctx";
import { fmt, labelUnit } from "./format";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/forms.css";

export interface BoxSummaryModuleProps {
  spec: ModuleOf<"box_summary">;
  summary: BoxSummary;
  figure: number;
}

const GW = 160;
const GH = 20;
const PAD = 4;

/** Whiskers from the minimum to the maximum, box from Q1 to Q3, median mark. The row is its own scale. */
function BoxGlyph({ row }: { row: BoxRow }) {
  const span = row.max - row.min;
  const p = (v: number) => (span === 0 ? GW / 2 : PAD + ((v - row.min) / span) * (GW - 2 * PAD));
  const about = t("Box from the first to the third quartile with the median; whiskers reach the minimum and the maximum.");
  return (
    <svg className="gx-box-svg" viewBox={`0 0 ${GW} ${GH}`} role="img" aria-label={about}>
      <title>{about}</title>
      <line className="gx-box-whisker" x1={p(row.min)} x2={p(row.max)} y1={GH / 2} y2={GH / 2} />
      <line className="gx-box-whisker" x1={p(row.min)} x2={p(row.min)} y1={GH / 2 - 4} y2={GH / 2 + 4} />
      <line className="gx-box-whisker" x1={p(row.max)} x2={p(row.max)} y1={GH / 2 - 4} y2={GH / 2 + 4} />
      <rect className="gx-box-box" x={p(row.q1)} y={3} width={Math.max(1, p(row.q3) - p(row.q1))} height={GH - 6} />
      <line className="gx-box-median" x1={p(row.median)} x2={p(row.median)} y1={2} y2={GH - 2} />
    </svg>
  );
}

export function BoxSummaryModule({ spec, summary, figure }: BoxSummaryModuleProps) {
  const { rows, empty } = summary;
  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {rows.length === 0 ? (
        <p className="gx-empty">{t("No record gives a value for these variables.")}</p>
      ) : (
        <div className="gx-scroll">
          <table className="gx-table gx-box">
            <thead>
              <tr>
                <th scope="col">{t("Variable")}</th>
                <th scope="col" className="gx-num">{t("Records")}</th>
                <th scope="col" className="gx-num">{t("Minimum")}</th>
                <th scope="col" className="gx-num">{t("First quartile")}</th>
                <th scope="col" className="gx-num">{t("Median")}</th>
                <th scope="col" className="gx-num">{t("Third quartile")}</th>
                <th scope="col" className="gx-num">{t("Maximum")}</th>
                <th scope="col">{t("Spread")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variable}>
                  <th scope="row">{labelUnit(r.label, r.unit)}</th>
                  <td className="gx-num">{r.n.toLocaleString("en-US")}</td>
                  <td className="gx-num">
                    <Src id={r.minRecord}>{fmt(r.min)}</Src>
                  </td>
                  <td className="gx-num">{fmt(r.q1)}</td>
                  <td className="gx-num">{fmt(r.median)}</td>
                  <td className="gx-num">{fmt(r.q3)}</td>
                  <td className="gx-num">
                    <Src id={r.maxRecord}>{fmt(r.max)}</Src>
                  </td>
                  <td className="gx-box-cell">
                    <BoxGlyph row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {empty.length > 0 && <p className="gx-n">{t("No record gives a value for: {0}", empty.map((e) => e.label).join(", "))}</p>}
    </ModuleFrame>
  );
}
