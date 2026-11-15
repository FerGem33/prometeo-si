/** Deterministic relevance score of extracted variables (owner: S1). STUB from F0. */
import type { ExtractedVariable, UploadedDoc } from "../ingest/types";
import { DEFAULT_CASE_VARIABLES } from "./types";
import type { VariableScore } from "./types";

export function scoreVariables(_docs: UploadedDoc[], _vars: ExtractedVariable[], _purpose: string): VariableScore[] {
  return [];
}

export function defaultSelection(scores: VariableScore[], n: number = DEFAULT_CASE_VARIABLES): string[] {
  return scores.slice(0, n).map((s) => s.id);
}
