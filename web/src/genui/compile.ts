/** Purpose -> dashboard modules, deterministic (owner: S2). STUB from F0. */
import type { Pack } from "../engine";
import type { DashboardSpec, VariableScore } from "./types";

export function compileDashboard(purpose: string, _pack: Pack, _scores: VariableScore[], _remote?: unknown): DashboardSpec {
  return { purpose, title: purpose.slice(0, 120), modules: [], dropped: [], suggestedQuestions: [], origin: "local" };
}

export function suggestPurposes(_scores: VariableScore[]): string[] {
  return [];
}
