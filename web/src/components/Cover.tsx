import { useState } from "react";
import type { Scenario } from "../engine";
import { useData } from "./ctx";
import { ChamberFigure } from "./ChamberFigure";
import { allHabitatPresets, HabitatFigure, habitatScenario } from "./HabitatFigure";
import { IsoBenchFigure } from "./IsoBenchFigure";
import { LaunchButton } from "./LaunchButton";
import { scenarioValueText } from "../report/format";
import { NASA_MISSION_PRESETS } from "./presets";
import { getSoundEnabled, playTelemetryClick, setSoundEnabled } from "../report/sound";
import { Prefs } from "./Prefs";
import { t, tx, many, lazy } from "../i18n";

const HOW: [string, string][] = lazy([
  [
    tx("Bring your papers"),
    tx("Reports, articles and experiment tables on any subject. Prometeo reads them and keeps the source of every value."),
  ],
  [
    tx("Describe your case"),
    tx("Say what you want to do and set the conditions you have in mind. Start from a ready-made setting or from scratch."),
  ],
  [
    tx("Read the evidence"),
    tx("See what has been studied under your conditions, how close it comes, and where nobody has looked. Every figure links to its source."),
  ],
]);

/**
 * Landing in article style. The hero fits one viewport; the explanation and isometric apparatus plates follow below.
 */
