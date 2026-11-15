import { useEffect, useMemo, useRef, useState } from "react";
import type { Lens, Pack, Scenario } from "../engine";
import { evidenceLevels } from "../engine";
import {
  compileUiBlueprint,
  buildLensFromBlueprint,
  suggestDesignPrompts,
} from "../ingest/blueprint";
import { buildPackFromDocs, extractVariablesFromDocs } from "../ingest/buildPack";
import { parseTabularDocument } from "../ingest/csv";
import { extractPdfPages, parsePaperPages, PdfDocError } from "../ingest/pdf";
import { requestRemoteDesign, requestRemoteProposals } from "../ingest/remote";
import { filesFromDrop } from "../ingest/folderDrop";
import { compatibleUnits, groupVariables } from "../ingest/variableView";
import { applyConversion, getConversion } from "../ingest/buildPack";
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
  ReportSectionId,
  UiBlueprint,
  UploadedDoc,
  VariableProposalRemote,
} from "../ingest/types";
import { newId } from "../report/storage";
import type { Extra } from "../state";
import { AddExtra, EXTRA_BASIS, ExtraTag } from "./ExtraVars";
import { NumField } from "./NumField";
import { Prefs } from "./Prefs";
import { LevelTag } from "./ScenarioPanel";
import { useData, type Mapping } from "./ctx";
import { t } from "../i18n";

export const SCENARIO_STEPS = ["Documents", "Interface design", "Variables"] as const;

