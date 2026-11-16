/** Table of the records at one end of a numeric variable; each row opens its source. */
import type { ModuleOf, RecordsTable } from "../../genui/types";
import { t } from "../../i18n";
import { rangeText } from "../../report/format";
import { Src } from "../ctx";
import { labelUnit } from "./format";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/forms.css";

export interface RecordsTableModuleProps {
  spec: ModuleOf<"records_table">;
  table: RecordsTable;
  figure: number;
}

export function RecordsTableModule({ spec, table, figure }: RecordsTableModuleProps) {
  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {table.rows.length === 0 ? (
        <p className="gx-empty">{t("No record gives a value for this variable.")}</p>
      ) : (
        <>
          <div className="gx-scroll">
            <table className="gx-table gx-rt">
              <thead>
                <tr>
                  <th scope="col">{t("Record")}</th>
                  {table.columns.map((c) => (
                    <th key={c.id} scope="col" className={c.id === table.sort ? "gx-num is-sort" : "gx-num"}>
                      {labelUnit(c.label, c.unit)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.record}>
                    <th scope="row">
                      <Src id={r.record}>
                        {r.group} · {r.label}
                      </Src>
                    </th>
                    {r.values.map((v, i) => (
                      <td key={table.columns[i].id} className="gx-num">
                        {v === null ? <span aria-label={t("not reported")}>—</span> : Array.isArray(v) ? rangeText(v) : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="gx-n">{t("{0} of the {1} records that report the variable", table.rows.length, table.n)}</p>
        </>
      )}
    </ModuleFrame>
  );
}
