/**
 * Contracts of the purpose-driven GenUI dashboard (spec: docs/superpowers/specs/2026-11-15-genui-dashboard-por-proposito-design.md).
 * Pure types and constants: no DOM, no network, no domain vocabulary.
 */
import type { Scenario } from "../engine";
import type { VariableCitation } from "../ingest/types";

export const MAX_CASE_VARIABLES = 10;
export const DEFAULT_CASE_VARIABLES = 5;
export const MAX_MODULES = 10;

/** Sections of the page that hold modules, in their base order. A purpose may reorder them; it never adds one. */
export type SectionId = "highlights" | "answers" | "patterns" | "coverage" | "sources";
export const SECTION_IDS: SectionId[] = ["highlights", "answers", "patterns", "coverage", "sources"];
/** A block of the page: a section of modules, or the case of the user with its analysis. */
export type BlockId = SectionId | "case";
export const BLOCK_IDS: BlockId[] = [...SECTION_IDS, "case"];
/** Width of a module in the grid of its section. */
export type ModuleSpan = "full" | "half";

/** Components of the deterministic relevance score, each in [0, 1]. */
export interface ScoreParts {
  coverage: number;
  frequency: number;
  position: number;
  purpose: number;
  measurability: number;
}

/** Weights of the relevance score; documented in Methods. They sum to 1. */
export const SCORE_WEIGHTS: ScoreParts = {
  coverage: 0.3,
  frequency: 0.2,
  position: 0.15,
  purpose: 0.25,
  measurability: 0.1,
};

export interface VariableScore {
  id: string;
  label: string;
  unit: string | null;
  type: "numeric" | "categorical";
  /** Weighted sum of `parts`, in [0, 1], rounded to 3 decimals. */
  score: number;
  parts: ScoreParts;
  /** Distinct documents that cite the variable. */
  docCount: number;
  mentions: { header: number; finding: number; text: number };
  /** English, e.g. "appears in 7 of 10 documents". Only components above 0. */
  reasons: string[];
  /** Never empty: a variable without a citation is not scored. */
  citations: VariableCitation[];
}

export type ModuleOrigin = "local" | "ai";

interface ModuleBase {
  id: string;
  title: string;
  caption: string;
  origin: ModuleOrigin;
  /** Section the module is shown in. Missing in specs saved before sections existed: the type decides. */
  section?: SectionId;
  /** Missing: the type decides. */
  span?: ModuleSpan;
}

export type ModuleSpec =
  | (ModuleBase & { type: "answer_stat"; variable: string; stat: "max" | "min" | "mean" | "count" })
  | (ModuleBase & { type: "answer_filter"; variable: string; op: "<" | ">" | "<=" | ">=" | "between"; bounds: number[] })
  | (ModuleBase & { type: "distribution"; variable: string })
  | (ModuleBase & { type: "scatter"; x: string; y: string })
  | (ModuleBase & { type: "coverage_matrix"; variables: string[] })
  | (ModuleBase & { type: "key_papers"; limit: number })
  | (ModuleBase & { type: "doc_summaries" })
  | (ModuleBase & { type: "variable_scores"; limit: number })
  | (ModuleBase & { type: "key_figures"; variables: string[] })
  | (ModuleBase & { type: "category_bars"; variable: string })
  | (ModuleBase & { type: "group_ranges"; variable: string; by?: string })
  | (ModuleBase & { type: "box_summary"; variables: string[] })
  | (ModuleBase & { type: "cross_tab"; row: string; column: string })
  | (ModuleBase & { type: "completeness"; variables: string[] })
  | (ModuleBase & { type: "records_table"; sort: string; order: "asc" | "desc"; columns: string[]; limit: number });

export type ModuleType = ModuleSpec["type"];
export type ModuleOf<T extends ModuleType> = Extract<ModuleSpec, { type: T }>;

export const MODULE_TYPES: ModuleType[] = [
  "answer_stat",
  "answer_filter",
  "distribution",
  "scatter",
  "coverage_matrix",
  "key_papers",
  "doc_summaries",
  "variable_scores",
  "key_figures",
  "category_bars",
  "group_ranges",
  "box_summary",
  "cross_tab",
  "completeness",
  "records_table",
];

export interface DashboardSpec {
  purpose: string;
  title: string;
  modules: ModuleSpec[];
  dropped: { module: unknown; reason: string }[];
  /** Questions for the chat, built from real variable labels. */
  suggestedQuestions: string[];
  /** "ai" only when /design v2 supplied at least one valid module. */
  origin: ModuleOrigin;
  /** Display order of the blocks. Missing in specs saved before sections existed: the base order applies. */
  order?: BlockId[];
}

