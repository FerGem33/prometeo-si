/** Inline citation of a document passage: "name · p. 4" with the quote on hover (owner: D9). STUB from F0. */
import type { ChatCitation } from "../../genui/types";
import type { VariableCitation } from "../../ingest/types";

export function DocCite({ citation }: { citation: ChatCitation | VariableCitation }) {
  return <cite title={citation.quote}>{citation.docName}</cite>;
}
