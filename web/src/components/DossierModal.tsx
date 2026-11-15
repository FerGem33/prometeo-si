import { useEffect, useMemo, useState } from "react";
import { pool } from "../engine";
import type { DataRecord, Finding, OverallEvidence, Pack, Range, Scenario, StudyResult } from "../engine";
import { useData } from "./ctx";
import { FINDING_LEVEL, findingText, findingTitle, OVERALL, whyText } from "../report/text";
import { matchingHabitatPreset, allHabitatPresets } from "./HabitatFigure";
import { num, scenarioValueText, varOf } from "../report/format";

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

export function harmonizedCsv(pack: Pack, records: DataRecord[] = pack.records): string {
  const nums = pack.schema.variables.filter((v) => v.type === "num");
  const cats = pack.schema.variables.filter((v) => v.type === "cat");
  const part = cats.find((v) => v.role === "partition");
  const others = cats.filter((v) => v !== part);
  const head = [
    "record_id",
    "study_id",
    "study_short",
    "kind",
    ...(part ? [part.id] : []),
    ...nums.flatMap((v) => [`${v.id}_min`, `${v.id}_max`]),
    ...others.map((v) => v.id),
    "confidence",
    "source_file",
    "source_row",
    "source_page",
    "quote",
    "flags",
  ];
  const shorts = new Map(pack.studies.map((s) => [s.id, s.short]));
  const files = new Map(pack.sources.map((s) => [s.id, s.name]));
  const rows = records.map((r): unknown[] => [
    r.id,
    r.study,
    shorts.get(r.study),
    r.kind,
    ...(part ? [r.values[part.id]] : []),
    ...nums.flatMap((v) => {
      const x = r.values[v.id] as Range | undefined;
      return (Array.isArray(x) ? [x[0], x[1]] : ["", ""]) as unknown[];
    }),
    ...others.map((v) => r.values[v.id]),
    r.confidence,
    files.get(r.source.id),
    r.source.row,
    r.source.page,
    r.quote,
    r.flags.join("|"),
  ]);
  return csv([head, ...rows]);
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
  const { pack, lens } = useData();
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
    return `${presetObj ? presetObj.label : "Custom scenario"} (${parts.join(" · ") || "no active variables"})`;
  }, [pack, presetObj, scenario]);

  const top6 = useMemo(() => ranking.slice(0, 6), [ranking]);
  const comparable = useMemo(() => pool(pack, scenario), [pack, scenario]);
  const scopedRecords = useMemo(
    () => scopeRecords(pack, scope, comparable, ranking),
    [pack, scope, comparable, ranking],
  );

  const buildPlainText = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    let txt = `PROMETEO · EVIDENCE DOSSIER · ${dateStr}\n`;
    txt += `${lens.title} (${lens.byline})\n`;
    txt += `Scenario: ${scenarioSummary}\n`;
    if (goal.trim()) txt += `Question: ${goal.trim()}\n`;
    txt += `Overall evidence: ${OVERALL[overall.level]}\n`;
    txt += `Grades: A ${overall.counts.A} · B ${overall.counts.B} · C ${overall.counts.C} · D ${overall.counts.D} (across ${pack.studies.length} ${lens.unit_of_study ?? "study"}s)\n\n`;

    txt += `NEAREST STUDIES\n`;
    for (const r of top6) {
      const st = pack.studies.find((s) => s.id === r.study);
      const distStr = r.distance === null ? "no distance" : `d = ${num(r.distance)}`;
      const whyStr = r.why.map((w) => whyText(pack, lens, w)).join("; ");
      const rec = r.nearest ? pack.records.find((x) => x.id === r.nearest) : null;
      const srcStr = rec ? ` [Source: ${r.study}, test ${rec.id}, row ${rec.source.row ?? "–"}]` : "";
      txt += `- Grade ${r.grade} · ${st?.short ?? r.study} (${r.study}) · ${distStr} · ${whyStr}${srcStr}\n`;
    }

    txt += `\nFINDINGS\n`;
    for (const f of findings) {
      txt += `- [${FINDING_LEVEL[f.level]}] ${findingTitle(pack, f)}: ${findingText(pack, lens, f)}\n`;
    }

    txt += `\nDISCLAIMER\n${lens.disclaimer}\n`;
    return txt;
  };

  const handleCopy = () => {
    const text = buildPlainText();
    const notify = (msg: string) => {
      setToast(msg);
      window.setTimeout(() => setToast(null), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => notify("Dossier copied to clipboard"));
    } else {
      notify("Clipboard unavailable");
    }
  };

  const dateTag = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="dossier-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence dossier and data export"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dossier-paper">
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Prometeo · Academic Dossier &amp; Export</p>
            <h2>{lens.title}</h2>
            <p className="dossier-sub">
              {lens.byline} · {pack.meta.created_at}
            </p>
          </div>
          <div className="dossier-actions noprint">
            <button type="button" className="chip" onClick={handleCopy}>
              Copy text
            </button>
            <button type="button" className="chip" onClick={() => window.print()}>
              Print / PDF
            </button>
            <button type="button" className="chip" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {toast && (
          <p className="dossier-toast" role="status">
            {toast}
          </p>
        )}

        <section className="dossier-sec">
          <h3>Scenario &amp; summary</h3>
          <p>
            <b>Proposed scenario:</b> {scenarioSummary}
          </p>
          {goal.trim() && (
            <p>
              <b>Question:</b> “{goal.trim()}”
            </p>
          )}
          <p>
            <b>Overall evidence:</b> {OVERALL[overall.level]}. Grades: <b>A {overall.counts.A}</b> ·{" "}
            <b>B {overall.counts.B}</b> · <b>C {overall.counts.C}</b> · <b>D {overall.counts.D}</b> across{" "}
            {pack.studies.length} {lens.unit_of_study ?? "study"}s ({comparable.length.toLocaleString("en-US")}{" "}
            comparable tests).
          </p>
        </section>

        <section className="dossier-sec">
          <h3>Nearest {lens.unit_of_study ?? "study"}s (top 6)</h3>
          <table className="dossier-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Study</th>
                <th>Basis</th>
                <th>Nearest record</th>
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
                      {rec ? `${rec.id} (row ${rec.source.row ?? "–"})` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="dossier-sec">
          <h3>Key findings ({findings.length})</h3>
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
          <h3>Export harmonized datasets</h3>
          <div className="dossier-export-bar">
            <label>
              Scope:{" "}
              <select value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
                <option value="comparable">Comparable tests ({comparable.length})</option>
                <option value="graded">Graded A–C studies</option>
                <option value="all">Full corpus ({pack.records.length})</option>
              </select>
            </label>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_${scope}_${dateTag}.csv`, harmonizedCsv(pack, scopedRecords))
              }
            >
              Download records CSV ({scopedRecords.length})
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(`prometeo_${pack.meta.id}_ranking_${dateTag}.csv`, caseResultCsv(pack, ranking))
              }
            >
              Download ranking CSV
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadFile(
                  `prometeo_${pack.meta.id}_dossier_${dateTag}.md`,
                  buildPlainText(),
                  "text/markdown;charset=utf-8",
                )
              }
            >
              Download dossier (.md)
            </button>
          </div>
        </section>

        <footer className="dossier-foot">{lens.disclaimer}</footer>
      </div>
    </div>
  );
}
