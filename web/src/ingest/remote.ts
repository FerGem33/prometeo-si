import { postApi } from "../report/api";
import type {
  UploadedDoc,
  ExtractedVariable,
  VariableProposalRemote,
  UiBlueprint,
} from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

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

/**
 * Requests AI variable proposals from Lambda Bedrock `/propose`.
 * Silently returns null on network/timeout/404/503 errors without throwing.
 */
export async function requestRemoteProposals(
  docs: UploadedDoc[],
  signal: AbortSignal,
): Promise<VariableProposalRemote[] | null> {
  const eligible = docs.filter(
    (d) => d.status === "done" && (d.table !== undefined || d.paper !== undefined),
  );
  if (eligible.length === 0) return [];

  const documents = eligible.map((d) => {
    if (d.kind === "table") {
      return {
        id: d.id,
        name: d.name,
        kind: "table" as const,
        headers: d.table?.headers ?? [],
        sample: (d.table?.rows ?? []).slice(0, 10).map((r) => r.values),
      };
    }
    return {
      id: d.id,
      name: d.name,
      kind: "paper" as const,
      pages: (d.paper?.pages ?? []).slice(0, 5).map((p) => ({
        page: p.page,
        text: p.text.slice(0, 2000),
      })),
    };
  });

  const { signal: reqSignal, cleanup } = createTimeoutSignal(signal);
  try {
    const raw = await postApi("propose", { documents }, reqSignal);
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
 * Silently returns null on network/timeout/404/503 errors without throwing.
 */
export async function requestRemoteDesign(
  instruction: string,
  docs: UploadedDoc[],
  vars: ExtractedVariable[],
  signal: AbortSignal,
): Promise<Partial<UiBlueprint> | null> {
  const payload = {
    instruction: instruction.trim(),
    variables: vars.map((v) => ({
      id: v.id,
      label: v.label,
      type: v.type,
      unit: v.unit,
    })),
    stats: {
      docCount: docs.length,
      varCount: vars.length,
    },
  };

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
