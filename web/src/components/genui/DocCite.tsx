/** Inline citation of a document passage: "name · p. 4" with the quote on hover (owner: D9). */
import type { ChatCitation } from "../../genui/types";
import type { VariableCitation } from "../../ingest/types";
import { t } from "../../i18n";

const NAME_MAX = 40;

export function DocCite({ citation }: { citation: ChatCitation | VariableCitation }) {
  const name = citation.docName;
  const shown = name.length > NAME_MAX ? name.slice(0, NAME_MAX) + "…" : name;
  const passage =
    citation.page != null ? t("p. {0}", citation.page) : citation.row != null ? t("row {0}", citation.row) : null;
  const title = `${name} · ${citation.quote}`;
  return (
    <cite className="gx-cite" title={title}>
      {shown}
      {passage ? ` · ${passage}` : ""}
    </cite>
  );
}
