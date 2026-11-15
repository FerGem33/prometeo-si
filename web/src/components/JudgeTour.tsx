import { useState } from "react";
import type { Stage } from "../state";

export interface TourStep {
  id: number;
  stage: Stage | "dossier";
  title: string;
  badge: string;
  pitch: string;
  takeaway: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    stage: "cover",
    badge: "Stop 1 of 5 · Vision & Corpus",
    title: "From 1,889 Scattered Tests to Cited Intelligence",
    pitch:
      "Prometeo unifies decades of NASA Physical Sciences Informatics (PSI) experiments into an empirical knowledge graph with cryptographic checksums for every source table.",
    takeaway: "Eliminates weeks of manual literature search; establishes verifiable provenance.",
  },
  {
    id: 2,
    stage: "scenario",
    badge: "Stop 2 of 5 · Intent & GenUI",
    title: "Mission Scenario & Habitat Selection",
    pitch:
      "Engineers formulate specific environmental conditions (Lunar Base 24% O₂ / 0.70 atm or ISS 21% O₂ / 1.0 atm). The generative interface dynamically binds variables to live telemetry.",
    takeaway: "Instant adaptation to mission requirements without hardcoded interfaces.",
  },
  {
    id: 3,
    stage: "processing",
    badge: "Stop 3 of 5 · Chamber Telemetry",
    title: "ISS CIR / BASS Microgravity Telemetry",
    pitch:
      "A 5-stage automated harmonization pipeline normalizes units, computes multidimensional σ-distances, and aligns empirical data to the proposed operating point.",
    takeaway: "Rigorous physics-based normalization with zero AI hallucination.",
  },
  {
    id: 4,
    stage: "report",
    badge: "Stop 4 of 5 · Scientific Verdict",
    title: "Deterministic Verdict & ML Readiness",
    pitch:
      "Evaluates overall evidence coverage, assigns grades A–D per study, plots the multi-variable condition map, and generates Table 5's ML Training Readiness Card.",
    takeaway: "Actionable decision-making backed by empirical safety boundaries.",
  },
  {
    id: 5,
    stage: "dossier",
    badge: "Stop 5 of 5 · Mission Deliverable",
    title: "1-Click Flight Director Technical Dossier",
    pitch:
      "Generates an audit-ready academic report with full DOI citations, downloadable CSV tables, and print-ready PDF layout for mission flight controllers.",
    takeaway: "Instant transition from interactive exploration to certified mission deliverable.",
  },
];

export function JudgeTour({
  currentStage: _currentStage,
  onNavigate,
  onOpenDossier,
}: {
  currentStage?: Stage;
  onNavigate: (stage: Stage) => void;
  onOpenDossier: () => void;
}) {
  const [active, setActive] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  const step = TOUR_STEPS[currentStepIdx];

  const handleStart = () => {
    setActive(true);
    setCurrentStepIdx(0);
    onNavigate("cover");
  };

  const handleClose = () => {
    setActive(false);
  };

  const handleNext = () => {
    if (currentStepIdx < TOUR_STEPS.length - 1) {
      const nextIdx = currentStepIdx + 1;
      setCurrentStepIdx(nextIdx);
      const nextStep = TOUR_STEPS[nextIdx];
      if (nextStep.stage === "dossier") {
        onNavigate("report");
        onOpenDossier();
      } else {
        onNavigate(nextStep.stage);
      }
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      const prevIdx = currentStepIdx - 1;
      setCurrentStepIdx(prevIdx);
      const prevStep = TOUR_STEPS[prevIdx];
      if (prevStep.stage !== "dossier") {
        onNavigate(prevStep.stage);
      }
    }
  };

  return (
    <>
      {/* Floating launcher pill for judges */}
      <aside className="judge-tour-pill-wrap noprint" aria-label="Contest judge presentation tour">
        <button
          type="button"
          className="judge-tour-pill"
          onClick={handleStart}
          title="Start 3-Minute Guided Pitch Tour for Hackathon Judges"
        >
          <span className="tour-pulse" aria-hidden="true" />
          <span className="tour-icon" aria-hidden="true">▶</span>
          <span className="tour-label"><b>3-Min Pitch Tour</b> · For Judges</span>
        </button>
      </aside>

      {/* Interactive spotlight guide dialog */}
      {active && (
        <div className="judge-tour-overlay" role="dialog" aria-modal="true" aria-label={step.title}>
          <div className="judge-tour-dialog">
            <header className="tour-dialog-header">
              <span className="tour-badge">{step.badge}</span>
              <button
                type="button"
                className="tour-close-btn"
                onClick={handleClose}
                aria-label="Close presentation tour"
              >
                ✕
              </button>
            </header>

            <div className="tour-dialog-body">
              <h3 className="tour-title">{step.title}</h3>
              <p className="tour-pitch">{step.pitch}</p>
              <div className="tour-takeaway">
                <span className="takeaway-label">Key Judge Takeaway:</span>
                <p>{step.takeaway}</p>
              </div>
            </div>

            <footer className="tour-dialog-footer">
              <div className="tour-dots">
                {TOUR_STEPS.map((s, idx) => (
                  <span
                    key={s.id}
                    className={`tour-dot ${idx === currentStepIdx ? "active" : ""}`}
                  />
                ))}
              </div>

              <div className="tour-actions">
                {currentStepIdx > 0 && (
                  <button type="button" className="tour-btn ghost" onClick={handlePrev}>
                    ← Back
                  </button>
                )}
                <button type="button" className="tour-btn cta" onClick={handleNext}>
                  {currentStepIdx === TOUR_STEPS.length - 1 ? "Finish Tour ✓" : "Next Stop →"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
