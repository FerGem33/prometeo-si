/**
 * Contracts of the purpose-driven GenUI dashboard (spec: docs/superpowers/specs/2026-11-15-genui-dashboard-por-proposito-design.md).
 * Pure types and constants: no DOM, no network, no domain vocabulary.
 */
import type { Scenario } from "../engine";
import type { VariableCitation } from "../ingest/types";

export const MAX_CASE_VARIABLES = 10;
export const DEFAULT_CASE_VARIABLES = 5;
export const MAX_MODULES = 8;

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
}

export type ModuleSpec =
  | (ModuleBase & { type: "answer_stat"; variable: string; stat: "max" | "min" | "mean" | "count" })
  | (ModuleBase & { type: "answer_filter"; variable: string; op: "<" | ">" | "<=" | ">=" | "between"; bounds: number[] })
  | (ModuleBase & { type: "distribution"; variable: string })
  | (ModuleBase & { type: "scatter"; x: string; y: string })
  | (ModuleBase & { type: "coverage_matrix"; variables: string[] })
  | (ModuleBase & { type: "key_papers"; limit: number })
  | (ModuleBase & { type: "doc_summaries" })
  | (ModuleBase & { type: "variable_scores"; limit: number });

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
