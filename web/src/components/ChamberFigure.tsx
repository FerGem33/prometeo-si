import { useMemo, useRef, useState } from "react";
import "../iso/iso.css";
import "../iso/theme-prometeo.css";
import { chamberSvg, CHAMBER_VECTORS } from "../iso/chamber/build";
import { useInView, useLoop, spring, type Spring } from "../iso/react/live";
import { playChamberStageChirp, playTelemetryClick } from "../report/sound";

export interface ChamberFigureProps {
  /** Current processing step (0..4). */
  step?: number;
  /** Completion percentage (0..100). */
  progressPct?: number;
  /** Optional interactive stage selector for standalone showcase plates. */
  interactive?: boolean;
}

export const STEP_TELEMETRY_EN = [
  "STAGE 01 · PMMA SAMPLE LOAD · DOCUMENT INGESTION",
  "STAGE 02 · OPTICAL LASER SCAN · VARIABLES O₂ / P / V",
  "STAGE 03 · MICROGRAVITY IGNITION · PSI HARMONIZATION",
  "STAGE 04 · TELEMETRY & GRADING · SIMILARITY A–D",
  "READY · 1,889 NASA PSI RECORDS SYNCHRONIZED",
];

const STAGE_SHORT = ["1 · Load", "2 · Laser scan", "3 · Ignition", "4 · Telemetry", "Ready"];

interface StagePlusSpec {
  code: string;
  subsystem: string;
  title: string;
  summary: string;
  metrics: { label: string; value: string; sub: string }[];
  modes: { id: string; label: string; detail: string; flameBoost?: number; scanBoost?: number; needleOffset?: number }[];
}

