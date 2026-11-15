import { useEffect, useMemo, useRef, useState } from "react";
import type { Lens, Pack, Scenario } from "../engine";
import { compileUiBlueprint, buildLensFromBlueprint } from "../ingest/blueprint";
import { buildPackFromDocs, extractVariablesFromDocs } from "../ingest/buildPack";
import { parseTabularDocument } from "../ingest/csv";
import { extractPdfPages, parsePaperPages, PdfDocError } from "../ingest/pdf";
import { requestRemoteProposals } from "../ingest/remote";
import { MAX_CASE_VARIABLES } from "../genui/types";
import type { CaseState, DashboardSpec, VariableScore } from "../genui/types";
import { defaultSelection, scoreVariables } from "../genui/score";
import { compileDashboard, suggestPurposes } from "../genui/compile";
import { VariableScoresModule } from "./genui/VariableScoresModule";
import { filesFromDrop } from "../ingest/folderDrop";
import {
  createDocStore,
  detectMediaType,
  mergeUploadedDocs,
  sha256Hex,
  validateFileMeta,
} from "../ingest/storage";
import { D3_LIMITS } from "../ingest/types";
import type {
  CorpusScope,
  DesignPresetFlag,
  DocErrorCode,
  ExtractedVariable,
  UiBlueprint,
  UploadedDoc,
  VariableProposalRemote,
} from "../ingest/types";
import { newId } from "../report/storage";
import type { Extra } from "../state";
import { Prefs } from "./Prefs";
import { useData, type Mapping } from "./ctx";
import { t } from "../i18n";

export const SCENARIO_STEPS = ["Documents", "Purpose"] as const;

const FILE_STAGES = ["Reading", "Hashing", "Parsing"] as const;
type FileProgress = { name: string; stage: (typeof FILE_STAGES)[number] | "Done" };

/** Moves one item of a list to another index; out-of-range moves return the list unchanged. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export interface EvaluationDraft {
  docs: UploadedDoc[];
  scope: CorpusScope;
  instruction: string;
  presetFlags: DesignPresetFlag[];
  variables: ExtractedVariable[];
  blueprint: UiBlueprint;
  pack: Pack;
  lens: Lens;
  mapping: Mapping;
  scenario: Scenario;
  extras: Extra[];
  isCustomCorpus: boolean;
  /** Purpose-driven GenUI (spec 2026-11-15-genui-dashboard-por-proposito). */
  purpose?: string;
  scores?: VariableScore[];
  dashboard?: DashboardSpec;
  caseState?: CaseState;
}

