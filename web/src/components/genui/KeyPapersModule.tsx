/** Ranked list of the most relevant documents, with reasons (owner: D5). STUB from F0. */
import type { ModuleOf, PaperRelevance } from "../../genui/types";

export interface KeyPapersModuleProps {
  spec: ModuleOf<"key_papers">;
  papers: PaperRelevance[];
  figure: number;
}

export function KeyPapersModule({ spec }: KeyPapersModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
