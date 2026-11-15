/** One template summary per uploaded document (owner: D6). STUB from F0. */
import type { DocSummary, ModuleOf } from "../../genui/types";

export interface DocSummariesModuleProps {
  spec: ModuleOf<"doc_summaries">;
  summaries: DocSummary[];
  figure: number;
}

export function DocSummariesModule({ spec }: DocSummariesModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
