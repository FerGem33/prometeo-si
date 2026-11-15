/** Ranked variables with score, reasons and a selection box limited to MAX_CASE_VARIABLES (owner: D7). STUB from F0. */
import type { VariableScore } from "../../genui/types";

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

export function VariableScoresModule({ scores }: VariableScoresModuleProps) {
  return <section className="gx-module">{scores.length}</section>;
}
