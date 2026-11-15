import { useEffect, useRef, useState } from "react";
import type { Finding, Scenario, VariableEvidence } from "../engine";
import { Src, useData } from "./ctx";
import { findingText } from "../report/text";
import { doiOf } from "../report/format";
import { API_BASE, parseAnalysis, postApi } from "../report/api";
import type { Analysis, Sentence } from "../report/api";
import { getLang, t } from "../i18n";
import { ChatPanel } from "./ChatPanel";

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
  const [result, setResult] = useState<{ key: string; analysis: Analysis } | null>(null);
  const key = JSON.stringify({ scenario, levels, findings });
  const configured = Boolean(API_BASE);
  const latestKey = useRef(key);
  latestKey.current = key;

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

  const fallback: Sentence[] = findings.filter((f) => f.sources.length > 0).slice(0, 5)
    .map((f) => ({ finding: f.id, text: findingText(pack, lens, f), sources: f.sources }));
  const analysis = result?.key === key && result.analysis.sentences.length ? result.analysis : { mode: "template", sentences: fallback };

  return <section className="assistant-panel" aria-label={t("Scenario questions and analysis")}>
    <div className="noprint">
      <ChatPanel docs={[]} scenario={scenario} isCustomCorpus={!!isCustomCorpus} suggestions={lens.questions ?? []} onApply={onChange} />
    </div>
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
