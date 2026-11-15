// Isometric illustration for a habitat preset card, with warm editorial tints and calm time-based SVG motion.
// Falls back to a clean 2D line-art icon for keys without an isometric model.
import { useMemo, useRef } from "react";
import type { Lens, Preset, Scenario } from "../engine";
import "../iso/iso.css";
import "../iso/theme-prometeo.css";
import { HABITAT_VECTORS, habitatSvg } from "../iso/habitats/build";
import { useInView, useLoop } from "../iso/react/live";

const { rise, slideX, slideY } = HABITAT_VECTORS;

function worldTranslate(dx: number, dy: number, dz: number): string {
  const tx = dx * slideX[0] + dy * slideY[0] + dz * rise[0];
  const ty = dx * slideX[1] + dy * slideY[1] + dz * rise[1];
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
}

const PART_MOTION: Record<string, (t: number) => string> = {
  dish: (t) => worldTranslate(Math.sin(t * 1.9) * 0.9, Math.cos(t * 1.9) * 0.8, 0),
  solar: (t) => worldTranslate(0, 0, (1 - Math.cos(t * 1.2)) * 0.8),
  beacon: (t) => worldTranslate(0, 0, (1 - Math.cos(t * 2.8)) * 1.5),
  flag: (t) => worldTranslate(0, Math.sin(t * 3.4) * 0.7, 0),
  // lift-off: a slow climb-and-settle with a fast engine rumble on top
  craft: (t) => worldTranslate(Math.sin(t * 23) * 0.25, 0, 2.2 + Math.sin(t * 1.3) * 2 + Math.sin(t * 17) * 0.3),
  // spacewalk: station, tether and suit drift together
  float: (t) => worldTranslate(Math.sin(t * 0.7) * 1.6, 0, Math.sin(t * 1.1) * 2.2),
  arrays: (t) => worldTranslate(0, 0, Math.sin(t * 1.4) * 0.7),
  radiators: (t) => worldTranslate(0, 0, Math.sin(t * 1.4 + 1.2) * 0.5),
  body: (t) => worldTranslate(0, 0, (1 + Math.sin(t * 4.2)) * 0.6),
  cam: (t) => worldTranslate(0, 0, (1 + Math.sin(t * 4.2)) * 0.6 + (1 - Math.cos(t * 1.2)) * 0.4),
  upper: (t) => worldTranslate(0, 0, (1 - Math.cos(t * 1.8)) * 0.5),
  "knob-0": (t) => worldTranslate(Math.sin(t * 1.6) * 9.5, 0, 0),
  "knob-1": (t) => worldTranslate(Math.sin(t * 1.6 + 2.1) * 9.5, 0, 0),
  "knob-2": (t) => worldTranslate(Math.sin(t * 1.6 + 4.2) * 9.5, 0, 0),
  "dial-0": (t) => worldTranslate(0, 0, (1 + Math.sin(t * 2.1)) * 0.5),
  "dial-1": (t) => worldTranslate(0, 0, (1 + Math.sin(t * 2.1 + 1.6)) * 0.5),
  "toggle-0": (t) => worldTranslate(0, Math.sin(t * 1.9) * 1.6, 0),
  "toggle-1": (t) => worldTranslate(0, Math.sin(t * 1.9 + Math.PI) * 1.6, 0),
};

/** Scenery loop of the driving rover: world units travelled before a group wraps, and loops per second. */
const PASS_SPAN = 300;
const PASS_SPEED = 0.11;

const FALLBACK_PATHS: Record<string, React.JSX.Element> = {
  moon_base: (
    <>
      <path d="M6 46h52" />
      <path d="M16 46a16 16 0 0 1 32 0" />
      <path d="M32 30V20M28 20h8" />
      <circle cx="50" cy="12" r="5" />
    </>
  ),
  spacecraft: (
    <>
      <path d="M10 32c8-12 28-12 44 0-16 12-36 12-44 0z" />
      <circle cx="32" cy="32" r="5" />
      <path d="M54 32h6M4 32h6" />
    </>
  ),
  station: (
    <>
      <rect x="26" y="26" width="12" height="12" />
      <path d="M6 28h16v8H6zM42 28h16v8H42zM32 26V14M32 38v12" />
    </>
  ),
  rover: (
    <>
      <rect x="12" y="24" width="40" height="14" rx="4" />
      <circle cx="20" cy="44" r="5" />
      <circle cx="44" cy="44" r="5" />
      <path d="M36 24v-8h8" />
    </>
  ),
  suit: (
    <>
      <circle cx="32" cy="16" r="9" />
      <path d="M20 28h24v18H20zM20 32l-8 10M44 32l8 10M26 46v10M38 46v10" />
    </>
  ),
  generic: (
    <>
      <circle cx="32" cy="32" r="18" />
      <path d="M14 32h36M32 14c-8 10-8 26 0 36M32 14c8 10 8 26 0 36" />
    </>
  ),
};

