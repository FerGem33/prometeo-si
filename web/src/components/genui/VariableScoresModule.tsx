/** Ranked variables with score, reasons and a selection box limited to MAX_CASE_VARIABLES (owner: D7). */
import { useState } from "react";
import type { VariableScore } from "../../genui/types";
import { t } from "../../i18n";
import { ModuleFrame } from "./ModuleFrame";
import { DocCite } from "./DocCite";
import "../../styles/genui/scores.css";

export interface VariableScoresModuleProps {
  scores: VariableScore[];
  selected: string[];
  onToggle: (id: string) => void;
  /** True right after the user tried to add one variable over the limit. */
  limitHit: boolean;
  limit: number;
  figure: number;
  /** Omit to render read-only (wizard step 1). */
  selectable?: boolean;
}

const MAX_VISIBLE = 20;

const TITLE = "Variables ranked by relevance";
const CAPTION =
  "Score = 0.30 coverage + 0.20 frequency + 0.15 position + 0.25 purpose + 0.10 measurability; computed in the browser, not by AI.";

export function VariableScoresModule({ scores, selected, onToggle, limitHit, limit, figure, selectable }: VariableScoresModuleProps) {
  const [showAll, setShowAll] = useState(false);

  if (scores.length === 0) {
    return (
      <ModuleFrame kind="Table" n={figure} title={t(TITLE)} caption={t(CAPTION)} origin="local">
        <p className="gx-vs-empty">{t("No variables were detected in the documents.")}</p>
      </ModuleFrame>
    );
  }

  const visible = showAll ? scores : scores.slice(0, MAX_VISIBLE);
  const atLimit = selected.length >= limit;

  return (
    <ModuleFrame kind="Table" n={figure} title={t(TITLE)} caption={t(CAPTION)} origin="local">
      {selectable && (
        <>
          <p className="gx-vs-selectline">{t("{0} / {1} selected", selected.length, limit)}</p>
          {limitHit && (
            <p className="gx-vs-limit" role="status">
              {t("Up to {0} variables. Remove one to add another.", limit)}
            </p>
          )}
        </>
      )}
      <div className="gx-vs-scroll">
        <table className="gx-vs-table">
          <thead>
            <tr>
              <th className="gx-vs-rank" aria-label={t("Rank")}>
                #
              </th>
              {selectable && <th className="gx-vs-check" />}
              <th>{t("Variable")}</th>
              <th>{t("Score")}</th>
              <th>{t("Documents")}</th>
              <th>{t("Why")}</th>
              <th>{t("Source")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => {
              const isSelected = selected.includes(s.id);
              return (
                <tr key={s.id} className={isSelected ? "gx-vs-row gx-vs-selected" : "gx-vs-row"}>
                  <td className="gx-vs-rank">{i + 1}</td>
                  {selectable && (
                    <td className="gx-vs-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isSelected && atLimit}
                        aria-label={t("Include {0}", s.label)}
                        onChange={() => onToggle(s.id)}
                      />
                    </td>
                  )}
                  <td className="gx-vs-var">
                    {s.label}
                    {s.unit ? <span className="gx-vs-unit"> {s.unit}</span> : null}
                  </td>
                  <td className="gx-vs-score">
                    <span className="gx-vs-num">{s.score.toFixed(2)}</span>
                    <span className="gx-vs-bar" aria-hidden="true">
                      <span className="gx-vs-bar-fill" style={{ width: `${Math.round(s.score * 100)}%` }} />
                    </span>
                  </td>
                  <td className="gx-vs-count">{s.docCount}</td>
                  <td className="gx-vs-why">{s.reasons.join(" · ")}</td>
                  <td className="gx-vs-src">
                    <DocCite citation={s.citations[0]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {scores.length > MAX_VISIBLE && (
        <button type="button" className="gx-vs-toggle" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t("Show fewer") : t("Show all {0} variables", scores.length)}
        </button>
      )}
    </ModuleFrame>
  );
}
