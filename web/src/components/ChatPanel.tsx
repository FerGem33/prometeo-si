/** Side chat over the corpus with history and labelled answer modes (owner: S4). */
import { useEffect, useRef, useState } from "react";
import type { Scenario } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import { API_BASE, postApi } from "../report/api";
import { t } from "../i18n";
import { routeQuestion } from "../genui/chat";
import type { ChatCitation, ChatMode, ChatTurn } from "../genui/types";
import { Src, useData } from "./ctx";
import "../styles/chat.css";

export interface ChatPanelProps {
  docs: UploadedDoc[];
  scenario: Scenario | null;
  isCustomCorpus: boolean;
  suggestions: string[];
  /** Applies a proposed scenario after the user confirms it. */
  onApply: (s: Scenario) => void;
}

const MAX_TURNS = 20;
const SHOWN_RECORDS = 12;

function modeLabel(mode?: ChatMode): string {
  switch (mode) {
    case "local_stat": return t("Computed locally from the records · not AI");
    case "local_search": return t("Local search · not AI");
    case "ai": return t("AI answer · each sentence quotes your documents");
    case "case_change": return t("Proposed change · not applied");
    case "guard": return t("Comparison, not prediction");
    default: return t("Notice · not AI");
  }
}

function Cite({ c }: { c: ChatCitation }) {
  const where = c.page !== undefined ? t("p. {0}", c.page) : c.row !== undefined ? t("row {0}", c.row) : "";
  return <li><cite title={c.quote}>{c.docName}{where ? ` · ${where}` : ""}</cite>
    <q className="chat-quote">{c.quote.length > 220 ? `${c.quote.slice(0, 220)}…` : c.quote}</q></li>;
}

function Answer({ turn, applied, onApply }: { turn: ChatTurn; applied: boolean; onApply: () => void }) {
  const { pack } = useData();
  const study = (id: string) => pack.studies.find((s) => s.id === id)?.short ?? id;
  const records = turn.records ?? [];
  return <div className="chat-turn chat-assistant">
    <p className="tblnote chat-mode">{modeLabel(turn.mode)}</p>
    <p className="chat-text">{turn.text}</p>
    {turn.citations && turn.citations.length > 0 && <ul className="chat-cites">{turn.citations.map((c, i) => <Cite key={i} c={c} />)}</ul>}
    {records.length > 0 && <p className="analysis-sources">{t("Records:")}{" "}
      {records.slice(0, SHOWN_RECORDS).map((id) => {
        const r = pack.records.find((x) => x.id === id);
        return <Src key={id} id={id}>{r ? `${study(r.study)} · ${r.label}` : id}</Src>;
      })}
      {records.length > SHOWN_RECORDS ? ` ${t("and {0} more", records.length - SHOWN_RECORDS)}` : ""}
    </p>}
    {turn.proposal && <p className="chat-apply">
      {applied ? <span role="status">{t("Applied")}</span> : <button type="button" className="chip" onClick={onApply}>{t("Apply")}</button>}
    </p>}
  </div>;
}

export function ChatPanel({ docs, scenario, isCustomCorpus, suggestions, onApply }: ChatPanelProps) {
  const { pack } = useData();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const request = useRef<AbortController | null>(null);
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns;
  const endRef = useRef<HTMLDivElement | null>(null);
  const post = API_BASE ? postApi : undefined;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [turns, busy]);

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    const controller = new AbortController();
    request.current = controller;
    const user: ChatTurn = { id: `u-${Date.now().toString(36)}-${turnsRef.current.length}`, role: "user", text: q };
    const history = turnsRef.current;
    setTurns((prev) => [...prev, user].slice(-MAX_TURNS));
    setText("");
    setBusy(true);
    try {
      const answer = await routeQuestion(q, { pack, docs, scenario, history, isCustomCorpus, post, signal: controller.signal });
      if (!controller.signal.aborted) setTurns((prev) => [...prev, answer].slice(-MAX_TURNS));
    } catch {
      const failed: ChatTurn = { id: `e-${Date.now().toString(36)}`, role: "assistant", mode: "error", text: t("The question could not be answered. Try again.") };
      if (!controller.signal.aborted) setTurns((prev) => [...prev, failed].slice(-MAX_TURNS));
    } finally {
      if (request.current === controller) { setBusy(false); request.current = null; }
    }
  }

  function clear() {
    request.current?.abort();
    request.current = null;
    setTurns([]); setApplied({}); setBusy(false);
  }

  return <aside className="chat-panel" aria-label={t("Chat about the documents")}>
    <h2 className="sec">{t("Ask the documents")}</h2>
    <p className="tblnote">{t("Questions compare conditions with the evidence; they do not predict outcomes.")}</p>
    <div className="chat-log" role="log" aria-live="polite" aria-label={t("Conversation")}>
      {turns.length === 0 && <p className="chat-empty">{t("No questions yet. Ask about the documents or pick a suggestion.")}</p>}
      {turns.map((turn) => turn.role === "user"
        ? <div key={turn.id} className="chat-turn chat-user"><p className="tblnote chat-mode">{t("You")}</p><p className="chat-text">{turn.text}</p></div>
        : <Answer key={turn.id} turn={turn} applied={Boolean(applied[turn.id])} onApply={() => { if (turn.proposal) { onApply(turn.proposal); setApplied((a) => ({ ...a, [turn.id]: true })); } }} />)}
      {busy && <p className="tblnote" role="status">{t("Searching the documents…")}</p>}
      <div ref={endRef} />
    </div>
    {suggestions.length > 0 && <div className="presets chat-suggest">{suggestions.map((q) => <button type="button" className="chip" key={q} disabled={busy} onClick={() => void send(q)}>{q}</button>)}</div>}
    <form className="chat-form" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
      <label htmlFor="chat-input">{t("Your question")}</label>
      <textarea id="chat-input" value={text} maxLength={2000} rows={3} disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
      <div className="chat-actions">
        <button type="submit" className="chip chat-send" disabled={busy || !text.trim()}>{busy ? t("Working…") : t("Send")}</button>
        <button type="button" className="chat-clear" onClick={clear} disabled={turns.length === 0 && !busy}>{t("Clear conversation")}</button>
      </div>
    </form>
  </aside>;
}
