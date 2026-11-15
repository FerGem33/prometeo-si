import type { Finding, Lens, OverallEvidence, Pack, Scenario, StudyResult } from "../engine";
import { FINDING_LEVEL, findingText, findingTitle, OVERALL, whyText } from "./text";
import { num } from "./format";

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
    const dist = r.distance !== null && Number.isFinite(r.distance) ? `d = ${num(r.distance)}` : "no distance";
    const whys = r.why.map((w) => whyText(pack, lens, w)).join("; ");
    return `- **Grade ${r.grade}** · ${s?.short ?? r.study} (${dist}): ${whys}`;
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

  return `# NASA FLIGHT DIRECTOR BRIEF · ${dateStr}
**System:** ${lens.title}
**Corpus:** ${lens.byline}

## 1. Mission Intent & Target Parameters
${goal ? `**Goal / Question:** ${goal}\n` : ""}
### Operating Point
${activeEntries}

## 2. Empirical Verification Verdict
- **Overall Evidence Level:** ${OVERALL[overall.level]}
- **Study Grades Distribution:** Grade A: ${overall.counts.A} | Grade B: ${overall.counts.B} | Grade C: ${overall.counts.C} | Grade D: ${overall.counts.D}

## 3. Nearest Empirical Studies (NASA PSI Database)
${topStudies}

## 4. Key Synthesized Findings & Rules
${findingsList}

---
*Disclaimer: ${lens.disclaimer}*
`;
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
