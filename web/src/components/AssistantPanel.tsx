import { useEffect, useRef, useState } from "react";
import type { Finding, Scenario, VariableEvidence } from "../engine";
import { Src, useData } from "./ctx";
import { findingText } from "../report/text";
import { doiOf, scenarioValueText } from "../report/format";
import { parseAnalysis, parseAsk, postApi } from "../report/api";
import type { Analysis, Sentence } from "../report/api";

export function AssistantPanel({ scenario, levels, findings, onChange }: {
  scenario: Scenario; levels: VariableEvidence[]; findings: Finding[]; onChange: (next: Scenario) => void;
}) {
  const { pack, lens } = useData();
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string; analysis: Analysis } | null>(null);
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify({ scenario, levels, findings });
  const latestKey = useRef(key);
  latestKey.current = key;
  const configured = Boolean(import.meta.env.VITE_API_URL);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounce = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 20000);
      postApi("analysis", JSON.parse(key) as unknown, controller.signal)
        .then((value) => {
          const analysis = parseAnalysis(value, findings, pack);
          if (!controller.signal.aborted) setResult({ key, analysis });
        })
        .catch(() => { /* Current deterministic template stays visible. */ })
        .finally(() => clearTimeout(timeout));
    }, 800);
    return () => { clearTimeout(debounce); clearTimeout(timeout); controller.abort(); };
  }, [key, configured, findings, pack]);

  async function ask() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const started = latestKey.current;
    setBusy(true); setMessage("");
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const next = parseAsk(await postApi("ask", { question, schema: pack.schema }, controller.signal), pack);
      if (controller.signal.aborted) return;
      if (started !== latestKey.current) { setMessage("The scenario changed. Submit the question again to apply it."); return; }
      if ("unsupported" in next) setMessage(next.unsupported);
      else { onChange(next); setMessage("Scenario updated. Edit its values in the controls above."); }
    } catch { setMessage("The question service is unavailable. Use the scenario controls above."); }
    finally { clearTimeout(timer); if (request.current === controller) setBusy(false); }
  }

  const fallback: Sentence[] = findings.filter((f) => f.sources.length > 0).slice(0, 5)
    .map((f) => ({ finding: f.id, text: findingText(pack, lens, f), sources: f.sources }));
  const analysis = result?.key === key && result.analysis.sentences.length ? result.analysis : { mode: "template", sentences: fallback };

  return <section className="assistant-panel" aria-label="Scenario questions and analysis">
    <div className="noprint">
      <form onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <label htmlFor="scenario-question">Ask about a scenario</label>
        <div className="question-row">
          <input id="scenario-question" value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} required disabled={busy} />
          <button className="chip" disabled={!configured || busy || !question.trim()}>{busy ? "Interpreting…" : "Apply question"}</button>
        </div>
      </form>
      <div className="presets">{lens.questions?.map((q) => <button type="button" className="chip" key={q} disabled={busy} onClick={() => setQuestion(q)}>{q}</button>)}</div>
      <p role="status">{message || (!configured ? "Questions are unavailable; use the scenario controls." : "Questions change conditions only; they do not predict outcomes.")}</p>
      <div className="presets" aria-label="Interpreted scenario">{scenario.active.map((id) => {
        const v = pack.schema.variables.find((item) => item.id === id);
        if (!v) return null;
        return <button type="button" className="chip" key={id} title={`Edit ${v.label} in the scenario controls above`} onClick={() => {
          const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${CSS.escape(v.label)} value"], select[aria-label="${CSS.escape(v.label)}"]`);
          field?.focus(); field?.scrollIntoView({ block: "center", behavior: "smooth" });
        }}>{v.label}: {scenarioValueText(pack, id, scenario.values[id])} · Edit</button>;
      })}</div>
    </div>
    <h2 className="sec">Analysis</h2>
    <p className="tblnote">{analysis.mode === "ai" ? "AI-assisted selection · verified evidence sentences" : "Template-based analysis · no live AI text"}</p>
    {analysis.sentences.length ? <ul>{analysis.sentences.map((s) => <li key={s.finding}>
      {s.text}{" "}<span className="analysis-sources">{s.sources.map((id) => {
        const study = pack.studies.find((item) => item.id === id);
        if (!study) return <Src key={id} id={id}>{id}</Src>;
        const doi = doiOf(pack, id);
        return doi ? <a key={id} href={doi.url} target="_blank" rel="noreferrer">{study.short}</a> : <span key={id}>{study.short}</span>;
      })}</span>
    </li>)}</ul> : <p>No sourced analysis is available for these conditions.</p>}
  </section>;
}
