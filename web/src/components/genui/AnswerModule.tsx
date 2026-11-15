/** Direct answer to the purpose: one statistic or one filter, with its records (owner: D1). STUB from F0. */
import type { LocalAnswer } from "../../ingest/localAsk";
import type { ModuleOf } from "../../genui/types";

export interface AnswerModuleProps {
  spec: ModuleOf<"answer_stat"> | ModuleOf<"answer_filter">;
  answer: LocalAnswer | { unsupported: string };
  figure: number;
}

export function AnswerModule({ spec }: AnswerModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
