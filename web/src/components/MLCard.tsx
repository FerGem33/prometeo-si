import { Src, useData } from "./ctx";
import { summarizeOutcomes } from "../report/ml-card";
import { t } from "../i18n";

function RecordLinks({ records, label }: { records: import("../engine/types").DataRecord[]; label: string }) {
  return <details><summary>{label}</summary><ul>{records.map((record) => <li key={record.id}><Src id={record.id}>{record.label}{t(", row")} {record.source.row ?? record.source.page ?? "—"}</Src></li>)}</ul></details>;
}

export function MLCard() {
  const { pack, mapping } = useData();
  const summaries = summarizeOutcomes(pack.records, mapping);
  if (!summaries.length) return null;
  return (
    <section aria-labelledby="ml-card-title">
      <div className="row">
        <div className="body">
          <h2 className="sec" id="ml-card-title">{t("4 · Outcome data description")}</h2>
          <p>
            {t("This inventory reports approved outcome columns separately by study, source file and record type. Raw values and stated units are preserved. Completeness uses all records of the same type in that source as its denominator.")}
          </p>
          <p>
            <b>{t("ML suitability: not assessed.")}</b> {t("The pack defines no acceptance thresholds or validated target classes. Raw value frequencies below are descriptive counts, not a class balance or a recommendation to train a model. Repeated rows are only candidates and remain in the data.")}
          </p>
        </div>
      </div>
      <div className="row">
        <div className="wide ml-card">
          <table>
            <caption><b>{t("Table 5 |")}</b> {t("Outcome completeness and raw value frequencies")}</caption>
            <thead><tr><th>{t("Study · source · type")}</th><th>{t("Outcome column")}</th><th>{t("Records with value")}</th><th>{t("Input completeness")}</th><th>{t("Input units stated")}</th><th>{t("Possible repeats")}</th><th>{t("Raw recorded values")}</th></tr></thead>
            <tbody>
              {summaries.map((summary) => {
                const source = pack.sources.find((item) => item.id === summary.sourceId);
                const study = pack.studies.find((item) => item.id === summary.study);
                return (
                  <tr key={`${summary.study}/${summary.sourceId}/${summary.kind}/${summary.column}`}>
                    <td>{study?.short ?? summary.study}<br /><small>{source?.name ?? summary.sourceId}<br />{summary.kind}</small></td>
                    <td>{summary.column}{summary.unit ? ` (${summary.unit})` : ""}</td>
                    <td>
                      <RecordLinks records={summary.observed} label={t("{0} / {1} observed", summary.observed.length, summary.denominator)} />
                      <RecordLinks records={summary.missingRecords} label={t("{0} missing", summary.missing)} />
                    </td>
                    <td>
                      {summary.inputTotal ? (
                        <>
                          <RecordLinks records={summary.inputCompleteRecords} label={t("{0} / {1} complete", summary.inputComplete, summary.inputTotal)} />
                          <small className="ml-subnote">{t("approved inputs present")}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td><RecordLinks records={summary.records} label={t("{0} / {1} mapped inputs", summary.unitsSpecified, summary.unitsTotal)} /></td>
                    <td>{summary.duplicateCandidates.length ? <RecordLinks records={summary.duplicateCandidates} label={t("{0} candidate rows", summary.duplicateCandidates.length)} /> : "0"}</td>
                    <td>
                      <details>
                        <summary>{summary.values.length} {t("distinct raw values")}</summary>
                        <ul>{summary.values.map((item) => <li key={item.value}>{item.value} · <RecordLinks records={item.records} label={t("{0} records", item.records.length)} /></li>)}</ul>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="tblnote">{t("Every linked count opens a contributing source record. Unit coverage describes mapped input columns; outcome units appear only when explicitly stated in the mapping.")}</p>
        </div>
      </div>
    </section>
  );
}