export function Cover({
  onStart,
  onDemo,
  onWorkspace,
}: {
  onStart: (presetScenario?: Scenario) => void;
  onDemo: () => void;
  onWorkspace: () => void;
}) {
  const { pack, lens } = useData();
  const [soundOn, setSoundOn] = useState<boolean>(() => getSoundEnabled());
  const [plateMode, setPlateMode] = useState<"chamber" | "habitats" | "bench">("chamber");
  const presets = allHabitatPresets(lens);
  const [selectedHab, setSelectedHab] = useState<string>(presets[0]?.id ?? "lunar_base");
  const unit = lens.unit_of_study ?? "study";
  const s = pack.meta.stats;
  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const activeHabPreset = presets.find((p) => p.id === selectedHab);
  const activeHabScenario = selectedHab === "custom" ? { values: { o2: 21, p: 1, material: "PMMA" }, active: ["o2", "p", "material"] } : habitatScenario(lens, selectedHab);
  const facts: [string, string][] = [
    [String(pack.studies.length), `${many(unit)}`],
    [(s.tests ?? 0).toLocaleString("en-US"), t("individual {0}", lens.subject ?? "tests")],
    [String(s.publications ?? 0), t("linked publications")],
    [String(s.sources ?? 0), t("source tables, each with a checksum")],
  ];

  return (
    <div className="screen cover">
      <section className="hero">
        <header className="screen-bar">
          <span>
            <b>{t("Prometeo")}</b> {t("· Evidence portals")}
          </span>
          <span className="bar-links">
            <Prefs />
            <button
              type="button"
              className="linkbtn sound-toggle"
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playTelemetryClick();
              }}
              title={soundOn ? t("Mute telemetry sounds") : t("Enable telemetry sounds")}
            >
              {soundOn ? t("🔊 SFX ON") : t("🔇 SFX OFF")}
            </button>
            <button type="button" className="linkbtn" onClick={onWorkspace}>
              {t("Workspace")}
            </button>
            <a href="#how" className="linkbtn">
              {t("How it works")}
            </a>
          </span>
        </header>
        <div className="hero-body">
          <img
            className="cover-logo"
            src="/logo-mark-float-512.png"
            alt={t("Prometeo emblem")}
            width={220}
            height={220}
          />
          <p className="cover-kicker">{t("From papers to a portal of cited knowledge")}</p>
          <h1 className="cover-title">{t("Know what the literature already shows about your idea")}</h1>
          <p className="cover-lede">
            {t("Bring your papers and say what you want to do. Prometeo builds a portal around it: what has been studied under your conditions, how solid it is, and where nobody has looked.")}
          </p>
          <div className="cover-ctas">
            <LaunchButton label={t("Begin evaluation")} className="cta big" onLaunch={() => onStart()} autoFocus />
            <button type="button" className="ghostbtn big" onClick={onDemo}>
              {t("See the example report")}
            </button>
          </div>
        </div>
      </section>

      <section className="mission-profiles-sec">
        <div className="section-head">
          <p className="cover-kicker">{t("NASA Reference Profiles")}</p>
          <h2>{t("One-Click Mission Evaluations")}</h2>
          <p className="section-desc">
            {t("Select a verified space exploration mission setting to evaluate its flammability regime and empirical evidence coverage instantly against the 1,889 NASA PSI tests.")}
          </p>
        </div>
        <div className="mission-profiles-grid">
          {NASA_MISSION_PRESETS.map((m) => (
            <div key={m.id} className="mission-profile-card">
              <div className="mission-card-top">
                <span className="mission-badge">{m.badge}</span>
                <span className="mission-dest">{m.destination}</span>
              </div>
              <div className="mission-card-body">
                <div className="mission-card-visual">
                  <HabitatFigure name={m.designId} size="sm" />
                </div>
                <div className="mission-card-text">
                  <h4>{m.name}</h4>
                  <p>{m.tagline}</p>
                </div>
              </div>
              <div className="mission-card-params">
                <span><b>O₂:</b> {m.scenario.o2}%</span>
                <span><b>{t("Pressure:")}</b> {m.scenario.p} {t("atm")}</span>
                <span><b>{t("Material:")}</b> {m.scenario.material}</span>
              </div>
              <button
                type="button"
                className="mission-launch-btn"
                onClick={() => {
                  const s: Scenario = {
                    values: { ...m.scenario },
                    active: ["o2", "p", ...(m.scenario.flow !== undefined ? ["flow"] : []), "material"],
                  };
                  onStart(s);
                }}
              >
                {t("Evaluate profile →")}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="how" id="how">
        <h2>{t("How it works")}</h2>
        <ol>
          {HOW.map(([t, d], i) => (
            <li key={t}>
              <i>{i + 1}</i>
              <b>{t}</b>
              <span>{d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="example">
        <h2>{t("The example corpus in this demo")}</h2>
        <p>{lens.byline}.</p>
        <dl className="cover-facts">
          {facts.map(([n, label]) => (
            <div key={label}>
              <dt>{n}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>

        <div className="cover-iso-showcase">
          <div className="cover-iso-bar">
            <span className="cover-iso-title">{t("Interactive isometric apparatus & habitats")}</span>
            <div className="presets" role="group" aria-label={t("Isometric plate selector")}>
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "chamber"}
                onClick={() => setPlateMode("chamber")}
              >
                {t("CIR / BASS Combustion Chamber")}
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "habitats"}
                onClick={() => setPlateMode("habitats")}
              >
                {t("Reference Habitats (6)")}
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "bench"}
                onClick={() => setPlateMode("bench")}
              >
                {t("Optical Test Bench")}
              </button>
            </div>
          </div>

          {plateMode === "chamber" && <ChamberFigure interactive />}

          {plateMode === "habitats" && (
            <div className="cover-habitats-showcase">
              <div className="design-hero-stage" role="region" aria-label={t("Selected habitat animation preview")}>
                <div className="design-hero-visual">
                  <HabitatFigure name={selectedHab} size="xl" />
                </div>
                <div className="design-hero-info">
                  <span className="design-hero-kicker">{t("Selected reference design · Live isometric telemetry")}</span>
                  <h3>{activeHabPreset ? activeHabPreset.label : t("Custom control bench")}</h3>
                  <p>{activeHabPreset ? activeHabPreset.blurb : t("Open experimental test rig with manual variable controls across the full NASA PSI corpus.")}</p>
                  <div className="design-hero-pills">
                    {activeHabScenario.active.map((id) => (
                      <span key={id} className="design-pill">
                        <b>{vars.find((v) => v.id === id)?.label ?? id}:</b>{" "}
                        {scenarioValueText(pack, id, activeHabScenario.values[id])}
                      </span>
                    ))}
                  </div>
                  <small className="design-hero-src">
                    {activeHabPreset ? activeHabPreset.source : t("Manual variable rig · Full corpus comparison")}
                  </small>
                </div>
              </div>

              <div className="cover-habitats-grid" role="group" aria-label={t("Select a habitat design to preview")}>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="cover-hab-card"
                    aria-pressed={selectedHab === p.id}
                    onClick={() => setSelectedHab(p.id)}
                  >
                    <HabitatFigure name={p.id} size="sm" />
                    <b>{p.label}</b>
                    <small>{p.source}</small>
                  </button>
                ))}
                <button
                  type="button"
                  className="cover-hab-card"
                  aria-pressed={selectedHab === "custom"}
                  onClick={() => setSelectedHab("custom")}
                >
                  <HabitatFigure name="custom" size="sm" />
                  <b>{t("Custom bench")}</b>
                  <small>{t("Manual variable rig")}</small>
                </button>
              </div>
            </div>
          )}

          {plateMode === "bench" && <IsoBenchFigure />}
        </div>

        <div className="cover-ctas">
          <LaunchButton label={t("Begin evaluation")} className="cta" onLaunch={() => onStart()} />
        </div>
      </section>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