const SECTION_LABELS: Record<ReportSectionId, string> = {
  graphical_abstract: "Graphical abstract",
  map: "Map of tests (Figure 1)",
  heat: "Closeness by variable (Figure 2)",
  gaps: "Coverage and gaps (Figure 3)",
  graph: "Evidence graph",
  data_methods: "Data, sources and methods",
};

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
  onChange,
  extras,
  onExtras,
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

  // GenUI design step state
  const [instruction, setInstruction] = useState(() => initialDraft?.instruction ?? goal ?? "");
  const [presetFlags, setPresetFlags] = useState<DesignPresetFlag[]>(() => initialDraft?.presetFlags ?? []);
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  // Manual section order from the reorder list; overrides the compiled order when set.
  const [sectionOverride, setSectionOverride] = useState<ReportSectionId[] | null>(() => initialDraft?.blueprint?.sectionOrder ?? null);
  const [dragSection, setDragSection] = useState<number | null>(null);
  const [remoteDesign, setRemoteDesign] = useState<Partial<UiBlueprint> | undefined>(undefined);
  const [designStatus, setDesignStatus] = useState<"idle" | "busy" | "success" | "error">("idle");

  // Variables step: search and display units (display only; stored values keep the source unit)
  const [varQuery, setVarQuery] = useState("");
  const [displayUnits, setDisplayUnits] = useState<Record<string, string>>({});

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

  // User override state for extracted variables (include toggle, custom label/values)
  const [customVarState, setCustomVarState] = useState<Record<string, Partial<ExtractedVariable>>>(() => {
    if (!initialDraft?.variables?.length) return {};
    const map: Record<string, Partial<ExtractedVariable>> = {};
    for (const v of initialDraft.variables) {
      map[v.id] = {
        label: v.label,
        include: v.include,
      };
    }
    return map;
  });

  const variables = useMemo(() => {
    return baseVariables.map((bv) => {
      const override = customVarState[bv.id];
      return override ? { ...bv, ...override } : bv;
    });
  }, [baseVariables, customVarState]);

  // Live compiled UI blueprint
  const compiledBlueprint = useMemo(() => {
    return compileUiBlueprint(instruction, docs, variables, presetFlags, remoteDesign);
  }, [instruction, docs, variables, presetFlags, remoteDesign]);
  const blueprint = useMemo<UiBlueprint>(() => {
    if (!sectionOverride) return compiledBlueprint;
    const known = new Set(compiledBlueprint.sectionOrder);
    const kept = sectionOverride.filter((s) => known.has(s));
    return { ...compiledBlueprint, sectionOrder: [...kept, ...compiledBlueprint.sectionOrder.filter((s) => !kept.includes(s))] };
  }, [compiledBlueprint, sectionOverride]);

  // Suggestion prompts derived from corpus
  const suggestions = useMemo(() => {
    return suggestDesignPrompts(docs, variables);
  }, [docs, variables]);

  // Evidence levels for the variables
  const levels = useMemo(() => {
    try {
      return evidenceLevels(pack, lens, scenario);
    } catch {
      return [];
    }
  }, [pack, lens, scenario]);

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

  // Optional remote layout (/design); the response is validated by compileUiBlueprint's allowlists.
  const handleAiDesign = async () => {
    if (designStatus === "busy") return;
    setDesignStatus("busy");
    const result = await requestRemoteDesign(instruction, docs, variables, new AbortController().signal);
    if (result) {
      setRemoteDesign(result);
      setSectionOverride(null);
      setDesignStatus("success");
    } else {
      setDesignStatus("error");
    }
  };

  const insertIntoInstruction = (text: string) => {
    const el = instructionRef.current;
    const start = el?.selectionStart ?? instruction.length;
    const end = el?.selectionEnd ?? instruction.length;
    const before = instruction.slice(0, start);
    const pad = before && !/\s$/.test(before) ? " " : "";
    const next = before + pad + text + instruction.slice(end);
    handleInstructionChange(next.slice(0, 4000));
    const caret = before.length + pad.length + text.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const moveSection = (from: number, to: number) => {
    setSectionOverride(moveItem(blueprint.sectionOrder, from, to));
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

  // Instruction & preset toggles
  const handleInstructionChange = (text: string) => {
    setInstruction(text);
    onGoal(text);
  };

  const togglePresetFlag = (flag: DesignPresetFlag) => {
    setPresetFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  // Variable toggle & value edits
  const toggleVariableInclude = (id: string) => {
    const currentVar = variables.find((v) => v.id === id);
    if (!currentVar) return;
    const nextInclude = !currentVar.include;

    setCustomVarState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), include: nextInclude },
    }));

    const nextActive = nextInclude
      ? Array.from(new Set([...scenario.active, id]))
      : scenario.active.filter((a) => a !== id);

    const nextValues = { ...scenario.values };
    if (nextInclude && nextValues[id] === undefined) {
      if (currentVar.type === "numeric") {
        const min = currentVar.min ?? 0;
        const max = currentVar.max ?? min + 100;
        nextValues[id] = currentVar.median ?? (min + max) / 2;
      } else {
        nextValues[id] = currentVar.mode ?? currentVar.categories?.[0] ?? "";
      }
    }

    onChange({
      ...scenario,
      active: nextActive,
      values: nextValues,
    });
  };

  const setVariableValue = (id: string, val: number | string) => {
    onChange({
      ...scenario,
      values: { ...scenario.values, [id]: val },
    });
  };

  const setVariableLabel = (id: string, newLabel: string) => {
    setCustomVarState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), label: newLabel },
    }));
  };

  const readyDocs = docs.filter((d) => d.status === "done");
  const hasOnlyFailedDocs = scope !== "demo" && docs.length > 0 && readyDocs.length === 0;

  // Draft submission
  const handleSubmit = () => {
    const activeVars = variables.filter((v) => v.include);
    const activeVarIds = new Set(activeVars.map((v) => v.id));
    const isCustom = scope !== "demo" && readyDocs.length > 0;

    const finalActive = isCustom
      ? activeVars.map((v) => v.id)
      : scenario.active.filter((id) => activeVarIds.has(id));

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

    const built = buildPackFromDocs(
      scope === "demo" ? [] : docs,
      activeVars,
      {
        scope,
        demoPack: pack,
        demoMapping: mapping,
        title: blueprint.title,
      }
    );

    const finalPack: Pack = {
      ...built.pack,
      schema: {
        ...built.pack.schema,
        variables: built.pack.schema.variables
          .filter((pv) => activeVarIds.has(pv.id))
          .map((pv) => {
            const match = activeVars.find((v) => v.id === pv.id);
            return match ? { ...pv, label: match.label, long: match.label } : pv;
          }),
      },
    };

    const compiledLens = buildLensFromBlueprint(blueprint, finalPack, activeVars, lens);

    const draft: EvaluationDraft = {
      docs,
      scope,
      instruction,
      presetFlags,
      variables,
      blueprint,
      pack: finalPack,
      lens: compiledLens,
      mapping: built.mapping,
      scenario: {
        values: finalValues,
        active: finalActive,
      },
      extras,
      isCustomCorpus: isCustom,
    };

    if (onSubmitDraft) {
      onSubmitDraft(draft);
    } else if (onRun) {
      onRun(docs.length);
    }
  };

  const includedCount = variables.filter((v) => v.include).length + extras.length;
  const last = step === SCENARIO_STEPS.length - 1;

  // Render variable row helper
  const renderVarRow = (v: ExtractedVariable) => {
    const x = scenario.values[v.id];
    const lv = levels.find((l) => l.variable === v.id);
    const citation = v.citations?.[0];
    const isIncluded = v.include;

    const min = v.min !== undefined ? v.min : 0;
    const max = v.max !== undefined && v.max > min ? v.max : min + 100;
    const numVal = typeof x === "number" ? x : (v.median ?? (min + max) / 2);

    return (
      <li key={v.id} className={`vrow ${!isIncluded ? "vrow-excluded" : ""}`}>
        <div className="vrow-head">
          <label className="vtoggle-label" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isIncluded}
              onChange={() => toggleVariableInclude(v.id)}
              aria-label={t("Include {0}", v.label)}
            />
          </label>
          <input
            type="text"
            className="vlabel-input"
            value={v.label}
            aria-label={t("Edit label for {0}", v.id)}
            onChange={(e) => setVariableLabel(v.id, e.target.value)}
          />
          {v.unit && <small>{v.unit}</small>}
          {lv && <LevelTag level={lv.level} />}
          {citation && (
            <span className="citation-badge" title={citation.quote}>
              {citation.docName}
              {citation.page ? ` · ${t("Page {0}", citation.page)}` : citation.row ? ` · ${t("Row {0}", citation.row)}` : ""}
            </span>
          )}
          <button
            type="button"
            className="rm"
            onClick={() => toggleVariableInclude(v.id)}
          >
            {isIncluded ? t("Exclude") : t("Include")}
          </button>
        </div>

        {citation?.quote && (
          <span className="citation-quote">“{citation.quote}”</span>
        )}

        {isIncluded && (
          v.type === "numeric" ? (
            <div className="cond-ctl">
              <input
                type="range"
                aria-label={v.label}
                min={min}
                max={max}
                step={(max - min) / 100 || 1}
                value={numVal}
                onChange={(e) => setVariableValue(v.id, Number(e.target.value))}
              />
              <NumField
                label={t("{0} value", v.label)}
                min={min}
                max={max}
                step={(max - min) / 100 || 1}
                value={numVal}
                onCommit={(n) => setVariableValue(v.id, n)}
              />
              {v.unit && <span className="alt">{v.unit}</span>}
              {v.unit && compatibleUnits(v.unit).length > 0 && (
                <span className="unit-view">
                  <select
                    aria-label={t("Display unit for {0}", v.label)}
                    value={displayUnits[v.id] ?? ""}
                    onChange={(e) => setDisplayUnits((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  >
                    <option value="">{t("Show in…")}</option>
                    {compatibleUnits(v.unit).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  {displayUnits[v.id] && (
                    <output>
                      = {Number(applyConversion(numVal, getConversion(v.unit, displayUnits[v.id])).toPrecision(4))} {displayUnits[v.id]}
                    </output>
                  )}
                </span>
              )}
            </div>
          ) : (
            <div className="cond-ctl">
              <select
                aria-label={v.label}
                value={typeof x === "string" ? x : (v.mode ?? v.categories?.[0] ?? "")}
                onChange={(e) => setVariableValue(v.id, e.target.value)}
              >
                {(v.categories ?? []).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
      </li>
    );
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

        {/* STEP 2: INTERFACE DESIGN */}
        {SCENARIO_STEPS[step] === "Interface design" && (
          <section className="step-panel">
            <h1>{t("Design your analysis interface")}</h1>
            <p className="step-lede">
              {t("Describe how you want the dashboard structured, or select focus presets below. Prometeo compiles an interface blueprint tailored to your corpus.")}
            </p>

            <div className="corpus-summary-badge">
              {t("{0} documents, {1} variables extracted", docs.length, variables.length)}
            </div>

            <label htmlFor="instruction" className="fieldlbl">
              {t("Interface instructions")}
            </label>
            <textarea
              ref={instructionRef}
              id="instruction"
              className="goal"
              rows={4}
              maxLength={4000}
              value={instruction}
              onChange={(e) => handleInstructionChange(e.target.value)}
              placeholder={t("e.g. Highlight key parameters, compare studies, and prioritize gap analysis")}
            />

            {/* Variables that can be inserted into the instruction */}
            {variables.length > 0 && (
              <div className="addvars">
                <span>{t("Insert a variable")}</span>
                {variables.filter((v) => v.include).slice(0, 24).map((v) => (
                  <button key={v.id} type="button" className="chip" onClick={() => insertIntoInstruction(v.label)}>
                    {v.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quick focus presets */}
            <div className="addvars">
              <span>{t("Quick focus presets")}</span>
              <button
                type="button"
                className={`chip ${presetFlags.includes("gaps") ? "add" : ""}`}
                aria-pressed={presetFlags.includes("gaps")}
                onClick={() => togglePresetFlag("gaps")}
              >
                {t("Gap analysis")}
              </button>
              <button
                type="button"
                className={`chip ${presetFlags.includes("compare") ? "add" : ""}`}
                aria-pressed={presetFlags.includes("compare")}
                onClick={() => togglePresetFlag("compare")}
              >
                {t("Study comparison")}
              </button>
              <button
                type="button"
                className={`chip ${presetFlags.includes("graph") ? "add" : ""}`}
                aria-pressed={presetFlags.includes("graph")}
                onClick={() => togglePresetFlag("graph")}
              >
                {t("Evidence graph")}
              </button>
              <button
                type="button"
                className={`chip ${presetFlags.includes("compact") ? "add" : ""}`}
                aria-pressed={presetFlags.includes("compact")}
                onClick={() => togglePresetFlag("compact")}
              >
                {t("Compact view")}
              </button>
            </div>

            {/* Suggested design prompts from corpus */}
            {suggestions.length > 0 && (
              <div className="addvars">
                <span>{t("Suggested design prompts")}</span>
                {suggestions.slice(0, 4).map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    className="chip"
                    onClick={() => handleInstructionChange(sug)}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}

            {/* Optional remote refinement (/design) */}
            <div className="ai-propose-bar">
              <button type="button" className="ghostbtn" onClick={handleAiDesign} disabled={designStatus === "busy"}>
                {designStatus === "busy" ? t("Requesting AI layout...") : t("Refine with AI (/design)")}
              </button>
              {designStatus === "success" && <span className="ai-status ai-status-success">{t("AI layout applied (validated against the allowed sections and variables)")}</span>}
              {designStatus === "error" && <span className="ai-status ai-status-error">{t("AI design unavailable, using the local blueprint")}</span>}
            </div>

            {/* Live UiBlueprint Preview */}
            <div className="genui-preview">
              <div className="genui-preview-head">
                <h3>{blueprint.title || t("Live interface blueprint")}</h3>
                <small>{blueprint.kicker}</small>
              </div>

              <div className="genui-pills">
                <span className="genui-pill">
                  {t(
                    "Layout: {0}",
                    blueprint.variablesLayout === "grouped"
                      ? t("Grouped")
                      : blueprint.variablesLayout === "grid"
                        ? t("Grid")
                        : t("List")
                  )}
                </span>
                <span className="genui-pill">
                  {t("Density: {0}", blueprint.density === "compact" ? t("Compact") : t("Editorial"))}
                </span>
                <span className="genui-pill">
                  {t("Default axes: {0}", blueprint.defaultAxes.join(", ") || t("None"))}
                </span>
                <span className="genui-pill">
                  {t("Prioritized: {0}", blueprint.highlightedVariables.join(", ") || t("None"))}
                </span>
                <span className="genui-pill">
                  {t("Sections: {0}", blueprint.sectionOrder.join(" → "))}
                </span>
              </div>

              <b className="fieldlbl">{t("Section order (drag, or use the arrows)")}</b>
              <ol className="section-order">
                {blueprint.sectionOrder.map((sid, i) => (
                  <li
                    key={sid}
                    draggable
                    className={dragSection === i ? "dragging" : ""}
                    onDragStart={() => setDragSection(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragSection !== null) moveSection(dragSection, i);
                      setDragSection(null);
                    }}
                    onDragEnd={() => setDragSection(null)}
                  >
                    <span>{i + 1}. {t(SECTION_LABELS[sid])}</span>
                    <button type="button" className="rm" disabled={i === 0} onClick={() => moveSection(i, i - 1)} aria-label={t("Move {0} up", t(SECTION_LABELS[sid]))}>
                      ↑
                    </button>
                    <button type="button" className="rm" disabled={i === blueprint.sectionOrder.length - 1} onClick={() => moveSection(i, i + 1)} aria-label={t("Move {0} down", t(SECTION_LABELS[sid]))}>
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
              {sectionOverride && (
                <button type="button" className="linkbtn" onClick={() => setSectionOverride(null)}>
                  {t("Reset to compiled order")}
                </button>
              )}

              {blueprint.rationale && (
                <p className="blueprint-rationale">
                  {t("Rationale: {0}", blueprint.rationale)}
                </p>
              )}
            </div>
          </section>
        )}

        {/* STEP 3: VARIABLES */}
        {SCENARIO_STEPS[step] === "Variables" && (
          <section className="step-panel">
            <h1>{t("Review and adjust extracted variables")}</h1>
            <p className="step-lede">
              {t("Toggle variables to include in the evaluation, verify source citations, and set scenario values. A variable left out is not compared.")}
            </p>

            {variables.length === 0 && extras.length === 0 && (
              <p className="empty">
                {t("No variables found in the uploaded corpus. Add a variable below or switch to reference corpus.")}
              </p>
            )}

            <input
              type="search"
              className="var-search"
              value={varQuery}
              onChange={(e) => setVarQuery(e.target.value)}
              placeholder={t("Filter variables by name or unit")}
              aria-label={t("Filter variables by name or unit")}
            />
            {(() => {
              const groups = groupVariables(variables, blueprint, varQuery, t("Other variables"));
              const listClass = blueprint.variablesLayout === "grid" ? "vlayout-grid" : "vlist";
              if (varQuery.trim() && groups.length === 0) return <p className="empty">{t("No variable matches “{0}”.", varQuery.trim())}</p>;
              return (
                <div className="vlayout-grouped">
                  {groups.map((g) => (
                    <details key={g.id} className="vgroup-section" open>
                      <summary className="vgroup-title">
                        {g.label} <small>({g.variables.length})</small>
                      </summary>
                      <ul className={listClass}>{g.variables.map(renderVarRow)}</ul>
                    </details>
                  ))}
                </div>
              );
            })()}

            {/* Extras (Manual Variables) */}
            {extras.length > 0 && (
              <ul className="vlist" style={{ marginTop: "18px" }}>
                {extras.map((e) => (
                  <li key={e.id} className="vrow">
                    <div className="vrow-head">
                      <b>{e.name}</b>
                      {e.unit && <small>{e.unit}</small>}
                      <ExtraTag />
                      <button
                        type="button"
                        className="rm"
                        onClick={() => onExtras(extras.filter((o) => o.id !== e.id))}
                        aria-label={t("Remove {0}", e.name)}
                      >
                        {t("Remove")}
                      </button>
                    </div>
                    <div className="cond-ctl">
                      <input
                        type="text"
                        className="xval"
                        aria-label={t("{0} value", e.name)}
                        maxLength={40}
                        value={e.value}
                        onChange={(ev) =>
                          onExtras(
                            extras.map((o) => (o.id === e.id ? { ...o, value: ev.target.value } : o))
                          )
                        }
                      />
                      <span className="alt">{t(EXTRA_BASIS)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add Extra Variable UI */}
            <div className="addvars" style={{ marginTop: "24px" }}>
              <AddExtra
                known={variables.map((v) => ({ id: v.id, label: v.label }))}
                onKnown={(id) => {
                  const v = variables.find((x) => x.id === id);
                  if (v && !v.include) toggleVariableInclude(id);
                }}
                onAdd={(e) => onExtras([...extras, e])}
              />
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

          {!last ? (
            <button
              type="button"
              className="cta"
              disabled={step === 0 && hasOnlyFailedDocs}
              onClick={() => setStep(step + 1)}
            >
              {t("Continue")}
            </button>
          ) : (
            <button
              type="button"
              className="cta"
              disabled={includedCount === 0 || hasOnlyFailedDocs}
              onClick={handleSubmit}
            >
              {t("Compare against the evidence")}
            </button>
          )}
        </div>
      </main>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
