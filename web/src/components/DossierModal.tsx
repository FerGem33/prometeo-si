import { useEffect, useMemo, useState } from "react";
import { pool } from "../engine";
import type { DataRecord, Finding, OverallEvidence, Pack, Scenario, StudyResult } from "../engine";
import { useData } from "./ctx";
import type { Mapping } from "./ctx";
import { FINDING_LEVEL, findingText, findingTitle, overallText, whyText } from "../report/text";
import { matchingHabitatPreset, allHabitatPresets } from "./HabitatFigure";
import { scenarioValueText, varOf } from "../report/format";
import { generateDossierJson, generateExecutiveMarkdown } from "../report/dossier";
import { datasetCsv, datasetExport, variableColumns } from "../report/dataset-export";
import { t, many } from "../i18n";

export type ExportScope = "all" | "comparable" | "graded";

const esc = (s: unknown) => {
  const t = s === undefined || s === null ? "" : String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n");

export function scopeRecords(pack: Pack, scope: ExportScope, comparable: DataRecord[], ranking: StudyResult[]): DataRecord[] {
  if (scope === "comparable") {
    const ids = new Set(comparable.map((r) => r.id));
    return pack.records.filter((r) => ids.has(r.id));
  }
  if (scope === "graded") {
    const ok = new Set(ranking.filter((r) => r.grade !== "D").map((r) => r.study));
    return pack.records.filter((r) => ok.has(r.study));
  }
  return pack.records;
}

export function harmonizedCsv(pack: Pack, records: DataRecord[] = pack.records, mapping?: Mapping): string {
  return datasetCsv(pack, records, mapping);
}

/** The same records as `harmonizedCsv`, as JSON: values keep their engine shape (numeric ranges as [min, max]). */
export function harmonizedJson(pack: Pack, records: DataRecord[] = pack.records): string {
  const shorts = new Map(pack.studies.map((s) => [s.id, s.short]));
  const files = new Map(pack.sources.map((s) => [s.id, s.name]));
  return JSON.stringify(
    {
      pack: pack.meta.id,
      created_at: pack.meta.created_at,
      source_note: pack.meta.source_note,
      records: records.map((r) => ({ ...r, study_short: shorts.get(r.study) ?? null, source_file: files.get(r.source.id) ?? null })),
    },
    null,
    2,
  );
}

/** Column-by-column description of the harmonized export, so the CSV can be used without reading the code. */
export function dataDictionary(pack: Pack) {
  const part = pack.schema.variables.find((v) => v.type === "cat" && v.role === "partition");
  const has = (id: string) => pack.records.filter((r) => r.values[id] !== undefined && r.values[id] !== "").length;
  const flags = [...new Set(pack.records.flatMap((r) => r.flags))].sort();
  return {
    pack: pack.meta.id,
    title: pack.meta.title,
    created_at: pack.meta.created_at,
    source_note: pack.meta.source_note,
    license: pack.meta.license ?? null,
    records: pack.records.length,
    variables: pack.schema.variables.map((v) => ({
      id: v.id,
      label: v.long ?? v.label,
      type: v.type,
      unit: v.type === "num" ? v.unit : null,
      role: v.type === "cat" ? (v.role ?? null) : null,
      range: v.type === "num" ? v.range : null,
      sigma: v.type === "num" ? v.sigma : null,
      display_units: v.type === "num" ? (v.display_units ?? []) : [],
      csv_columns: variableColumns(v),
      records_with_value: has(v.id),
    })),
    thresholds: pack.schema.thresholds,
    flags: flags.map((id) => ({
      id,
      label: pack.schema.flags?.[id]?.label ?? null,
      note: pack.schema.flags?.[id]?.note ?? null,
      records: pack.records.filter((r) => r.flags.includes(id)).length,
    })),
    notes: [
      "An empty cell means the source does not record the value; it is not a zero.",
      "Numeric variables are ranges in the canonical unit: <id>_min [unit] and <id>_max [unit].",
      "<id>_original columns keep the value before a reviewer correction; <id>_source_text and <id>_source_unit keep the cell as the source wrote it.",
      ...(part ? [`${part.id} separates records that are never compared with each other.`] : []),
      "source_file, source_row and source_page point to the origin of each record; flags are separated by |.",
    ],
  };
}

export function dataDictionaryMd(pack: Pack): string {
  const d = dataDictionary(pack);
  const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|");
  return [
    `# Data dictionary · ${d.title}`,
    "",
    `${d.source_note}. Pack \`${d.pack}\`, ${d.created_at}, ${d.records} records.`,
    "",
    "| CSV columns | Variable | Type | Canonical unit | Range | Records with value |",
    "|---|---|---|---|---|---|",
    ...d.variables.map((v) => `| \`${v.csv_columns.join("`, `")}\` | ${cell(v.label)} | ${v.role ?? v.type} | ${cell(v.unit)} | ${v.range ? v.range.join("–") : ""} | ${v.records_with_value} |`),
    "",
    ...(d.flags.length ? ["| Flag | Meaning | Records |", "|---|---|---|", ...d.flags.map((f) => `| \`${f.id}\` | ${cell(f.label ?? f.note)} | ${f.records} |`), ""] : []),
    ...d.notes.map((n) => `- ${n}`),
    "",
  ].join("\n");
}

export function caseResultCsv(pack: Pack, ranking: StudyResult[]): string {
  const shorts = new Map(pack.studies.map((s) => [s.id, s.short]));
  return csv([
    ["study_id", "study_short", "grade", "distance", "missing", "nearest_record", "reasons"],
    ...ranking.map((x) => [
      x.study,
      shorts.get(x.study),
      x.grade,
      x.distance !== null && Number.isFinite(x.distance) ? x.distance : "",
      x.missing.join("|"),
      x.nearest ?? "",
      x.why.map((w) => w.code).join("|"),
    ]),
  ]);
}

function downloadFile(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function DossierModal({
  scenario,
  goal,
  overall,
  ranking,
  findings,
  onClose,
}: {
  scenario: Scenario;
  goal: string;
  overall: OverallEvidence;
  ranking: StudyResult[];
  findings: Finding[];
  onClose: () => void;
}) {
  const { pack, lens, mapping } = useData();
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportScope>("comparable");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const presetId = matchingHabitatPreset(lens, scenario);
  const presetObj = allHabitatPresets(lens).find((p) => p.id === presetId);

  const scenarioSummary = useMemo(() => {
    const parts = scenario.active
      .filter((id) => scenario.values[id] !== undefined && scenario.values[id] !== "")
      .map((id) => `${varOf(pack, id).label}: ${scenarioValueText(pack, id, scenario.values[id])}`);
    return `${presetObj ? presetObj.label : t("Custom scenario")} (${parts.join(" · ") || t("no active variables")})`;
  }, [pack, presetObj, scenario]);

  const top6 = useMemo(() => ranking.slice(0, 6), [ranking]);
  const comparable = useMemo(() => pool(pack, scenario), [pack, scenario]);
  const scopedRecords = useMemo(
    () => scopeRecords(pack, scope, comparable, ranking),
    [pack, scope, comparable, ranking],
  );

  const handleDatacard = async () => {
    setExporting(true);
    try {
      const { datacard } = await datasetExport(pack, mapping, lens, scopedRecords);
      downloadFile(`prometeo_${pack.meta.id}_${scope}_${dateTag}_datacard.json`, JSON.stringify(datacard, null, 2), "application/json;charset=utf-8");
    } catch (error: unknown) {
      setToast(error instanceof Error ? error.message : t("Dataset export failed."));
    } finally {
      setExporting(false);
    }
  };

  const handleCopyMarkdown = () => {
    const text = generateExecutiveMarkdown(pack, lens, scenario, goal, overall, ranking, findings);
    const notify = (msg: string) => {
      setToast(msg);
      window.setTimeout(() => setToast(null), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => notify(t("Executive Markdown copied to clipboard")));
    } else {
      notify(t("Clipboard unavailable"));
    }
  };

  const handleDownloadMarkdown = () => {
    const text = generateExecutiveMarkdown(pack, lens, scenario, goal, overall, ranking, findings);
    downloadFile(`prometeo-executive-brief-${dateTag}.md`, text, "text/markdown;charset=utf-8");
  };

  const handleDownloadJson = () => {
    const text = generateDossierJson(pack, lens, scenario, overall, ranking, findings);
    downloadFile(`prometeo-evidence-pack-${dateTag}.json`, text, "application/json;charset=utf-8");
  };

  const dateTag = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="dossier-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("Evidence dossier and data export")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dossier-paper">
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">{t("Prometeo · Academic Dossier & Export")}</p>
            <h2>{lens.title}</h2>
            <p className="dossier-sub">
              {lens.byline} · {pack.meta.created_at}
            </p>
          </div>
          <div className="dossier-actions noprint">
            <button type="button" className="chip highlight" onClick={handleCopyMarkdown} title={t("Copy Executive Summary formatted for Flight Directors")}>
              {t("Copy Markdown brief")}
            </button>
            <button type="button" className="chip" onClick={handleDownloadMarkdown} title={t("Download Markdown Dossier")}>
              {t("Download .md")}
            </button>
            <button type="button" className="chip" onClick={handleDownloadJson} title={t("Export full JSON evidence pack")}>
              {t("Export JSON")}
            </button>
            <button type="button" className="chip" onClick={() => window.print()} title={t("Print or save as official NASA PDF")}>
              {t("Print / PDF")}
            </button>
            <button type="button" className="chip" onClick={onClose}>
              {t("Close")}
            </button>
          </div>
        </header>

        {toast && (
          <p className="dossier-toast" role="status">
            {toast}
          </p>
        )}

        <section className="dossier-sec">
          <h3>{t("Scenario & summary")}</h3>
          <p>
            <b>{t("Proposed scenario:")}</b> {scenarioSummary}
          </p>
          {goal.trim() && (
            <p>
              <b>{t("Question:")}</b> “{goal.trim()}”
            </p>
          )}
          <p>
            <b>{t("Overall evidence:")}</b> {overallText(overall.level)}{t(". Grades:")} <b>A {overall.counts.A}</b> ·{" "}
            <b>B {overall.counts.B}</b> · <b>C {overall.counts.C}</b> · <b>D {overall.counts.D}</b> {t("across")}{" "}
            {pack.studies.length} {many(lens.unit_of_study ?? "study")} ({comparable.length.toLocaleString("en-US")}{" "}
            {t("comparable tests).")}
          </p>
        </section>

        <section className="dossier-sec">
          <h3>{t("Nearest")} {many(lens.unit_of_study ?? "study")} {t("(top 6)")}</h3>
          <table className="dossier-table">
            <thead>
              <tr>
                <th>{t("Grade")}</th>
                <th>{t("Study")}</th>
                <th>{t("Basis")}</th>
                <th>{t("Nearest record")}</th>
              </tr>
            </thead>
            <tbody>
              {top6.map((r) => {
                const st = pack.studies.find((s) => s.id === r.study);
                const rec = r.nearest ? pack.records.find((x) => x.id === r.nearest) : null;
                return (
                  <tr key={r.study}>
                    <td>
                      <span className={`grade g${r.grade}`}>{r.grade}</span>
                    </td>
                    <td>
                      <b>{st?.short ?? r.study}</b> <small>({r.study})</small>
                    </td>
                    <td>{r.why.map((w) => whyText(pack, lens, w)).join(" · ")}</td>
                    <td className="mono">
                      {rec ? t("{0} (row {1})", rec.id, rec.source.row ?? "–") : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="dossier-sec">
          <h3>{t("Key findings (")}{findings.length})</h3>
          <ul className="dossier-list">
            {findings.slice(0, 6).map((f, i) => (
              <li key={i}>
                <b>
                  [{FINDING_LEVEL[f.level]}] {findingTitle(pack, f)}:
                </b>{" "}
                {findingText(pack, lens, f)}
              </li>
            ))}
          </ul>
        </section>

        <section className="dossier-sec noprint">
          <h3>{t("Export harmonized datasets")}</h3>
          <div className="dossier-export-bar">
            <label>
              {t("Scope:")}{" "}
              <select disabled={exporting} value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
                <option value="comparable">{t("Comparable tests (")}{comparable.length})</option>
                <option value="graded">{t("Graded A–C studies")}</option>
                <option value="all">{t("Full corpus (")}{pack.records.length})</option>
              </select>
            </label>
            <button
              type="button"
              className="chip"
              onClick={() => {
                try {
                  downloadFile(`prometeo_${pack.meta.id}_${scope}_${dateTag}.csv`, harmonizedCsv(pack, scopedRecords, mapping));
                } catch (error: unknown) {
                  setToast(error instanceof Error ? error.message : t("Dataset export failed."));
                }
              }}
            >
              {t("Download records CSV (")}{scopedRecords.length})
            </button>
            <button type="button" className="chip" disabled={exporting} onClick={handleDatacard}>
              {exporting ? t("Preparing datacard…") : t("Download datacard JSON")}
            </button>
            <p>{t("Dataset export: split by study. Predictive performance is not assessed.")}</p>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_ranking_${dateTag}.csv`, caseResultCsv(pack, ranking))
              }
            >
              {t("Download ranking CSV")}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_${scope}_${dateTag}.json`, harmonizedJson(pack, scopedRecords), "application/json;charset=utf-8")
              }
            >
              {t("Download records JSON")}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_data_dictionary.md`, dataDictionaryMd(pack), "text/markdown;charset=utf-8")
              }
            >
              {t("Download data dictionary (.md)")}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_data_dictionary.json`, JSON.stringify(dataDictionary(pack), null, 2), "application/json;charset=utf-8")
              }
            >
              {t("Download data dictionary (.json)")}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(
                  `prometeo_${pack.meta.id}_dossier_${dateTag}.md`,
                  generateExecutiveMarkdown(pack, lens, scenario, goal, overall, ranking, findings),
                  "text/markdown;charset=utf-8",
                )
              }
            >
              {t("Download dossier (.md)")}
            </button>
          </div>
        </section>

        <footer className="dossier-foot">{lens.disclaimer}</footer>
      </div>
    </div>
  );
}
