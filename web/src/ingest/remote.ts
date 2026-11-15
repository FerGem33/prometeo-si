import { postApi } from "../report/api";
import { MODULE_TYPES } from "../genui/types";
import type { VariableScore } from "../genui/types";
import type {
  UploadedDoc,
  ExtractedVariable,
  VariableProposalRemote,
  UiBlueprint,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAYLOAD_BYTES = 115_000;
const HARD_PAYLOAD_LIMIT_BYTES = 120_000;

function getUtf8ByteLength(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).byteLength;
}

function createTimeoutSignal(
  parentSignal: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("Request timed out"));
  }, timeoutMs);

  const onParentAbort = () => {
    controller.abort(parentSignal.reason);
  };

  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
  } else {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
    },
  };
}

interface ProposeDocPayload {
  id: string;
  name: string;
  kind: "table" | "paper";
  headers?: string[];
  sample?: string[][];
  pages?: { page: number; text: string }[];
}

function buildProposePayload(
  docs: UploadedDoc[],
): { documents: ProposeDocPayload[] } | null {
  const eligible = docs.filter(
    (d) => d.status === "done" && (d.table !== undefined || d.paper !== undefined),
  );
  if (eligible.length === 0) return { documents: [] };

  // Progressive trimming stages: [maxPages, maxCharsPerPage, maxSampleRows]
  const stages: [number, number, number][] = [
    [5, 2000, 10],
    [3, 1000, 5],
    [2, 500, 3],
    [1, 300, 1],
    [1, 150, 0],
  ];

  for (const [maxPages, maxChars, maxRows] of stages) {
    const documents: ProposeDocPayload[] = eligible.map((d) => {
      if (d.kind === "table") {
        return {
          id: d.id,
          name: d.name.slice(0, 80),
          kind: "table" as const,
          headers: (d.table?.headers ?? []).slice(0, 30),
          sample: (d.table?.rows ?? [])
            .slice(0, maxRows)
            .map((r) => r.values.slice(0, 30).map((v) => String(v).slice(0, 100))),
        };
      }
      return {
        id: d.id,
        name: d.name.slice(0, 80),
        kind: "paper" as const,
        pages: (d.paper?.pages ?? []).slice(0, maxPages).map((p) => ({
          page: p.page,
          text: p.text.slice(0, maxChars),
        })),
      };
    });

    const candidate = { documents };
    if (getUtf8ByteLength(candidate) <= MAX_PAYLOAD_BYTES) {
      return candidate;
    }
  }

  // Truncate document count if batch is still over budget
  let trimmedDocs: ProposeDocPayload[] = eligible.map((d) => {
    if (d.kind === "table") {
      return {
        id: d.id,
        name: d.name.slice(0, 60),
        kind: "table" as const,
        headers: (d.table?.headers ?? []).slice(0, 20),
        sample: [],
      };
    }
    return {
      id: d.id,
      name: d.name.slice(0, 60),
      kind: "paper" as const,
      pages: (d.paper?.pages ?? []).slice(0, 1).map((p) => ({
        page: p.page,
        text: p.text.slice(0, 150),
      })),
    };
  });

  while (trimmedDocs.length > 0) {
    const candidate = { documents: trimmedDocs };
    const bytes = getUtf8ByteLength(candidate);
    if (bytes <= MAX_PAYLOAD_BYTES) {
      return candidate;
    }
    trimmedDocs = trimmedDocs.slice(0, -1);
  }

  return null;
}

/**
 * Requests AI variable proposals from Lambda Bedrock `/propose`.
 * Enforces strict byte budget <= 115 KB to stay safely within the 128 KB Lambda limit.
 * Silently returns null on network/timeout/404/503 errors or oversized payload without throwing.
 */
