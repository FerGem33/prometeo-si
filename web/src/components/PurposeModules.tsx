import { useMemo, useRef, useState, type ComponentType } from "react";
import { assess, explainRank } from "../engine";
import type { Scenario } from "../engine";
import type { ModuleSpec, ModuleType, UiBlueprint } from "../ingest/types";
import { validateModules } from "../ingest/modules";
import { compatibleUnits } from "../ingest/variableView";
import { caseFromFields, type CaseField } from "../contracts/case";
import { Src, useData } from "./ctx";
import { doiOf } from "../report/format";
import { interpretLocalQuestion } from "../ingest/localAsk";
import "../styles/purpose.css";

type Props = { module: ModuleSpec; scenario: Scenario; onChange: (s: Scenario) => void };

function ScenarioInput({ module, scenario, onChange }: Props) {
  const { pack } = useData();
  const [fields, setFields] = useState<Record<string, CaseField>>(() => Object.fromEntries(module.variables.map(id => {
    const variable = pack.schema.variables.find(v => v.id === id);
    return [id, { value: scenario.values[id] === undefined ? "" : String(scenario.values[id]), unit: variable?.type === "num" ? variable.unit : undefined }];
  })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorSummary = useRef<HTMLDivElement>(null);
  return <form onSubmit={event => {
    event.preventDefault();
    const result = caseFromFields(pack, module.variables, fields);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) requestAnimationFrame(() => errorSummary.current?.focus());
    else onChange(result.scenario);
  }} noValidate>
    {!!Object.keys(errors).length && <div ref={errorSummary} role="alert" tabIndex={-1}>
      <b>Check the case conditions</b>
      <ul>{Object.entries(errors).map(([id, error]) => <li key={id}><a href={`#case-${module.id}-${id}`}>{error}</a></li>)}</ul>
    </div>}
    <div id={`case-${module.id}-case`} />
    {module.variables.map(id => {
      const variable = pack.schema.variables.find(v => v.id === id);
      if (!variable) return null;
      const inputId = `case-${module.id}-${id}`;
      const field = fields[id] ?? { value: "" };
      const update = (patch: Partial<CaseField>) => setFields(previous => ({ ...previous, [id]: { ...field, ...patch } }));
      return <div className="purpose-field" key={id}>
        <label htmlFor={inputId}>{variable.long ?? variable.label}{variable.type === "num" ? ` (${variable.unit})` : ""}</label>
        <input id={inputId} type="text" inputMode={variable.type === "num" ? "decimal" : "text"} value={field.value}
          maxLength={120} onChange={event => update({ value: event.target.value })}
          aria-invalid={!!errors[id]} aria-describedby={`${inputId}-hint${errors[id] ? ` ${inputId}-error` : ""}`} />
        {variable.type === "num" && <label>Input unit<select value={field.unit ?? variable.unit} onChange={event => update({ unit: event.target.value })}>
          {[variable.unit, ...compatibleUnits(variable.unit)].map(unit => <option key={unit} value={unit}>{unit}</option>)}
        </select></label>}
        <p className="hint" id={`${inputId}-hint`}>{variable.type === "num"
          ? `Schema input limits: ${variable.range[0]} to ${variable.range[1]} ${variable.unit}. These are validation limits, not evidence coverage.`
          : "Enter a category for your case; an unseen category is not measured evidence."}</p>
        {errors[id] && <p id={`${inputId}-error`}>{errors[id]}</p>}
      </div>;
    })}
    <button type="submit" className="chip">Compare confirmed conditions</button>
  </form>;
}

function CaseNotes({ module, scenario, onChange }: Props) {
  const { pack } = useData();
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<{ scenario: Scenario; signature: string } | null>(null);
  const [message, setMessage] = useState("");
  return <div>
    <label htmlFor={`notes-${module.id}`}>{module.title}</label>
    <textarea id={`notes-${module.id}`} value={text} maxLength={4000} rows={4} onChange={event => { setText(event.target.value); setProposal(null); }} />
    <button type="button" className="chip" disabled={!text.trim()} onClick={() => {
      const selectedPack = { ...pack, schema: { ...pack.schema, variables: pack.schema.variables.filter(v => module.variables.includes(v.id)) } };
      const result = interpretLocalQuestion(text, selectedPack, true);
      if ("unsupported" in result) { setProposal(null); setMessage("No valid selected-variable conditions were found. Use the case form."); }
      else { setProposal({ scenario: result, signature: JSON.stringify(scenario) }); setMessage("Interpreted locally; nothing has been applied. Review the conditions below."); }
    }}>Interpret conditions locally</button>
    <p role="status">{message}</p>
    {proposal && <div><ul>{proposal.scenario.active.map(id => {
      const variable = pack.schema.variables.find(v => v.id === id)!;
      return <li key={id}>{variable.label}: {proposal.scenario.values[id]} {variable.type === "num" ? variable.unit : ""} · user-described condition</li>;
    })}</ul><button type="button" className="chip" onClick={() => {
      if (proposal.signature !== JSON.stringify(scenario)) { setProposal(null); setMessage("Your case changed. Interpret the description again."); return; }
      const values = { ...scenario.values, ...proposal.scenario.values };
      onChange({ values, active: module.variables.filter(id => values[id] !== undefined && values[id] !== "") });
      setProposal(null);
    }}>Confirm and apply these conditions</button></div>}
  </div>;
}

function KeyPapers({ scenario }: Props) {
  const { pack, lens } = useData();
  const assessment = useMemo(() => assess(pack, lens, scenario), [pack, lens, scenario]);
  const ranked = assessment.ranking;
  return <div>
    <p>Template-based source summaries · no live AI text. {scenario.active.length ? "Ordered by the engine for your confirmed conditions." : "Enter case conditions to rank sources by proximity."}</p>
    {ranked.map(result => {
      const study = pack.studies.find(s => s.id === result.study)!;
      const record = pack.records.find(r => r.id === result.nearest) ?? pack.records.find(r => r.study === study.id);
      const source = pack.sources.find(s => s.id === record?.source.id);
      const doi = doiOf(pack, study.id);
      const why = scenario.active.length ? explainRank(pack, scenario, study.id) : null;
      return <section key={study.id}>
        <h3>{study.title}</h3>
        {doi && <p><a href={doi.url} target="_blank" rel="noreferrer">DOI: {doi.label}</a></p>}
        {record && source ? <p><Src id={record.id}>{source.name} · {record.source.page !== undefined ? `Page ${record.source.page}` : `Row ${record.source.row}`}</Src></p> : <p>No sourced record is available.</p>}
        {record?.quote && <blockquote>{record.quote}</blockquote>}
        {why && <><p>Study proximity grade: {result.grade}. This is the existing engine distance grade, not a risk or global case-coverage grade.</p>
          <ul>{why.terms.map(term => <li key={term.variable}>
            {pack.schema.variables.find(v => v.id === term.variable)?.label}: {term.status}
            {record && term.recordValue !== null && <> · <Src id={record.id}>{JSON.stringify(term.recordValue)}</Src></>}
          </li>)}</ul></>}
      </section>;
    })}
  </div>;
}

/** Register renderers independently of schemas. Classification/chat await SPEC §7 decisions. */
const RENDERERS: Partial<Record<ModuleType, ComponentType<Props>>> = {
  scenario_input: ScenarioInput, case_notes: CaseNotes, key_papers: KeyPapers,
};

export function PurposeModules({ blueprint, scenario, onChange }: { blueprint: UiBlueprint; scenario: Scenario; onChange: (s: Scenario) => void }) {
  const { pack } = useData();
  const checked = validateModules(blueprint.modules, pack.schema.variables.map(v => v.id));
  return <section className="purpose-modules" aria-label="Purpose-guided modules">
    {blueprint.purpose && <p><b>Purpose:</b> {blueprint.purpose}</p>}
    {checked.modules.map(module => {
      const Renderer = RENDERERS[module.type];
      return Renderer ? <section key={module.id} aria-labelledby={`module-${module.id}`}>
        <h2 id={`module-${module.id}`}>{module.title}</h2><p>{module.description}</p>
        <Renderer key={`${module.id}:${JSON.stringify(scenario)}`} module={module} scenario={scenario} onChange={onChange} />
      </section> : null;
    })}
  </section>;
}
