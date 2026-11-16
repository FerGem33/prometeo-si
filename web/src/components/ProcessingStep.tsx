import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../report/api";
import { requestRemoteDashboard } from "../ingest/remote";
import { compileDashboard } from "../genui/compile";
import { useData } from "./ctx";
import { ChamberFigure } from "./ChamberFigure";
import { Prefs } from "./Prefs";
import { t, tx, many, lazy } from "../i18n";
import type { EvaluationDraft } from "./ScenarioStep";

export const PROCESSING_STEPS = lazy([
  tx("Reading documents and source tables"),
  tx("Detecting experimental variables and canonical units"),
  tx("Harmonizing test records across partitions"),
  tx("Computing σ-distance, study grades (A–D) and findings"),
]);

/** How long the report waits for the AI layout after the animation ends. */
const LAYOUT_GRACE_MS = 4000;

export function ProcessingStep({
  draft,
  fileCount,
  stepDurationMs = 620,
  hold = false,
  onBack,
  onComplete,
}: {
  draft?: EvaluationDraft | null;
  fileCount?: number;
  stepDurationMs?: number;
  /** Stay on this screen after the last step instead of opening the report (the guided tour talks over it). */
  hold?: boolean;
  onBack: () => void;
  onComplete: (finalDraft?: EvaluationDraft) => void;
}) {
  const { pack: demoPack, lens: demoLens } = useData();
  const pack = draft?.pack ?? demoPack;
  const lens = draft?.lens ?? demoLens;
  const [currentStep, setCurrentStep] = useState(0);
  const s = pack.meta.stats;
  // Optional AI layout (/design v2), requested while the animation runs; any failure keeps the local dashboard.
  const enrichedRef = useRef<EvaluationDraft | null>(null);
  // Settles when the layout request ends, whatever its result; null when no request was made.
  const layoutRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    enrichedRef.current = null;
    layoutRef.current = null;
    if (!API_BASE || !draft?.dashboard || !draft.purpose || !draft.scores) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const { purpose, scores } = draft;
    layoutRef.current = (async () => {
      try {
        const remote = await requestRemoteDashboard(purpose!, scores!, controller.signal);
        if (controller.signal.aborted || !remote) return;
        enrichedRef.current = { ...draft, dashboard: compileDashboard(purpose!, draft.pack, scores!, remote) };
      } catch {
        // local dashboard stays
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [draft]);
  const finish = () => onComplete(enrichedRef.current ?? draft ?? undefined);
  const effectiveFileCount = draft?.docs?.length ?? fileCount ?? 0;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (currentStep < PROCESSING_STEPS.length) {
      timer = setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
      }, stepDurationMs);
    } else if (!hold) {
      // The report opens once the layout request has settled, or after a short grace period: a slow API never blocks it.
      let cancelled = false;
      const open = () => {
        if (!cancelled) finish();
      };
      timer = setTimeout(() => {
        const layout = layoutRef.current;
        if (!layout) return open();
        const grace = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, LAYOUT_GRACE_MS);
        });
        void Promise.race([layout, grace]).then(open);
      }, 380);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    return () => clearTimeout(timer);
  }, [currentStep, stepDurationMs, onComplete, hold, draft]);

  const progressPct = Math.min(100, Math.round((currentStep / PROCESSING_STEPS.length) * 100));

  return (
    <div className="screen step">
      <header className="screen-bar">
        <span>
          <b>{t("Prometeo")}</b> {t("· Harmonizing evidence")}
        </span>
        <span className="bar-links">
          <Prefs />
          <button type="button" className="linkbtn" onClick={onBack}>
          {t("Back to scenario")}
        </button>
        </span>
      </header>

      <main className="step-main proc-main">
        <section className="step-panel proc-panel" role="status" aria-live="polite">
          <p className="cover-kicker">{t("Isometric Chamber · Evidence Harmonization")}</p>
          <h1>{t("Preparing your evidence report")}</h1>
          <p className="step-lede">
            {effectiveFileCount > 0 ? t("{0} staged document(s) and ", effectiveFileCount) : ""}
            {lens.byline}: {pack.studies.length} {many(lens.unit_of_study ?? "study")}, {(s.tests ?? 0).toLocaleString("en-US")} {t("individual {0}", lens.subject ?? t("tests"))}.
          </p>

          <div className="proc-grid">
            <ChamberFigure step={currentStep} progressPct={progressPct} />

            <div className="proc-status-col">
              <ol className="psteps" aria-label={t("Harmonization steps")}>
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
                  aria-label={t("Analysis progress")}
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i id="pb" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="pbar-pct">{progressPct}%</span>
              </div>

              <div className="proc-actions">
                <button type="button" className="cta" onClick={finish}>
                  {t("Skip to report →")}
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
