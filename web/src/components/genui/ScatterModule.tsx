/** Scatter of two numeric variables; each point opens its record (owner: D3). STUB from F0. */
import type { ModuleOf, ScatterPoint } from "../../genui/types";

export interface ScatterModuleProps {
  spec: ModuleOf<"scatter">;
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  figure: number;
}

export function ScatterModule({ spec }: ScatterModuleProps) {
  return <section className="gx-module">{spec.title}</section>;
}
