/** One value field per selected variable of the user's case (owner: D8). */
import type { Scenario, Variable } from "../../engine";
import { t } from "../../i18n";
import { rangeText } from "../../report/format";
import { NumField } from "../NumField";
import "../../styles/genui/case.css";

export interface CaseInputsModuleProps {
  variables: Variable[];
  values: Scenario["values"];
  /** undefined clears the value. */
  onValue: (id: string, v: number | string | undefined) => void;
  /** Categories available per categorical variable id (from the pack records). */
  categories: Record<string, string[]>;
}

export function CaseInputsModule({ variables, values, onValue, categories }: CaseInputsModuleProps) {
  if (variables.length === 0) {
    return <p className="gx-ci-empty">{t("Select variables above to describe your case.")}</p>;
  }
  return (
    <form className="gx-ci-grid" onSubmit={(e) => e.preventDefault()}>
      {variables.map((v) => {
        const current = values[v.id];
        return (
          <div key={v.id} className="gx-ci-field">
            <div className="gx-ci-label">{v.label}</div>
            {v.type === "num" ? (
              <>
                <NumField
                  value={typeof current === "number" ? current : undefined}
                  min={v.range[0]}
                  max={v.range[1]}
                  step={v.step}
                  label={t("{0} value", v.label)}
                  onCommit={(n) => onValue(v.id, n)}
                />
                <div className="gx-ci-meta">
                  <span className="gx-ci-unit">{v.unit}</span>
                  <span className="gx-ci-range">
                    {t("Evidence range")} {rangeText(v.range, v)}
                  </span>
                </div>
              </>
            ) : (
              <select
                className="gx-ci-select"
                aria-label={v.label}
                value={typeof current === "string" ? current : ""}
                onChange={(e) => onValue(v.id, e.target.value === "" ? undefined : e.target.value)}
              >
                <option value="">{t("— no value —")}</option>
                {(categories[v.id] ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            {current !== undefined && (
              <button type="button" className="gx-ci-clear" onClick={() => onValue(v.id, undefined)}>
                {t("Clear value")}
              </button>
            )}
          </div>
        );
      })}
    </form>
  );
}
