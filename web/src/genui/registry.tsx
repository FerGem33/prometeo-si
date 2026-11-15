/** Maps a ModuleSpec to its component. Pure mapping: values come from stats.ts and localAsk.ts. */
import type { ReactNode } from "react";
import type { Pack, Scenario } from "../engine";
import type { UploadedDoc } from "../ingest/types";
import type { ExtractedVariable } from "../ingest/types";
import { answerLocalQuery } from "../ingest/localAsk";
import type { LocalAnswer } from "../ingest/localAsk";
import { coverageMatrix, docSummaries, histogram, paperRelevance, scatterPoints } from "./stats";
import type { ModuleSpec } from "./types";
import { AnswerModule } from "../components/genui/AnswerModule";
import { CoverageMatrixModule } from "../components/genui/CoverageMatrixModule";
import { DistributionModule } from "../components/genui/DistributionModule";
import { DocSummariesModule } from "../components/genui/DocSummariesModule";
import { KeyPapersModule } from "../components/genui/KeyPapersModule";
import { ScatterModule } from "../components/genui/ScatterModule";

export interface ModuleCtx {
  pack: Pack;
  docs: UploadedDoc[];
  variables: ExtractedVariable[];
  purpose: string;
  /** Scenario of the case, when it has values. */
  caseScenario?: Scenario;
}

/** Figure or Table: which numbering a module consumes. */
export function moduleKind(spec: ModuleSpec): "Figure" | "Table" {
  return spec.type === "scatter" || spec.type === "distribution" || spec.type === "coverage_matrix" ? "Figure" : "Table";
}

function labelOf(pack: Pack, id: string): { label: string; unit: string | null } {
  const v = pack.schema.variables.find((x) => x.id === id);
  if (!v) return { label: id, unit: null };
  return { label: v.label, unit: v.type === "num" ? v.unit || null : null };
}

function withUnit(l: { label: string; unit: string | null }): string {
  return l.unit ? `${l.label} (${l.unit})` : l.label;
}

/** Deterministic question built from variable data and the module parameters, answered by localAsk. */
function answerFor(spec: Extract<ModuleSpec, { type: "answer_stat" | "answer_filter" }>, pack: Pack): LocalAnswer | { unsupported: string } {
  const label = labelOf(pack, spec.type === "answer_stat" ? spec.variable : spec.variable).label;
  if (spec.type === "answer_stat") {
    const word = { max: "maximum", min: "minimum", mean: "mean", count: "count" }[spec.stat];
    return answerLocalQuery(`${word} ${label}`, pack);
  }
  const [a, b] = spec.bounds;
  const q =
    spec.op === "between" ? `between ${a} and ${b} ${label}` : `${label} ${{ "<": "below", ">": "above", "<=": "at most", ">=": "at least" }[spec.op]} ${a}`;
  return answerLocalQuery(q, pack);
}

export function renderModule(spec: ModuleSpec, ctx: ModuleCtx, figure: number): ReactNode {
  switch (spec.type) {
    case "answer_stat":
    case "answer_filter":
      return <AnswerModule key={spec.id} spec={spec} answer={answerFor(spec, ctx.pack)} figure={figure} />;
    case "distribution":
      return <DistributionModule key={spec.id} spec={spec} histogram={histogram(ctx.pack, spec.variable)} figure={figure} />;
    case "scatter":
      return (
        <ScatterModule
          key={spec.id}
          spec={spec}
          points={scatterPoints(ctx.pack, spec.x, spec.y)}
          xLabel={withUnit(labelOf(ctx.pack, spec.x))}
          yLabel={withUnit(labelOf(ctx.pack, spec.y))}
          figure={figure}
        />
      );
    case "coverage_matrix":
      return <CoverageMatrixModule key={spec.id} spec={spec} matrix={coverageMatrix(ctx.docs, ctx.variables, spec.variables)} figure={figure} />;
    case "key_papers":
      return (
        <KeyPapersModule
          key={spec.id}
          spec={spec}
          papers={paperRelevance(ctx.docs, ctx.variables, ctx.purpose, ctx.caseScenario).slice(0, spec.limit)}
          figure={figure}
        />
      );
    case "doc_summaries":
      return <DocSummariesModule key={spec.id} spec={spec} summaries={docSummaries(ctx.docs, ctx.variables)} figure={figure} />;
    case "variable_scores":
      return null;
  }
}