export interface ScenarioStepProps {
  scenario: Scenario;
  onChange: (s: Scenario) => void;
  extras: Extra[];
  onExtras: (e: Extra[]) => void;
  goal: string;
  onGoal: (g: string) => void;
  onBack: () => void;
  onRun?: (count?: number) => void;
  onSubmitDraft?: (draft: EvaluationDraft) => void;
  initialDraft?: EvaluationDraft | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocErrorMessage(code?: DocErrorCode): string {
  switch (code) {
    case "no_text_layer":
      return t("PDF has no extractable text layer (scanned/raster)");
    case "too_many_pages":
      return t("Exceeds 60 pages limit");
    case "too_large":
      return t("Exceeds 20 MB limit");
    case "limit_exceeded":
      return t("Maximum 30 documents limit reached");
    case "unsupported_type":
      return t("Unsupported file format (use PDF, CSV, TSV, JSON)");
    case "unreadable":
    default:
      return t("File is unreadable or empty");
  }
}

/**
 * 3-step New Evaluation wizard:
 * 1. Documents (real file ingest, scope toggle, SHA-256 integrity, optional Bedrock AI enrichment)
 * 2. Interface design (GenUI blueprint compilation, suggestion chips, focus presets, live preview)
 * 3. Variables (extracted empirical variables, inclusion toggles, source citations, scenario values, manual variables)
 */
export function ScenarioStep({
  scenario,
  extras,
  goal,
  onGoal,
  onBack,
  onRun,
  onSubmitDraft,
  initialDraft,
}: ScenarioStepProps) {
  const { pack, lens, mapping } = useData();
  const [step, setStep] = useState(0);

  // Ingestion & documents state
  const [docs, setDocs] = useState<UploadedDoc[]>(() => initialDraft?.docs ?? []);
  const [scope, setScope] = useState<CorpusScope>(() => initialDraft?.scope ?? (initialDraft?.docs?.length ? "uploaded" : "demo"));
  const [dragOver, setDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [duplicateNotices, setDuplicateNotices] = useState<string[]>([]);
  const [overflowNotices, setOverflowNotices] = useState<string[]>([]);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docStore = useMemo(() => createDocStore(), []);

  // Hydrate stored documents on mount only if initialDraft was not provided or empty
  useEffect(() => {
    if (initialDraft?.docs && initialDraft.docs.length > 0) return;
    let active = true;
    docStore.list().then((list) => {
      if (active && list.length > 0) {
        setDocs(list);
        setScope("uploaded");
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [docStore, initialDraft]);

  // AI proposals enrichment state
  const [remoteProposals, setRemoteProposals] = useState<VariableProposalRemote[] | undefined>(undefined);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "success" | "error">("idle");
  const [aiProposalsCount, setAiProposalsCount] = useState(0);

  // Purpose step state
  const [purpose, setPurpose] = useState(() => initialDraft?.purpose ?? initialDraft?.instruction ?? goal ?? "");

  // Categories helper from reference pack
  const cats = useMemo(() => {
    const out: Record<string, { value: string; n: number }[]> = {};
    for (const v of pack.schema.variables) {
      if (v.type !== "cat") continue;
      const c = new Map<string, number>();
      for (const r of pack.records) {
        const x = r.values[v.id];
        if (typeof x === "string" && r.kind === "test") c.set(x, (c.get(x) ?? 0) + 1);
      }
      out[v.id] = [...c]
        .map(([value, n]) => ({ value, n }))
        .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
    }
    return out;
  }, [pack]);

  // Demo fallback variables
  const demoVariables = useMemo<ExtractedVariable[]>(() => {
    return pack.schema.variables
      .filter((v) => !(v.type === "cat" && v.role === "partition"))
      .map((v) => {
        const isNum = v.type === "num";
        return {
          id: v.id,
          label: v.long ?? v.label,
          type: isNum ? "numeric" : "categorical",
          unit: isNum ? (v.unit ?? null) : null,
          min: isNum ? v.range[0] : undefined,
          max: isNum ? v.range[1] : undefined,
          median: isNum ? (v.range[0] + v.range[1]) / 2 : undefined,
          categories: !isNum ? (cats[v.id]?.map((c) => c.value) ?? []) : undefined,
          mode: !isNum ? cats[v.id]?.[0]?.value : undefined,
          include: scenario.active.includes(v.id),
          citations: [
            {
              docId: "nasa-psi-pack",
              docName: "NASA PSI Reference Pack",
              kind: "table" as const,
              column: v.id,
              quote: `${v.label} from NASA PSI database (${pack.records.length} records)`,
            },
          ],
        };
      });
  }, [pack, cats, scenario.active]);

  // Variables extracted from uploaded documents
  const uploadedVariables = useMemo(() => {
    if (docs.length === 0) return [];
    return extractVariablesFromDocs(docs, remoteProposals);
  }, [docs, remoteProposals]);

  // Combine or select active corpus variables
  const baseVariables = useMemo(() => {
    if (scope === "demo" || docs.length === 0) {
      return demoVariables;
    }
    if (scope === "combine") {
      const seen = new Set(uploadedVariables.map((v) => v.id));
      const extraDemo = demoVariables.filter((v) => !seen.has(v.id));
      return [...uploadedVariables, ...extraDemo];
    }
    return uploadedVariables;
  }, [scope, docs.length, demoVariables, uploadedVariables]);

  const variables = baseVariables;

  // Blueprint of the demo path only; the uploaded corpus compiles its own on submit.
  const blueprint = useMemo<UiBlueprint>(() => compileUiBlueprint("", docs, variables, []), [docs, variables]);

  // File ingestion handler
  const addFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    const incomingFiles = Array.from(list);
    setIsParsing(true);
    const newDocs: UploadedDoc[] = [];
    const rows: FileProgress[] = incomingFiles.map((f) => ({ name: f.name, stage: "Reading" }));
    setProgress(rows);
    const mark = (i: number, stage: FileProgress["stage"]) => {
      rows[i] = { ...rows[i], stage };
      setProgress([...rows]);
    };

    for (const [index, file] of incomingFiles.entries()) {
      if (index > 0) mark(index - 1, "Done");
      const errorCode = validateFileMeta(file, docs.length + newDocs.length);
      const mediaType = detectMediaType(file.name, file.type);

      if (errorCode || !mediaType) {
        const errDoc: UploadedDoc = {
          id: newId("doc"),
          name: file.name,
          kind: file.name.toLowerCase().endsWith(".pdf") ? "paper" : "table",
          mediaType: mediaType ?? "text/csv",
          bytes: file.size,
          sha256: "",
          status: "error",
          uploadedAt: new Date().toISOString(),
          errorCode: errorCode ?? "unsupported_type",
          errorMessage: errorCode ?? "unsupported_type",
        };
        newDocs.push(errDoc);
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        mark(index, "Hashing");
        const sha256 = await sha256Hex(bytes);
        mark(index, "Parsing");

        if (mediaType === "application/pdf") {
          try {
            const { pages, pageCount, metadataTitle } = await extractPdfPages(bytes);
            const paper = parsePaperPages(pages, metadataTitle || file.name);
            const doc: UploadedDoc = {
              id: newId("doc"),
              name: file.name,
              kind: "paper",
              mediaType,
              bytes: file.size,
              sha256,
              status: "done",
              uploadedAt: new Date().toISOString(),
              pageCount,
              paper,
            };
            await docStore.save(doc, bytes);
            newDocs.push(doc);
          } catch (pdfErr) {
            const code: DocErrorCode =
              pdfErr instanceof PdfDocError ? pdfErr.code : "unreadable";
            const errDoc: UploadedDoc = {
              id: newId("doc"),
              name: file.name,
              kind: "paper",
              mediaType,
              bytes: file.size,
              sha256,
              status: "error",
              uploadedAt: new Date().toISOString(),
              errorCode: code,
              errorMessage: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
            };
            newDocs.push(errDoc);
          }
        } else {
          // Tabular format (CSV, TSV, JSON)
          try {
            const table = parseTabularDocument(file.name, bytes, mediaType);
            const doc: UploadedDoc = {
              id: newId("doc"),
              name: file.name,
              kind: "table",
              mediaType,
              bytes: file.size,
              sha256,
              status: "done",
              uploadedAt: new Date().toISOString(),
              rowCount: table.rows.length,
              table,
            };
            await docStore.save(doc, bytes);
            newDocs.push(doc);
          } catch (tabErr) {
            const errDoc: UploadedDoc = {
              id: newId("doc"),
              name: file.name,
              kind: "table",
              mediaType,
              bytes: file.size,
              sha256,
              status: "error",
              uploadedAt: new Date().toISOString(),
              errorCode: "unreadable",
              errorMessage: tabErr instanceof Error ? tabErr.message : String(tabErr),
            };
            newDocs.push(errDoc);
          }
        }
      } catch {
        const errDoc: UploadedDoc = {
          id: newId("doc"),
          name: file.name,
          kind: "table",
          mediaType,
          bytes: file.size,
          sha256: "",
          status: "error",
          uploadedAt: new Date().toISOString(),
          errorCode: "unreadable",
        };
        newDocs.push(errDoc);
      }
    }

    const { docs: merged, duplicates, overflow } = mergeUploadedDocs(docs, newDocs);
    setDocs(merged);
    setProgress([]);
    if (duplicates.length > 0) {
      setDuplicateNotices((prev) => [...prev, ...duplicates]);
    }
    if (overflow.length > 0) {
      setOverflowNotices((prev) => [...prev, ...overflow]);
    }
    if (merged.length > 0 && scope === "demo") {
      setScope("uploaded");
    }
    setIsParsing(false);
  };

  const removeDoc = async (id: string) => {
    await docStore.remove(id);
    const remaining = docs.filter((d) => d.id !== id);
    setDocs(remaining);
    if (remaining.length === 0) {
      setScope("demo");
    }
  };

  const clearAllDocs = async () => {
    await docStore.clear().catch(() => {});
    setDocs([]);
    setScope("demo");
    setDuplicateNotices([]);
    setOverflowNotices([]);
    setRemoteProposals(undefined);
    setAiStatus("idle");
  };


  // AI analysis button handler (/propose)
  const handleAiPropose = async () => {
    if (isAiAnalyzing) return;
    setIsAiAnalyzing(true);
    setAiStatus("idle");

    const controller = new AbortController();
    try {
      const proposals = await requestRemoteProposals(docs, controller.signal);
      if (proposals && proposals.length > 0) {
        setRemoteProposals(proposals);
        setAiProposalsCount(proposals.length);
        setAiStatus("success");
      } else if (proposals && proposals.length === 0) {
        setAiProposalsCount(0);
        setAiStatus("success");
      } else {
        setAiStatus("error");
      }
    } catch {
      setAiStatus("error");
    } finally {
      setIsAiAnalyzing(false);
    }
  };


  const readyDocs = docs.filter((d) => d.status === "done");
  const hasOnlyFailedDocs = scope !== "demo" && docs.length > 0 && readyDocs.length === 0;
  const isDemoScope = scope === "demo" || docs.length === 0;
  const last = step === SCENARIO_STEPS.length - 1;

  // Variables that can be scored: every extracted variable with a source citation (outcome columns are excluded by the extractor).
  const scoringVars = useMemo(
    () => (isDemoScope ? [] : variables.filter((v) => v.include !== false && v.citations.length > 0)),
    [isDemoScope, variables],
  );
  const scores1 = useMemo(() => scoreVariables(readyDocs, scoringVars, ""), [readyDocs, scoringVars]);
  const purposeScores = useMemo(
    () => (purpose.trim().length > 0 ? scoreVariables(readyDocs, scoringVars, purpose) : scores1),
    [readyDocs, scoringVars, purpose, scores1],
  );
  const purposeSuggestions = useMemo(() => suggestPurposes(scores1), [scores1]);

  const handlePurposeChange = (text: string) => {
    setPurpose(text);
    onGoal(text);
  };

  // Draft submission
  const handleSubmit = () => {
    const isCustom = scope !== "demo" && readyDocs.length > 0;

    if (!isCustom) {
      // Demo corpus: the existing path to the reference report.
      const activeVars = variables.filter((v) => v.include);
      const activeVarIds = new Set(activeVars.map((v) => v.id));
      const finalValues = { ...scenario.values };
      for (const v of activeVars) {
        if (finalValues[v.id] === undefined) {
          if (v.type === "numeric") {
            const min = v.min ?? 0;
            const max = v.max ?? min + 100;
            finalValues[v.id] = v.median ?? (min + max) / 2;
          } else {
            finalValues[v.id] = v.mode ?? v.categories?.[0] ?? "";
          }
        }
      }
      const built = buildPackFromDocs([], activeVars, { scope: "demo", demoPack: pack, demoMapping: mapping, title: blueprint.title });
      const demoBlueprint = compileUiBlueprint(purpose, [], activeVars, []);
      const draft: EvaluationDraft = {
        docs,
        scope,
        instruction: purpose,
        presetFlags: [],
        variables,
        blueprint: demoBlueprint,
        pack: built.pack,
        lens: buildLensFromBlueprint(demoBlueprint, built.pack, activeVars, lens),
        mapping: built.mapping,
        scenario: { values: finalValues, active: scenario.active.filter((id) => activeVarIds.has(id)) },
        extras,
        isCustomCorpus: false,
      };
      if (onSubmitDraft) onSubmitDraft(draft);
      else if (onRun) onRun(docs.length);
      return;
    }

    const built = buildPackFromDocs(docs, variables, { scope, demoPack: pack, demoMapping: mapping, title: purpose.trim().slice(0, 80) });
    const packIds = new Set(built.pack.schema.variables.map((v) => v.id));
    const scores = scoreVariables(readyDocs, scoringVars, purpose).filter((s) => packIds.has(s.id));
    const dashboard = compileDashboard(purpose, built.pack, scores);
    const customBlueprint = compileUiBlueprint(purpose, docs, variables, []);
    const compiledLens = buildLensFromBlueprint(customBlueprint, built.pack, variables, lens);

    const draft: EvaluationDraft = {
      docs,
      scope,
      instruction: purpose,
      presetFlags: [],
      variables,
      blueprint: customBlueprint,
      pack: built.pack,
      lens: compiledLens,
      mapping: built.mapping,
      scenario: { values: {}, active: [] },
      extras,
      isCustomCorpus: true,
      purpose,
      scores,
      dashboard,
      caseState: { selected: defaultSelection(scores), values: {} },
    };
    if (onSubmitDraft) onSubmitDraft(draft);
    else if (onRun) onRun(docs.length);
  };


  return (
    <div className="screen step">
      <header className="screen-bar">
        <span>
          <b>{t("Prometeo")}</b> {t("· New evaluation")}
        </span>
        <span className="bar-links">
          <Prefs />
          <button type="button" className="linkbtn" onClick={onBack}>
            {t("Cancel")}
          </button>
        </span>
      </header>

      <main className="step-main">
        <ol className="stepper" aria-label={t("Progress")}>
          {SCENARIO_STEPS.map((label, i) => (
            <li
              key={label}
              className={i === step ? "now" : i < step ? "done" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <button
                type="button"
                disabled={hasOnlyFailedDocs && i > 0}
                onClick={() => {
                  if (!hasOnlyFailedDocs || i === 0) setStep(i);
                }}
              >
                <i>{i + 1}</i>
                {t(label)}
              </button>
            </li>
          ))}
        </ol>

        {/* STEP 1: DOCUMENTS */}
        {SCENARIO_STEPS[step] === "Documents" && (
          <section className="step-panel">
            <h1>{t("Your documents")}</h1>
            <p className="step-lede">
              {t("Everything starts from a corpus of papers and tables: the variables you can compare are the ones those documents record. Upload your own research papers or data tables, or evaluate against the reference pack.")}
            </p>

            {/* Scope selector */}
            <div className="scope-selector">
              <b className="fieldlbl">{t("Corpus scope")}</b>
              <div className="scope-options">
                <label className="scope-option">
                  <input
                    type="radio"
                    name="scope"
                    value="uploaded"
                    checked={scope === "uploaded"}
                    disabled={docs.filter((d) => d.status === "done").length === 0}
                    onChange={() => setScope("uploaded")}
                  />
                  <span>{t("Uploaded documents only ({0})", docs.filter((d) => d.status === "done").length)}</span>
                </label>
                <label className="scope-option">
                  <input
                    type="radio"
                    name="scope"
                    value="combine"
                    checked={scope === "combine"}
                    disabled={docs.filter((d) => d.status === "done").length === 0}
                    onChange={() => setScope("combine")}
                  />
                  <span>{t("Combine uploaded documents with NASA PSI reference pack")}</span>
                </label>
                <label className="scope-option">
                  <input
                    type="radio"
                    name="scope"
                    value="demo"
                    checked={scope === "demo"}
                    onChange={() => setScope("demo")}
                  />
                  <span>{t("NASA PSI reference pack only (Demo)")}</span>
                </label>
              </div>
            </div>

            {/* Reference info if 0 uploaded docs */}
            {docs.length === 0 && (
              <div className="corpus">
                <div>
                  <b>{t("Example corpus")}</b>
                  <span>
                    {lens.byline}: {pack.studies.length} studies, {pack.records.length} records.
                  </span>
                </div>
                <em>{t("Included")}</em>
              </div>
            )}

            {/* Upload Dropzone */}
            <div
              className={`drop drop-interactive ${dragOver ? "dragover" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                // Entries must be taken synchronously inside the drop event; filesFromDrop does so before awaiting.
                filesFromDrop(e.dataTransfer).then(addFiles, () => addFiles(e.dataTransfer.files));
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.tsv,.json"
                style={{ display: "none" }}
                onChange={(e) => addFiles(e.target.files)}
              />
              <b>{t("Drop PDF, CSV, TSV or JSON files or whole folders here (or click to browse)")}</b>
              <span>{t("Limit: up to 30 files per batch (max. 20 MB per file, 60 pages per PDF)")}</span>
              <em>
                {isParsing
                  ? t("Processing uploaded files...")
                  : docs.length > 0
                    ? t("{0} document(s) uploaded", docs.length)
                    : t("Browse or drop files")}
              </em>
            </div>

            {/* Warning banner when all uploaded documents failed */}
            {hasOnlyFailedDocs && (
              <div className="doc-notice doc-notice-warning" role="alert">
                <b>{t("All uploaded documents failed to process.")}</b>{" "}
                <span>
                  {t(
                    "Please upload at least one valid document (PDF, CSV, TSV, JSON) or switch corpus scope to Demo to proceed."
                  )}
                </span>
              </div>
            )}

            {/* Per-file progress while a batch is being read */}
            {isParsing && progress.length > 0 && (
              <ul className="doc-progress" aria-label={t("Processing uploaded files...")} aria-live="polite">
                {progress.map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    <span className="doc-name">{p.name}</span>
                    <progress max={FILE_STAGES.length} value={p.stage === "Done" ? FILE_STAGES.length : FILE_STAGES.indexOf(p.stage)} />
                    <small>{t(p.stage)}</small>
                  </li>
                ))}
              </ul>
            )}

            {overflowNotices.length > 0 && (
              <div className="doc-notice doc-notice-warning" role="alert">
                <b>{t("Over the {0}-file limit, not added: {1}", D3_LIMITS.maxDocuments, overflowNotices.join(", "))}</b>
              </div>
            )}

            {/* Deduplication notices */}
            {duplicateNotices.length > 0 && (
              <div className="doc-notice doc-notice-info">
                <b>{t("Duplicate file(s) omitted (matching SHA-256): {0}", duplicateNotices.join(", "))}</b>
              </div>
            )}

            {/* Uploaded documents card list */}
            {docs.length > 0 && (
              <div className="doc-list-bar">
                <span>{t("{0} of {1} files", docs.length, D3_LIMITS.maxDocuments)}</span>
                <button type="button" className="linkbtn" onClick={clearAllDocs} disabled={isParsing}>
                  {t("Clear all documents")}
                </button>
              </div>
            )}
            {docs.length > 0 && (
              <ul className="doc-list" aria-label={t("Your documents")}>
                {docs.map((doc) => (
                  <li key={doc.id} className="doc-card">
                    <div className="doc-card-head">
                      <div className="doc-title-group">
                        <span className="doc-kind-badge">
                          {doc.kind === "paper" ? "PDF" : doc.mediaType === "application/json" ? "JSON" : "CSV"}
                        </span>
                        <b className="doc-name">{doc.name}</b>
                        <span className="doc-size">({formatSize(doc.bytes)})</span>
                      </div>
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={() => removeDoc(doc.id)}
                      >
                        {t("Remove")}
                      </button>
                    </div>

                    <div className="doc-chips">
                      {doc.status === "done" && (
                        <>
                          {doc.kind === "table" && (
                            <span className="doc-chip doc-chip-success">
                              {doc.rowCount} {t("rows")}
                            </span>
                          )}
                          {doc.kind === "paper" && (
                            <>
                              <span className="doc-chip doc-chip-success">
                                {doc.pageCount} {t("pages")}
                              </span>
                              <span className="doc-chip doc-chip-success">
                                {doc.paper?.findings.length ?? 0} {t("findings")}
                              </span>
                            </>
                          )}
                          <span className="doc-chip doc-chip-hash">
                            SHA-256: {doc.sha256 ? doc.sha256.slice(0, 8) : "--------"}
                          </span>
                        </>
                      )}
                      {doc.status === "error" && (
                        <span className="doc-chip doc-chip-error">
                          {getDocErrorMessage(doc.errorCode)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {docs.some((d) => d.status === "done") && scope !== "demo" && scores1.length > 0 && (
              <VariableScoresModule
                scores={scores1}
                selected={[]}
                onToggle={() => {}}
                limitHit={false}
                limit={MAX_CASE_VARIABLES}
                figure={1}
              />
            )}

            {/* Optional Bedrock /propose AI enrichment button */}
            {docs.some((d) => d.status === "done") && (
              <div className="ai-propose-bar">
                <button
                  type="button"
                  className="ghostbtn"
                  onClick={handleAiPropose}
                  disabled={isAiAnalyzing}
                >
                  {isAiAnalyzing ? t("Analyzing documents with AI...") : t("Analyze with AI (/propose)")}
                </button>
                {aiStatus === "success" && (
                  <span className="ai-status ai-status-success">
                    {t("AI analysis completed ({0} proposals found)", aiProposalsCount)}
                  </span>
                )}
                {aiStatus === "error" && (
                  <span className="ai-status ai-status-error">
                    {t("AI analysis unavailable (continuing with local extraction)")}
                  </span>
                )}
              </div>
            )}
          </section>
        )}

        {/* STEP 2: PURPOSE */}
        {SCENARIO_STEPS[step] === "Purpose" && (
          <section className="step-panel">
            <h1>{t("What do you want to find out?")}</h1>
            <p className="step-lede">
              {t("Prometeo builds a dashboard that answers your question from the documents you uploaded. The variables most relevant to your purpose are ranked from the evidence in those documents; nothing is predicted.")}
            </p>

            <div className="corpus-summary-badge">
              {t("{0} documents, {1} variables extracted", readyDocs.length, scoringVars.length)}
            </div>

            <label htmlFor="purpose" className="fieldlbl">
              {t("What do you want to find out from these documents?")}
            </label>
            <textarea
              id="purpose"
              className="goal"
              rows={4}
              maxLength={4000}
              required
              value={purpose}
              onChange={(e) => handlePurposeChange(e.target.value)}
              placeholder={t("e.g. Which conditions were studied, and where is the evidence thin?")}
            />

            {purposeSuggestions.length > 0 && (
              <div className="addvars">
                <span>{t("Suggested purposes")}</span>
                {purposeSuggestions.slice(0, 4).map((sug) => (
                  <button key={sug} type="button" className="chip" onClick={() => handlePurposeChange(sug)}>
                    {sug}
                  </button>
                ))}
              </div>
            )}

            <div className="genui-preview">
              <div className="genui-preview-head">
                <h3>{t("Most relevant variables for this purpose")}</h3>
              </div>
              {purposeScores.length === 0 ? (
                <p className="empty">{t("No variable with a source citation was found in the uploaded documents.")}</p>
              ) : (
                <ol className="purpose-preview">
                  {purposeScores.slice(0, MAX_CASE_VARIABLES).map((s) => (
                    <li key={s.id}>
                      <span>{s.label}</span> <b>{s.score.toFixed(2)}</b>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}

        {/* Step navigation actions */}
        <div className="step-actions">
          <button
            type="button"
            className="ghostbtn"
            onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
          >
            {step === 0 ? t("Back to start") : t("Back")}
          </button>

          {step === 0 && isDemoScope ? (
            <button type="button" className="cta" onClick={handleSubmit}>
              {t("Compare against the evidence")}
            </button>
          ) : !last ? (
            <button
              type="button"
              className="cta"
              disabled={hasOnlyFailedDocs}
              onClick={() => setStep(step + 1)}
            >
              {t("Continue")}
            </button>
          ) : (
            <button
              type="button"
              className="cta"
              disabled={purpose.trim().length < 8 || hasOnlyFailedDocs}
              onClick={handleSubmit}
            >
              {t("Generate dashboard")}
            </button>
          )}
        </div>
      </main>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
