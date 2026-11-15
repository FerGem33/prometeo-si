// Contract types (prometeo.pack/1). The engine knows nothing about any particular corpus:
// every label, unit, threshold and preset comes from the pack and the lens.

export type Range = [number, number];

export type RiskNote = { direction: "up" | "down"; note: string; source: string };

export type NumVariable = {
  id: string;
  label: string;
  long?: string;
  unit: string;
  /** unit used when stating a difference, if it differs from `unit` */
  delta_unit?: string;
  type: "num";
  sigma: number;
  range: Range;
  step?: number;
  risk?: RiskNote;
  display_units?: { unit: string; factor: number }[];
};

export type CatVariable = {
  id: string;
  label: string;
  long?: string;
  type: "cat";
  penalty?: number;
  role?: "partition";
};

export type Variable = NumVariable | CatVariable;

export type Thresholds = { grade_a: number; tolerance: number; closeness_reach: number };

export type FlagInfo = { variables?: string[]; label?: string; note?: string };

export type Schema = {
  variables: Variable[];
  thresholds: Thresholds;
  flags?: Record<string, FlagInfo>;
};

export type Source = {
  id: string;
  kind: string;
  name: string;
  study: string;
  sha256?: string;
  path?: string;
  used?: boolean;
  note?: string;
};

export type Study = {
  id: string;
  short: string;
  title: string;
  summary: {
    objective: string | null;
    subjects: string[];
    conditions: string | null;
    variables: string[];
    instruments: string | null;
  };
  attributes: Record<string, string | string[] | null>;
  related: string[];
  links: { kind: string; url: string; label?: string }[];
  counts: { records: number; tests?: number; publications: number; documents?: number };
  publications?: { title: string; doi: string; authors?: string }[];
};

export type Origin = {
  column: string | null;
  text: string;
  unit: string | null;
  factor: number | null;
  constant?: boolean;
};

export type DataRecord = {
  id: string;
  study: string;
  label: string;
  values: Record<string, Range | string>;
  kind: "test" | "campaign";
  source: { id: string; row?: number; page?: number };
  confidence: "table" | "paper";
  quote: string | null;
  flags: string[];
  flag_notes?: string[];
  orig?: Record<string, Origin>;
  date?: string;
  outcomes?: Record<string, string>;
};

export type Pack = {
  contract: string;
  meta: {
    id: string;
    title: string;
    created_at: string;
    source_note: string;
    license?: string;
    repository_url?: string;
    stats: Record<string, number>;
  };
  schema: Schema;
  sources: Source[];
  studies: Study[];
  records: DataRecord[];
  claims: unknown[];
};

export type Preset = {
  id: string;
  label: string;
  blurb: string;
  values: Record<string, number | string>;
  active: string[];
  source: string;
};

export type Lens = {
  ml_thresholds?: import("./dataset").DatasetThresholds;
  title: string;
  kicker?: string;
  subject?: string;
  unit_of_study?: string;
  byline?: string;
  disclaimer?: string;
  footer?: string;
  presets: Preset[];
  default_preset?: string;
  default_axes: string[];
  optional_variables?: string[];
  questions?: string[];
  evidence: { min_studies: number };
  finding_priority?: string[];
  known_gaps?: { variable: string; note: string; source: string }[];
  groups?: { id: string; label: string; studies: string[] }[];
  partition_labels?: Record<string, string>;
  outcome_columns_note?: string;
  /** named parts of a proposal: each groups variables; the weakest variable sets the level of the part */
  parts?: { id: string; label: string; variables: string[] }[];
  /** study attributes whose shared values become edges of the knowledge graph */
  graph?: { attributes?: string[] };
};

export type Scenario = {
  values: Record<string, number | string>;
  active: string[];
  sigma?: Record<string, number>;
};

export type AxisReason = "not_recorded" | "not_comparable" | "no_records" | "no_evidence";

export type AxisScore = {
  variable: string;
  score: number;
  missing: boolean;
  reason?: AxisReason;
  /** distance from the scenario value to the nearest record interval, in the unit of the variable */
  gap?: number;
  /** id of the record that realises `gap` */
  nearest?: string;
  /** envelope of the study on this variable */
  tested?: Range;
};

export type Grade = "A" | "B" | "C" | "D";

export type Why =
  | { code: "out_of_range"; variable: string; value: number; tested: Range }
  | { code: "category_untested"; variable: string; value: string }
  | { code: "not_recorded"; variables: string[] }
  | { code: "within_tested" }
  | { code: "not_comparable"; partition: string; has: string[] }
  | { code: "no_records" }
  | { code: "no_common_variable" };

export type StudyResult = {
  study: string;
  grade: Grade;
  distance: number | null;
  missing: string[];
  nearest: string | null;
  why: Why[];
  comparable: number;
};

export type Coverage = { full: number; partial: number; studiesFull: string[]; pool: number };

export type Partition = { variable: string; value: string; via: string } | null;

export type FindingLevel = "attention" | "caution" | "context" | "support";

export type Finding = {
  id: string;
  level: FindingLevel;
  code: string;
  variable?: string;
  params: Record<string, number | string>;
  /** record ids or study ids that back the finding */
  sources: string[];
  metric: { value: string; unit?: string };
  note?: { text: string; source: string };
};

export type EvidenceLevel = "studied" | "scarce" | "near" | "not_studied";

export type VariableEvidence = {
  variable: string;
  level: EvidenceLevel;
  reason:
    | "covered"
    | "few_studies"
    | "flagged_only"
    | "no_record_at_value"
    | "outside_near"
    | "outside_far"
    | "never_recorded"
    | "category_absent";
  value: number | string;
  /** pool envelope (numeric variables) */
  tested?: Range;
  /** distance from the value to the envelope, in the unit of the variable */
  gap?: number;
  /** pool tests that carry the variable */
  recorded: number;
  /** pool tests that cover the value */
  covering: number;
  studies: string[];
  /** record that backs the statement (edge of the envelope, or first covering record) */
  source?: string;
  pool: number;
};

export type GapCell = { n: number; studies: string[]; other: number };

export type GapGrid = {
  x: string;
  y: string;
  partition: string | null;
  xEdges: number[];
  yEdges: number[];
  /** cells[yi][xi] */
  cells: GapCell[][];
  total: number;
  both: number;
  no_x: number;
  no_y: number;
  scenarioCell: { xi: number; yi: number } | null;
  nearestCell: { xi: number; yi: number; n: number } | null;
};

export type OverallEvidence = {
  level: "strong" | "partial" | "scarce" | "none";
  counts: Record<Grade, number>;
};
