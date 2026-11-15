// Pure geometry (no DOM): runs on the server, the browser only receives finished SVG paths.
import { iso as k, type Plan } from './index';
import * as G from './lathe.mjs';
import { tonguePath } from './flame';
import { floorGrid } from './backdrop';

export const W = 520;
export const H = 400;
const rect = (x: number, y: number, w: number, d: number, r = 2): Plan => ({ x, y, w, d, r });

const BASE = rect(-80, -60, 160, 120, 8);
export const P = k.fitProjection(k.boxCorners(BASE, 0, 122), W, H, { pad: 22 });
const slab = (plan: Plan, z: number, h: number) => k.slabOf(plan, z, h, P, 8, Math.min(h / 3, 1));

/** Top of the housing: the sample rests here at zero lift. */
const REST = 40;
export const TRAVEL = 34;
const SAMPLE_H = 16;
const TOP = REST + SAMPLE_H;
const CAM: [number, number] = [56, -40];
const lens = G.frameOf([46, -40, 78], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);

export const ART = {
  // lab floor grid; it bleeds past the viewBox and the plate clips it
  floor: floorGrid(P, 0, 20, 520),
  base: slab(BASE, 0, 8),
  deck: slab(rect(-70, -50, 140, 100, 6), 8, 3),
  // actuator housing with its bands; the stem slides inside it, so the lifted sample never floats
  pedestal: k.cylinder(0, 0, 22, 11, REST - 11, P, 40),
  pedestalBands: [18, 33].map((z) => k.sideArc(0, 0, 22, z, P, 32)).join('') + k.knurl(0, 0, 22, 19, 32, 30, P),
  pedestalRim: k.ring(0, 0, 17, REST + 0.05, P, 36),
  stem: k.cylinder(0, 0, 4, REST - TRAVEL, TRAVEL, P, 20),
  collar: k.cylinder(0, 0, 11.5, REST, 2.4, P, 28),
  sample: k.cylinder(0, 0, 9, REST + 2.4, SAMPLE_H - 2.4, P, 28),
  sampleBand: k.sideArc(0, 0, 9, REST + 9, P, 20),
  guide: k.rise([0, 0], TOP, TOP + TRAVEL + 26, P),
  ticks: k.sideTicks(-60, 60, 10, 5, 60, 8, [2, 4], P),
  grid: k.dotGrid(-60, -42, 5, 3, 12, 11.2, P),
  label: k.topMatrix([-62, 44], 11.2, P),
  // diagnostic camera on a post, looking at the sample
  post: k.cylinder(CAM[0], CAM[1], 3.6, 11, 61, P, 20),
  postFoot: k.cylinder(CAM[0], CAM[1], 8, 11, 2.4, P, 24),
  head: slab(rect(46, -47, 20, 14, 2.5), 72, 12),
  lens: G.solidOf([[0, 4], [7, 4], [9, 5.2]], lens, P),
  lensGlass: G.circleOf(lens, 9, 3.6, P),
  sampleCenter: k.iso([0, 0, TOP + 0.5], P),
  flameRingInner: k.ring(0, 0, 9, TOP + 0.05, P, 28),
  flameRingOuter: k.ring(0, 0, 14.5, TOP + 0.05, P, 32),
  flame: {
    left: tonguePath(P, -5 * Math.SQRT1_2, 5 * Math.SQRT1_2, TOP + 2, 4.4, 14, -2.4),
    right: tonguePath(P, 5.2 * Math.SQRT1_2, -5.2 * Math.SQRT1_2, TOP + 2, 4.2, 12, 2.2),
    main: tonguePath(P, 0, 0, TOP + 1.5, 7, 22, 0.8),
    inner: tonguePath(P, 0, 0, TOP + 2, 4.2, 13.5, 0),
    core: k.iso([0, 0, TOP + 4.5], P),
    sparks: ([[-11, 14], [10, 18], [-5, 25], [4, 29]] as const).map(([u, v]) => k.iso([u * Math.SQRT1_2, -u * Math.SQRT1_2, TOP + v], P)),
  },
};

/** Screen vector for lifting one world unit along z: the client moves the sample with it. */
export const RISE = k.axisVector(P, [0, 0, 1]);
