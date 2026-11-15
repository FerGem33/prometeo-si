import { useState } from "react";
import { useData } from "./ctx";
import { ChamberFigure } from "./ChamberFigure";
import { allHabitatPresets, HabitatFigure, habitatScenario } from "./HabitatFigure";
import { IsoBenchFigure } from "./IsoBenchFigure";
import { LaunchButton } from "./LaunchButton";
import { scenarioValueText } from "../report/format";

const HOW: [string, string][] = [
  [
    "Bring your papers",
    "Reports, articles and experiment tables on any subject. Prometeo reads them and keeps the source of every value.",
  ],
  [
    "Describe your case",
    "Say what you want to do and set the conditions you have in mind. Start from a ready-made setting or from scratch.",
  ],
  [
    "Read the evidence",
    "See what has been studied under your conditions, how close it comes, and where nobody has looked. Every figure links to its source.",
  ],
];

/**
 * Landing in article style. The hero fits one viewport; the explanation and isometric apparatus plates follow below.
 */
export function Cover({
  onStart,
  onDemo,
  onWorkspace,
}: {
  onStart: () => void;
  onDemo: () => void;
  onWorkspace: () => void;
}) {
  const { pack, lens } = useData();
  const [plateMode, setPlateMode] = useState<"chamber" | "habitats" | "bench">("chamber");
  const presets = allHabitatPresets(lens);
  const [selectedHab, setSelectedHab] = useState<string>(presets[0]?.id ?? "lunar_base");
  const unit = lens.unit_of_study ?? "study";
  const s = pack.meta.stats;
  const vars = pack.schema.variables.filter((v) => !(v.type === "cat" && v.role === "partition"));
  const activeHabPreset = presets.find((p) => p.id === selectedHab);
  const activeHabScenario = selectedHab === "custom" ? { values: { o2: 21, p: 1, material: "PMMA" }, active: ["o2", "p", "material"] } : habitatScenario(lens, selectedHab);
  const facts: [string, string][] = [
    [String(pack.studies.length), `${unit}s`],
    [(s.tests ?? 0).toLocaleString("en-US"), `individual ${lens.subject ?? "tests"}`],
    [String(s.publications ?? 0), "linked publications"],
    [String(s.sources ?? 0), "source tables, each with a checksum"],
  ];

  return (
    <div className="screen cover">
      <section className="hero">
        <header className="screen-bar">
          <span>
            <b>Prometeo</b> · Evidence portals
          </span>
          <span className="bar-links">
            <button type="button" className="linkbtn" onClick={onWorkspace}>
              Workspace
            </button>
            <a href="#how" className="linkbtn">
              How it works
            </a>
          </span>
        </header>
        <div className="hero-body">
          <img
            className="cover-logo"
            src="/logo-mark-float-512.png"
            alt="Prometeo emblem"
            width={220}
            height={220}
          />
          <p className="cover-kicker">From papers to a portal of cited knowledge</p>
          <h1 className="cover-title">Know what the literature already shows about your idea</h1>
          <p className="cover-lede">
            Bring your papers and say what you want to do. Prometeo builds a portal around it: what has been studied under your conditions, how solid it is, and where nobody has looked.
          </p>
          <div className="cover-ctas">
            <LaunchButton label="Begin evaluation" className="cta big" onLaunch={onStart} autoFocus />
            <button type="button" className="ghostbtn big" onClick={onDemo}>
              See the example report
            </button>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <h2>How it works</h2>
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
        <h2>The example corpus in this demo</h2>
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
            <span className="cover-iso-title">Interactive isometric apparatus &amp; habitats</span>
            <div className="presets" role="group" aria-label="Isometric plate selector">
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "chamber"}
                onClick={() => setPlateMode("chamber")}
              >
                CIR / BASS Combustion Chamber
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "habitats"}
                onClick={() => setPlateMode("habitats")}
              >
                Reference Habitats (6)
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={plateMode === "bench"}
                onClick={() => setPlateMode("bench")}
              >
                Optical Test Bench
              </button>
            </div>
          </div>

          {plateMode === "chamber" && <ChamberFigure interactive />}

          {plateMode === "habitats" && (
            <div className="cover-habitats-showcase">
              <div className="design-hero-stage" role="region" aria-label="Selected habitat animation preview">
                <div className="design-hero-visual">
                  <HabitatFigure name={selectedHab} size="xl" />
                </div>
                <div className="design-hero-info">
                  <span className="design-hero-kicker">Selected reference design · Live isometric telemetry</span>
                  <h3>{activeHabPreset ? activeHabPreset.label : "Custom control bench"}</h3>
                  <p>{activeHabPreset ? activeHabPreset.blurb : "Open experimental test rig with manual variable controls across the full NASA PSI corpus."}</p>
                  <div className="design-hero-pills">
                    {activeHabScenario.active.map((id) => (
                      <span key={id} className="design-pill">
                        <b>{vars.find((v) => v.id === id)?.label ?? id}:</b>{" "}
                        {scenarioValueText(pack, id, activeHabScenario.values[id])}
                      </span>
                    ))}
                  </div>
                  <small className="design-hero-src">
                    {activeHabPreset ? activeHabPreset.source : "Manual variable rig · Full corpus comparison"}
                  </small>
                </div>
              </div>

              <div className="cover-habitats-grid" role="group" aria-label="Select a habitat design to preview">
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
                  <b>Custom bench</b>
                  <small>Manual variable rig</small>
                </button>
              </div>
            </div>
          )}

          {plateMode === "bench" && <IsoBenchFigure />}
        </div>

        <div className="cover-ctas">
          <LaunchButton label="Begin evaluation" className="cta" onLaunch={onStart} />
        </div>
      </section>

      <footer className="screen-foot">{lens.disclaimer}</footer>
    </div>
  );
}
