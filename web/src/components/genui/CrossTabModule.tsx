/** Cross table: number of records in each combination of two variables. A cell lists its records. */
import { useState } from "react";
import type { CrossAxis, CrossTab, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { fmt, labelUnit } from "./format";
import { ModuleFrame } from "./ModuleFrame";
import { RecordChips } from "./RecordChips";
import "../../styles/genui/forms.css";

export interface CrossTabModuleProps {
  spec: ModuleOf<"cross_tab">;
  tab: CrossTab;
  figure: number;
}

function axisLabels(axis: CrossAxis): string[] {
  if (axis.kind === "cat") return axis.categories;
  return axis.edges.slice(0, -1).map((from, i) => `${fmt(from)}–${fmt(axis.edges[i + 1])}`);
}

export function CrossTabModule({ spec, tab, figure }: CrossTabModuleProps) {
  const [sel, setSel] = useState<number | null>(null);
  const rows = axisLabels(tab.row);
  const cols = axisLabels(tab.column);
  const selected = sel !== null ? tab.cells[sel] : null;

  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {rows.length === 0 || cols.length === 0 ? (
        <p className="gx-empty">{t("No record gives a value for both variables.")}</p>
      ) : (
        <div className="gx-ct">
          <p className="gx-n">
            {t("n = {0} records with both values", tab.n)}
            {tab.omitted > 0 ? ` · ${t("{0} records fall in categories that are not shown", tab.omitted)}` : ""}
          </p>
          <div className="gx-scroll">
            <table className="gx-table gx-ct-table">
              <thead>
                <tr>
                  <th scope="col" className="gx-ct-corner">
                    {t("{0} in rows, {1} in columns", labelUnit(tab.row.label, tab.row.unit), labelUnit(tab.column.label, tab.column.unit))}
                  </th>
                  {cols.map((c, j) => (
                    <th key={j} scope="col" className="gx-num">
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="gx-num gx-ct-gap">
                    {t("{0} not reported", tab.column.label)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <th scope="row">{r}</th>
                    {cols.map((c, j) => {
                      const at = i * cols.length + j;
                      const cell = tab.cells[at];
                      if (!cell || cell.count === 0) {
                        return (
                          <td key={j} className="gx-num gx-ct-zero">
                            0
                          </td>
                        );
                      }
                      // The shade repeats the number; the number is always printed.
                      const shade = Math.round(6 + 24 * (cell.count / tab.max));
                      return (
                        <td key={j} className="gx-num gx-ct-td">
                          <button
                            type="button"
                            className={sel === at ? "gx-ct-cell is-sel" : "gx-ct-cell"}
                            style={{ background: `color-mix(in srgb, var(--ink) ${shade}%, transparent)` }}
                            aria-pressed={sel === at}
                            aria-label={`${r}, ${c}: ${cell.count}`}
                            onClick={() => setSel(sel === at ? null : at)}
                          >
                            {cell.count.toLocaleString("en-US")}
                          </button>
                        </td>
                      );
                    })}
                    <td className="gx-num gx-ct-gap">{(tab.rowMissing[i] ?? 0).toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t("{0} not reported", tab.row.label)}</th>
                  {cols.map((_, j) => (
                    <td key={j} className="gx-num gx-ct-zero">
                      {(tab.columnMissing[j] ?? 0).toLocaleString("en-US")}
                    </td>
                  ))}
                  <td aria-hidden="true" />
                </tr>
              </tfoot>
            </table>
          </div>
          {selected && selected.count > 0 && <RecordChips ids={selected.records} heading={t("Records in the selected cell")} />}
        </div>
      )}
    </ModuleFrame>
  );
}
