/** Deterministic statistics for dashboard modules (owner: S1). STUB from F0. */
import type { Pack, Scenario } from "../engine";
import type { ExtractedVariable, UploadedDoc } from "../ingest/types";
import type { CoverageMatrix, DocSummary, Histogram, PaperRelevance, ScatterPoint } from "./types";

export function histogram(_pack: Pack, _variable: string, _bins?: number): Histogram | null {
  return null;
}

export function scatterPoints(_pack: Pack, _x: string, _y: string): ScatterPoint[] {
  return [];
}

export function coverageMatrix(_docs: UploadedDoc[], _vars: ExtractedVariable[], _ids: string[]): CoverageMatrix {
  return { docs: [], variables: [], cells: [] };
}

export function paperRelevance(_docs: UploadedDoc[], _vars: ExtractedVariable[], _purpose: string, _scenario?: Scenario): PaperRelevance[] {
  return [];
}

export function docSummaries(_docs: UploadedDoc[], _vars: ExtractedVariable[]): DocSummary[] {
  return [];
}
