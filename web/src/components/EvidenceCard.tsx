import type { EvidenceLevel, Grade, OverallEvidence, StudyResult, VariableEvidence } from "../engine";
import { useData } from "./ctx";
import { GradeGlyph } from "./GraphicalAbstract";
import { LEVELS, OVERALL } from "../report/text";
import { studyShort } from "../report/format";

const GRADES: Grade[] = ["A", "B", "C", "D"];
const LEVEL_ORDER: EvidenceLevel[] = ["studied", "scarce", "near", "not_studied"];

/** Word and shape for the overall level. Four distinct shapes, so the level never relies on colour. */
const OVERALL_WORD: Record<OverallEvidence["level"], { word: string; grade: Grade }> = {
  strong: { word: "Strong", grade: "A" },
  partial: { word: "Partial", grade: "B" },
  scarce: { word: "Scarce", grade: "C" },
  none: { word: "None recorded", grade: "D" },
};

/** The answer to "how much evidence is there for what I am asking?", from engine values only. */
export function EvidenceCard({ overall, ranking, levels, comparable }: { overall: OverallEvidence; ranking: StudyResult[]; levels: VariableEvidence[]; comparable: number }) {
  const { pack, lens } = useData();
  const unit = lens.unit_of_study ?? "study";
  const o = OVERALL_WORD[overall.level];
  const closest = ranking.find((r) => r.grade !== "D");
  const byLevel = LEVEL_ORDER.map((l) => ({ level: l, n: levels.filter((x) => x.level === l).length })).filter((x) => x.n > 0);
  return (
    <section className="evcard" aria-label="Evidence level for this scenario">
      <h2>Evidence for this scenario</h2>
      <p className="evcard-level">
        <GradeGlyph grade={o.grade} size={34} />
        <span>{o.word}</span>
      </p>
      <p className="evcard-def">{(OVERALL[overall.level].match(/\((.*)\)/)?.[1] ?? OVERALL[overall.level]).replace(/study/g, unit).replace(/^./, (c) => c.toUpperCase())}.</p>
      <ul className="evcard-grades" aria-label={`${unit}s by grade`}>
        {GRADES.map((g) => (
          <li key={g}>
            <GradeGlyph grade={g} size={20} />
            <b>{overall.counts[g]}</b>
          </li>
        ))}
      </ul>
      <p className="evcard-line">
        {comparable.toLocaleString("en-US")} comparable tests.{" "}
        {closest ? `Closest ${unit}: ${studyShort(pack, closest.study)} (grade ${closest.grade}, d = ${closest.distance}).` : `No ${unit} has comparable records.`}
      </p>
      {byLevel.length > 0 && (
        <p className="evcard-line">
          {levels.length} {levels.length === 1 ? "variable" : "variables"}:{" "}
          {byLevel.map((x, i) => (
            <span key={x.level}>
              {i > 0 && " · "}
              <span aria-hidden="true">{LEVELS[x.level].icon}</span> {x.n} {LEVELS[x.level].label.toLowerCase()}
            </span>
          ))}
        </p>
      )}
      <p className="evcard-note">Coverage of the scenario by recorded tests. Prometeo compares conditions; it does not predict outcomes.</p>
    </section>
  );
}
