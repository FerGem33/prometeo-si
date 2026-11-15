import type { Finding, Lens, OverallEvidence, Pack, Scenario, StudyResult } from "../engine";
import { FINDING_LEVEL, findingText, findingTitle, overallText, whyText } from "./text";
import { num } from "./format";
import { t } from "../i18n";

export function generateExecutiveMarkdown(
  pack: Pack,
  lens: Lens,
  scenario: Scenario,
  goal: string,
  overall: OverallEvidence,
  ranking: StudyResult[],
  findings: Finding[],
): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const activeEntries = scenario.active.map((id) => `- **${id}:** ${scenario.values[id]}`).join("\n");
  const topStudies = ranking.slice(0, 6).map((r) => {
    const s = pack.studies.find((x) => x.id === r.study);
    const dist = r.distance !== null && Number.isFinite(r.distance) ? `d = ${num(r.distance)}` : t("no distance");
    const whys = r.why.map((w) => whyText(pack, lens, w)).join("; ");
    return t("- **Grade {0}** · {1} ({2}): {3}", r.grade, s?.short ?? r.study, dist, whys);
  }).join("\n");

  const findingsList = findings.map((f) => {
    let desc = "";
    try {
      desc = f.params ? findingText(pack, lens, f) : findingTitle(pack, f);
    } catch {
      desc = findingTitle(pack, f);
    }
    return `- **[${FINDING_LEVEL[f.level]}] ${findingTitle(pack, f)}**: ${desc}`;
  }).join("\n");

  return t("# NASA FLIGHT DIRECTOR BRIEF · {0}\n**System:** {1}\n**Corpus:** {2}\n\n## 1. Mission Intent & Target Parameters\n{3}\n### Operating Point\n{4}\n\n## 2. Empirical Verification Verdict\n- **Overall Evidence Level:** {5}\n- **Study Grades Distribution:** Grade A: {6} | Grade B: {7} | Grade C: {8} | Grade D: {9}\n\n## 3. Nearest Empirical Studies (NASA PSI Database)\n{10}\n\n## 4. Key Synthesized Findings & Rules\n{11}\n\n---\n*Disclaimer: {12}*\n", dateStr, lens.title, lens.byline, goal ? t("**Goal / Question:** {0}\n", goal) : "", activeEntries, overallText(overall.level), overall.counts.A, overall.counts.B, overall.counts.C, overall.counts.D, topStudies, findingsList, lens.disclaimer);
}

export function generateDossierJson(
  pack: Pack,
  lens: Lens,
  scenario: Scenario,
  overall: OverallEvidence,
  ranking: StudyResult[],
  findings: Finding[],
): string {
  return JSON.stringify(
    {
      contract: pack.contract,
      timestamp: new Date().toISOString(),
      portal: {
        title: lens.title,
        byline: lens.byline,
      },
      scenario,
      overall,
      ranking: ranking.slice(0, 10),
      findings,
    },
    null,
    2,
  );
}

const bibEscape = (s: string) => s.replace(/[{}]/g, "").replace(/([&%$#_])/g, "\\$1").replace(/\s+/g, " ").trim();
const bibKey = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "ref";

/**
 * BibTeX for every DOI the pack carries: publications of a study (@article) and the study's own DOI link (@misc).
 * Only fields present in the pack are written; authors and years are never inferred.
 */
export function generateBibtex(pack: Pack): string {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (type: string, key: string, fields: [string, string | undefined][]) => {
    const body = fields.filter(([, v]) => v && v.trim()).map(([k, v]) => `  ${k} = {${k === "url" || k === "doi" ? v!.trim() : bibEscape(v!)}}`);
    out.push(`@${type}{${key},\n${body.join(",\n")}\n}`);
  };
  for (const s of pack.studies) {
    (s.publications ?? []).forEach((p, i) => {
      const doi = p.doi?.trim();
      if (!doi || seen.has(doi.toLowerCase())) return;
      seen.add(doi.toLowerCase());
      const author = p.authors ? p.authors.split(/\s*,\s*/).filter(Boolean).join(" and ") : undefined;
      add("article", bibKey(`${s.id}_${i + 1}`), [["title", p.title], ["author", author], ["doi", doi], ["url", `https://doi.org/${doi}`]]);
    });
    const link = s.links.find((l) => l.kind === "doi");
    const doi = link ? (link.label ?? link.url.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")) : "";
    if (doi && !seen.has(doi.toLowerCase())) {
      seen.add(doi.toLowerCase());
      add("misc", bibKey(s.id), [["title", s.title], ["doi", doi], ["url", link!.url]]);
    }
  }
  return out.join("\n\n") + (out.length ? "\n" : "");
}
