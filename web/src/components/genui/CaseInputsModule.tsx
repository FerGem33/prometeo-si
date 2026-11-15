/** One value field per selected variable of the user's case (owner: D8). STUB from F0. */
import type { Scenario, Variable } from "../../engine";

export interface CaseInputsModuleProps {
  variables: Variable[];
  values: Scenario["values"];
  /** undefined clears the value. */
  onValue: (id: string, v: number | string | undefined) => void;
  /** Categories available per categorical variable id (from the pack records). */
  categories: Record<string, string[]>;
}

export function CaseInputsModule({ variables }: CaseInputsModuleProps) {
  return <section className="gx-module">{variables.length}</section>;
}
