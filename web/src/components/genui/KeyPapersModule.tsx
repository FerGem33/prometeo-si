/** Ranked list of the most relevant documents, with reasons (owner: D5). */
import type { ModuleOf, PaperRelevance } from "../../genui/types";
import { t } from "../../i18n";
import { num } from "../../report/format";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/papers.css";

export interface KeyPapersModuleProps {
  spec: ModuleOf<"key_papers">;
  papers: PaperRelevance[];
  figure: number;
}

export function KeyPapersModule({ spec, papers, figure }: KeyPapersModuleProps) {
  const shown = papers.slice(0, spec.limit);
  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      {shown.length === 0 ? (
        <p className="gx-kp-empty">{t("No document matches the purpose yet.")}</p>
      ) : (
        <ol className="gx-kp-list">
          {shown.map((p, i) => (
            <li key={p.docId} className="gx-kp-item">
              <div className="gx-kp-head">
                <span className="gx-kp-rank">
                  {i + 1}
                  <span className="gx-kp-bar" aria-hidden="true">
                    <span className="gx-kp-bar-fill" style={{ width: `${Math.max(0, Math.min(1, p.score)) * 100}%` }} />
                  </span>
                </span>
                <div className="gx-kp-body">
                  <div className="gx-kp-title">{p.title || p.name}</div>
                  <div className="gx-kp-meta">
                    {p.year != null && <span className="gx-kp-year">{p.year}</span>}
                    {p.doi && (
                      <a className="gx-kp-doi" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                        {p.doi}
                      </a>
                    )}
                    <span className="gx-kp-score">
                      <span className="gx-kp-score-text">{t("score {0}", num(p.score, 2))}</span>
                      <span className="gx-kp-bar" aria-hidden="true">
                        <span className="gx-kp-bar-fill" style={{ width: `${Math.max(0, Math.min(1, p.score)) * 100}%` }} />
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              {p.shared.length > 0 && <p className="gx-kp-shared">{t("Shared variables: {0}", p.shared.join(", "))}</p>}
              {p.reasons.length > 0 && (
                <ul className="gx-kp-reasons">
                  {p.reasons.map((r, j) => (
                    <li key={j}>{r}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </ModuleFrame>
  );
}
