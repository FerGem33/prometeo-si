import { Src, useData } from "./ctx";
import { summarizeOutcomes } from "../report/ml-card";

function RecordLinks({ records, label }: { records: import("../engine/types").DataRecord[]; label: string }) {
  return <details><summary>{label}</summary><ul>{records.map((record) => <li key={record.id}><Src id={record.id}>{record.label}, row {record.source.row ?? record.source.page ?? "—"}</Src></li>)}</ul></details>;
}

export function MLCard() {
  const { pack, mapping } = useData();
  const summaries = summarizeOutcomes(pack.records, mapping);
  if (!summaries.length) return null;
  return (
    <section aria-labelledby="ml-card-title">
      <div className="row">
        <div className="body">
          <h2 className="sec" id="ml-card-title">4 · Outcome data description</h2>
          <p>
            This inventory reports approved outcome columns separately by study, source file and record type. Raw values and stated units are preserved. Completeness uses all records of the same type in that source as its denominator.
          </p>
          <p>
            <b>ML suitability: not assessed.</b> The pack defines no acceptance thresholds or validated target classes. Raw value frequencies below are descriptive counts, not a class balance or a recommendation to train a model. Repeated rows are only candidates and remain in the data.
          </p>
        </div>
      </div>
      <div className="row">
        <div className="wide ml-card">
          <table>
            <caption><b>Table 5 |</b> Outcome completeness and raw value frequencies</caption>
            <thead><tr><th>Study · source · type</th><th>Outcome column</th><th>Records with value</th><th>Input completeness</th><th>Input units stated</th><th>Possible repeats</th><th>Raw recorded values</th></tr></thead>
            <tbody>
              {summaries.map((summary) => {
                const source = pack.sources.find((item) => item.id === summary.sourceId);
                const study = pack.studies.find((item) => item.id === summary.study);
                return (
                  <tr key={`${summary.study}/${summary.sourceId}/${summary.kind}/${summary.column}`}>
                    <td>{study?.short ?? summary.study}<br /><small>{source?.name ?? summary.sourceId}<br />{summary.kind}</small></td>
                    <td>{summary.column}{summary.unit ? ` (${summary.unit})` : ""}</td>
                    <td>
                      <RecordLinks records={summary.observed} label={`${summary.observed.length} / ${summary.denominator} observed`} />
                      <RecordLinks records={summary.missingRecords} label={`${summary.missing} missing`} />
                    </td>
                    <td>
                      {summary.inputTotal ? (
                        <>
                          <RecordLinks records={summary.inputCompleteRecords} label={`${summary.inputComplete} / ${summary.inputTotal} complete`} />
                          <small className="ml-subnote">approved inputs present</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td><RecordLinks records={summary.records} label={`${summary.unitsSpecified} / ${summary.unitsTotal} mapped inputs`} /></td>
                    <td>{summary.duplicateCandidates.length ? <RecordLinks records={summary.duplicateCandidates} label={`${summary.duplicateCandidates.length} candidate rows`} /> : "0"}</td>
                    <td>
                      <details>
                        <summary>{summary.values.length} distinct raw values</summary>
                        <ul>{summary.values.map((item) => <li key={item.value}>{item.value} · <RecordLinks records={item.records} label={`${item.records.length} records`} /></li>)}</ul>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="tblnote">Every linked count opens a contributing source record. Unit coverage describes mapped input columns; outcome units appear only when explicitly stated in the mapping.</p>
        </div>
      </div>
    </section>
  );
}
