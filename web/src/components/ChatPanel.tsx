/** Side chat over the corpus with history and labelled answer modes (owner: S4). STUB from F0. */
import type { Scenario } from "../engine";
import type { UploadedDoc } from "../ingest/types";

export interface ChatPanelProps {
  docs: UploadedDoc[];
  scenario: Scenario | null;
  isCustomCorpus: boolean;
  suggestions: string[];
  /** Applies a proposed scenario after the user confirms it. */
  onApply: (s: Scenario) => void;
}

export function ChatPanel(_props: ChatPanelProps) {
  return <aside className="chat-panel" />;
}
