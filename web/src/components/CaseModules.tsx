import { useMemo, useState, type ComponentType } from "react";
import { evidenceLevels, explainRank, type Scenario, type StudyResult, type VariableEvidence } from "../engine";
import type { ModuleSpec, ModuleType } from "../ingest/modules";
import { extractCaseFeatures, type CaseFeature } from "../ingest/caseNotes";
import { answerLocalQuery, isPredictionQuestion, type LocalAnswer } from "../ingest/localAsk";
import { API_BASE, parseAsk, postApi } from "../report/api";
import { doiOf, num, scenarioValueText, studyShort, varOf } from "../report/format";
import { LEVELS, whyText } from "../report/text";
import { originalPack } from "../i18n/localize";
import type { Extra } from "../state";
import { EXTRA_BASIS, ExtraTag } from "./ExtraVars";
import { LocalAnswerView } from "./AssistantPanel";
import { NumField } from "./NumField";
import { LevelTag } from "./ScenarioPanel";
import { Src, useData } from "./ctx";
import { t } from "../i18n";

export interface ModuleProps {
  spec: ModuleSpec;
  scenario: Scenario;
  setScenario: (s: Scenario | ((s: Scenario) => Scenario)) => void;
  extras: Extra[];
  setExtras: (e: Extra[]) => void;
  levels: VariableEvidence[];
  ranking: StudyResult[];
  isCustomCorpus?: boolean;
}

/** Coverage letter of the presentation layer (spec §4). It describes evidence coverage, never risk or an outcome. */
export const COVERAGE_LETTER: Record<VariableEvidence["level"], "A" | "B" | "C" | "D"> = { studied: "A", near: "B", scarce: "C", not_studied: "D" };
const LETTER_ORDER = ["A", "B", "C", "D"] as const;

const setValue = (setScenario: ModuleProps["setScenario"], id: string, value: number | string) =>
  setScenario((s) => ({ ...s, values: { ...s.values, [id]: value }, active: s.active.includes(id) ? s.active : [...s.active, id] }));

