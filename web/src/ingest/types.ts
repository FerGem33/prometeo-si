/**
 * Core types for document upload, parsing, variable extraction, and UI blueprint generation.
 * Conforms to D3 limits matching upload_tickets.py.
 */

export const D3_LIMITS = {
  maxBytes: 20_000_000,
  maxPages: 60,
  maxDocuments: 30,
} as const;

export type SupportedMediaType =
  | "text/csv"
  | "text/tab-separated-values"
  | "application/json"
  | "application/pdf";

export type DocKind = "table" | "paper";

export type DocStatus = "pending" | "parsing" | "done" | "error";

export type DocErrorCode =
  | "too_large"
  | "too_many_pages"
  | "limit_exceeded"
  | "unsupported_type"
  | "no_text_layer"
  | "unreadable";

export type CorpusScope = "uploaded" | "combine" | "demo";

export interface ParsedRow {
  row: number;
  values: string[];
}

export interface DetectedColumn {
  name: string;
  label: string;
  unit: string | null;
  type: "numeric" | "categorical";
  nonEmptyCount: number;
  numericCount: number;
  min?: number;
  max?: number;
  median?: number;
  categories?: string[];
  mode?: string;
  sampleCells: { row: number; raw: string }[];
}

export interface ParsedTableResult {
  headers: string[];
  rows: ParsedRow[];
  columns: DetectedColumn[];
  delimiter?: string;
}

export interface ParsedPaperFinding {
  label: string;
  rawName: string;
  type: "numeric" | "categorical";
  unit: string | null;
  min?: number;
  max?: number;
  values: number[];
  categories?: string[];
  page: number;
  quote: string;
}

export interface ParsedPage {
  page: number;
  text: string;
}

export interface ParsedPaperResult {
  title?: string;
  doi?: string;
  year?: number;
  pageCount: number;
  pages: ParsedPage[];
  findings: ParsedPaperFinding[];
}

export interface VariableCitation {
  docId: string;
  docName: string;
  kind: DocKind;
  page?: number;
  row?: number;
  column?: string;
  quote: string;
  doi?: string;
  basis?: "approved_pack";
  recordId?: string;
  variableId?: string;
}

export interface ExtractedVariable {
  id: string;
  label: string;
  type: "numeric" | "categorical";
  unit: string | null;
  min?: number;
  max?: number;
  sigma?: number;
  median?: number;
  categories?: string[];
  mode?: string;
  include: boolean;
  citations: VariableCitation[];
  groupId?: string;
  score?: number;
  reasons?: string[];
  scoreComponents?: Record<"frequency" | "coverage" | "position" | "purpose" | "measurability", number>;
}

export type ModuleType = "scenario_input" | "classification" | "key_papers" | "case_notes" | "free_chat";
export type ModuleSpec = {
  id: string;
  type: ModuleType;
  title: string;
  description: string;
  variables: string[];
};

export interface VariableProposalRemote {
  id?: string;
  label: string;
  type: "numeric" | "categorical";
  unit: string | null;
  docId: string;
  page?: number;
  row?: number;
  quote: string;
  min?: number;
  max?: number;
  categories?: string[];
}

export interface UploadedDoc {
  id: string;
  name: string;
  kind: DocKind;
  mediaType: SupportedMediaType;
  bytes: number;
  sha256: string;
  status: DocStatus;
  uploadedAt: string;
  errorCode?: DocErrorCode;
  errorMessage?: string;
  pageCount?: number;
  rowCount?: number;
  table?: ParsedTableResult;
  paper?: ParsedPaperResult;
}

export type ReportSectionId =
  | "graphical_abstract"
  | "map"
  | "heat"
  | "gaps"
  | "graph"
  | "data_methods";

export type DesignPresetFlag = "gaps" | "compare" | "graph" | "compact";

export interface UiBlueprint {
  /** Optional only for browser saves written before the purpose workflow. New compiles always set these. */
  purpose?: string;
  modules?: ModuleSpec[];
  discardedModules?: string[];
  title: string;
  kicker: string;
  variablesLayout: "grouped" | "list" | "grid";
  density: "editorial" | "compact";
  highlightedVariables: string[];
  variableGroups: { id: string; label: string; variables: string[] }[];
  defaultAxes: string[];
  sectionOrder: ReportSectionId[];
  foldedSections: Record<string, boolean>;
  hiddenSections: ReportSectionId[];
  hideMlCard?: boolean;
  hideStudyCompare?: boolean;
  rationale: string;
}

export interface DocStoreEntry {
  doc: UploadedDoc;
  blob?: Blob | Uint8Array | ArrayBuffer;
}

export type StoredDocRecord = UploadedDoc & {
  doc: UploadedDoc;
  blob?: Blob | Uint8Array | ArrayBuffer;
};

export interface DocStore {
  save(doc: UploadedDoc, blob?: Blob | Uint8Array | ArrayBuffer): Promise<void>;
  list(): Promise<UploadedDoc[]>;
  get(id: string): Promise<StoredDocRecord | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
