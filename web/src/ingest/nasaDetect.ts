import type { UploadedDoc } from "./types";

export type NasaApparatusKind = "chamber" | "habitat";
export interface NasaDetection {
  isNasa: boolean;
  apparatus: NasaApparatusKind | null;
  matched: string[];
}

type Term = { label: string; re: RegExp; strong?: boolean; kind?: NasaApparatusKind };

// Whole-token match; acronyms are case-sensitive so "cir" in prose or "Eva" as a name do not count.
const word = (s: string, cs = false) => new RegExp(`(?<![A-Za-z0-9])${s}(?![A-Za-z0-9])`, cs ? "" : "i");

const TERMS: Term[] = [
  // Agency and missions
  { label: "NASA", re: word("NASA"), strong: true },
  { label: "ESA", re: word("ESA", true) },
  { label: "JAXA", re: word("JAXA"), strong: true },
  { label: "ISS", re: word("ISS", true), strong: true },
  { label: "International Space Station", re: word("international\\s+space\\s+station"), strong: true },
  { label: "CIR", re: word("CIR", true), strong: true, kind: "chamber" },
  { label: "BASS", re: word("BASS", true), strong: true, kind: "chamber" },
  { label: "FBC", re: word("FBCE?", true), kind: "chamber" },
  { label: "MABE", re: word("MABE", true), strong: true, kind: "chamber" },
  { label: "NPBX", re: word("NPBX", true), strong: true, kind: "chamber" },
  { label: "PBE", re: word("PBE", true), kind: "chamber" },
  { label: "SAFFIRE", re: word("saffire"), strong: true, kind: "chamber" },
  { label: "Artemis", re: word("Artemis", true), kind: "habitat" },
  { label: "Gateway", re: word("lunar\\s+gateway"), kind: "habitat" },
  { label: "Apollo", re: word("Apollo", true) },
  // Microgravity phenomenology
  { label: "microgravity", re: word("micro-?gravity") },
  { label: "reduced gravity", re: word("reduced[\\s-]+gravity") },
  { label: "zero-g", re: word("zero[\\s-]?g") },
  { label: "0g", re: word("0\\s?-?g") },
  { label: "low-g", re: word("low[\\s-]g") },
  { label: "parabola", re: word("parabol(?:a|ic|as)") },
  { label: "KC-135", re: word("KC-?135") },
  { label: "spacecraft", re: word("spacecraft") },
  { label: "flight experiment", re: word("flight\\s+experiments?") },
  // Habitat and life support
  { label: "lunar base", re: word("lunar\\s+base"), kind: "habitat" },
  { label: "habitat", re: word("habitats?"), kind: "habitat" },
  { label: "airlock", re: word("airlocks?"), kind: "habitat" },
  { label: "spacesuit", re: word("space\\s?suits?"), kind: "habitat" },
  { label: "EVA", re: word("EVA", true), kind: "habitat" },
  { label: "rover", re: word("rovers?"), kind: "habitat" },
  { label: "ECLSS", re: word("ECLSS", true), kind: "habitat" },
  { label: "combustion chamber", re: word("combustion\\s+chambers?"), kind: "chamber" },
];

const PAGES_SCANNED = 3; // bounded for speed on 30-document batches
const CHARS_PER_PAGE = 6000;

function corpusText(docs: UploadedDoc[], variables: { label: string; unit?: string | null }[]): string {
  const parts: string[] = [];
  for (const d of docs) {
    if (d.status !== "done") continue;
    parts.push(d.name);
    if (d.paper) {
      parts.push(d.paper.title ?? "", d.paper.doi ?? "");
      for (const p of d.paper.pages.slice(0, PAGES_SCANNED)) parts.push(p.text.slice(0, CHARS_PER_PAGE));
      for (const f of d.paper.findings) parts.push(f.label, f.rawName);
    }
    if (d.table) parts.push(...d.table.headers, ...d.table.columns.map((c) => c.label));
  }
  for (const v of variables) parts.push(v.label);
  // File names use "_" as a separator; treat it as a space so tokens stay whole.
  return parts.join("\n").replace(/_/g, " ");
}

/** Detects a space-research corpus from names, titles, DOIs, early page text, headers and variable labels. */
export function detectNasaCorpus(docs: UploadedDoc[], variables: { label: string; unit?: string | null }[] = []): NasaDetection {
  const text = corpusText(docs, variables);
  const hits = TERMS.filter((term) => term.re.test(text));
  const matched = hits.map((h) => h.label);
  const isNasa = hits.length >= 2 || hits.some((h) => h.strong);
  if (!isNasa) return { isNasa: false, apparatus: null, matched };
  const chamber = hits.filter((h) => h.kind === "chamber").length;
  const habitat = hits.filter((h) => h.kind === "habitat").length;
  // Ties and corpora without apparatus terms default to the experiment chamber: PSI flight data are chamber experiments.
  return { isNasa, apparatus: habitat > chamber ? "habitat" : "chamber", matched };
}