export async function requestRemoteProposals(
  docs: UploadedDoc[],
  signal: AbortSignal,
): Promise<VariableProposalRemote[] | null> {
  const payload = buildProposePayload(docs);
  if (!payload) return null;
  if (payload.documents.length === 0) return [];

  const byteLength = getUtf8ByteLength(payload);
  if (byteLength > HARD_PAYLOAD_LIMIT_BYTES) return null;

  const { signal: reqSignal, cleanup } = createTimeoutSignal(signal);
  try {
    const raw = await postApi("propose", payload, reqSignal);
    if (!raw || typeof raw !== "object") return null;

    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { proposals?: unknown }).proposals)
        ? (raw as { proposals: unknown[] }).proposals
        : null;

    if (!list) return null;

    const proposals: VariableProposalRemote[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const docId =
        typeof rec.docId === "string"
          ? rec.docId
          : typeof rec.doc_id === "string"
            ? rec.doc_id
            : "";
      const quote = typeof rec.quote === "string" ? rec.quote.trim() : "";
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      if (!docId || !quote || !label) continue;

      const type =
        rec.type === "categorical" || rec.type === "cat"
          ? ("categorical" as const)
          : ("numeric" as const);
      const unit = typeof rec.unit === "string" ? rec.unit : null;
      const prop: VariableProposalRemote = {
        id: typeof rec.id === "string" ? rec.id : undefined,
        label,
        type,
        unit,
        docId,
        quote,
      };
      if (typeof rec.page === "number") prop.page = rec.page;
      if (typeof rec.row === "number") prop.row = rec.row;
      if (typeof rec.min === "number" && Number.isFinite(rec.min)) prop.min = rec.min;
      if (typeof rec.max === "number" && Number.isFinite(rec.max)) prop.max = rec.max;
      if (Array.isArray(rec.categories)) {
        prop.categories = rec.categories.filter((c): c is string => typeof c === "string");
      }
      proposals.push(prop);
    }
    return proposals;
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

/**
 * Requests AI dashboard layout recommendations from Lambda Bedrock `/design`.
 * Safely caps payload byte length under 120 KB before calling postApi.
 * Silently returns null on network/timeout/404/503 errors without throwing.
 */
export async function requestRemoteDesign(
  instruction: string,
  docs: UploadedDoc[],
  vars: ExtractedVariable[],
  signal: AbortSignal,
): Promise<Partial<UiBlueprint> | null> {
  const cleanInstruction = instruction.trim().slice(0, 4000);
  let cleanVars = vars.map((v) => ({
    id: v.id,
    label: v.label.slice(0, 120),
    type: v.type,
    unit: v.unit ? v.unit.slice(0, 40) : null,
  }));

  let payload = {
    instruction: cleanInstruction,
    variables: cleanVars,
    stats: {
      docCount: docs.length,
      varCount: vars.length,
    },
  };

  // If payload exceeds budget due to excessive variables, truncate variables list
  if (getUtf8ByteLength(payload) > MAX_PAYLOAD_BYTES) {
    while (cleanVars.length > 0 && getUtf8ByteLength(payload) > MAX_PAYLOAD_BYTES) {
      cleanVars = cleanVars.slice(0, -5);
      payload = {
        instruction: cleanInstruction,
        variables: cleanVars,
        stats: {
          docCount: docs.length,
          varCount: vars.length,
        },
      };
    }
  }

  if (getUtf8ByteLength(payload) > HARD_PAYLOAD_LIMIT_BYTES) {
    return null;
  }

  const { signal: reqSignal, cleanup } = createTimeoutSignal(signal);
  try {
    const raw = await postApi("design", payload, reqSignal);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const bp = raw as Partial<UiBlueprint>;
    return bp;
  } catch {
    return null;
  } finally {
    cleanup();
  }
}

/**
 * Requests an AI dashboard layout from `/design` (version 2). The reply is untrusted:
 * the caller must validate every module. Throws on network, timeout or API errors.
 */
export async function requestRemoteDashboard(
  purpose: string,
  scores: VariableScore[],
  signal: AbortSignal,
): Promise<unknown> {
  const cleanPurpose = purpose.trim().slice(0, 4000);
  const payload = {
    version: 2,
    instruction: cleanPurpose,
    purpose: cleanPurpose,
    variables: scores.slice(0, 30).map((s) => ({
      id: s.id,
      label: s.label.slice(0, 120),
      type: s.type,
      unit: s.unit ? s.unit.slice(0, 40) : null,
    })),
    catalog: MODULE_TYPES,
  };
  if (getUtf8ByteLength(payload) > HARD_PAYLOAD_LIMIT_BYTES) throw new Error("Payload too large");

  const { signal: reqSignal, cleanup } = createTimeoutSignal(signal);
  try {
    return await postApi("design", payload, reqSignal);
  } finally {
    cleanup();
  }
}
