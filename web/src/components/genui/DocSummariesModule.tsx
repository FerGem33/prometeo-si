/** One template summary per uploaded document (owner: D6). */
import type { DocSummary, ModuleOf } from "../../genui/types";
import { count, t } from "../../i18n";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/summaries.css";

export interface DocSummariesModuleProps {
  spec: ModuleOf<"doc_summaries">;
  summaries: DocSummary[];
  figure: number;
}

export function DocSummariesModule({ spec, summaries, figure }: DocSummariesModuleProps) {
  const useDetails = summaries.length > 4;

  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <p className="gx-ds-note">{t("Template summaries built from the extracted values · not AI")}</p>

      {summaries.length === 0 ? (
        <p className="gx-ds-empty">{t("No documents uploaded.")}</p>
      ) : (
        <div className="gx-ds-list">
          {summaries.map((s, i) => {
            const kindLabel = s.kind === "paper" ? t("Paper") : t("Table");
            const sizeLabel =
              s.kind === "paper" && s.pages != null
                ? count(s.pages, "page", "pages")
                : s.kind === "table" && s.rows != null
                  ? count(s.rows, "row", "rows")
                  : null;
            const heading = <h3 className="gx-ds-heading">{s.title || s.name}</h3>;
            const body = (
              <>
                <div className="gx-ds-meta">
                  <span>{sizeLabel ? t("{0} · {1}", kindLabel, sizeLabel) : kindLabel}</span>
                  {s.year != null && <span className="gx-ds-year">{s.year}</span>}
                  {s.doi && (
                    <a className="gx-ds-doi" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">
                      {s.doi}
                    </a>
                  )}
                </div>
                {s.text && <p className="gx-ds-text">{s.text}</p>}
                {s.variables.length > 0 && (
                  <div className="gx-ds-vars">
                    <span className="gx-ds-vars-label">{t("Variables found:")}</span>
                    <ul className="gx-ds-vars-list">
                      {s.variables.map((v) => (
                        <li key={v.id} className="gx-ds-var">
                          <span className="gx-ds-var-label">{v.label}</span>
                          {v.page != null ? (
                            <span className="gx-ds-var-passage">{t("p. {0}", v.page)}</span>
                          ) : v.row != null ? (
                            <span className="gx-ds-var-passage">{t("row {0}", v.row)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );

            if (useDetails) {
              return (
                <details key={s.docId} className="gx-ds-details" open={i < 2}>
                  <summary className="gx-ds-summary">{heading}</summary>
                  <div className="gx-ds-body">{body}</div>
                </details>
              );
            }
            return (
              <article key={s.docId} className="gx-ds-doc">
                {heading}
                {body}
              </article>
            );
          })}
        </div>
      )}
    </ModuleFrame>
  );
}
