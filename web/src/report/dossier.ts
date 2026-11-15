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
