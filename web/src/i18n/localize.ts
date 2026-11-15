// Texts of a corpus in another language. The words of a corpus never live in the code: they come with its pack,
// in a locale file next to it (demo/locale.<lang>.json). Only labels and notes are translated; identifiers, category
// values, numbers and source data are kept exactly as in the pack, so the engine computes the same results.
import type { Lens, Pack } from "../engine";
import type { Data } from "../components/ctx";
import { setUnitGender } from "./index";
import type { Gender, Lang } from "./index";

export type CorpusLocale = { lang: Lang; unit_gender?: Gender; strings: Record<string, string> };

const ORIGINAL = new WeakMap<Pack, Pack>();

/** The pack exactly as published, for requests to the server, whatever the language of the interface. */
export const originalPack = (pack: Pack): Pack => ORIGINAL.get(pack) ?? pack;

export async function loadLocale(base: string, lang: Lang): Promise<CorpusLocale | null> {
  if (lang === "en") return null;
  try {
    const r = await fetch(`${base}locale.${lang}.json`);
    if (!r.ok) return null;
    const json = (await r.json()) as CorpusLocale;
    return json && typeof json.strings === "object" ? json : null;
  } catch {
    return null;
  }
}

export function localizeData(data: Data, locale: CorpusLocale | null): Data {
  setUnitGender(locale?.unit_gender ?? "m");
  if (!locale) return data;
  const s = locale.strings;
  const tr = <T extends string | undefined>(x: T): T => (typeof x === "string" ? ((s[x] ?? x) as T) : x);
  const { pack, lens } = data;

  const l: Lens = {
    ...lens,
    title: tr(lens.title),
    kicker: tr(lens.kicker),
    purpose_example: tr(lens.purpose_example),
    subject: tr(lens.subject),
    unit_of_study: tr(lens.unit_of_study),
    byline: tr(lens.byline),
    disclaimer: tr(lens.disclaimer),
    footer: tr(lens.footer),
    outcome_columns_note: tr(lens.outcome_columns_note),
    presets: lens.presets.map((p) => ({ ...p, label: tr(p.label), blurb: tr(p.blurb), source: tr(p.source) })),
    questions: lens.questions?.map(tr),
    known_gaps: lens.known_gaps?.map((g) => ({ ...g, note: tr(g.note), source: tr(g.source) })),
    groups: lens.groups?.map((g) => ({ ...g, label: tr(g.label) })),
    parts: lens.parts?.map((p) => ({ ...p, label: tr(p.label) })),
    partition_labels: lens.partition_labels && Object.fromEntries(Object.entries(lens.partition_labels).map(([k, v]) => [k, tr(v)])),
  };

  const p: Pack = {
    ...pack,
    meta: { ...pack.meta, title: tr(pack.meta.title), source_note: tr(pack.meta.source_note) },
    schema: {
      ...pack.schema,
      variables: pack.schema.variables.map((v) =>
        v.type === "num"
          ? { ...v, label: tr(v.label), long: tr(v.long), delta_unit: tr(v.delta_unit), risk: v.risk && { ...v.risk, note: tr(v.risk.note), source: tr(v.risk.source) } }
          : { ...v, label: tr(v.label), long: tr(v.long) },
      ),
      flags: pack.schema.flags && Object.fromEntries(Object.entries(pack.schema.flags).map(([k, f]) => [k, { ...f, label: tr(f.label), note: tr(f.note) }])),
    },
  };
  ORIGINAL.set(p, pack);
  return { ...data, pack: p, lens: l };
}