const STAGE_PLUS_SPECS: StagePlusSpec[] = [
  {
    code: "STAGE 01 · CAROUSEL & MANIFOLD",
    subsystem: "Motorized Specimen Pedestal + O₂/N₂ Gas Manifold",
    title: "Specimen Insertion & PSI Source Table Ingestion",
    summary:
      "Positions the fuel sample on the vertical actuator while indexing 22 SHA-256 verified NASA PSI experiment tables across all four combustion partitions.",
    metrics: [
      { label: "Corpus Investigations", value: "24 studies", sub: "22 source tables · 352 DOIs" },
      { label: "Individual Tests", value: "1,889 rows", sub: "+ 97 campaign range rows" },
      { label: "Manifold Purge", value: "O₂ / N₂", sub: "13.6–100 % O₂ envelope" },
    ],
    modes: [
      {
        id: "solid",
        label: "Solid fuels (268)",
        detail: "PMMA, Nomex, SIBAL, Cotton/fiberglass & Thin cellulose sheets across BASS, BASS-II & SAFFIRE.",
      },
      {
        id: "gaseous",
        label: "Gaseous (1,141)",
        detail: "Methane, Ethane, Ethylene, Propane & Hydrogen coflow/spherical flames across ACME & s-Flame.",
      },
      {
        id: "droplets",
        label: "Droplets (361)",
        detail: "Heptane, Methanol, Ethanol & Decane isolated droplet combustion across FLEX & FLEX-2.",
      },
      {
        id: "soot",
        label: "Smoke & aerosols (119)",
        detail: "Particulate diagnostics and smoke point characterization in microgravity.",
      },
    ],
  },
  {
    code: "STAGE 02 · OPTICAL INTERFEROMETRY",
    subsystem: "Twin-Column Laser Sheet & Radiometer Ring",
    title: "Canonical Variable Mapping & Envelope Audit",
    summary:
      "Sweeps the dual-column optical ring along the specimen axis to map raw experiment columns to canonical units without imputing missing values.",
    metrics: [
      { label: "Mapped Variables", value: "5 canonical", sub: "O₂ · Pressure · Flow · Gravity · Fuel" },
      { label: "Solid O₂ Ceiling", value: "22.2 % max", sub: "BASS-II (140 of 268 solid tests)" },
      { label: "Solid P Coverage", value: "0 / 268 tests", sub: "Critical gap detected in solid pool" },
    ],
    modes: [
      {
        id: "o2_scan",
        label: "O₂ Envelope (σ = 5 %)",
        detail: "Tested across 13.6–22.2 % O₂ in solid fuels and up to 100 % O₂ in gaseous/droplet partitions.",
        scanBoost: 1.35,
      },
      {
        id: "p_scan",
        label: "Pressure Audit (σ = 0.25 atm)",
        detail: "0 of 268 solid-fuel tests record ambient pressure; gaseous/droplet tests span 0.3–9.87 atm.",
        scanBoost: 1.6,
      },
      {
        id: "flow_scan",
        label: "Forced Flow (σ = 8 cm/s)",
        detail: "Concurrent and opposed oxidizer flow velocities mapped from 0 to 55 cm/s in solid tests.",
        scanBoost: 1.15,
      },
    ],
  },
  {
    code: "STAGE 03 · HOT-WIRE IGNITION",
    subsystem: "Sapphire Observation Dome & Spherical 0g Kernel",
    title: "Microgravity Ignition & Diffusion Plume Harmonization",
    summary:
      "Energizes the hot-wire igniter to establish a buoyancy-free spherical flame kernel, aligning test conditions with outcome columns across investigations.",
    metrics: [
      { label: "Ignition Regime", value: "0g Spherical", sub: "Diffusion & concurrent-flow wake" },
      { label: "Outcome Columns", value: "73 approved", sub: "Spread rate · extinction · radiant loss" },
      { label: "Tolerance Window", value: "±1.25 % O₂", sub: "±0.08 atm P · ±2.0 cm/s Flow" },
    ],
    modes: [
      {
        id: "iss_nom",
        label: "ISS Cabin (21 % O₂ · 1 atm)",
        detail: "Baseline space-station atmosphere: covered by BASS and BASS-II PMMA/SIBAL microgravity tests.",
        flameBoost: 1.0,
      },
      {
        id: "lunar_30",
        label: "Lunar Base (30 % O₂ · 0.69 atm)",
        detail: "Exploration atmosphere: 7.8 percentage points above the 22.2 % O₂ solid-fuel tested ceiling.",
        flameBoost: 1.24,
      },
      {
        id: "eva_suit",
        label: "Spacesuit (100 % O₂ · 0.29 atm)",
        detail: "Pure-oxygen low-pressure EVA regime: high thermal diffusivity and unstudied solid-fuel gap.",
        flameBoost: 1.42,
      },
    ],
  },
  {
    code: "STAGE 04 · TELEMETRY & GRADING",
    subsystem: "Range-Normalized Mahalanobis Distance Computer",
    title: "Deterministic σ-Distance Ranking & Study Grades (A–D)",
    summary:
      "Computes normalized distance d(s, r) from the active scenario to every test record and assigns study grades A through D without predictive extrapolation.",
    metrics: [
      { label: "Distance Metric", value: "σ-Euclidean", sub: "Weighted by variable scale σ" },
      { label: "Evidence Levels", value: "4 deterministic", sub: "Studied · Scarce · Near · Not studied" },
      { label: "Study Grading", value: "Grades A–D", sub: "Shape + letter + colour encoded" },
    ],
    modes: [
      {
        id: "grade_a",
        label: "● Grade A · Direct",
        detail: "Comparable partition with all active variables inside tolerance (d ≤ 0.5 σ).",
        needleOffset: 24,
      },
      {
        id: "grade_b",
        label: "■ Grade B · Near",
        detail: "Comparable partition within near threshold (d ≤ 1.5 σ) or partial variable coverage.",
        needleOffset: 8,
      },
      {
        id: "grade_c",
        label: "◆ Grade C · Context",
        detail: "Same fuel partition (e.g., BASS-II, SAFFIRE-I/II) but outside the near-condition envelope.",
        needleOffset: -8,
      },
      {
        id: "grade_d",
        label: "○ Grade D · Other pool",
        detail: "Different fuel partition (e.g., gaseous or droplet studies when evaluating solid fuels).",
        needleOffset: -24,
      },
    ],
  },
  {
    code: "READY · PORTAL SYNCHRONIZED",
    subsystem: "Deterministic Evidence Engine (prometeo.pack.v1)",
    title: "Full Provenance Lock & Interactive Report Ready",
    summary:
      "All 1,889 test records, 24 investigations, and 22 SHA-256 source tables are locked and ready for interactive scenario comparison and academic dossier export.",
    metrics: [
      { label: "Provenance Lock", value: "100 % Cited", sub: "Every value links to source + row + DOI" },
      { label: "Engine Status", value: "Deterministic", sub: "Zero domain assumptions or predictions" },
      { label: "Export Formats", value: "Dossier / CSV", sub: "JSON · BibTeX · Print-ready PDF" },
    ],
    modes: [
      {
        id: "ready_map",
        label: "Figure 1 · Condition Map",
        detail: "1,010 dual-variable tests + 140 O₂-only strip tests plotted against scenario tolerance.",
      },
      {
        id: "ready_graph",
        label: "Figure 4 · Evidence Network",
        detail: "24-study force-directed & ranked-circle graph connected by shared variables and DOIs.",
      },
      {
        id: "ready_ml",
        label: "Table 5 · ML Readiness Card",
        detail: "73 approved outcome columns audited for completeness and experimental flags.",
      },
    ],
  },
];

