/** Chat router: guard -> case command -> local stat -> search -> /chat (owner: S4). STUB from F0. */
import type { Pack, Scenario } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import type { ChatTurn } from "./types";

export interface ChatContext {
  pack: Pack;
  docs: UploadedDoc[];
  scenario: Scenario | null;
  history: ChatTurn[];
  isCustomCorpus: boolean;
  /** Injected network call (report/api.ts postApi); undefined when no API is configured. */
  post?: (path: string, body: unknown, signal: AbortSignal) => Promise<unknown>;
  signal: AbortSignal;
}

export function isPredictionQuestion(_q: string): boolean {
  return false;
}

export async function routeQuestion(q: string, _ctx: ChatContext): Promise<ChatTurn> {
  return { id: `a-${Date.now()}`, role: "assistant", text: q, mode: "error" };
}
