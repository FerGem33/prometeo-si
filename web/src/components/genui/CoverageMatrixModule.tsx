/** Document x variable coverage table: "● p. 4" / "○ not found", with row and column totals (owner: D4). */
import type { CoverageCell, CoverageMatrix, ModuleOf } from "../../genui/types";
import { t } from "../../i18n";
import { ModuleFrame } from "./ModuleFrame";
import "../../styles/genui/coverage.css";

export interface CoverageMatrixModuleProps {
  spec: ModuleOf<"coverage_matrix">;
  matrix: CoverageMatrix;
  figure: number;
}

const FOUND = "\u25CF";
const NOT_FOUND = "\u25CB";

export function CoverageMatrixModule({ spec, matrix, figure }: CoverageMatrixModuleProps) {
  const { docs, variables, cells } = matrix;

  if (docs.length === 0 || variables.length === 0) {
    return (
      <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
        <p className="gx-cov-empty">{t("No documents to compare.")}</p>
      </ModuleFrame>
    );
  }

  const index = new Map<string, CoverageCell>();
  for (const c of cells) index.set(`${c.docId}\u0000${c.variable}`, c);

  const n = variables.length;
  const m = docs.length;

  const foundPerDoc = new Map<string, number>();
  const foundPerVar = new Map<string, number>();
  for (const c of cells) {
    if (!c.found) continue;
    foundPerDoc.set(c.docId, (foundPerDoc.get(c.docId) ?? 0) + 1);
    foundPerVar.set(c.variable, (foundPerVar.get(c.variable) ?? 0) + 1);
  }

  return (
    <ModuleFrame kind="Table" n={figure} title={spec.title} caption={spec.caption} origin={spec.origin}>
      <div className="gx-cov-scroll">
        <table className="gx-cov-table">
          <thead>
            <tr>
              <th scope="col" className="gx-cov-doc-head" aria-label={t("Document")} />
              {variables.map((v) => (
                <th key={v.id} scope="col" className="gx-cov-var">
                  {v.label}
                </th>
              ))}
              <th scope="col" className="gx-cov-total">
                {t("Found")}
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <th scope="row" className="gx-cov-doc">
                  {d.name}
                </th>
                {variables.map((v) => {
                  const c = index.get(`${d.id}\u0000${v.id}`);
                  return <td key={v.id}>{renderCell(c)}</td>;
                })}
                <td className="gx-cov-total">{t("Found: {0} of {1}", foundPerDoc.get(d.id) ?? 0, n)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="gx-cov-doc">
                {t("Documents")}
              </th>
              {variables.map((v) => (
                <td key={v.id} className="gx-cov-total">
                  {t("{0} of {1}", foundPerVar.get(v.id) ?? 0, m)}
                </td>
              ))}
              <td className="gx-cov-total" aria-hidden="true" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="gx-cov-legend">
        <span className="gx-cov-cell gx-cov-found">
          <span aria-hidden="true">{FOUND}</span> {t("found in the document")}
        </span>
        <span className="gx-cov-sep"> · </span>
        <span className="gx-cov-cell gx-cov-notfound">
          <span aria-hidden="true">{NOT_FOUND}</span> {t("not found")}
        </span>
      </p>
    </ModuleFrame>
  );
}

function renderCell(c?: CoverageCell) {
  if (!c || !c.found) {
    return (
      <span className="gx-cov-cell gx-cov-notfound">
        <span aria-hidden="true">{NOT_FOUND}</span> {t("not found")}
      </span>
    );
  }
  const passage = c.page != null ? t("p. {0}", c.page) : c.row != null ? t("row {0}", c.row) : null;
  return (
    <span className="gx-cov-cell gx-cov-found" title={c.quote}>
      <span aria-hidden="true">{FOUND}</span>
      {passage ? ` ${passage}` : ""}
    </span>
  );
}
