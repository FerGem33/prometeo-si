import type { Grade, OverallEvidence, StudyResult } from "../engine";
import { useData } from "./ctx";
import { GradeGlyph } from "./GraphicalAbstract";
import { ReadingGuide } from "./ReadingGuide";
import { verdictText } from "../report/text";
import { studyShort } from "../report/format";
import { t, tx, many, lazy } from "../i18n";

const GRADES: Grade[] = ["A", "B", "C", "D"];

/** Word and shape for the overall level. Four distinct shapes, so the level never relies on colour. */
const OVERALL_WORD: Record<OverallEvidence["level"], { word: string; grade: Grade }> = lazy({
  strong: { word: tx("Strong"), grade: "A" },
  partial: { word: tx("Partial"), grade: "B" },
  scarce: { word: tx("Scarce"), grade: "C" },
  none: { word: tx("None recorded"), grade: "D" },
});

/** The answer to "how much evidence is there for what I am asking?", from engine values only. It is the first thing read. */
export function EvidenceCard({ overall, ranking, comparable }: { overall: OverallEvidence; ranking: StudyResult[]; comparable: number }) {
  const { pack, lens } = useData();
  const unit = lens.unit_of_study ?? "study";
  const o = OVERALL_WORD[overall.level];
  const closest = ranking.find((r) => r.grade !== "D");
  const total = GRADES.reduce((n, g) => n + overall.counts[g], 0);
  return (
    <section className="evcard" aria-label={t("Evidence level for this scenario")}>
      <div className="evcard-main">
        <h2>{t("Evidence for this scenario")}</h2>
        <p className="evcard-level">
          <GradeGlyph grade={o.grade} size={56} />
          <span>{o.word}</span>
        </p>
        <p className="evcard-def">{verdictText(overall, unit)}</p>
        <p className="evcard-note">{t("Coverage of the scenario by recorded tests. Prometeo compares conditions; it does not predict outcomes.")}</p>
      </div>
      <div className="evcard-side">
        <h3>{t("{0} by grade", many(unit)).replace(/^./, (c) => c.toUpperCase())}</h3>
        {total > 0 && (
          <div className="evcard-bar" aria-hidden="true">
            {GRADES.map((g) => overall.counts[g] > 0 && <span key={g} className={`g${g}`} style={{ flexGrow: overall.counts[g] }} />)}
          </div>
        )}
        <ul className="evcard-grades" aria-label={t("{0} by grade", many(unit))}>
          {GRADES.map((g) => (
            <li key={g}>
              <GradeGlyph grade={g} size={20} />
              <b>{overall.counts[g]}</b>
            </li>
          ))}
        </ul>
        <p className="evcard-line">
          {comparable.toLocaleString("en-US")} {t("comparable tests.")}{" "}
          {closest ? t("Closest {0}: {1} (grade {2}, d = {3}).", unit, studyShort(pack, closest.study), closest.grade, closest.distance) : t("No {0} has comparable records.", unit)}
        </p>
        <ReadingGuide />
      </div>
    </section>
  );
}
