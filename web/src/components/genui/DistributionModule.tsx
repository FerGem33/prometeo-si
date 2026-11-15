/** Histogram of one numeric variable over the corpus records (owner: D2). STUB from F0. */
import type { Histogram, ModuleOf } from "../../genui/types";

export interface DistributionModuleProps {
  spec: ModuleOf<"distribution">;
  histogram: Histogram | null;
  figure: number;
}

export function DistributionModule({ spec }: DistributionModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
