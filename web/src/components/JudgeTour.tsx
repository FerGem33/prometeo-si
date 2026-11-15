import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Lens, Pack, Scenario } from "../engine";
import type { Stage } from "../state";
import { useData } from "./ctx";
import { habitatScenario } from "./HabitatFigure";
import { LEVELS } from "../report/text";
import { t, tx, many, lazy } from "../i18n";

/**
 * What a stop can say about the loaded example. Counts come from the pack and settings from the lens; the text of
 * the stops stays general, because the tour presents Prometeo, not one field of research.
 */
export interface TourContext {
  studies: number;
  units: string;
  sources: number;
  /** The reference case of the lens; the tour loads it to show the report being recomputed. */
  presetId: string;
  presetLabel: string;
  /** Another setting of the lens, shown first so that loading the reference case visibly changes the report. */
  baseId: string;
  baseLabel: string;
}

/** A control: a selector, or one that depends on the settings of the lens. */
type Control = string | ((c: TourContext) => string);

export interface TourStep {
  id: number;
  stage: Stage | "dossier";
  /** Short name shown next to the number of the stop. */
  name: string;
  title: string;
  /** Two or three short sentences about what is outlined on the page, for an audience from any field. */
  pitch: (c: TourContext) => string;
  /** The element on the page the stop talks about; it is outlined and scrolled into view. */
  target: string;
  takeaway: string;
  /** A control clicked on arrival to show the feature working; a control already pressed or expanded is left as is. */
  click?: Control;
  /** A control clicked on departure, to close what `click` opened. */
  leave?: string;
}

export function tourContext(pack: Pack, lens: Lens): TourContext {
  const preset = lens.presets.find((p) => p.id === lens.default_preset) ?? lens.presets[0];
  const base = lens.presets.find((p) => p.id !== preset?.id);
  return {
    studies: pack.studies.length,
    units: many(lens.unit_of_study ?? "study"),
    sources: pack.meta.stats.sources ?? pack.sources.length,
    presetId: preset?.id ?? "",
    presetLabel: preset?.label ?? "",
    baseId: base?.id ?? "",
    baseLabel: base?.label ?? "",
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
    title: tx("Research starts by finding what is already known"),
    pitch: (c: TourContext) =>
      t(
        "Before a new experiment or design, researchers must find out what has already been tested. That evidence is scattered across papers and data tables, each with its own format and units. The example in this demo: {0} {1} and {2} data tables.",
        c.studies,
        c.units,
        c.sources,
      ),
    target: ".cover .example",
    takeaway: tx("Gathering that evidence by hand takes weeks."),
  },
  {
    id: 2,
    stage: "processing",
    name: tx("Prometeo"),
    title: tx("One verifiable paper, for any research topic"),
    pitch: () =>
      t(
        "Prometeo reads the papers and tables, converts every value to common units and calculates what has been studied and what has not. It is not tied to one field: the same steps work for any experimental topic.",
      ),
    target: ".proc-status-col",
    takeaway: tx("Results are calculated, not written by AI, so anyone can check and reproduce them."),
  },
  {
    id: 3,
    stage: "report",
    name: tx("Report"),
    title: tx("Results in the format researchers already read"),
    pitch: (c: TourContext) =>
      t("The answer is a scientific paper: abstract, key findings, figures, tables and references. The most important results come first; the details follow below.") +
      (c.baseLabel ? ` ${t("It opens on a familiar example: “{0}”.", c.baseLabel)}` : ""),
    target: ".page .top",
    click: (c: TourContext) => preset(c.baseId),
    takeaway: tx("Nothing new to learn: it reads like any paper."),
  },
  {
    id: 4,
    stage: "report",
    name: tx("Scenario"),
    title: tx("Your scenario, compared with what has been tested"),
    pitch: (c: TourContext) =>
      t(
        "The tour has switched to the example “{0}”, and the whole report updated at once. In the outlined panel, each band is the range already covered by experiments and the mark is the scenario. Inside a band: {1}. Just outside: {2}. No band: {3}.",
        c.presetLabel,
        LEVELS.studied.label,
        LEVELS.near.label,
        LEVELS.not_studied.label,
      ),
    target: ".page figure.ga .ga-a",
    click: (c: TourContext) => preset(c.presetId),
    takeaway: tx("Prometeo does not predict results: it shows what the evidence covers and where the gaps are."),
  },
  {
    id: 5,
    stage: "report",
    name: tx("Sources"),
    title: tx("Every number has a source"),
    pitch: () =>
      t(
        "Any underlined value opens its origin: the original file, the row, the value as published and the DOI of the dataset. The tour has opened one. Nothing is shown without a source.",
      ),
    target: ".prov",
    click: ".page figure.ga .src",
    leave: ".prov header button",
    takeaway: tx("Every claim can be checked in one click."),
  },
  {
    id: 6,
    stage: "report",
    name: tx("Question"),
    title: tx("Ask in plain words"),
    pitch: () =>
      t(
        "The tour has written a suggested question in the box; Apply question sends it to the AI live. The AI only turns the words into conditions. Prometeo then calculates the results, and the AI's written text is checked against the data.",
      ),
    target: ".page .assistant-panel",
    click: ".page .assistant-panel .presets .chip",
    takeaway: tx("AI helps to ask and to explain; it never decides the results."),
  },
  {
    id: 7,
    stage: "dossier",
    name: tx("Export"),
    title: tx("Take the evidence with you"),
    pitch: () =>
      t(
        "The report downloads as PDF. The data behind it downloads as a CSV file with units and a source on every row, plus a data card that explains how it was built.",
      ),
    target: ".dossier-export-bar",
    takeaway: tx("The same evidence serves a review, a proposal or a new dataset."),
  },
  {
    id: 8,
    stage: "report",
    name: tx("Any field"),
    title: tx("Works for any field of research"),
    pitch: () =>
      t(
        "Nothing in the engine of Prometeo is specific to this topic. Each field is described by its own data files; an automated test keeps the engine free of field-specific terms, and the same engine has already run on data from a second field.",
      ),
    target: "#methods .side",
    click: "#methods > .fold-head",
    leave: '#methods > .fold-head[aria-expanded="true"]',
    takeaway: tx("A new field needs new data, not new software."),
  },
  {
    id: 9,
    stage: "report",
    name: tx("Closing"),
    title: tx("Start from the gap"),
    pitch: () =>
      t(
        "The key findings put what is missing first, each with its sources. Instead of reading for weeks to find a gap, a researcher starts from it.",
      ),
    target: ".page .keys",
    takeaway: tx("One living, verifiable paper: what is known, what is not, and where each number comes from."),
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