export interface CaseState {
  selected: string[];
  values: Scenario["values"];
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  records: string[];
}

export interface Histogram {
  variable: string;
  unit: string | null;
  n: number;
  min: number;
  max: number;
  bins: HistogramBin[];
}

export interface ScatterPoint {
  record: string;
  x: number;
  y: number;
  label: string;
}

export interface CoverageCell {
  docId: string;
  variable: string;
  found: boolean;
  page?: number;
  row?: number;
  quote?: string;
}

export interface CoverageMatrix {
  docs: { id: string; name: string }[];
  variables: { id: string; label: string }[];
  cells: CoverageCell[];
}

export interface PaperRelevance {
  docId: string;
  name: string;
  title?: string;
  doi?: string;
  year?: number;
  score: number;
  /** Labels of the variables the document shares with the purpose or the case. */
  shared: string[];
  reasons: string[];
}

export interface DocSummary {
  docId: string;
  name: string;
  kind: "table" | "paper";
  title?: string;
  doi?: string;
  year?: number;
  pages?: number;
  rows?: number;
  variables: { id: string; label: string; page?: number; row?: number }[];
  text: string;
  mode: "template";
}

export interface KeyFigure {
  variable: string;
  label: string;
  unit: string | null;
  /** Records that give a value, out of `total`. */
  n: number;
  total: number;
  /** Lowest and highest tested value, null when no record gives one. */
  min: number | null;
  max: number | null;
  minRecord: string | null;
  maxRecord: string | null;
}

export interface KeyFigures {
  records: number;
  groups: number;
  figures: KeyFigure[];
}

export interface CategoryCount {
  category: string;
  count: number;
  records: string[];
}

export interface CategoryCounts {
  variable: string;
  /** Records that give a category, out of `total`. */
  n: number;
  total: number;
  /** Most frequent first; ties in alphabetical order. */
  categories: CategoryCount[];
  /** Categories beyond the limit, and the records they hold. */
  other: { categories: number; count: number };
}

export interface GroupRange {
  key: string;
  label: string;
  n: number;
  min: number;
  median: number;
  max: number;
  minRecord: string;
  maxRecord: string;
}

export interface GroupRanges {
  variable: string;
  unit: string | null;
  /** Categorical variable that defines the groups; null when the groups are the source documents. */
  by: string | null;
  n: number;
  min: number;
  max: number;
  /** Highest median first. */
  groups: GroupRange[];
  /** Groups beyond the limit. */
  omitted: number;
}

export interface BoxRow {
  variable: string;
  label: string;
  unit: string | null;
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  minRecord: string;
  maxRecord: string;
}

export interface BoxSummary {
  rows: BoxRow[];
  /** Variables asked for that no record gives a value for. */
  empty: { variable: string; label: string }[];
}

export type CrossAxis = { variable: string; label: string; unit: string | null } & (
  | { kind: "cat"; categories: string[] }
  | { kind: "num"; edges: number[] }
);

export interface CrossCell {
  row: number;
  column: number;
  count: number;
  records: string[];
}

export interface CrossTab {
  row: CrossAxis;
  column: CrossAxis;
  /** Every row x column pair, row by row. */
  cells: CrossCell[];
  /** Records counted in the cells. */
  n: number;
  /** Highest count of a cell. */
  max: number;
  /** Records of each row that give no value for the column variable, and the reverse. A gap is shown, not hidden. */
  rowMissing: number[];
  columnMissing: number[];
  /** Records with both values that fall in a category beyond the limit. */
  omitted: number;
}

export interface CompletenessRow {
  variable: string;
  label: string;
  /** Records that give a value, out of `total`. */
  n: number;
  total: number;
  /** n / total, rounded to 3 decimals; 0 when there are no records. */
  share: number;
  /** Source documents with at least one record that gives a value, out of `groupsTotal`. */
  groups: number;
  groupsTotal: number;
}

export interface RecordsTable {
  sort: string;
  order: "asc" | "desc";
  columns: { id: string; label: string; unit: string | null }[];
  rows: { record: string; group: string; label: string; values: ([number, number] | string | null)[] }[];
  /** Records that give a value for the sort variable. */
  n: number;
}

export interface ChatCitation {
  docId: string;
  docName: string;
  page?: number;
  row?: number;
  quote: string;
}

export type ChatMode = "local_stat" | "local_search" | "ai" | "case_change" | "guard" | "error";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode?: ChatMode;
  citations?: ChatCitation[];
  /** Pack record ids the answer used (open with Src). */
  records?: string[];
  /** A proposed scenario; the UI asks before applying it. */
  proposal?: Scenario;
}

export interface Snippet {
  docId: string;
  docName: string;
  page?: number;
  row?: number;
  text: string;
  score: number;
}
