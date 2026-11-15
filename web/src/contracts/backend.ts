// Block C backend contract (PROPOSAL, not deployed): accounts, projects, upload, processing, review, publish.
// Source of truth for the shapes in docs/CONTRATOS_FASE2.md section 5. Types only: no runtime code.
// A published project yields the same prometeo.pack/1 files the report already reads, so the engine does not change.
import type { Lens, Pack, Scenario } from "../engine";

/** Every non-2xx response. `code` is stable and meant for the interface; `message` is for people. */
export type ApiError = { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };
export type ErrorCode =
  | "unauthenticated" // 401: missing or expired token
  | "forbidden" // 403: the project belongs to someone else
  | "not_found" // 404
  | "invalid_request" // 400: body does not match the contract
  | "limit_exceeded" // 413 / 422: file size, pages, documents per project
  | "conflict" // 409: wrong state for the action (e.g. publish before approval)
  | "rate_limited" // 429
  | "model_unavailable" // 502: the language model did not answer
  | "internal"; // 500

export type ProjectStatus = "draft" | "processing" | "awaiting_review" | "ready_to_publish" | "published" | "failed";

export type Project = {
  id: string;
  name: string;
  /** what the person wants to decide; drives the lens, not the extraction */
  intent: string;
  status: ProjectStatus;
  counts: { documents: number; records: number; variables: number; conflicts_open: number };
  /** version of the published pack; null until the first publish */
  pack_version: number | null;
  lens_version: number | null;
  created_at: string;
  updated_at: string;
};

export type DocumentKind = "table" | "paper";
export type Stage = "upload" | "parse" | "profile" | "propose" | "extract" | "verify";
export type JobStatus = "queued" | "running" | "done" | "failed" | "skipped";

export type ProjectDocument = {
  id: string;
  name: string;
  kind: DocumentKind;
  media_type: "text/csv" | "application/pdf";
  bytes: number;
  sha256: string | null; // set when the upload is confirmed
  pages?: number; // papers
  rows?: number; // tables
  stage: Stage;
  status: JobStatus;
  error_code?: "unreadable" | "no_text_layer" | "too_large" | "too_many_pages" | "duplicate" | "model_unavailable" | "internal";
  uploaded_at: string;
};

export type UploadTicket = {
  doc_id: string;
  /** presigned PUT; send the file bytes with exactly these headers */
  upload: { url: string; method: "PUT"; headers: Record<string, string>; expires_in: number };
};

export type Job = { doc_id: string; name: string; stage: Stage; status: JobStatus; error_code?: ProjectDocument["error_code"]; updated_at: string };
export type JobsResponse = { project_status: ProjectStatus; jobs: Job[]; totals: Record<JobStatus, number> };

/** Where a value comes from. Tables: row. Papers: page and a literal quote that must occur in the document text. */
export type Citation =
  | { kind: "table"; doc_id: string; row: number; column: string; text: string }
  | { kind: "paper"; doc_id: string; page: number; quote: string; verified: boolean };

export type ReviewStatus = "proposed" | "approved" | "flagged" | "rejected";

export type VariableProposal = {
  id: string; // stable slug proposed by the model, editable until approval
  label: string;
  type: "num" | "cat";
  unit?: string; // num
  role?: "partition";
  sigma?: number; // num: scale used in distances; proposed from the spread of the data, editable
  range?: [number, number];
  status: ReviewStatus;
  /** ids of proposals merged into this one by the reviewer */
  merged_from: string[];
  /** why the model proposed it: evidence for the reviewer */
  evidence: Citation[];
  records: number;
};

export type ColumnProposal = {
  doc_id: string;
  column: string;
  variable: string | null; // null = not used
  unit: string | null;
  convert: { factor: number; offset: number } | null; // linear only
  status: ReviewStatus;
  note?: string;
  sample: string[]; // up to 5 raw cell values
};

export type SchemaProposal = {
  version: number; // increases with every edit; send it back to detect concurrent edits
  status: "proposed" | "approved";
  variables: VariableProposal[];
  columns: ColumnProposal[];
  constants: { doc_id: string; variable: string; value: [number, number] | string; note: string }[];
  approved_by?: string;
  approved_at?: string;
};

/** Reviewer decisions, applied in order. The server validates each one and returns the new SchemaProposal. */
export type SchemaEdit =
  | { op: "set_status"; target: "variable" | "column"; id: string; doc_id?: string; status: ReviewStatus; note?: string }
  | { op: "rename"; variable: string; label: string }
  | { op: "merge"; into: string; from: string[] }
  | { op: "set_unit"; variable: string; unit: string }
  | { op: "set_convert"; doc_id: string; column: string; convert: { factor: number; offset: number } | null; unit: string | null }
  | { op: "map_column"; doc_id: string; column: string; variable: string | null }
  | { op: "set_role"; variable: string; role: "partition" | null }
  | { op: "set_sigma"; variable: string; sigma: number };

export type RecordDraft = {
  id: string;
  study: string;
  label: string;
  kind: "test" | "campaign";
  /** same shape as pack records: numeric ranges and categorical strings */
  values: Record<string, [number, number] | string>;
  citations: Record<string, Citation>; // one per variable id
  confidence: "table" | "paper";
  flags: string[];
  /** set when a reviewer changed a value: the original value and its citation are kept */
  corrections?: Record<string, { from: [number, number] | string | null; by: string; at: string; reason: string }>;
};

export type Conflict = {
  id: string;
  kind: "value_mismatch" | "unit_mismatch" | "duplicate_record";
  variable: string;
  record_ids: string[];
  candidates: { value: [number, number] | string; citation: Citation }[];
  status: "open" | "resolved";
  resolution?: { choice: number | "keep_all" | "exclude"; by: string; at: string; note?: string };
};

/** Relations and gaps stated by authors (CU-18). Stored in pack.claims; never used in distances or grades. */
export type Claim = {
  id: string;
  kind: "relation" | "gap";
  variables: string[];
  /** relation: direction of the effect the authors state; gap: absent */
  direction?: "increases" | "decreases" | "non_monotonic" | "no_effect";
  statement: string; // the authors' sentence, verbatim
  citation: Extract<Citation, { kind: "paper" }>;
  study: string;
};

export type PublishResponse = { pack_version: number; lens_version: number; files: { pack: string; lens: string; mapping: string }; expires_in: number };
export type PublishedFiles = { pack: Pack; lens: Lens };

export type Proposal = { id: string; name: string; scenario: Scenario; created_at: string; updated_at: string };

export type SynthesisRequest = { study_ids: string[]; focus?: string };
export type SynthesisResponse = { mode: "ai" | "template"; sentences: { text: string; citations: Citation[] }[]; dropped: number };

export type Page<T> = { items: T[]; next_cursor: string | null };
