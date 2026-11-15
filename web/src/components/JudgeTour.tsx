import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { evidenceLevels, findings } from "../engine";
import type { Lens, Pack, Scenario } from "../engine";
import type { Stage } from "../state";
import { useData } from "./ctx";
import { habitatScenario } from "./HabitatFigure";
import { findingText, LEVELS } from "../report/text";
import { scenarioValueText, varOf } from "../report/format";
import { t, tx, many, lazy } from "../i18n";

/**
 * What a stop can say about the loaded corpus. Counts come from the pack, settings from the lens, and levels and
 * findings from the engine run on those settings; nothing is written in this file.
 */
export interface TourContext {
  studies: number;
  units: string;
  sources: number;
  subject: string;
  /** The reference case of the lens, the one the pitch is about. */
  presetId: string;
  presetLabel: string;
  presetBlurb: string;
  /** Another setting of the lens, shown first so that loading the reference case visibly rewrites the report. */
  baseId: string;
  baseLabel: string;
  baseBlurb: string;
  /** The first finding of the engine for the reference case, as the report words it. */
  hook: string;
  /** Each variable of the reference case with its value and level, as the report words them. */
  levels: string;
  /** The first variable of the reference case, whose source the tour opens. */
  firstVar: string;
  question: string;
}

/** A control: a selector, or one that depends on the settings of the lens. */
type Control = string | ((c: TourContext) => string);

export interface TourStep {
  id: number;
  stage: Stage | "dossier";
  /** Short name shown next to the number of the stop. */
  name: string;
  title: string;
  pitch: (c: TourContext) => string;
  /** The element on the page the stop talks about; it is outlined and scrolled into view. */
  target: string;
  takeaway: string;
  /** A control clicked on arrival to show the feature working; a control already pressed or expanded is left as is. */
  click?: Control;
  /** A control clicked on departure, to close what `click` opened. */
  leave?: string;
}

