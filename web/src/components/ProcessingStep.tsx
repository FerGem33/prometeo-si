import { useEffect, useState } from "react";
import { useData } from "./ctx";
import { ChamberFigure } from "./ChamberFigure";

export const PROCESSING_STEPS = [
  "Reading documents and source tables",
  "Detecting experimental variables and canonical units",
  "Harmonizing test records across partitions",
  "Computing σ-distance, study grades (A–D) and findings",
];

export function ProcessingStep({
  fileCount = 0,
  stepDurationMs = 620,
  onBack,
  onComplete,
}: {
  fileCount?: number;
  stepDurationMs?: number;
  onBack: () => void;
  onComplete: () => void;
}) {
  const { pack, lens } = useData();
  const [currentStep, setCurrentStep] = useState(0);
  const s = pack.meta.stats;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (currentStep < PROCESSING_STEPS.length) {
      timer = setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
      }, stepDurationMs);
    } else {
      timer = setTimeout(() => {
        onComplete();
      }, 380);
    }
    return () => clearTimeout(timer);
  }, [currentStep, stepDurationMs, onComplete]);

  const progressPct = Math.min(100, Math.round((currentStep / PROCESSING_STEPS.length) * 100));

  return (
    <div className="screen step">
      <header className="screen-bar">
        <span>
          <b>Prometeo</b> · Harmonizing evidence
        </span>
        <button type="button" className="linkbtn" onClick={onBack}>
          Back to scenario
        </button>
      </header>

      <main className="step-main proc-main">
        <section className="step-panel proc-panel" role="status" aria-live="polite">
          <p className="cover-kicker">Isometric Chamber · Evidence Harmonization</p>
          <h1>Preparing your evidence report</h1>
          <p className="step-lede">
            {fileCount > 0 ? `${fileCount} staged document(s) and ` : ""}
            {lens.byline}: {pack.studies.length} {lens.unit_of_study ?? "study"}s, {(s.tests ?? 0).toLocaleString("en-US")} individual {lens.subject ?? "tests"}.
          </p>

          <div className="proc-grid">
            <ChamberFigure step={currentStep} progressPct={progressPct} />

            <div className="proc-status-col">
              <ol className="psteps" aria-label="Harmonization steps">
                {PROCESSING_STEPS.map((label, idx) => {
                  const isDone = idx < currentStep;
                  const isNow = idx === currentStep;
                  return (
                    <li
                      key={label}
                      id={`ps${idx}`}
                      className={`${isDone ? "ps-done" : ""} ${isNow ? "ps-now" : ""}`.trim()}
                    >
                      <span className="pstep-num" aria-hidden="true">
                        {isDone ? "✓" : idx + 1}
                      </span>
                      <span className="pstep-label">{label}</span>
                    </li>
                  );
                })}
              </ol>

              <div className="pbar-wrapper">
                <div
                  className="pbar"
                  role="progressbar"
                  aria-label="Analysis progress"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i id="pb" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="pbar-pct">{progressPct}%</span>
              </div>

              <div className="proc-actions">
                <button type="button" className="cta" onClick={onComplete}>
                  Skip to report →
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
