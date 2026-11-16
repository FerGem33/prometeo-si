/**
 * Layout of the dashboard: a base order of blocks that the purpose can rearrange.
 * Pure: no DOM, no network. Only enumerations decide the layout, never free text.
 */
import { BLOCK_IDS, SECTION_IDS } from "./types";
import type { BlockId, DashboardSpec, ModuleSpan, ModuleSpec, ModuleType, SectionId } from "./types";

/** Section each module type belongs to unless its spec says otherwise. */
export const SECTION_OF: Record<ModuleType, SectionId> = {
  key_figures: "highlights",
  answer_stat: "answers",
  answer_filter: "answers",
  records_table: "answers",
  distribution: "patterns",
  scatter: "patterns",
  category_bars: "patterns",
  group_ranges: "patterns",
  box_summary: "patterns",
  cross_tab: "patterns",
  coverage_matrix: "coverage",
  completeness: "coverage",
  key_papers: "sources",
  doc_summaries: "sources",
  variable_scores: "sources",
};

/** Module types that stay readable at half the width of the column. */
const HALF_OK: ReadonlySet<ModuleType> = new Set<ModuleType>(["answer_stat", "answer_filter", "category_bars", "completeness"]);

export const isSection = (x: unknown): x is SectionId => typeof x === "string" && (SECTION_IDS as string[]).includes(x);
export const isBlock = (x: unknown): x is BlockId => typeof x === "string" && (BLOCK_IDS as string[]).includes(x);

export function sectionOf(m: Pick<ModuleSpec, "type" | "section">): SectionId {
  return isSection(m.section) ? m.section : SECTION_OF[m.type];
}

/** Width of a module. A type that needs the whole column is never narrowed. */
export function spanOf(m: Pick<ModuleSpec, "type" | "span">): ModuleSpan {
  if (!HALF_OK.has(m.type)) return "full";
  return m.span === "full" ? "full" : "half";
}

/**
 * Order of the blocks. `asked` holds the blocks a purpose or a layout asks for, most wanted first.
 * Key figures always open the page and direct answers follow them; the blocks asked for come next,
 * and the rest keep the base order. Unknown and repeated entries are ignored.
 */
export function blockOrder(asked: readonly unknown[] = []): BlockId[] {
  const out: BlockId[] = ["highlights", "answers"];
  for (const b of [...asked, ...BLOCK_IDS]) if (isBlock(b) && !out.includes(b)) out.push(b);
  return out;
}

/** Blocks ordered by the position where the purpose first names them. */
export function askedBlocks(positions: Partial<Record<BlockId, number>>): BlockId[] {
  return BLOCK_IDS.filter((b) => positions[b] !== undefined).sort((a, b) => positions[a]! - positions[b]! || BLOCK_IDS.indexOf(a) - BLOCK_IDS.indexOf(b));
}

export type DashboardBlock =
  | { kind: "section"; id: SectionId; rows: ModuleSpec[][] }
  | { kind: "case" };

/**
 * Blocks of the page in display order. A section without modules is left out; the case appears exactly once.
 * Inside a section, two consecutive half-width modules share a row; a half-width module alone takes the row.
 */
export function arrange(dashboard: Pick<DashboardSpec, "modules" | "order">): DashboardBlock[] {
  const bySection = new Map<SectionId, ModuleSpec[]>();
  for (const m of dashboard.modules) {
    if (m.type === "variable_scores") continue;
    const id = sectionOf(m);
    const list = bySection.get(id);
    if (list) list.push(m);
    else bySection.set(id, [m]);
  }
  const blocks: DashboardBlock[] = [];
  for (const id of blockOrder(dashboard.order)) {
    if (id === "case") {
      blocks.push({ kind: "case" });
      continue;
    }
    const modules = bySection.get(id);
    if (!modules?.length) continue;
    const rows: ModuleSpec[][] = [];
    for (const m of modules) {
      const last = rows[rows.length - 1];
      if (spanOf(m) === "half" && last && last.length === 1 && spanOf(last[0]) === "half") last.push(m);
      else rows.push([m]);
    }
    blocks.push({ kind: "section", id, rows });
  }
  return blocks;
}
