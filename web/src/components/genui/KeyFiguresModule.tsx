/** Key figures: number of records and the tested range of the most relevant numeric variables. */
import type { KeyFigures, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { Src } from "../ctx";
import { fmt, labelUnit } from "./format";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/forms.css";

export interface KeyFiguresModuleProps {
  spec: ModuleOf<"key_figures">;
  data: KeyFigures;
  figure: number;
}

export function KeyFiguresModule({ spec, data, figure }: KeyFiguresModuleProps) {
  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <dl className="gx-kf">
        <div className="gx-kf-item">
          <dt>{t("Records")}</dt>
          <dd className="gx-kf-value">{data.records.toLocaleString("en-US")}</dd>
          <dd className="gx-kf-note">{data.groups === 1 ? t("in 1 source document") : t("in {0} source documents", data.groups)}</dd>
        </div>
        {data.figures.map((f) => (
          <div className="gx-kf-item" key={f.variable}>
            <dt>{labelUnit(f.label, f.unit)}</dt>
            {f.min === null || f.max === null ? (
              <dd className="gx-kf-none">{t("No record gives a value")}</dd>
            ) : f.min === f.max ? (
              <dd className="gx-kf-value">
                <Src id={f.minRecord}>{fmt(f.min)}</Src>
              </dd>
            ) : (
              <dd className="gx-kf-value">
                <Src id={f.minRecord}>{fmt(f.min)}</Src>
                <span className="gx-kf-dash"> – </span>
                <Src id={f.maxRecord}>{fmt(f.max)}</Src>
              </dd>
            )}
            <dd className="gx-kf-note">{t("{0} of {1} records give a value", f.n, f.total)}</dd>
          </div>
        ))}
      </dl>
    </ModuleFrame>
  );
}