const lower = (s: string) => (/^.[a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

export function tourContext(pack: Pack, lens: Lens): TourContext {
  const preset = lens.presets.find((p) => p.id === lens.default_preset) ?? lens.presets[0];
  const base = lens.presets.find((p) => p.id !== preset?.id);
  const scenario = habitatScenario(lens, preset?.id);
  const levels = evidenceLevels(pack, lens, scenario);
  const first = findings(pack, lens, scenario)[0];
  const label = (id: string) => {
    const v = varOf(pack, id);
    return v.long ?? v.label;
  };
  return {
    studies: pack.studies.length,
    units: many(lens.unit_of_study ?? "study"),
    sources: pack.meta.stats.sources ?? pack.sources.length,
    subject: lens.subject ?? t("tests"),
    presetId: preset?.id ?? "",
    presetLabel: preset?.label ?? "",
    presetBlurb: preset?.blurb ?? "",
    baseId: base?.id ?? "",
    baseLabel: base?.label ?? "",
    baseBlurb: base?.blurb ?? "",
    hook: first ? findingText(pack, lens, first) : "",
    levels: levels.map((lv) => `${label(lv.variable)} ${scenarioValueText(pack, lv.variable, lv.value)}: ${LEVELS[lv.level].label}`).join("; "),
    firstVar: levels[0] ? lower(label(levels[0].variable)) : "",
    question: lens.questions?.[0] ?? "",
  };
}

/** The scenario the report opens on when the tour starts. */
export function tourStartScenario(lens: Lens): Scenario {
  const c = lens.presets.find((p) => p.id !== lens.default_preset);
  return habitatScenario(lens, c?.id ?? lens.default_preset);
}

const preset = (id: string) => (id ? `.hab-panel [data-preset="${id}"]` : "");

/** The stops follow the order of the pitch: problem, product, report, live case, sources, question, export, scope, close. */
export const TOUR_STEPS: TourStep[] = lazy([
  {
    id: 1,
    stage: "cover",
    name: tx("Problem"),
    title: tx("A simple question, an answer spread over the literature"),
    pitch: (c: TourContext) =>
      t(
        "{0}: {1} Before designing it, a researcher needs to know what has been tested under those conditions. The answer is spread over {2} {3} and {4} data tables, each with its own columns and units.",
        c.presetLabel,
        c.presetBlurb,
        c.studies,
        c.units,
        c.sources,
      ) + (c.hook ? ` ${t("Read side by side, they show something uncomfortable: {0}", c.hook)}` : ""),
    target: ".cover .example",
    takeaway: tx("Finding that gap by hand means reading every paper and converting every value."),
  },
  {
    id: 2,
    stage: "processing",
    name: tx("Prometeo"),
    title: tx("All that literature, turned into one verifiable paper"),
    pitch: (c: TourContext) =>
      t(
        "Prometeo is a tool for the research community. It reads the {0} source tables, converts every value to one canonical unit, keeps comparable {1} together and computes, with a deterministic engine, what has been studied and what has not. The same inputs always produce the same report.",
        c.sources,
        c.subject,
      ),
    target: ".proc-status-col",
    takeaway: tx("Levels, grades and findings are computed, not generated: they can be audited and reproduced."),
  },
  {
    id: 3,
    stage: "report",
    name: tx("Report"),
    title: tx("The format a researcher already reads"),
    pitch: (c: TourContext) =>
      t("An abstract, key findings, numbered figures and tables, methods and references, read in layers from the top down.") +
      (c.baseLabel ? ` ${t("The tour opens it first on a familiar setting, “{0}”: {1}", c.baseLabel, c.baseBlurb)}` : ""),
    target: ".page .top",
    click: (c: TourContext) => preset(c.baseId),
    takeaway: tx("There is no new interface to learn: it reads like a paper, from the key findings down."),
  },
  {
    id: 4,
    stage: "report",
    name: tx("Scenario"),
    title: tx("Load the case, and the whole report is recomputed"),
    pitch: (c: TourContext) =>
      t(
        "The tour has loaded “{0}”, and every level, figure and finding has been recomputed in the browser: {1}. Panel a shows why: each value against the range that the comparable tests cover.",
        c.presetLabel,
        c.levels,
      ),
    target: ".page figure.ga .ga-a",
    click: (c: TourContext) => preset(c.presetId),
    takeaway: tx("Prometeo does not predict outcomes: it states what the record supports and what it does not."),
  },
  {
    id: 5,
    stage: "report",
    name: tx("Sources"),
    title: tx("Every number leads back to its source"),
    pitch: (c: TourContext) =>
      t(
        "The tour has opened the record behind the level of {0}: the file, the row, the original value and unit, the conversion applied, the DOI and the SHA-256 of the table. Any underlined value in the report opens its record the same way.",
        c.firstVar,
      ),
    target: ".prov",
    click: ".page figure.ga .src",
    leave: ".prov header button",
    takeaway: tx("Nothing appears without a source: any number can be checked in one click."),
  },
  {
    id: 6,
    stage: "report",
    name: tx("Question"),
    title: tx("Ask in plain language; the engine still decides"),
    pitch: (c: TourContext) =>
      t(
        "The tour has typed a suggested question: “{0}”. Apply question sends it to the model live. The model only turns the words into scenario values, which are validated before use; the engine recomputes the levels, and the written analysis keeps only sentences that match a computed finding, each with its sources. If the service fails, a template text is shown and labeled as such.",
        c.question,
      ),
    target: ".page .assistant-panel",
    click: ".page .assistant-panel .presets .chip",
    takeaway: tx("The AI translates and writes; it never sets a level, a grade or a finding."),
  },
  {
    id: 7,
    stage: "dossier",
    name: tx("Export"),
    title: tx("A dossier and datasets ready for review"),
    pitch: () =>
      t(
        "The report goes out as PDF or Markdown. The harmonized records go out as CSV with units, DOI and a study group for leakage-free splits, together with a datacard that lists conversions, rejected columns and what was not assessed.",
      ),
    target: ".dossier-export-bar",
    takeaway: tx("The same corpus serves a design review and a machine-learning dataset, with its provenance intact."),
  },
  {
    id: 8,
    stage: "report",
    name: tx("Any field"),
    title: tx("Nothing in the engine is written for this field"),
    pitch: () =>
      t(
        "Variables, units, partitions and level rules come from two files that describe the corpus: the evidence pack and its lens. The engine that computes levels, grades and findings contains no vocabulary of any field; an automated check enforces it, and the same engine has run unchanged on a second corpus from another field.",
      ),
    target: "#methods .side",
    click: '#methods > .fold-head',
    leave: '#methods > .fold-head[aria-expanded="true"]',
    takeaway: tx("Another field needs a new pack and lens, not a new engine."),
  },
  {
    id: 9,
    stage: "report",
    name: tx("Closing"),
    title: tx("Start from the gap"),
    pitch: () =>
      t(
        "Back to the key findings: the largest gaps come first, each with its sources. Reading dozens of papers to find a gap takes weeks; with Prometeo, a researcher starts from the gap.",
      ),
    target: ".page .keys",
    takeaway: tx("One living, verifiable paper: what has been studied, what has not, and where every number comes from."),
  },
]);

const WIDE = "(min-width: 1600px)";
const FOCUS = "data-tour-focus";

function clearFocus() {
  document.querySelectorAll(`[${FOCUS}]`).forEach((el) => el.removeAttribute(FOCUS));
}

/** Waits until `selector` matches, for up to `ms`; elements appear a frame after a change of stage. */
function waitFor(selector: string, ms: number, cancelled: () => boolean): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (cancelled()) return resolve(null);
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return resolve(el);
      if (performance.now() - start > ms) return resolve(null);
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

/**
 * Scrolls the element into the part of the window the tour panel leaves free. Fixed panels are already in view.
 * With `settle`, it only corrects a position that content loading above the element has shifted meanwhile.
 */
function reveal(el: HTMLElement, dock: HTMLElement | null, settle = false) {
  const smooth = !settle && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  if (getComputedStyle(el).position === "fixed") return;
  if (el.closest(".dossier-overlay")) {
    el.scrollIntoView({ block: settle ? "nearest" : "center", behavior });
    return;
  }
  const free = window.innerHeight - (window.matchMedia(WIDE).matches || !dock ? 0 : dock.offsetHeight);
  const r = el.getBoundingClientRect();
  const want = Math.max(24, (free - r.height) / 2);
  if (settle && Math.abs(r.top - want) < 40) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - want), behavior });
}