/** Values found in the records for a categorical variable, most frequent first. */
function useCategories(id: string): string[] {
  const { pack } = useData();
  return useMemo(() => {
    const c = new Map<string, number>();
    for (const r of pack.records) {
      const x = r.values[id];
      if (typeof x === "string" && x) c.set(x, (c.get(x) ?? 0) + 1);
    }
    return [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
  }, [pack, id]);
}

// ------------------------------------------------------------------ scenario_input

function CatInput({ id, label, value, onPick }: { id: string; label: string; value: string; onPick: (v: string) => void }) {
  const cats = useCategories(id);
  return (
    <select aria-label={t("{0} value", label)} value={value} onChange={(e) => onPick(e.target.value)}>
      {!cats.includes(value) && <option value={value}>{value || t("Choose…")}</option>}
      {cats.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

function ScenarioInput({ spec, scenario, setScenario, extras, setExtras }: ModuleProps) {
  const { pack } = useData();
  const vars = spec.variables.map((id) => pack.schema.variables.find((v) => v.id === id)).filter((v) => !!v);
  return (
    <div className="mod-form">
      {vars.map((v) => {
        const x = scenario.values[v.id];
        if (v.type === "num") {
          const out = typeof x === "number" && (x < v.range[0] || x > v.range[1]);
          return (
            <label key={v.id} className="mod-field">
              <span>{v.long ?? v.label}</span>
              <NumField label={t("{0} value", v.label)} min={-1e12} max={1e12} value={typeof x === "number" ? x : undefined} onCommit={(n) => setValue(setScenario, v.id, n)} />
              <small>{v.unit}</small>
              <small className={out ? "mod-out" : ""}>
                {out
                  ? t("Outside the range found in the documents ({0}–{1} {2}).", num(v.range[0]), num(v.range[1]), v.unit)
                  : t("Range in the documents: {0}–{1}", num(v.range[0]), num(v.range[1]))}
              </small>
            </label>
          );
        }
        return (
          <label key={v.id} className="mod-field">
            <span>{v.long ?? v.label}</span>
            <CatInput id={v.id} label={v.label} value={typeof x === "string" ? x : ""} onPick={(c) => setValue(setScenario, v.id, c)} />
          </label>
        );
      })}
      {extras.map((e) => (
        <label key={e.id} className="mod-field">
          <span>{e.name}</span>
          <input
            aria-label={t("{0} value", e.name)}
            maxLength={40}
            inputMode={e.type === "categorical" ? "text" : "decimal"}
            value={e.value}
            onChange={(ev) => setExtras(extras.map((o) => (o.id === e.id ? { ...o, value: ev.target.value } : o)))}
          />
          <small>{e.unit}</small>
          <ExtraTag />
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ classification

function Classification({ spec, scenario, extras, levels }: ModuleProps) {
  const { pack, lens } = useData();
  const rows = levels.filter((l) => spec.variables.includes(l.variable));
  const letters = [...rows.map((l) => COVERAGE_LETTER[l.level]), ...extras.map(() => "D" as const)];
  const overall = letters.length ? LETTER_ORDER[Math.max(...letters.map((l) => LETTER_ORDER.indexOf(l)))] : null;
  const overallLevel = overall ? (Object.keys(COVERAGE_LETTER) as VariableEvidence["level"][]).find((k) => COVERAGE_LETTER[k] === overall)! : null;
  return (
    <div>
      {overall && overallLevel && (
        <p className="mod-overall">
          <b className={`mod-letter mod-letter-${overall}`} aria-hidden="true">{overall}</b>{" "}
          {t("Overall coverage of the case: {0} · {1}. The weakest variable sets it.", overall, LEVELS[overallLevel].label)}
        </p>
      )}
      <table className="mod-table">
        <caption>{t("Coverage by variable. Letters: A studied · B near, not covered · C scarce evidence · D not studied. They describe evidence coverage only.")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("Variable")}</th>
            <th scope="col">{t("Your case")}</th>
            <th scope="col">{t("Coverage")}</th>
            <th scope="col">{t("Tested range")}</th>
            <th scope="col">{t("Backed by")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const v = varOf(pack, l.variable);
            return (
              <tr key={l.variable}>
                <th scope="row">{v.long ?? v.label}</th>
                <td>{scenarioValueText(pack, l.variable, scenario.values[l.variable])}</td>
                <td>
                  <b className={`mod-letter mod-letter-${COVERAGE_LETTER[l.level]}`}>{COVERAGE_LETTER[l.level]}</b> <LevelTag level={l.level} />
                </td>
                <td>{l.tested ? `${num(l.tested[0])}–${num(l.tested[1])} ${v.type === "num" ? v.unit : ""}` : "—"}</td>
                <td>
                  {l.source ? <Src id={l.source}>{t("record")}</Src> : null}{" "}
                  {l.studies.slice(0, 3).map((s) => {
                    const doi = doiOf(pack, s);
                    return doi ? (
                      <a key={s} href={doi.url} target="_blank" rel="noreferrer">
                        {studyShort(pack, s)}
                      </a>
                    ) : (
                      <span key={s}>{studyShort(pack, s)} </span>
                    );
                  })}
                  {!l.source && !l.studies.length ? t("No record in the corpus") : null}
                </td>
              </tr>
            );
          })}
          {extras.map((e) => (
            <tr key={e.id}>
              <th scope="row">{e.name}</th>
              <td>{e.value ? `${e.value} ${e.unit}`.trim() : "—"}</td>
              <td>
                <b className="mod-letter mod-letter-D">D</b> <ExtraTag />
              </td>
              <td>—</td>
              <td>{t(EXTRA_BASIS)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && extras.length === 0 && <p className="hint">{t("Enter the values of your case to classify it.")}</p>}
      <p className="tblnote">{t("Computed by the engine from the records ({0} rule set); not a prediction.", lens.evidence.min_studies > 1 ? t("minimum {0} studies", lens.evidence.min_studies) : t("minimum 1 study"))}</p>
    </div>
  );
}

// ------------------------------------------------------------------ key_papers

function KeyPapers({ spec, scenario, ranking }: ModuleProps) {
  const { pack, lens } = useData();
  const top = ranking.filter((r) => r.distance !== null).slice(0, spec.limit ?? 5);
  if (!top.length) return <p className="hint">{t("No paper has records comparable with the case.")}</p>;
  return (
    <>
      <p className="tblnote">{t("Order and relevance computed by the engine (distance to the case). Summaries are templates built from the records · no live AI text.")}</p>
      <ol className="mod-papers">
        {top.map((r) => {
          const s = pack.studies.find((x) => x.id === r.study);
          const doi = doiOf(pack, r.study);
          const terms = explainRank(pack, scenario, r.study)?.terms ?? [];
          const shared = terms.filter((x) => x.status === "inside" || x.status === "same").map((x) => varOf(pack, x.variable).label);
          const outside = terms.filter((x) => x.status === "outside" || x.status === "differs").map((x) => varOf(pack, x.variable).label);
          return (
            <li key={r.study}>
              <p>
                <b>{s?.short ?? r.study}</b> · {t("grade {0}, d = {1}", r.grade, r.distance === null ? "—" : num(r.distance))}{" "}
                {doi && (
                  <a href={doi.url} target="_blank" rel="noreferrer">
                    {doi.label}
                  </a>
                )}
              </p>
              {s?.title && s.title !== s.short && <p className="mod-title">{s.title}</p>}
              <p>
                <b>{t("Why it is relevant.")}</b>{" "}
                {shared.length ? t("Its records cover the case on {0}.", shared.join(", ")) : t("Its records do not cover any value of the case.")}{" "}
                {outside.length ? t("They differ on {0}.", outside.join(", ")) : ""}
              </p>
              <p>
                <b>{t("Summary.")}</b> {s?.summary.objective ?? t("{0} records from this source.", s?.counts.records ?? 0)}{" "}
                {r.nearest && <Src id={r.nearest}>{t("nearest record")}</Src>}
              </p>
              {r.why.length > 0 && (
                <p>
                  <b>{t("Interpretation.")}</b> {r.why.slice(0, 3).map((w) => whyText(pack, lens, w)).join("; ")}
                  {r.why.length > 3 ? t("; and {0} more reasons (Table 1).", r.why.length - 3) : "."}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ case_notes

function CaseNotes({ spec, setScenario }: ModuleProps) {
  const { pack } = useData();
  const [text, setText] = useState("");
  const [found, setFound] = useState<CaseFeature[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const vars = spec.variables
    .map((id) => pack.schema.variables.find((v) => v.id === id))
    .filter((v) => !!v)
    .map((v) => ({ id: v.id, label: v.label, long: v.long, type: v.type, unit: v.type === "num" ? v.unit : undefined }));
  const cats = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    for (const r of pack.records) for (const v of vars) if (v.type === "cat" && typeof r.values[v.id] === "string") (out[v.id] ??= new Set()).add(r.values[v.id] as string);
    return out;
  }, [pack, vars.map((v) => v.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = (f: CaseFeature) => {
    const raw = edits[f.variable] ?? String(f.value);
    const v = varOf(pack, f.variable);
    const value = v.type === "num" ? Number(raw) : raw;
    if (v.type === "num" && !Number.isFinite(value)) return;
    setValue(setScenario, f.variable, value);
    setFound((prev) => prev?.filter((x) => x.variable !== f.variable) ?? null);
  };

  return (
    <div>
      <label className="fieldlbl" htmlFor={`${spec.id}-text`}>
        {t("Description of the case")}
      </label>
      <textarea id={`${spec.id}-text`} className="goal" rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
      <button
        type="button"
        className="chip"
        disabled={!text.trim()}
        onClick={() => {
          setEdits({});
          setFound(extractCaseFeatures(text, vars.map((v) => ({ ...v, categories: [...(cats[v.id] ?? [])] }))));
        }}
      >
        {t("Detect variables in the text")}
      </button>
      {found && found.length === 0 && <p className="hint">{t("No selected variable with a value was found in the text.")}</p>}
      {found && found.length > 0 && (
        <ul className="mod-found">
          {found.map((f) => {
            const v = varOf(pack, f.variable);
            return (
              <li key={f.variable}>
                <span>
                  <b>{v.long ?? v.label}</b>{" "}
                  <input
                    aria-label={t("{0} proposed value", v.label)}
                    value={edits[f.variable] ?? String(f.value)}
                    onChange={(e) => setEdits((p) => ({ ...p, [f.variable]: e.target.value }))}
                  />{" "}
                  {v.type === "num" ? v.unit : ""}
                  {f.fromUnit ? ` ${t("(converted from {0})", f.fromUnit)}` : ""}
                </span>
                <small>“{f.quote}”</small>
                <button type="button" className="chip add" onClick={() => confirm(f)}>
                  {t("Confirm")}
                </button>
                <button type="button" className="rm" onClick={() => setFound((p) => p?.filter((x) => x.variable !== f.variable) ?? null)}>
                  {t("Dismiss")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="tblnote">{t("Detected locally from your text. Nothing is applied until you confirm it.")}</p>
    </div>
  );
}

// ------------------------------------------------------------------ free_chat

type ChatTurn =
  | { q: string; kind: "local"; answer: LocalAnswer }
  | { q: string; kind: "engine"; levels: VariableEvidence[] }
  | { q: string; kind: "reframe"; levels: VariableEvidence[] }
  | { q: string; kind: "note"; text: string };

function LevelList({ levels }: { levels: VariableEvidence[] }) {
  const { pack } = useData();
  if (!levels.length) return <p>{t("No variable of the case is set.")}</p>;
  return (
    <ul>
      {levels.map((l) => (
        <li key={l.variable}>
          {varOf(pack, l.variable).label} {scenarioValueText(pack, l.variable, l.value)}: <LevelTag level={l.level} />{" "}
          {l.source && <Src id={l.source}>{t("source")}</Src>}
        </li>
      ))}
    </ul>
  );
}

function FreeChat({ levels, isCustomCorpus }: ModuleProps) {
  const { pack, lens } = useData();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const add = (turn: ChatTurn) => setTurns((prev) => [turn, ...prev].slice(0, 20));

  const local = (question: string, note?: string) => {
    const a = answerLocalQuery(question, pack);
    if ("unsupported" in a) add({ q: question, kind: "note", text: note ? `${note} ${a.unsupported}` : a.unsupported });
    else add({ q: question, kind: "local", answer: a });
  };

  async function ask() {
    const question = q.trim();
    if (!question) return;
    setBusy(true);
    try {
      if (isPredictionQuestion(question)) return add({ q: question, kind: "reframe", levels });
      if (isCustomCorpus || !API_BASE) return local(question);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        // The model only turns the question into validated conditions; levels and values come from the engine.
        const next = parseAsk(await postApi("ask", { question, schema: originalPack(pack).schema }, controller.signal), pack);
        if ("unsupported" in next) local(question);
        else add({ q: question, kind: "engine", levels: evidenceLevels(pack, lens, next) });
      } catch {
        local(question, t("The AI service is unavailable; local answer."));
      } finally {
        clearTimeout(timer);
      }
    } finally {
      setBusy(false);
      setQ("");
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className="question-row">
          <input aria-label={t("Question about the corpus")} value={q} maxLength={2000} onChange={(e) => setQ(e.target.value)} disabled={busy} />
          <button className="chip" disabled={busy || !q.trim()}>
            {busy ? t("Answering…") : t("Ask")}
          </button>
        </div>
      </form>
      <p className="hint">{t("Answers compare conditions with the records; they do not predict outcomes.")}</p>
      <ol className="mod-chat">
        {turns.map((turn, i) => (
          <li key={turns.length - i}>
            <p className="mod-q">
              <b>{t("Question.")}</b> {turn.q}
            </p>
            {turn.kind === "local" && (
              <>
                <p className="tblnote">{t("Local answer · computed in the browser from the records, no AI")}</p>
                <LocalAnswerView answer={turn.answer} />
              </>
            )}
            {turn.kind === "engine" && (
              <>
                <p className="tblnote">{t("AI-interpreted question · levels and values computed by the engine")}</p>
                <LevelList levels={turn.levels} />
              </>
            )}
            {turn.kind === "reframe" && (
              <>
                <p className="tblnote">{t("Template answer · no AI")}</p>
                <p>{t("Prometeo does not predict outcomes or judge safety. What it can say is how far the evidence covers your case:")}</p>
                <LevelList levels={turn.levels} />
              </>
            )}
            {turn.kind === "note" && <p>{turn.text}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Registry: a new module type = a schema in ingest/modules.ts + a renderer here. */
export const MODULE_RENDERERS: Record<ModuleType, ComponentType<ModuleProps>> = {
  scenario_input: ScenarioInput,
  classification: Classification,
  key_papers: KeyPapers,
  case_notes: CaseNotes,
  free_chat: FreeChat,
};

/** The purpose-driven modules of the report, drawn in the order of the blueprint. */
export function CaseModules({ modules, purpose, ...rest }: Omit<ModuleProps, "spec"> & { modules: ModuleSpec[]; purpose?: string }) {
  if (!modules.length) return null;
  return (
    <section className="case-modules" aria-label={t("Modules generated for the purpose")}>
      <h2 className="sec">{t("Generated for your purpose")}</h2>
      {purpose && <p className="mod-purpose">“{purpose}”</p>}
      {modules.map((m) => {
        const R = MODULE_RENDERERS[m.type];
        return (
          <section key={m.id} className={`mod mod-${m.type}`} aria-label={m.title}>
            <h3>{m.title}</h3>
            {m.description && <p className="mod-desc">{m.description}</p>}
            <R spec={m} {...rest} />
          </section>
        );
      })}
    </section>
  );
}