export function ChamberFigure({ step = 2, progressPct = 75, interactive = false }: ChamberFigureProps) {
  const [localStep, setLocalStep] = useState(step);
  const [selectedModes, setSelectedModes] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
  const activeStep = interactive ? localStep : Math.min(4, Math.max(0, step));
  const activePct = interactive ? Math.min(100, Math.round(((localStep + 1) / 5) * 100)) : progressPct;

  const activeSpec = STAGE_PLUS_SPECS[activeStep] ?? STAGE_PLUS_SPECS[2];
  const activeModeIdx = selectedModes[activeStep] ?? 0;
  const activeMode = activeSpec.modes[activeModeIdx] ?? activeSpec.modes[0];

  const hostRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(hostRef);
  const clockRef = useRef(0);
  const stepRef = useRef(activeStep);
  stepRef.current = activeStep;
  const pctRef = useRef(activePct);
  pctRef.current = activePct;
  const modeRef = useRef(activeMode);
  modeRef.current = activeMode;

  const carriageSpring = useRef<Spring>({ at: 0, rate: 0 });
  const needleSpring = useRef<Spring>({ at: -55, rate: 0 });

  useLoop((dt, calm) => {
    const root = hostRef.current;
    if (!root) return false;

    clockRef.current += dt;
    const t = clockRef.current;
    const s = Math.min(4, Math.max(0, stepRef.current));
    const pct = pctRef.current;
    const curMode = modeRef.current;
    const [rx, ry] = CHAMBER_VECTORS.rise;
    const [px, py] = CHAMBER_VECTORS.needlePivot;
    const [fx, fy] = CHAMBER_VECTORS.flameCenter;

    // 1. Sample carriage lift: in Stage 0 (Load) it actively cycles up/down to load specimen
    const targetLift = s === 0 ? 1.5 : 3.2;
    spring(carriageSpring.current, targetLift, dt, 110, 16, calm);
    const loadOsc = s === 0 ? Math.sin(t * 3.4) * 1.5 : Math.sin(t * 2.1) * 0.5;
    const liftZ = calm ? targetLift : carriageSpring.current.at + loadOsc;

    // 2. Optical laser scanner ring: in Stage 1 (Laser scan) it sweeps faster and wider
    const scanBoost = curMode?.scanBoost ?? 1;
    const scanSpeed = (s === 1 ? 4.4 : s === 4 ? 2.6 : 2.0) * scanBoost;
    const scanAmp = s === 1 ? 14 : s >= 2 ? 9 : 4;
    const scanZ = calm ? 0 : Math.sin(t * scanSpeed) * scanAmp;

    // 3. Spherical microgravity flame kernel: dormant in Load (0), pre-heat in Scan (1), full in Ignition (2..4)
    const flameBoost = curMode?.flameBoost ?? 1;
    const isIgnited = s >= 2;
    const flameZ = calm ? 0 : Math.sin(t * 4.2 * flameBoost) * (isIgnited ? 1.6 : 0.7) + Math.cos(t * 7.1) * 0.4;
    const baseScale = (s === 0 ? 0.42 : s === 1 ? 0.68 : s === 2 ? 1.16 : 1.06) * flameBoost;
    const pulseAmp = (isIgnited ? 0.14 : 0.05) * flameBoost;
    const flameSx = calm ? baseScale : baseScale + Math.sin(t * 5.6 * flameBoost) * pulseAmp + Math.cos(t * 9.3) * 0.04;
    const flameSy = calm ? baseScale : baseScale + Math.cos(t * 5.6 * flameBoost) * (pulseAmp * 1.25) + Math.sin(t * 11.2) * 0.05;
    const fTx = rx * flameZ + fx * (1 - flameSx);
    const fTy = ry * flameZ + fy * (1 - flameSy);
    const flameOpacity = s === 0 ? 0 : s === 1 ? 0.45 : 1; // no kernel before the scan stage

    // 4. Evidence dial needle rotation (-55 deg -> +65 deg across 0..100%), in the dial's own plane (pivot = local origin)
    const needleOffset = s === 3 ? (curMode?.needleOffset ?? 0) : 0;
    const targetAngle = -55 + (pct / 100) * 120 + needleOffset;
    spring(needleSpring.current, targetAngle, dt, 130, 18, calm);
    const needleWobble = s === 3 ? Math.sin(t * 6.2) * 5.5 : Math.sin(t * 4.5) * 2.0;
    const angle = calm ? targetAngle : needleSpring.current.at + needleWobble;

    const nodes = root.querySelectorAll<SVGGElement>("[data-part]");
    nodes.forEach((node) => {
      const part = node.dataset.part;
      if (!part) return;
      if (part === "carriage") {
        node.setAttribute("transform", `translate(${(rx * liftZ).toFixed(2)} ${(ry * liftZ).toFixed(2)})`);
      } else if (part === "scanner") {
        node.setAttribute("transform", `translate(${(rx * scanZ).toFixed(2)} ${(ry * scanZ).toFixed(2)})`);
      } else if (part === "flame") {
        node.setAttribute(
          "transform",
          `translate(${fTx.toFixed(2)} ${fTy.toFixed(2)}) scale(${flameSx.toFixed(3)} ${flameSy.toFixed(3)})`,
        );
        node.style.opacity = String(flameOpacity);
      } else if (part === "needle") {
        node.setAttribute("transform", `rotate(${angle.toFixed(1)} ${px.toFixed(2)} ${py.toFixed(2)})`);
      }
    });

    // 5. Toggle stage-specific isometric diagnostic overlays [data-stage-fx="0..4"]
    const fxNodes = root.querySelectorAll<SVGGElement>("[data-stage-fx]");
    fxNodes.forEach((fxNode) => {
      const fxStage = Number(fxNode.dataset.stageFx);
      const isActive = fxStage === s;
      fxNode.style.opacity = isActive ? "1" : "0";
      if (isActive && !calm) {
        const pulse = 1 + Math.sin(t * 4.8) * 0.025;
        fxNode.style.transform = `scale(${pulse.toFixed(3)})`;
        fxNode.style.transformOrigin = `${fx.toFixed(1)}px ${fy.toFixed(1)}px`;
      } else {
        fxNode.style.transform = "none";
      }
    });

    return !calm;
  }, inView);

  const svg = useMemo(() => chamberSvg(), []);
  const statusText = STEP_TELEMETRY_EN[Math.min(4, Math.max(0, activeStep))];

  return (
    <div ref={hostRef} className="proc-chamber iso iso-prometeo" data-active-stage={activeStep}>
      <div className="proc-chamber-header">
        <span className="proc-chamber-tag">ISS CIR / BASS · NASA PSI</span>
        {interactive ? (
          <div className="proc-chamber-tabs" role="group" aria-label="Chamber stage">
            {STAGE_SHORT.map((lbl, idx) => (
              <button
                key={lbl}
                type="button"
                className="chip"
                aria-pressed={activeStep === idx}
                onClick={() => {
                  setLocalStep(idx);
                  playChamberStageChirp(idx);
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        ) : (
          <span className="proc-chamber-metrics">O₂ 21–30% · P 0.5–1.0 atm · 0g</span>
        )}
      </div>

      <div className="proc-chamber-stage" dangerouslySetInnerHTML={{ __html: svg }} />

      {/* Stage-Specific Interactive Diagnostic & Telemetry Inspector ("Plus" per selected stage) */}
      <div className="proc-chamber-plus" role="region" aria-label={`Stage ${activeStep + 1} diagnostic telemetry`}>
        <div className="proc-plus-top">
          <div className="proc-plus-heading">
            <span className="proc-plus-kicker">{activeSpec.code} · {activeSpec.subsystem}</span>
            <h4 className="proc-plus-title">{activeSpec.title}</h4>
            <p className="proc-plus-summary">{activeSpec.summary}</p>
          </div>
          <dl className="proc-plus-metrics">
            {activeSpec.metrics.map((m) => (
              <div key={m.label} className="proc-plus-metric">
                <dt>{m.label}</dt>
                <dd>
                  <b>{m.value}</b>
                  <small>{m.sub}</small>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="proc-plus-modes">
          <div className="proc-plus-mode-chips" role="group" aria-label="Stage sub-mode inspector">
            {activeSpec.modes.map((m, i) => (
              <button
                key={m.id}
                type="button"
                className="chip proc-plus-chip"
                aria-pressed={activeModeIdx === i}
                onClick={() => {
                  setSelectedModes((prev) => ({ ...prev, [activeStep]: i }));
                  playTelemetryClick();
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="proc-plus-mode-detail">
            <b>Active readout:</b> {activeMode.detail}
          </p>
        </div>
      </div>

      <div className="proc-chamber-footer" data-readout="">
        <span className="proc-chamber-dot" aria-hidden="true" />
        <span className="proc-chamber-readout">{statusText}</span>
      </div>
    </div>
  );
}
