/** Share of the records, and number of source documents, that give a value for each variable. */
import type { CompletenessRow, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/forms.css";

export interface CompletenessModuleProps {
  spec: ModuleOf<"completeness">;
  rows: CompletenessRow[];
  figure: number;
}

export function CompletenessModule({ spec, rows, figure }: CompletenessModuleProps) {
  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {rows.length === 0 ? (
        <p className="gx-empty">{t("No variable to compare.")}</p>
      ) : (
        <ul className="gx-cp-list">
          {rows.map((r) => (
            <li key={r.variable} className="gx-cp-row">
              <span className="gx-cp-name">{r.label}</span>
              <span className="gx-track" aria-hidden="true">
                <span className="gx-fill" style={{ width: `${r.share * 100}%` }} />
              </span>
              <span className="gx-cp-text">
                {r.n === 0 ? t("no record gives a value") : t("{0} of {1} records", r.n.toLocaleString("en-US"), r.total.toLocaleString("en-US"))}
                <span className="gx-cp-docs"> · {t("{0} of {1} documents", r.groups, r.groupsTotal)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </ModuleFrame>
  );
}
