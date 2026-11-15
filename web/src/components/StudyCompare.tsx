import { useMemo, useState } from "react";
import type { DataRecord, Study, Variable } from "../engine";
import { doiOf } from "../report/format";
import { Src, useData } from "./ctx";

function RecordLinks({ records }: { records: DataRecord[] }) {
  return <details><summary>{records.length} source records</summary><ul>{records.map((record) => <li key={record.id}><Src id={record.id}>{record.label}, row {record.source.row ?? record.source.page ?? "—"}</Src></li>)}</ul></details>;
}

function StudyText({ label, value }: { label: string; value: string | null }) {
  if (!value) return <p><b>{label}:</b> Not stated in repository metadata</p>;
  if (value.length <= 220) return <p><b>{label}:</b> {value}</p>;
  return <details className="study-description"><summary><b>{label}:</b> {value.slice(0, 220).trim()}…</summary><p>{value}</p></details>;
}

function VariableValues({ records, variable }: { records: DataRecord[]; variable: Variable }) {
  const available = records.filter((record) => record.values[variable.id] !== undefined && record.values[variable.id] !== "");
  if (!available.length) return <span>Not recorded</span>;
  if (variable.type === "num") {
    const ranges = available.flatMap((record) => {
      const value = record.values[variable.id];
      return Array.isArray(value) ? [value] : [];
    });
    if (!ranges.length) return <span>Recorded; source values open below</span>;
    const low = Math.min(...ranges.map((range) => range[0]));
    const high = Math.max(...ranges.map((range) => range[1]));
    return <><span>{low === high ? `${low} ${variable.unit}` : `${low}–${high} ${variable.unit}`}</span><br /><RecordLinks records={available} /></>;
  }
  const categories = [...new Set(available.map((record) => String(record.values[variable.id])))].sort((a, b) => a.localeCompare(b, "en"));
  return <details><summary>{categories.length} observed values</summary><ul>{categories.map((category) => {
    const categoryRecords = available.filter((record) => record.values[variable.id] === category);
    return <li key={category}>{category} · <RecordLinks records={categoryRecords} /></li>;
  })}</ul></details>;
}

function StudyColumn({ study, variables, records }: { study: Study; variables: Variable[]; records: DataRecord[] }) {
  const { pack } = useData();
  const tests = records.filter((record) => record.kind === "test");
  const campaigns = records.filter((record) => record.kind === "campaign");
  const doi = doiOf(pack, study.id);
  return (
    <section className="study-compare-col" aria-label={`${study.short} study details`}>
      <h3>{study.short}</h3>
      <p className="study-title">{study.title}</p>
      <p className="tblnote">{doi ? <a href={doi.url} target="_blank" rel="noreferrer">Dataset DOI: {doi.label}</a> : "No dataset DOI in repository metadata"}</p>
      <StudyText label="Objective" value={study.summary.objective} />
      <StudyText label="Conditions" value={study.summary.conditions} />
      <p><b>Subjects:</b> {study.summary.subjects.join(", ") || "Not stated in repository metadata"}</p>
      <p><b>Instruments:</b> {study.summary.instruments ?? "Not stated in repository metadata"}</p>
      <p><RecordLinks records={records} /> · tests and campaign rows shown separately below</p>
      <p className="tblnote">{tests.length} individual tests · {campaigns.length} campaign rows</p>
      <table className="study-values">
        <thead><tr><th>Variable · unit</th><th>Observed values in individual tests</th><th>Original columns · source units</th></tr></thead>
        <tbody>
          {variables.map((variable) => {
            const testRecords = tests.filter((record) => record.values[variable.id] !== undefined && record.values[variable.id] !== "");
            const campaignRecords = campaigns.filter((record) => record.values[variable.id] !== undefined && record.values[variable.id] !== "");
            const available = [...testRecords, ...campaignRecords];
            const origins = [...new Set(available.map((record) => {
              const origin = record.orig?.[variable.id];
              const unitAlreadyInColumn = origin?.unit && origin.column?.toLocaleLowerCase().includes(origin.unit.toLocaleLowerCase());
              return origin?.column ? `${origin.column}${origin.unit && !unitAlreadyInColumn ? ` (${origin.unit})` : ""}` : "Approved table constant";
            }))];
            return (
              <tr key={variable.id}>
                <td>{variable.long ?? variable.label}{variable.type === "num" ? ` (${variable.unit})` : " (categorical)"}</td>
                <td><small>Tests:</small> <VariableValues records={testRecords} variable={variable} /><br /><small>Campaigns:</small> <VariableValues records={campaignRecords} variable={variable} /></td>
                <td>{origins.length ? <>{origins.join("; ")}<br /><RecordLinks records={available} /></> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tblnote">Test measurements and campaign summaries are displayed separately. Open linked records for the source rows.</p>
    </section>
  );
}

export function StudyCompare() {
  const { pack } = useData();
  const studies = pack.studies;
  const withTests = studies.filter((study) => (study.counts.tests ?? 0) > 0);
  const [leftId, setLeftId] = useState(withTests[0]?.id ?? studies[0]?.id ?? "");
  const [rightId, setRightId] = useState(withTests.find((study) => study.id !== leftId)?.id ?? studies.find((study) => study.id !== leftId)?.id ?? "");
  const [left, right] = useMemo(() => [studies.find((study) => study.id === leftId), studies.find((study) => study.id === rightId)], [studies, leftId, rightId]);
  if (!left || !right || left.id === right.id) return null;
  const recordsFor = (studyId: string) => pack.records.filter((record) => record.study === studyId);
  return (
    <section aria-labelledby="compare-title">
      <div className="row">
        <div className="body">
          <h2 className="sec" id="compare-title">5 · Compare two studies</h2>
          <div className="study-compare-controls noprint">
            <label>Study A <select value={left.id} onChange={(event) => {
              const id = event.target.value;
              setLeftId(id);
              if (id === right.id) setRightId(studies.find((study) => study.id !== id)?.id ?? "");
            }}>{studies.map((study) => <option key={study.id} value={study.id}>{study.short} · {study.id}</option>)}</select></label>
            <label>Study B <select value={right.id} onChange={(event) => {
              const id = event.target.value;
              setRightId(id);
              if (id === left.id) setLeftId(studies.find((study) => study.id !== id)?.id ?? "");
            }}>{studies.map((study) => <option key={study.id} value={study.id}>{study.short} · {study.id}</option>)}</select></label>
          </div>
          <p>Each column summarizes repository metadata and records for one study. Numeric intervals use the report’s normalized units; original column names and stated source units remain visible. Individual tests and campaign summaries stay separate, and outcomes with different source headers are not combined.</p>
        </div>
      </div>
      <div className="row study-compare-grid">
        <StudyColumn study={left} variables={pack.schema.variables} records={recordsFor(left.id)} />
        <StudyColumn study={right} variables={pack.schema.variables} records={recordsFor(right.id)} />
      </div>
    </section>
  );
}
