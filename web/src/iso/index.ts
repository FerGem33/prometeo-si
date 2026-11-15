// Isometric figures (Anatomy kit, MIT — see ./LICENSE and ./README.md).
// Geometry: `iso.fitProjection`, `iso.slabOf`, `iso.cylinder`… (pure TS, no DOM).
export * as iso from './iso-kit';
export type { Flat, Plan, Plane, Point3, Projection, SolidPaths, Tone, LineTone, LegendKey } from './iso-kit';
// Drawing: server-safe React components.
export { Solid, Line, Wire, Dots, FaceText, IsoFigure, Plate } from './react/draw';
// Motion: "use client" hooks.
export { useReadout, useLoop, useEased, useInView, useStillness, asksForStillness, spring, follow } from './react/live';
