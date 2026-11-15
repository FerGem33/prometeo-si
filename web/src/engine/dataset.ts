import type { DataRecord, Pack } from "./types";

export type DatasetCriteria = {
  records: number; input_presence: number; unconverted: number; studies: number;
  duplicates: number; class_count: number; minority: number;
};
export type DatasetThresholds = {
  source: string; ready: DatasetCriteria; cleaning: DatasetCriteria;
  volume: { classical_first: number; deep_minimum: number };
};
/** Column aliases across files must be chosen explicitly by the reviewer. */
export type DatasetCandidate = {
  id: string; outcome: { type: "num" | "cat"; columns: Record<string, string> }; inputs: string[];
};

export function assessDataset(pack: Pack, candidate: DatasetCandidate, thresholds: DatasetThresholds) {
  if (!["num", "cat"].includes(candidate.outcome.type)) throw new Error("Reviewed outcome type required.");
  for (const criteria of [thresholds.ready, thresholds.cleaning]) {
    const keys = ["records", "input_presence", "unconverted", "studies", "duplicates", "class_count", "minority"] as const;
    if (!criteria || keys.some(key => !Number.isFinite(criteria[key]) || criteria[key] < 0) ||
      [criteria.input_presence, criteria.unconverted, criteria.duplicates, criteria.minority].some(x => x > 1)) {
      throw new Error("Invalid dataset criteria in lens.");
    }
  }
  if (!thresholds.volume || !Number.isFinite(thresholds.volume.classical_first) ||
    !Number.isFinite(thresholds.volume.deep_minimum) || thresholds.volume.classical_first <= 0 ||
    thresholds.volume.deep_minimum <= thresholds.volume.classical_first) throw new Error("Invalid dataset volume criteria.");
  if (candidate.inputs.some(id => !pack.schema.variables.some(v => v.id === id))) {
    throw new Error("Dataset inputs must be published schema variables.");
  }
  const records = pack.records.filter(r => r.kind === "test" &&
    Boolean(r.outcomes?.[candidate.outcome.columns[r.source.id]]?.trim()));
  const outcome = (r: DataRecord) => r.outcomes![candidate.outcome.columns[r.source.id]].trim();
  const hasInput = (r: DataRecord, key: string) => {
    const value = r.values[key];
    return typeof value === "string" ? Boolean(value.trim()) : Array.isArray(value) && value.every(Number.isFinite);
  };
  const inputPresence = Object.fromEntries(candidate.inputs.map(key =>
    [key, records.length ? records.filter(r => hasInput(r, key)).length / records.length : 0]));
  const complete = records.filter(r => candidate.inputs.every(key => hasInput(r, key))).length;
  const classes = new Map<string, number>();
  for (const r of records) classes.set(outcome(r), (classes.get(outcome(r)) ?? 0) + 1);
  const signatures = new Map<string, Set<string>>();
  const signature = (r: DataRecord) => JSON.stringify([r.study, candidate.inputs.map(key => r.values[key]), outcome(r)]);
  for (const r of records) {
    const sources = signatures.get(signature(r)) ?? new Set<string>();
    sources.add(r.source.id);
    signatures.set(signature(r), sources);
  }
  const duplicates = records.filter(r => signatures.get(signature(r))!.size > 1).length;
  const unconverted = records.filter(r => r.flags.includes("unit_unconverted")).length;
  const studies = new Set(records.map(r => r.study)).size;
  const minorityCount = classes.size ? Math.min(...classes.values()) : 0;
  const failures = (criteria: DatasetCriteria) => [
    ...(records.length < criteria.records ? ["records"] : []),
    ...(!candidate.inputs.length || Object.values(inputPresence).some(p => p < criteria.input_presence) ? ["input_presence"] : []),
    ...(records.length && unconverted / records.length > criteria.unconverted ? ["unconverted"] : []),
    ...(studies < criteria.studies ? ["studies"] : []),
    ...(records.length && duplicates / records.length > criteria.duplicates ? ["duplicates"] : []),
    ...(candidate.outcome.type === "cat" && (classes.size < 2 || minorityCount < criteria.class_count ||
      minorityCount / records.length < criteria.minority) ? ["classes"] : []),
  ];
  const readyFailures = failures(thresholds.ready), cleaningFailures = failures(thresholds.cleaning);
  const verdict = !records.length ? "external_reference_only" : !readyFailures.length ? "ready_to_train" :
    !cleaningFailures.length ? "usable_with_cleaning" : "insufficient";
  return { candidate, verdict, records: records.length, complete, input_presence: inputPresence, studies,
    unconverted, duplicate_candidates: duplicates, classes: Object.fromEntries(classes),
    failed_criteria: { ready: readyFailures, cleaning: cleaningFailures }, thresholds,
    volume: complete < thresholds.volume.classical_first ? "classical" :
      complete < thresholds.volume.deep_minimum ? "classical_first" : "deep_requires_justification",
    split_by: "study", note: "Criteria in this lens; not evidence of predictive performance. Duplicate candidates require review." };
}
