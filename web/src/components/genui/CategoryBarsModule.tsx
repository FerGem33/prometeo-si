/** Horizontal bars: records per category of one categorical variable. A bar lists its records. */
import { useState } from "react";
import type { CategoryCounts, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { ModuleFrame } from "./ModuleFrame";
import { RecordChips } from "./RecordChips";
import "../../styles/genui/forms.css";

export interface CategoryBarsModuleProps {
  spec: ModuleOf<"category_bars">;
  counts: CategoryCounts;
  figure: number;
}

export function CategoryBarsModule({ spec, counts, figure }: CategoryBarsModuleProps) {
  const [sel, setSel] = useState<string | null>(null);
  const max = counts.categories[0]?.count ?? 0;
  const selected = counts.categories.find((c) => c.category === sel);
  return (
    <ModuleFrame kind="Figure" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {counts.n === 0 ? (
        <p className="gx-empty">{t("No record gives a category for this variable.")}</p>
      ) : (
        <div className="gx-cb">
          <p className="gx-n">{t("{0} of {1} records give a category", counts.n, counts.total)}</p>
          <ul className="gx-cb-list">
            {counts.categories.map((c) => (
              <li key={c.category}>
                <button
                  type="button"
                  className={sel === c.category ? "gx-cb-row is-sel" : "gx-cb-row"}
                  aria-pressed={sel === c.category}
                  onClick={() => setSel(sel === c.category ? null : c.category)}
                >
                  <span className="gx-cb-name">{c.category}</span>
                  <span className="gx-track" aria-hidden="true">
                    <span className="gx-fill" style={{ width: `${(c.count / max) * 100}%` }} />
                  </span>
                  <span className="gx-cb-count">{c.count.toLocaleString("en-US")}</span>
                </button>
              </li>
            ))}
          </ul>
          {counts.other.categories > 0 && (
            <p className="gx-n">{t("{0} more categories hold {1} records", counts.other.categories, counts.other.count)}</p>
          )}
          {selected && <RecordChips ids={selected.records} heading={t("Records in the selected category")} />}
        </div>
      )}
    </ModuleFrame>
  );
}
