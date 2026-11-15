import { useEffect, useRef, useState } from "react";
import type { Finding, Scenario, VariableEvidence } from "../engine";
import { Src, useData } from "./ctx";
import { findingText } from "../report/text";
import { doiOf, scenarioValueText } from "../report/format";
import { API_BASE, parseAnalysis, parseAsk, postApi } from "../report/api";
import type { Analysis, Sentence } from "../report/api";
import { getLang, t, tx } from "../i18n";
import { originalPack } from "../i18n/localize";
import { answerLocalQuery, interpretLocalQuestion } from "../ingest/localAsk";
import type { LocalAnswer } from "../ingest/localAsk";
import { num } from "../report/format";

// An explicit command changes the scenario; any other question is answered from the records.
const SET_COMMAND = /\b(set|change|cambia|cambiar|pon|poner|fija|establece)\b/i;

export function AssistantPanel({
  scenario,
  levels,
  findings,
  onChange,
  isCustomCorpus,
}: {
  scenario: Scenario;
  levels: VariableEvidence[];
  findings: Finding[];
  onChange: (next: Scenario) => void;
  isCustomCorpus?: boolean;
}) {
  const { pack, lens } = useData();
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ key: string; analysis: Analysis } | null>(null);
  const [local, setLocal] = useState<LocalAnswer | null>(null);
  const request = useRef<AbortController | null>(null);
  const key = JSON.stringify({ scenario, levels, findings });
  const latestKey = useRef(key);
  latestKey.current = key;
  const configured = Boolean(API_BASE);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!configured || isCustomCorpus) return;
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
  }, [key, configured, findings, pack, isCustomCorpus]);

  async function ask() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const started = latestKey.current;
    setBusy(true); setMessage(""); setLocal(null);

    if (isCustomCorpus) {
      try {
        const answer = SET_COMMAND.test(question) ? null : answerLocalQuery(question, pack);
        if (answer && !("unsupported" in answer)) {
          setLocal(answer);
          return;
        }
        const next = interpretLocalQuestion(question, pack);
        if (started !== latestKey.current) {
          setMessage(t("The scenario changed. Submit the question again to apply it."));
          return;
        }
        if ("unsupported" in next) {
          setMessage(next.unsupported);
        } else {
          onChange(next);
          setMessage(t("Scenario updated. Edit its values in the controls above."));
        }
      } finally {
        if (request.current === controller) setBusy(false);
      }
      return;
    }

    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const next = parseAsk(await postApi("ask", { question, schema: originalPack(pack).schema }, controller.signal), pack);
      if (controller.signal.aborted) return;
      if (started !== latestKey.current) { setMessage(t("The scenario changed. Submit the question again to apply it.")); return; }
      if ("unsupported" in next) setMessage(next.unsupported);
      else { onChange(next); setMessage(t("Scenario updated. Edit its values in the controls above.")); }
    } catch { setMessage(t("The question service is unavailable. Use the scenario controls above.")); }
    finally { clearTimeout(timer); if (request.current === controller) setBusy(false); }
  }

  const fallback: Sentence[] = findings.filter((f) => f.sources.length > 0).slice(0, 5)
    .map((f) => ({ finding: f.id, text: findingText(pack, lens, f), sources: f.sources }));
  const analysis = result?.key === key && result.analysis.sentences.length ? result.analysis : { mode: "template", sentences: fallback };

  return <section className="assistant-panel" aria-label={t("Scenario questions and analysis")}>
    <div className="noprint">
      <form onSubmit={(event) => { event.preventDefault(); void ask(); }}>
        <label htmlFor="scenario-question">{t("Ask about a scenario")}</label>
        <div className="question-row">
          <input id="scenario-question" value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} required disabled={busy} />
          <button className="chip" disabled={(!configured && !isCustomCorpus) || busy || !question.trim()}>{busy ? t("Interpreting…") : t("Apply question")}</button>
        </div>
      </form>
      <div className="presets">{lens.questions?.map((q) => <button type="button" className="chip" key={q} disabled={busy} onClick={() => setQuestion(q)}>{q}</button>)}</div>
      <p role="status">{message || (!configured && !isCustomCorpus ? t("Questions are unavailable; use the scenario controls.") : t("Questions change conditions only; they do not predict outcomes."))}</p>
      <div className="presets" aria-label={t("Interpreted scenario")}>{scenario.active.map((id) => {
        const v = pack.schema.variables.find((item) => item.id === id);
        if (!v) return null;
        return <button type="button" className="chip" key={id} title={t("Edit {0} in the scenario controls above", v.label)} onClick={() => {
          const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${CSS.escape(t("{0} value", v.label))}"], select[aria-label="${CSS.escape(v.label)}"]`);
          field?.focus(); field?.scrollIntoView({ block: "center", behavior: "smooth" });
        }}>{v.label}: {scenarioValueText(pack, id, scenario.values[id])} {t("· Edit")}</button>;
      })}</div>
    </div>
    {local && <LocalAnswerView answer={local} />}
    <h2 className="sec">{t("Analysis")}</h2>
    <p className="tblnote">{analysis.mode === "ai" ? t("AI-assisted selection · verified evidence sentences") : t("Template-based analysis · no live AI text")}{analysis.mode === "ai" && getLang() !== "en" ? ` ${t("The analysis sentences are written in English.")}` : ""}</p>
    {analysis.sentences.length ? <ul>{analysis.sentences.map((s) => <li key={s.finding}>
      {s.text}{" "}<span className="analysis-sources">{s.sources.map((id) => {
        const study = pack.studies.find((item) => item.id === id);
        if (!study) return <Src key={id} id={id}>{id}</Src>;
        const doi = doiOf(pack, id);
        return doi ? <a key={id} href={doi.url} target="_blank" rel="noreferrer">{study.short}</a> : <span key={id}>{study.short}</span>;
      })}</span>
    </li>)}</ul> : <p>{t("No sourced analysis is available for these conditions.")}</p>}
  </section>;
}


