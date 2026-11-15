import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Stage } from "../state";
import { useData } from "./ctx";
import { t, tx, many, lazy } from "../i18n";

/** What a stop can say about the loaded corpus. Every number comes from the pack or the lens, never from this file. */
export interface TourContext {
  tests: string;
  studies: number;
  unit: string;
  units: string;
  sources: number;
  subject: string;
  presetLabel: string;
  presetBlurb: string;
  question: string;
}

export interface TourStep {
  id: number;
  stage: Stage | "dossier";
  /** Short name in the agenda of the tour. */
  name: string;
  title: string;
  pitch: (c: TourContext) => string;
  /** The element on the page the stop talks about; it is outlined and scrolled into view. */
  target: string;
  /** What the outline marks, so the presenter can point at it. */
  look: string;
  takeaway: string;
  /** A control clicked on arrival, to show the feature working (for example a source link). */
  click?: string;
  /** A control clicked on departure, to undo `click`. */
  leave?: string;
}

export const TOUR_STEPS: TourStep[] = lazy([
  {
    id: 1,
    stage: "cover",
    name: tx("Problem"),
    title: tx("Decades of experiments, scattered across tables"),
    pitch: (c: TourContext) =>
      t(
        "The example corpus holds {0} {1} from {2} {3}, spread over {4} source tables, each with its own columns and units. Checking one new scenario against all of them means reading every paper and converting every value by hand.",
        c.tests,
        c.subject,
        c.studies,
        c.units,
        c.sources,
      ),
    target: ".cover .example",
    look: tx("The corpus behind this demo, counted from the evidence pack."),
    takeaway: tx("Prometeo turns that scattered record into one comparable, cited corpus."),
  },
  {
    id: 2,
    stage: "scenario",
    name: tx("Case"),
    title: tx("State the case in four steps"),
    pitch: (c: TourContext) =>
      t(
        "Documents to compare against, the question in plain words, a starting setting and the variables with their values. The tour has loaded the setting “{0}”: {1}",
        c.presetLabel,
        c.presetBlurb,
      ),
    target: ".step .stepper",
    look: tx("The four steps of the form."),
    takeaway: tx("Every condition that enters the comparison is explicit and editable."),
  },
  {
    id: 3,
    stage: "processing",
    name: tx("Engine"),
    title: tx("A deterministic engine computes the evidence"),
    pitch: (c: TourContext) =>
      t(
        "Values are converted to one canonical unit, tests are split into partitions that are never compared with each other, and each of the {0} {1} receives a distance in standard deviations and a grade from A to D. The same inputs always produce the same report.",
        c.studies,
        c.units,
      ),
    target: ".proc-status-col",
    look: tx("The harmonization steps run by the engine."),
    takeaway: tx("Levels, grades and findings are computed, not generated: they can be audited and reproduced."),
  },
  {
    id: 4,
    stage: "report",
    name: tx("Answer"),
    title: tx("What has been studied, condition by condition"),
    pitch: () =>
      t(
        "Each condition of the scenario receives one level: Studied, Near, not covered, Not studied or Scarce evidence, always written in words and never shown by color alone. Key findings state the largest gaps, each with its sources.",
      ),
    target: ".page .top",
    look: tx("The evidence card and the key findings."),
    takeaway: tx("Prometeo compares conditions with the record; it does not predict outcomes. A gap is reported as a gap."),
  },
  {
    id: 5,
    stage: "report",
    name: tx("Coverage"),
    title: tx("Where the evidence is, and where nobody has looked"),
    pitch: (c: TourContext) =>
      t(
        "The graphical abstract places the scenario inside the range in which each variable was tested and shows how close the nearest {0} comes. Tests that do not record a variable are kept apart; they are never given a value.",
        c.unit,
      ),
    target: ".page figure.ga",
    look: tx("The graphical abstract: tested range per variable and the scenario value."),
    takeaway: tx("Blank regions point to the experiment that would close the gap."),
  },
  {
    id: 6,
    stage: "report",
    name: tx("Sources"),
    title: tx("Every value leads back to its source"),
    pitch: () =>
      t(
        "Any underlined value opens its source: the file, the row, the original value and unit, the conversion applied, the DOI and the SHA-256 of the table. The tour has just opened one.",
      ),
    target: ".prov",
    click: ".page figure.ga .src",
    leave: ".prov header button",
    look: tx("The source panel of a value in the graphical abstract."),
    takeaway: tx("Any number in the report can be checked against the original record in one click."),
  },
  {
    id: 7,
    stage: "report",
    name: tx("Assistant"),
    title: tx("Questions in plain language, checked before they are shown"),
    pitch: (c: TourContext) =>
      t(
        "A question such as “{0}” is translated into scenario values that are validated before they are applied. The written analysis keeps only sentences that match, word for word, a finding computed by the engine, each with its sources. If the service fails, a template text is shown and labeled as such.",
        c.question,
      ),
    target: ".page .assistant-panel",
    look: tx("The questions and analysis panel."),
    takeaway: tx("The AI helps to ask and to explain; it never sets a level, a grade or a finding."),
  },
  {
    id: 8,
    stage: "dossier",
    name: tx("Export"),
    title: tx("A dossier and datasets ready for review"),
    pitch: () =>
      t(
        "The report goes out as PDF or Markdown. The harmonized records go out as CSV with units, DOI and a study group for leakage-free splits, together with a datacard that lists conversions, rejected columns and what was not assessed.",
      ),
    target: ".dossier-export-bar",
    look: tx("The dataset export of the dossier."),
    takeaway: tx("The same corpus serves a design review and a machine-learning dataset, with its provenance intact."),
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
  /** Loads the reference scenario, so the stops talk about the same case every time. */
  onStart: () => void;
  onNavigate: (stage: Stage) => void;
  onDossier: (open: boolean) => void;
  /** Keeps the processing screen in place while its stop is shown. */
  onHold: (hold: boolean) => void;
}) {
  const { pack, lens } = useData();
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [found, setFound] = useState(true);
  const dock = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = TOUR_STEPS[idx];
  const last = TOUR_STEPS.length - 1;

  const preset = lens.presets.find((p) => p.id === lens.default_preset) ?? lens.presets[0];
  const unit = lens.unit_of_study ?? "study";
  const ctx: TourContext = {
    tests: (pack.meta.stats.tests ?? pack.records.length).toLocaleString("en-US"),
    studies: pack.studies.length,
    unit,
    units: many(unit),
    sources: pack.meta.stats.sources ?? pack.sources.length,
    subject: lens.subject ?? t("tests"),
    presetLabel: preset?.label ?? "",
    presetBlurb: preset?.blurb ?? "",
    question: lens.questions?.[0] ?? "",
  };

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
    onStart();
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
    setFound(true);
    (async () => {
      if (step.click) (await waitFor(step.click, 3000, stop))?.click();
      const el = await waitFor(step.target, 3000, stop);
      if (cancelled) return;
      if (!el) return setFound(false);
      el.setAttribute(FOCUS, "");
      reveal(el, dock.current);
      settle = window.setTimeout(() => !cancelled && reveal(el, dock.current, true), 900);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [active, step]);

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
          <ol className="tour-agenda" aria-label={t("Stops of the tour")}>
            {TOUR_STEPS.map((s, i) => (
              <li key={s.id} className={i === idx ? "now" : i < idx ? "done" : ""}>
                <button type="button" onClick={() => go(i)} aria-current={i === idx ? "step" : undefined}>
                  <i>{i + 1}</i>
                  <span>{s.name}</span>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="tour-close" onClick={close}>
            {t("Close tour")} <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="tour-main" aria-live="polite">
          <p className="tour-kicker">{t("Stop {0} of {1} · {2}", idx + 1, TOUR_STEPS.length, step.name)}</p>
          <h2 className="tour-title" ref={heading} tabIndex={-1}>
            {step.title}
          </h2>
          <p className="tour-pitch">{step.pitch(ctx)}</p>
          <p className="tour-look">
            <b>{found ? t("Outlined on the page:") : t("Not on screen:")}</b> {step.look}
          </p>
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
