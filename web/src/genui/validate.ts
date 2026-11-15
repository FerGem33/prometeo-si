/** Validation of module specs from any generator (owner: S2). STUB from F0. */
import type { Pack } from "../engine";
import type { DashboardSpec, ModuleSpec } from "./types";

export function validateModules(_raw: unknown, _pack: Pack): { modules: ModuleSpec[]; dropped: DashboardSpec["dropped"] } {
  return { modules: [], dropped: [] };
}
