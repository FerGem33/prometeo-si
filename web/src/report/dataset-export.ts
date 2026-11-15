import { assessDataset } from "../engine";
import type { DataRecord, DatasetCandidate, Lens, Pack, Range, Source } from "../engine";
import type { RecordDraft } from "../contracts/backend";
import type { Mapping } from "../components/ctx";
import approvedThresholds from "../contracts/ml-thresholds.json";

type ExportRecord = DataRecord & Partial<Pick<RecordDraft, "citations" | "corrections">> & { excluded?: boolean };
type ExportSource = Source & { license?: string | null; doi?: string };
type ExportMapping = Mapping & { version?: number; schema_sha256?: string };

export function exportableRecords(pack: Pack, selected: DataRecord[] = pack.records): ExportRecord[] {
  const ids = new Set(selected.map(r => r.id));
  return (pack.records as ExportRecord[]).filter(r => ids.has(r.id) && !r.excluded &&
    !Object.values(r.citations ?? {}).some(c => c.kind === "paper" && !c.verified));
}

function doiFor(pack: Pack, record: Pick<DataRecord, "source" | "study">): string {
  const source = (pack.sources as ExportSource[]).find(s => s.id === record.source.id);
  const study = pack.studies.find(s => s.id === record.study);
  const doi = source?.doi ?? study?.links.find(l => l.kind.toLowerCase() === "doi")?.url;
  if (!source || source.study !== record.study || !study || !doi) throw new Error("Dataset export requires a source, study and DOI for every row.");
  return doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}

const cell = (value: unknown): string => {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const range = (value: Range | string | null | undefined) => Array.isArray(value) ? value : ["", ""];

/** Canonical values, correction originals and raw source text have distinct columns. */
export function datasetCsv(pack: Pack, selected: DataRecord[] = pack.records, mapping?: Mapping): string {
  const variables = pack.schema.variables;
  const outcomes = mapping?.tables.flatMap(t => t.columns.filter(c => c.role === "outcome" && c.status === "approved")
    .map(c => ({ source: t.source, column: c.column, unit: c.unit }))) ?? [];
  const head = ["record_id", "study_id", "group_id", "doi", "kind", ...variables.flatMap(v =>
    v.type === "num" ? [`${v.id}_min [${v.unit}]`, `${v.id}_max [${v.unit}]`,
      `${v.id}_original_min [${v.unit}]`, `${v.id}_original_max [${v.unit}]`, `${v.id}_source_text`, `${v.id}_source_unit`] :
      [v.id, `${v.id}_original`, `${v.id}_source_text`]),
    ...outcomes.map(o => `outcome:${o.source}:${o.column}${o.unit ? ` [${o.unit}]` : ""}`),
    "source_file", "source_row", "source_page", "confidence", "quote", "citations", "corrections", "flags"];
  const rows = exportableRecords(pack, selected).map(r => [r.id, r.study, r.study, doiFor(pack, r), r.kind,
    ...variables.flatMap((v): unknown[] => {
      const correction = r.corrections?.[v.id];
      const original = correction ? correction.from : r.values[v.id];
      return v.type === "num" ? [...range(r.values[v.id]), ...range(original), r.orig?.[v.id]?.text, r.orig?.[v.id]?.unit] :
        [r.values[v.id], original, r.orig?.[v.id]?.text];
    }),
    ...outcomes.map(o => o.source === r.source.id ? r.outcomes?.[o.column] : ""),
    pack.sources.find(s => s.id === r.source.id)!.name, r.source.row, r.source.page, r.confidence,
    r.quote, r.citations, r.corrections, r.flags.join("|")]);
  return "\uFEFF"+[head, ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  return value;
}
async function sha256(value: unknown): Promise<string> {
  return sha256Text(JSON.stringify(canonical(value)));
}
async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function datasetExport(pack: Pack, mapping: ExportMapping, lens: Lens,
  selected: DataRecord[] = pack.records, candidates: DatasetCandidate[] = []) {
  const records = exportableRecords(pack, selected);
  for (const candidate of candidates) {
    const targetUnits = new Set<string | null>();
    for (const [source, column] of Object.entries(candidate.outcome.columns)) {
      const target = mapping.tables.find(t => t.source === source)?.columns.find(c =>
        c.column === column && c.status === "approved" && c.role === "outcome");
      if (!target) {
        throw new Error("Dataset assessment requires explicitly approved outcome columns.");
      }
      targetUnits.add(target.unit?.trim() || null);
    }
    if (candidate.outcome.type === "num" && (targetUnits.size !== 1 || targetUnits.has(null))) {
      throw new Error("Review numeric outcome units before pooling sources; no automatic outcome conversion is applied.");
    }
  }
  const thresholds = lens.ml_thresholds ?? approvedThresholds;
  const subset: Pack = { ...pack, records };
  const csv = datasetCsv(pack, records, mapping);
  const [packHash, mappingHash, lensHash, csvHash] = await Promise.all([sha256(pack), sha256(mapping), sha256(lens), sha256Text(csv)]);
  const usedSources = new Set(records.map(r => r.source.id));
  const datacard = {
    contract: "prometeo.dataset/1", records: records.length,
    versions: { pack: (pack.meta as Pack["meta"] & { pack_version?: number }).pack_version ?? null,
      mapping: mapping.version ?? null, lens: (lens as Lens & { lens_version?: number }).lens_version ?? null },
    identity: { pack_sha256: packHash, mapping_sha256: mappingHash, lens_sha256: lensHash, csv_sha256: csvHash },
    hash_format: "SHA-256 of canonical sorted JSON; CSV hashed as UTF-8 bytes including BOM and CRLF",
    pack_license: pack.meta.license ?? null,
    sources: (pack.sources as ExportSource[]).map(s => ({ id: s.id, study: s.study, included: usedSources.has(s.id),
      sha256: s.sha256 ?? null, doi: doiFor(pack, { source: { id: s.id }, study: s.study }), license: s.license ?? null })),
    conversions: mapping.tables.flatMap(t => t.columns.filter(c => c.convert && c.status !== "rejected")
      .map(c => ({ source: t.source, column: c.column, variable: c.variable, source_unit: c.unit, convert: c.convert }))),
    rejected_columns: mapping.tables.flatMap(t => t.columns.filter(c => c.status === "rejected")
      .map(c => ({ source: t.source, column: c.column, note: c.note ?? null }))),
    outcome_columns: "Only approved outcome columns; kept separate by source and in original units. Selecting aliases does not relabel the CSV.",
    criteria: thresholds, criteria_origin: lens.ml_thresholds ? "lens.ml_thresholds" : "approved D4 defaults; legacy lens has no ml_thresholds",
    fitness: candidates.map(candidate => assessDataset(subset, candidate, thresholds)),
    assessment: candidates.length ? "explicitly selected targets and inputs" : "not_assessed: select a reviewed target and inputs",
    group_id: "study_id", split_recommendation: "Split by group_id; files and rows are not independent studies.",
    exclusions: "Excluded records and paper citations with verified=false are omitted. Missing values remain empty.",
    correction_columns: "Canonical current value and corrections.from use the same unit; raw source text/unit are separate.",
    limitations: ["Dataset criteria do not establish predictive performance.",
      "Unknown source licenses remain null; pack license does not establish rights to original sources.",
      "Legacy packs without numeric versions are identified by content hashes; no version is invented."] };
  return { csv, datacard };
}