/**
 * Guided tour for a live presentation. It docks at the bottom of the window (on the right on wide screens) and
 * reserves that space, so the page stays visible and usable; each stop outlines the element it talks about.
 * Keys: → / PageDown next, ← / PageUp back, Esc closes, so a presentation clicker can drive it.
 */
export function JudgeTour({
  onStart,
  onNavigate,
  onDossier,
  onHold,
}: {
  /** Sets the scenario the report opens on, so the stops talk about the same case every time. */
  onStart: (scenario: Scenario) => void;
  onNavigate: (stage: Stage) => void;
  onDossier: (open: boolean) => void;
  /** Keeps the processing screen in place while its stop is shown. */
  onHold: (hold: boolean) => void;
}) {
  const { pack, lens } = useData();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const dock = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = TOUR_STEPS[idx];
  const last = TOUR_STEPS.length - 1;
  const ctx = useMemo(() => tourContext(pack, lens), [pack, lens]);

  const go = useCallback(
    (next: number) => {
      const from = TOUR_STEPS[idx];
      const to = TOUR_STEPS[next];
      if (from.leave && from.id !== to.id) document.querySelector<HTMLElement>(from.leave)?.click();
      onHold(to.stage === "processing");
      onDossier(to.stage === "dossier");
      onNavigate(to.stage === "dossier" ? "report" : to.stage);
      setIdx(next);
    },
    [idx, onDossier, onHold, onNavigate],
  );

  const start = () => {
    onStart(tourStartScenario(lens));
    setActive(true);
    setIdx(0);
    onHold(false);
    onDossier(false);
    onNavigate(TOUR_STEPS[0].stage as Stage);
  };

  const close = useCallback(() => {
    const leave = TOUR_STEPS[idx].leave;
    if (leave) document.querySelector<HTMLElement>(leave)?.click();
    setActive(false);
    onHold(false);
  }, [idx, onHold]);

  // Reserve the space of the panel on the page, and give it back on close.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.removeAttribute("data-tour");
      root.style.removeProperty("--tour-h");
      clearFocus();
      return;
    }
    root.setAttribute("data-tour", "on");
    const el = dock.current;
    if (!el) return;
    const measure = () => root.style.setProperty("--tour-h", `${el.offsetHeight}px`);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  useEffect(() => () => {
    document.documentElement.removeAttribute("data-tour");
    clearFocus();
  }, []);

  // On each stop: run its demo action, then outline and reveal what it talks about.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let settle = 0;
    const stop = () => cancelled;
    clearFocus();
    (async () => {
      const sel = typeof step.click === "function" ? step.click(ctx) : step.click;
      const control = sel ? await waitFor(sel, 3000, stop) : null;
      const on = (a: string) => control?.getAttribute(a) === "true";
      if (control && !on("aria-pressed") && !on("aria-expanded")) control.click();
      const el = await waitFor(step.target, 3000, stop);
      if (cancelled || !el) return;
      el.setAttribute(FOCUS, "");
      reveal(el, dock.current);
      settle = window.setTimeout(() => !cancelled && reveal(el, dock.current, true), 900);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [active, step, ctx]);

  // Screen readers land in the panel when it opens; later stops are announced by the live region.
  useEffect(() => {
    if (active) heading.current?.focus({ preventScroll: true });
  }, [active]);

  // Presentation clickers send PageDown / PageUp or the arrow keys.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if ((e.key === "ArrowRight" || e.key === "PageDown") && idx < last) {
        e.preventDefault();
        go(idx + 1);
      } else if ((e.key === "ArrowLeft" || e.key === "PageUp") && idx > 0) {
        e.preventDefault();
        go(idx - 1);
      } else if (e.key === "Escape" && !document.querySelector(".dossier-overlay")) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, idx, last, go, close]);

  if (!active)
    return (
      <button type="button" className="tour-launch noprint" onClick={start}>
        <span className="tour-launch-mark" aria-hidden="true">▶</span>
        <span>
          <b>{t("Guided tour")}</b> {t("· for judges")}
        </span>
      </button>
    );

  return (
    <section ref={dock} className="tour-dock noprint" aria-label={t("Guided tour of Prometeo")}>
      <div className="tour-inner">
        <header className="tour-top">
          <p className="tour-kicker">{t("Stop {0} of {1} · {2}", idx + 1, TOUR_STEPS.length, step.name)}</p>
          <button type="button" className="tour-close" onClick={close}>
            {t("Close tour")} <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="tour-main" aria-live="polite">
          <h2 className="tour-title" ref={heading} tabIndex={-1}>
            {step.title}
          </h2>
          <p className="tour-pitch">{step.pitch(ctx)}</p>
        </div>

        <div className="tour-takeaway">
          <b>{t("Why it matters")}</b>
          <p>{step.takeaway}</p>
        </div>
        <div className="tour-nav">
          <button type="button" className="tour-btn" onClick={() => go(idx - 1)} disabled={idx === 0}>
            {t("← Back")}
          </button>
          {idx < last ? (
            <button type="button" className="tour-btn primary" onClick={() => go(idx + 1)}>
              {t("Next: {0} →", TOUR_STEPS[idx + 1].name)}
            </button>
          ) : (
            <button type="button" className="tour-btn primary" onClick={close}>
              {t("Finish the tour")}
            </button>
          )}
        </div>
        <p className="tour-keys">{t("Keys: ← → or a presentation clicker; Esc closes.")}</p>
      </div>
    </section>
  );
}