export function HabitatFigure({
  name,
  size = "md",
  className = "",
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const svg = useMemo(() => habitatSvg(name), [name]);
  const hostRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(hostRef);
  const clock = useRef(0);
  const speed = useRef(1);

  useLoop((dt, calm) => {
    const root = hostRef.current;
    if (!root) return false;
    clock.current += dt * speed.current;
    const t = clock.current;
    const nodes = root.querySelectorAll<SVGGElement>("[data-part]");
    nodes.forEach((node) => {
      const part = node.dataset.part;
      if (!part) return;
      if (calm) {
        node.setAttribute("transform", "translate(0 0)");
        return;
      }
      if (part.startsWith("pass-")) {
        // scenery the rover drives past: travels along -x and wraps, each group at its own phase of the loop
        const along = (t * PASS_SPEED + Number(part.slice(5))) % 1;
        node.setAttribute("transform", worldTranslate(PASS_SPAN / 2 - along * PASS_SPAN, 0, 0));
        return;
      }
      const fn = PART_MOTION[part];
      if (fn) node.setAttribute("transform", fn(t));
    });
    return !calm;
  }, Boolean(svg) && inView);

  if (!svg) {
    return (
      <svg
        viewBox="0 0 64 64"
        width="72"
        height="72"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {FALLBACK_PATHS[name] ?? FALLBACK_PATHS.generic}
      </svg>
    );
  }

  // The markup is produced by our own deterministic isometric geometry builder (no user input).
  return (
    <span
      ref={hostRef}
      className={`iso iso-prometeo habitat-fig habitat-fig--${size} ${className}`.trim()}
      onPointerEnter={() => {
        speed.current = 1.9;
      }}
      onPointerLeave={() => {
        speed.current = 1;
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Computes a visual flame intensity multiplier (0.75..1.5) from scenario O2 % and pressure. */
export function flameIntensityForScenario(s?: Scenario): number {
  if (!s || !s.values) return 1.05;
  const o2 = typeof s.values.o2 === "number" ? s.values.o2 : 21;
  const p = typeof s.values.p === "number" ? s.values.p : 1;
  const o2Factor = 0.72 + Math.min(0.68, Math.max(0, (o2 - 15) / 65));
  const pFactor = 0.88 + Math.min(0.22, Math.max(0, p * 0.16));
  return Number(Math.max(0.75, Math.min(1.52, o2Factor * pFactor)).toFixed(2));
}

const SUPPLEMENTAL_HABITATS: Preset[] = [
  {
    id: "spacecraft",
    label: "Exploration vehicle",
    blurb: "Crew transit capsule at reduced cabin pressure and elevated oxygen.",
    source: "NASA exploration atmosphere (56 kPa / 34% O₂)",
    values: { o2: 34, p: 0.56, flow: 10, g: 0, material: "PMMA" },
    active: ["o2", "p", "material"],
  },
  {
    id: "rover",
    label: "Pressurized rover",
    blurb: "Surface pressurized cabin for lunar or planetary traverses with cabin ventilation.",
    source: "NASA lunar surface pressurized rover reference",
    values: { o2: 34, p: 0.56, flow: 12, g: 0.16, material: "Nomex" },
    active: ["o2", "p", "material"],
  },
];

/** Returns the lens presets plus supplemental isometric habitats so all 5 + Custom models are available. */
export function allHabitatPresets(lens: Lens): Preset[] {
  const existing = new Set(lens.presets.map((p) => p.id));
  const extra = SUPPLEMENTAL_HABITATS.filter((p) => !existing.has(p.id));
  return [...lens.presets, ...extra];
}

export function matchingHabitatPreset(lens: Lens, s: Scenario): string {
  for (const p of allHabitatPresets(lens)) {
    if (p.active.length !== s.active.length || !p.active.every((a) => s.active.includes(a))) continue;
    if (p.active.every((a) => p.values[a] === s.values[a])) return p.id;
  }
  return "";
}

export function habitatScenario(lens: Lens, id?: string): Scenario {
  const all = allHabitatPresets(lens);
  const p = all.find((x) => x.id === (id ?? lens.default_preset)) ?? all[0];
  return { values: { ...p.values }, active: [...p.active] };
}
