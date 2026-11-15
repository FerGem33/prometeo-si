/** Purpose-driven dashboard for an uploaded corpus (owner: S6). STUB from F0. */
import type { Scenario } from "../engine";
import type { Axes } from "../state";
import type { EvaluationDraft } from "./ScenarioStep";

export interface GenUIDashboardProps {
  draft: EvaluationDraft;
  axes: Axes;
  setAxes: (a: Axes) => void;
  /** Keeps App's scenario in sync with the case (null while no value is set). */
  onScenario: (s: Scenario | null) => void;
  onHome: () => void;
  onEdit: () => void;
  onWorkspace: () => void;
}

export function GenUIDashboard({ draft }: GenUIDashboardProps) {
  return <article className="page">{draft.purpose ?? ""}</article>;
}