const OP_TEXT: Record<string, string> = { "<": tx("below"), ">": tx("above"), "<=": tx("at or below"), ">=": tx("at or above"), between: tx("between") };
const STAT_TEXT: Record<string, string> = { max: tx("Maximum"), min: tx("Minimum"), mean: tx("Mean of the tested midpoints"), count: tx("Records with a value") };
const SHOWN = 12;

/** A read-only answer computed in the browser from pack.records; every record it used opens its source. */
export function LocalAnswerView({ answer }: { answer: LocalAnswer }) {
  const { pack } = useData();
  const v = pack.schema.variables.find((x) => x.id === answer.variable);
  const label = v?.label ?? answer.variable;
  const unit = answer.unit ? ` ${answer.unit}` : ""; // leading space only when there is a unit
  const study = (id: string) => pack.studies.find((s) => s.id === id)?.short ?? id;
  let text: string;
  if (answer.kind === "stat") {
    text = answer.n === 0
      ? t("No record gives a value for {0}.", label)
      : answer.stat === "count"
        ? t("{0} of {1}: {2}.", t(STAT_TEXT.count), label, answer.value)
        : t("{0} of {1}: {2}{3}, over {4} records with a value.", t(STAT_TEXT[answer.stat]), label, num(answer.value), unit, answer.n);
  } else {
    const bounds = answer.bounds.map((b) => num(b)).join(t(" and "));
    text = answer.studies.length === 0
      ? t("No study records {0} {1} {2}{3}.", label, t(OP_TEXT[answer.op]), bounds, unit)
      : t("{0} studies record {1} {2} {3}{4}: {5}.", answer.studies.length, label, t(OP_TEXT[answer.op]), bounds, unit, answer.studies.map(study).join(", "));
  }
  return <div className="local-answer" role="status">
    <p className="tblnote">{t("Computed locally from the corpus records · not AI")}</p>
    <p>{text}</p>
    {answer.records.length > 0 && <p className="analysis-sources">{t("Records:")}{" "}
      {answer.records.slice(0, SHOWN).map((id) => {
        const r = pack.records.find((x) => x.id === id);
        return <Src key={id} id={id}>{r ? `${study(r.study)} · ${r.label}` : id}</Src>;
      })}
      {answer.records.length > SHOWN ? ` ${t("and {0} more", answer.records.length - SHOWN)}` : ""}
    </p>}
  </div>;
}
