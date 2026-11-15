/** Document x variable coverage table (owner: D4). STUB from F0. */
import type { CoverageMatrix, ModuleOf } from "../../genui/types";

export interface CoverageMatrixModuleProps {
  spec: ModuleOf<"coverage_matrix">;
  matrix: CoverageMatrix;
  figure: number;
}

export function CoverageMatrixModule({ spec }: CoverageMatrixModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
