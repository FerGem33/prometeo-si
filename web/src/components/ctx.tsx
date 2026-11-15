import { createContext, useContext } from "react";
import type { Lens, Pack } from "../engine";

export type Mapping = {
  tables: {
    source: string;
    columns: { column: string; variable: string | null; unit?: string | null; convert?: { factor: number; offset: number } | null; status: string; role?: string; note?: string }[];
    constants: Record<string, unknown>;
    notes?: string[];
  }[];
  synonyms: Record<string, Record<string, string[]>>;
  flag_notes?: Record<string, string>;
  unused_sources?: string[];
  approved_by: string;
  approved_at: string;
  note?: string;
};

export type Data = { pack: Pack; lens: Lens; mapping: Mapping };

export const DataCtx = createContext<Data>(null as unknown as Data);
export const useData = () => useContext(DataCtx);

export const ProvCtx = createContext<(recordId: string) => void>(() => {});
export const useProv = () => useContext(ProvCtx);

/** A value that opens its provenance (file, row, original text, DOI). */
export function Src({ id, children, title }: { id: string | null | undefined; children: React.ReactNode; title?: string }) {
  const open = useProv();
  if (!id) return <>{children}</>;
  return (
    <button type="button" className="src" title={title ?? "Show source: file, row and DOI"} onClick={() => open(id)}>
      {children}
    </button>
  );
}
