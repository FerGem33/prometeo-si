// Isometric habitat figures for the form's habitat cards: one small model per `art` key, all on the same
// base tile, camera and scale so the six read as a set. Pure geometry (no DOM): returns an SVG string.
import * as k from '../iso-kit';
import * as G from '../lathe.mjs';
import * as B from '../backdrop';
import { tonguePath } from '../flame';

export const W = 300;
export const H = 250;

export type Tint = 'solar' | 'cyan' | 'amber' | 'emerald' | 'coral' | 'violet' | 'glass' | 'regolith' | 'mars';
type TagOpts = { tint?: Tint; part?: string };

type Plan = k.Plan;
const TILE: Plan = { x: -60, y: -60, w: 120, d: 120, r: 10 };
// Every model fills this box (tile footprint, 78 units tall) so the subject, not the base, carries the card.
// One camera and one scale for all six, so they stay the same size as a set.
export const P = k.fitProjection(k.boxCorners(TILE, -11, 78), W, H, { pad: 5 });

/** Screen-space unit vectors for world X, Y and Z so HabitatFigure can animate parts without shipping projection math. */
export const HABITAT_VECTORS = {
  rise: k.axisVector(P, [0, 0, 1]),
  slideX: k.axisVector(P, [1, 0, 0]),
  slideY: k.axisVector(P, [0, 1, 0]),
};

const rect = (x: number, y: number, w: number, d: number, r = 1): Plan => ({ x, y, w, d, r });
const S = (paths: k.SolidPaths, tone: k.Tone = 'mid', style: k.SolidStyle = {}) => k.solidSvg(paths, { tone, ...style });
const L = (d: string, tone: k.LineTone = 'lo', style: k.LineStyle = {}) => k.lineSvg(d, { tone, ...style });
const box = (plan: Plan, z: number, h: number, tone: k.Tone = 'mid', style: k.SolidStyle = {}, bevel = Math.min(h / 3, 0.8)) =>
  S(k.slabOf(plan, z, h, P, 5, bevel), tone, style);
const post = (x: number, y: number, r: number, z: number, h: number, tone: k.Tone = 'mid', style: k.SolidStyle = {}) =>
  S(k.cylinder(x, y, r, z, h, P, r > 6 ? 40 : 20), tone, style);
const upAt = (x: number, y: number, z: number) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const alongX = (x: number, y: number, z: number) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongY = (x: number, y: number, z: number) => G.frameOf([x, y, z], [0, 1, 0], [-1, 0, 0], [0, 0, 1]);
const loop = (points: k.Point3[]) => k.pathOf(k.pointsAt(points, P), true);
const seg = (a: k.Point3, b: k.Point3) => k.segment(a, b, P);
const dots = (points: k.Point3[], size = 0.5, tone: k.Tone = 'mid', pulse?: boolean) =>
  k.dotsSvg(k.pointsAt(points, P), { size, tone, pulse });
const centre = (p: Plan): [number, number] => [p.x + p.w / 2, p.y + p.d / 2];
/** A filled dark pane (window, hatch glass) on any face: a closed loop through world points. */
const pane = (points: k.Point3[]) => `<path class="iso-pane" d="${loop(points)}"/>`;
/** Rectangular pane on a +y face (y constant) or a +x face (x constant). */
const paneY = (y: number, x0: number, x1: number, z0: number, z1: number) => pane([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const paneX = (x: number, y0: number, y1: number, z0: number, z1: number) => pane([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
/** Photovoltaic panel lying flat: dark cells with a light grid. */
const pvPanel = (p: Plan, z: number, cols: number, rows: number) =>
  tag(box(p, z, 1.2, 'mid', {
    inner:
      Array.from({ length: cols - 1 }, (_, i) => L(k.lineOnTop([p.x + (p.w * (i + 1)) / cols, p.y], [p.x + (p.w * (i + 1)) / cols, p.y + p.d], z + 1.25, P), 'faint')).join('') +
      Array.from({ length: rows - 1 }, (_, i) => L(k.lineOnTop([p.x, p.y + (p.d * (i + 1)) / rows], [p.x + p.w, p.y + (p.d * (i + 1)) / rows], z + 1.25, P), 'faint')).join(''),
  }), { tint: 'glass' });

const tag = (svg: string, opts?: TagOpts) => {
  if (!opts || (!opts.tint && !opts.part)) return svg;
  const attrs = `${opts.tint ? ` data-tint="${opts.tint}"` : ''}${opts.part ? ` data-part="${opts.part}"` : ''}`;
  return `<g${attrs}>${svg}</g>`;
};

/** Painter's order: parts are drawn back to front by the depth of a reference point (plus a manual bias). */
function stage() {
  const items: { depth: number; svg: string }[] = [];
  return {
    put(at: k.Point3, svg: string, bias = 0, opts?: TagOpts) {
      items.push({ depth: k.depthOf(at, P) + bias, svg: tag(svg, opts) });
    },
    box(plan: Plan, z: number, h: number, tone: k.Tone = 'mid', style: k.SolidStyle = {}, bias = 0, opts?: TagOpts) {
      this.put([...centre(plan), z + h / 2], box(plan, z, h, tone, style), bias, opts);
    },
    post(x: number, y: number, r: number, z: number, h: number, tone: k.Tone = 'mid', style: k.SolidStyle = {}, bias = 0, opts?: TagOpts) {
      this.put([x, y, z + h / 2], post(x, y, r, z, h, tone, style), bias, opts);
    },
    done: () => items.sort((a, b) => a.depth - b.depth).map((i) => i.svg),
  };
}

/** The machined base of the console (the other models stand in their own scene instead). */
function tile(top: string[] = []): string[] {
  const screws = k.corners(TILE, 9).map(([x, y]): k.Point3 => [x, y, 0.05]);
  return [
    ...k.corners(TILE, 12).map(([x, y]) => post(x, y, 5, -11, 3, 'lo')),
    S(k.slabOf(TILE, -8, 8, P, 10, 1.2), 'lo', { halo: true, inner: L(k.sideSeam(TILE, -4, P, 10), 'faint') }),
    L(k.planOutline(k.insetPlan(TILE, 4), 0.05, P, 10), 'faint'),
    ...screws.map(([x, y, z]) => L(k.ring(x, y, 1.6, z, P, 16), 'lo')),
    dots(screws, 0.5, 'mid'),
    ...top,
  ];
}

/** Screen height of a horizon that clears the world point `far` by `lift` pixels. */
const horizon = (far: k.Point3, lift: number) => Math.round(k.iso(far, P)[1] - lift);
/** Grains and pebbles strewn over open ground (world plane z), kept on the near side of the horizon. */
function scatter(seed: number, count: number, z = 0.05) {
  let v = seed >>> 0;
  const next = () => (v = (Math.imul(v, 1664525) + 1013904223) >>> 0) / 4294967296;
  const all: k.Point3[] = [];
  while (all.length < count) {
    const [x, y] = [-150 + next() * 300, -150 + next() * 300];
    if (x + y > -100 && Math.abs(x - y) < 130) all.push([x, y, z]);
  }
  return dots(all.slice(0, count * 0.7), 0.45, 'lo') + dots(all.slice(count * 0.7), 0.8, 'mid');
}
/** A crater: dark floor, rim, and a lit inner lip on the far side. */
const crater = (x: number, y: number, r: number) =>
  `<path class="iso-crater" d="${k.ring(x, y, r, 0.05, P, 28)}"/>` + L(k.ring(x - r * 0.12, y - r * 0.12, r * 0.62, 0.05, P, 20), 'faint');

/** A suited figure for scale, facing the viewer: legs, backpack, torso, helmet with a dark visor. About 15 units tall. */
function astronaut(st: ReturnType<typeof stage>, x: number, y: number, bias = 0) {
  const d = Math.SQRT1_2;
  [-1.9, 0.9].forEach((o) => st.put([x, y, 2.5], box(rect(x - 1.5 + o * d, y - 1.5 - o * d, 3, 3, 1), 0, 5, 'mid'), bias, { tint: 'solar' }));
  st.put([x - 2, y - 2, 8], box(rect(x - 4.4, y - 4.4, 4.4, 4.4, 1), 4.6, 6.4, 'mid'), bias, { tint: 'violet' });
  st.put([x, y, 8], box(rect(x - 2.9, y - 2.9, 5.8, 5.8, 1.8), 4.8, 5.6, 'mid'), bias + 1, { tint: 'amber' });
  st.put([x, y, 13], S(G.sphereOf([x, y, 13], 3.1, P), 'hi', { lit: true }), bias + 2, { tint: 'cyan' });
  st.put([x, y, 13.4], pane(Array.from({ length: 10 }, (_, i): k.Point3 => {
    const a = (i / 10) * Math.PI * 2;
    return [x + 2.3 * d + 1.9 * Math.cos(a) * d, y + 2.3 * d - 1.9 * Math.cos(a) * d, 13.3 + 1.5 * Math.sin(a)];
  })), bias + 3);
}

/** The finished figure: a scene plate (sky, ground and whatever passes behind) with the model painted over it. */
const svgOf = (label: string, body: string[], id: string, kind: 'sky' | 'lab' | 'mars', scene: string) =>
  k.figureSvg({ width: W, height: H, label, body: [B.plate(`bd-${id}`, W, H, kind, scene), ...body] });

/* ───────────── Moon base: a pressurised dome with an airlock, a lab module, power and comms ───────────── */
function moonBase() {
  const st = stage();
  const R = 32, cx = -8, cy = -10, z0 = 5;
  const F = upAt(cx, cy, z0);
  const radius = (s: number) => Math.sqrt(Math.max(0, R * R - s * s));
  const slope = (s: number) => -s / Math.max(0.5, radius(s));
  const top = R * 0.992;

  const ground = [
    scatter(9, 110),
    crater(14, 48, 6), crater(52, 46, 4), crater(-50, -30, 5), crater(50, -6, 3.5),
    // the open plain around the base
    crater(-98, -6, 9), crater(100, -42, 7), crater(-72, 88, 10), crater(88, 78, 8), crater(124, 14, 6), crater(-124, 54, 7), crater(22, -90, 5), crater(-30, 112, 6), crater(40, 108, 5),
    L(k.onTop([[30, 30], [24, 22], [18, 14]], 0.05, P), 'green', { flow: true }), // O2 supply line from the tanks to the dome
    // boot prints from the lab hatch to the flag
    dots([[-12, 52, 0.05], [-17, 53.5, 0.05], [-22, 52.5, 0.05], [-27, 51, 0.05], [-32, 49, 0.05], [-37, 47.5, 0.05]], 0.7, 'hi'),
  ];

  // solar wall on two posts, to the left of the dome
  [10, 30].forEach((y) => st.post(-53, y, 1.3, 0, 14, 'lo'));
  st.put([-53, 20, 24], box(rect(-54.2, 4, 2.4, 32, 0.6), 13, 22, 'mid', {
    inner: [1, 2, 3].map((i) => L(seg([-51.8, 4 + i * 8, 13.4], [-51.8, 4 + i * 8, 34.6]), 'faint')).join('') + L(seg([-51.8, 4, 24], [-51.8, 36, 24]), 'faint'),
  }), 0, { tint: 'glass', part: 'solar' });

  // comms mast and dish, to the right of the dome
  st.post(38, -46, 1.3, 0, 46, 'mid');
  st.post(38, -46, 3, 0, 2, 'lo');
  st.put([38, -46, 50], S(G.disc(0, 1.8, 8.5, G.frameAlong([38, -46, 47], [0.5, 0.45, 0.74]), P), 'mid', {
    inner: L(G.circleOf(G.frameAlong([38, -46, 47], [0.5, 0.45, 0.74]), 1.8, 5, P), 'faint'),
  }), 0, { tint: 'cyan', part: 'dish' });
  st.put([39, -45.2, 52], dots([[39.4, -44.8, 49.6]], 1, 'hi', true), 0, { tint: 'emerald', part: 'dish' });

  // the dome on its foundation ring
  st.post(cx, cy, R + 5, 0, z0, 'mid', { inner: L(k.sideArc(cx, cy, R + 5, 2.5, P, 40), 'faint') + L(k.knurl(cx, cy, R + 5, 2.5, 5, 40, P), 'faint') }, 0, { tint: 'violet' });
  st.put([cx, cy, z0 + R * 0.5], S(G.solidOf([[0, R], [top, radius(top)]], F, P, { smooth: { slope, radius } }), 'hi', {
    lit: true,
    inner: [9, 18, 26].map((s) => L(G.arcOf(F, s, radius(s), P, { slope: slope(s) }), s === 9 ? 'lo' : 'faint')).join('') +
      k.dotsSvg(G.dotsOf(F, 4.5, radius(4.5), 18, P, { slope: slope(4.5), least: 0.2 }), { size: 1.25, tone: 'hi' }) +
      k.dotsSvg(G.dotsOf(F, 13.5, radius(13.5), 14, P, { slope: slope(13.5), least: 0.2 }), { size: 0.9, tone: 'hi', pulse: true }),
  }), 0, { tint: 'amber' });
  st.post(cx, cy, 3.6, z0 + top, 2.4, 'mid', {}, 0, { tint: 'coral', part: 'beacon' });
  st.put([cx, cy, z0 + top + 3], dots([[cx, cy, z0 + top + 2.45]], 1, 'hi', true), 0, { tint: 'coral', part: 'beacon' });

  // airlock: tunnel, lock module with hatch, step
  st.put([32, -10, 9], S(G.solidOf([[0, 7.5], [20, 7.5]], alongX(20, -10, 9), P), 'mid', {
    inner: [6, 12].map((s) => L(G.arcOf(alongX(20, -10, 9), s, 7.5, P), 'faint')).join(''),
  }), 6, { tint: 'violet' });
  const lock = rect(38, -21, 18, 22, 3);
  st.box(lock, 0, 18, 'mid', {
    inner: L(k.sideSeam(lock, 14, P, 5), 'faint') + `<g data-tint="glass">${L(k.sideRing([56, -10, 8.5], 5.6, 'x', P), 'hi')}</g>` +
      pane([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i): k.Point3 => [56, -10 + 4 * Math.cos((i / 12) * Math.PI * 2), 8.5 + 4 * Math.sin((i / 12) * Math.PI * 2)])) +
      paneY(1, 42, 52, 9, 14),
  }, 10, { tint: 'violet' });
  st.box(rect(56, -15, 4, 10, 0.6), 0, 1.6, 'lo', {}, 12);

  // lab module: a horizontal cylinder docked to the dome, with a round end hatch
  const LAB = alongY(-8, 18, 9.5);
  st.put([-8, 36, 9.5], S(G.solidOf([[0, 9], [28, 9], [31, 7]], LAB, P), 'mid', {
    inner: [7, 14, 21].map((s) => L(G.arcOf(LAB, s, 9, P), 'faint')).join('') + L(G.circleOf(LAB, 31, 4.6, P), 'lo') +
      k.dotsSvg(G.dotsOf(LAB, 10.5, 9, 9, P, { least: 0.35 }), { size: 1.1, tone: 'hi' }),
  }), 14, { tint: 'cyan' });
  [24, 42].forEach((y) => st.box(rect(-14, y, 12, 3, 0.8), 0, 2.5, 'lo', {}, 13));

  // tank farm (O2 & N2 storage)
  st.post(32, 32, 7, 0, 17, 'mid', { inner: [5.5, 11].map((z) => L(k.sideArc(32, 32, 7, z, P, 20), 'faint')).join('') }, 0, { tint: 'cyan' });
  st.post(32, 32, 2.2, 17, 2, 'lo', {}, 1, { tint: 'cyan' });
  st.post(45, 25, 5.5, 0, 12, 'mid', { inner: L(k.sideArc(45, 25, 5.5, 6, P, 20), 'faint') }, 0, { tint: 'emerald' });
  st.post(45, 25, 1.8, 12, 1.6, 'lo', {}, 1, { tint: 'emerald' });

  // rocks and a marker flag
  st.box(rect(-34, 46, 7, 6, 2.4), 0, 3, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(-26, 53, 4, 3.5, 1.4), 0, 1.8, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(28, 50, 4.5, 4, 1.6), 0, 2.2, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(-56, -8, 4, 3.5, 1.4), 0, 2, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(-88, 30, 8, 7, 2.6), 0, 3.6, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(76, 20, 6, 5, 2), 0, 2.6, 'hi', {}, 0, { tint: 'regolith' });
  st.box(rect(-10, 78, 7, 6, 2.4), 0, 3, 'hi', {}, 0, { tint: 'regolith' });
  astronaut(st, 2, 34, 20);
  st.post(-46, 44, 0.7, 0, 15, 'mid');
  st.put([-46, 47, 12], `<path class="iso-flag" d="${loop([[-46, 44.7, 15], [-46, 51.5, 13.6], [-46, 44.7, 10.4]])}"/>`, 0, { tint: 'coral', part: 'flag' });

  return svgOf('A Moon base: a pressurised dome with an airlock, a docked lab module, a solar wall, a comms mast and tanks on the lunar surface.', st.done(), 'moon', 'sky',
    B.stars(7, W, H) + B.planet('bd-earth-moon', 44, 36, 19, 'earth', -18) +
      B.ground('bd-ground-moon', W, horizon([-60, -60, 0], 14), 18, 'moon', tag(ground.join(''), { tint: 'regolith' })));
}

/* ───────────── Spacecraft: a crew capsule on its service module, lifting off from a pad ───────────── */
function spacecraft() {
  const st = stage();
  const PAD = -9; // pad deck height: the craft has already cleared it
  const padAt = k.iso([0, 0, PAD], P);
  // launch pad: deck with a blast ring, flame-trench marks and four lamps
  const pad =
    post(0, 0, 34, PAD - 3, 3, 'mid', {
      inner: L(k.sideArc(0, 0, 34, PAD - 1.5, P, 40), 'faint') + L(k.ring(0, 0, 29, PAD + 0.05, P, 40), 'lo') + L(k.ring(0, 0, 13, PAD + 0.05, P, 28), 'red') +
        [0, 1, 2, 3].map((i) => { const a = Math.PI / 4 + (i * Math.PI) / 2; return L(k.lineOnTop([16 * Math.cos(a), 16 * Math.sin(a)], [27 * Math.cos(a), 27 * Math.sin(a)], PAD + 0.05, P), 'lo'); }).join(''),
    }) +
    dots([0, 1, 2, 3].map((i): k.Point3 => [31 * Math.cos((i * Math.PI) / 2), 31 * Math.sin((i * Math.PI) / 2), PAD + 0.05]), 1, 'hi', true);
  const scene =
    B.stars(23, W, H) + B.planet('bd-moon-craft', 252, 40, 16, 'moon', 20) +
    B.ground('bd-ground-craft', W, horizon([-46, -46, PAD], 12), 16, 'pad', scatter(5, 60, PAD - 3)) +
    pad +
    B.smoke(3, padAt[0], padAt[1] - 4, 26, 6);
  // exhaust: three tongues pointing down from the bell to the pad, and the streaks of air rushing past
  const down = (x: number, y: number, w: number, h: number, lean: number, kind: string) =>
    `<path class="iso-flame-tongue" data-tongue="${kind}" data-down="" d="${tonguePath(P, x, y, 13, w, -h, lean)}"/>`;
  const d = Math.SQRT1_2;
  const exhaust = tag(
    down(-5 * d, 5 * d, 5.4, 18, -3.2, 'side') + down(5.2 * d, -5.2 * d, 5.2, 17, 3, 'side') + down(0, 0, 9, 25, 0, 'main') + down(0, 0, 5, 16, 0, 'inner'),
    { part: 'craft' },
  );
  const streaks = ([[-44, 30, 56, 34], [50, -26, 60, 36], [36, 34, 30, 12], [-56, 4, 26, 8]] as const)
    .map(([x, y, z0, z1]) => L(seg([x, y, z0], [x, y, z1]), 'faint', { free: true, flow: true })).join('');
  // smoke rolls out to both sides of the pad, in front of it, leaving the flame in view
  const front = B.smoke(8, padAt[0] - 50, padAt[1] + 10, 26, 7) + B.smoke(12, padAt[0] + 52, padAt[1] + 8, 24, 7);

  // engine bell
  st.put([0, 0, 16], S(G.solidOf([[0, 10.5], [3, 9.4], [8, 6]], upAt(0, 0, 12.4), P), 'mid', {
    inner: L(G.arcOf(upAt(0, 0, 12.4), 3, 9.4, P), 'faint'),
  }), 0, { tint: 'coral', part: 'craft' });

  // service module with ribs, bands, thruster quads and two solar wings
  const wing = (x: number, bias: number) => st.put([x + 18, 0, 31], pvPanel(rect(x, -10, 36, 20, 1), 30.4, 6, 2), bias, { part: 'craft' });
  const boom = (x: number, bias: number) => st.put([x + 3, 0, 31], box(rect(x, -1.4, 6, 2.8, 0.5), 30, 2, 'lo'), bias, { tint: 'cyan', part: 'craft' });
  wing(-60, -30);
  boom(-25, -20);
  st.post(0, 0, 20, 20.4, 22, 'mid', {
    inner: [27, 39].map((z) => L(k.sideArc(0, 0, 20, z, P, 40), 'lo')).join('') + L(k.knurl(0, 0, 20, 27.6, 38.4, 38, P), 'faint'),
  }, 0, { tint: 'violet', part: 'craft' });
  st.put([14.4, 14.4, 33], box(rect(12.4, 12.4, 4, 4, 0.8), 30, 6, 'mid'), 30, { tint: 'coral', part: 'craft' });
  boom(19, 40);
  wing(24, 60);
  st.post(0, 0, 21.6, 42.4, 2.2, 'lo', {}, 70, { tint: 'coral', part: 'craft' });

  // the capsule: heat shield lip, cone with windows, docking tunnel
  const F = upAt(0, 0, 44.6);
  const cone = (s: number) => 23 - (s - 4.5) * (13.5 / 22);
  st.put([0, 0, 60], S(G.solidOf([[0, 21.6], [1.8, 23.6], [4.5, 23], [26.5, 9.5], [29.4, 9.5]], F, P), 'hi', {
    lit: true,
    inner: L(G.arcOf(F, 9, cone(9), P, { slope: -13.5 / 22 }), 'faint') + L(G.arcOf(F, 22, cone(22), P, { slope: -13.5 / 22 }), 'lo') +
      k.dotsSvg(G.dotsOf(F, 15.5, cone(15.5), 8, P, { slope: -13.5 / 22, least: 0.25 }), { size: 2, tone: 'hi' }) +
      k.dotsSvg(G.dotsOf(F, 6.5, cone(6.5), 20, P, { slope: -13.5 / 22, least: 0.25 }), { size: 0.7, tone: 'mid', pulse: true }),
  }), 80, { tint: 'amber', part: 'craft' });
  st.post(0, 0, 6.8, 74, 2.6, 'mid', { inner: `<g data-tint="glass">${S(k.cylinder(0, 0, 4.2, 76.6, 0.1, P, 24), 'mid', { flat: true })}</g>` + L(k.ring(0, 0, 4.2, 76.65, P, 24), 'hi') }, 120, { tint: 'cyan', part: 'craft' });

  return svgOf('A crewed spacecraft lifting off from its pad: a conical capsule on a ribbed service module with two solar wings, engine exhaust and smoke below.',
    [streaks, exhaust, ...st.done(), front], 'craft', 'sky', scene);
}

/* ───────────── Space station: a node with four modules, a truss and solar arrays, in orbit ───────────── */
function station() {
  const st = stage();
  const Z = 37;

  const module = (F: G.Frame, profile: G.Knot[], at: k.Point3, len: number, r: number, bias = 0, tint: Tint = 'violet') =>
    st.put(at, S(G.solidOf(profile, F, P), 'mid', {
      inner: [0.2, 0.5, 0.8].map((t) => L(G.arcOf(F, len * t, r, P), t === 0.5 ? 'lo' : 'faint')).join('') +
        k.dotsSvg(G.dotsOf(F, len * 0.35, r, 10, P, { least: 0.3 }), { size: 1.15, tone: 'hi' }) +
        k.dotsSvg(G.dotsOf(F, len * 0.65, r, 10, P, { least: 0.3, phase: 0.3 }), { size: 0.8, tone: 'hi', pulse: true }),
    }), bias, { tint });

  module(alongY(0, -54, Z), [[0, 6.5], [3, 9.5], [38, 9.5], [41, 8.5]], [0, -32, Z], 41, 9.5, -6, 'cyan');
  module(alongX(-58, 0, Z), [[0, 7.5], [3, 11], [42, 11], [45, 9.5]], [-34, 0, Z], 45, 11, -6, 'violet');
  st.put([-58, 0, Z], L(G.circleOf(alongX(-58, 0, Z), 0, 4.2, P), 'green'), -4);
  st.put([0, 0, Z], S(G.sphereOf([0, 0, Z], 13.5, P), 'hi', { lit: true }), 0, { tint: 'amber' });
  module(alongX(13, 0, Z), [[0, 9.5], [2, 11], [38, 11], [43, 7.5]], [32, 0, Z], 43, 11, 6, 'violet');
  module(alongY(0, 13, Z), [[0, 8.5], [2, 10], [30, 10], [35, 6.5]], [0, 30, Z], 35, 10, 6, 'emerald');
  st.put([0, 48, Z], L(G.circleOf(alongY(0, 48, Z), 0, 3.8, P), 'green'), 8);

  // mast, truss, four solar arrays and two radiators
  st.put([0, 0, 55], box(rect(-2, -2, 4, 4, 0.6), 50, 10, 'lo'), 4);
  const array = (x: number, y: number, bias: number) => st.put([x + 9, y + 13.5, 62], pvPanel(rect(x, y, 18, 27, 0.8), 61, 2, 5), bias, { part: 'arrays' });
  const radiator = (x: number, y: number, bias: number) => {
    const p = rect(x, y, 9, 18, 0.8);
    st.put([x + 4.5, y + 9, 62], box(p, 61, 1.1, 'mid', {
      inner: [1, 2, 3, 4].map((i) => L(k.lineOnTop([x, y + (18 * i) / 5], [x + 9, y + (18 * i) / 5], 62.15, P), 'faint')).join(''),
    }), bias, { tint: 'cyan', part: 'radiators' });
  };
  array(-59, -31, 2);
  array(41, -31, 2);
  radiator(-30, -21, 2);
  const truss = rect(-59, -2, 118, 4, 0.6);
  st.put([0, 0, 61.5], box(truss, 60, 3.2, 'mid', {
    inner: L(k.sideSeam(truss, 61.6, P, 5), 'faint') + Array.from({ length: 13 }, (_, i) => L(k.lineOnTop([-54 + i * 9, -2], [-54 + i * 9, 2], 63.25, P), 'faint')).join(''),
  }), 10);
  array(-59, 4, 14);
  array(41, 4, 14);
  radiator(21, 3, 14);
  st.post(0, 0, 1.1, 63.2, 9, 'mid', {}, 20, { tint: 'coral', part: 'beacon' });
  st.put([0, 0, 74], dots([[0, 0, 72.3]], 1, 'hi', true), 22, { tint: 'coral', part: 'beacon' });

  // lowered to the middle of the plate now that no stand holds it up; asteroids drift between it and the planet
  return svgOf('A space station in orbit: a central node with four cylindrical modules, a truss carrying four solar arrays and two radiators, above a planet, with asteroids drifting behind.',
    [`<g transform="${k.translateAlong(P, [0, 0, -12])}">${st.done().join('')}</g>`], 'station', 'sky',
    B.stars(31, W, H, 40) + B.planet('bd-earth-station', 64, 334, 204, 'earth', 38) + B.asteroids(17, W, H, 5));
}

/* ───────────── Pressurised rover: a cabin on six wheels, driving across Mars ───────────── */
function rover() {
  const st = stage();
  // Scenery scrolls past along -x (the rover drives toward +x). `pass-<phase>` groups are moved by HabitatFigure and wrap around.
  const passing = (phase: number, svg: string) => `<g data-part="pass-${phase}">${svg}</g>`;
  const rock = (x: number, y: number, w: number, h: number) => box(rect(x - w / 2, y - w / 2, w, w * 0.85, w * 0.3), 0, h, 'hi');
  const ground = [
    scatter(11, 90),
    // wheel tracks streaming away behind the rover
    ...[-19.5, 19.5].flatMap((y) => [-3, 3].map((o) => L(k.lineOnTop([-46, y + o], [-170, y + o], 0.05, P), 'lo', { flow: true }))),
    passing(0.15, crater(-20, -62, 6) + rock(-4, -50, 6, 3.2)),
    passing(0.4, crater(30, 70, 5) + rock(52, 56, 5, 2.6)),
    passing(0.65, rock(-30, -44, 8, 4.4) + rock(-18, -52, 4, 2)),
    passing(0.85, crater(-6, 84, 7) + rock(16, 40, 4.5, 2.4)),
  ];
  const HZN = horizon([-60, -60, 0], 14);
  const hz = (x: number) => B.horizonAt(W, HZN, 18, x);
  const mesa = (x0: number, x1: number, h: number) =>
    `<path class="iso-mesa" d="M${x0} ${(hz(x0) + 6).toFixed(1)}L${x0 + 9} ${(hz(x0 + 9) - h * 0.8).toFixed(1)}L${x0 + 18} ${(hz(x0 + 18) - h).toFixed(1)}L${x1 - 14} ${(hz(x1 - 14) - h * 0.94).toFixed(1)}L${x1 - 6} ${(hz(x1 - 6) - h * 0.5).toFixed(1)}L${x1} ${(hz(x1) + 6).toFixed(1)}Z"/>`;
  const scene =
    B.stars(11, W, H, 18) +
    `<circle class="iso-moonlet" cx="236" cy="34" r="5.5"/><circle class="iso-moonlet" cx="262" cy="52" r="2.6"/>` +
    mesa(22, 96, 17) + mesa(84, 128, 9) + mesa(188, 270, 12) +
    B.ground('bd-ground-rover', W, HZN, 18, 'mars', tag(ground.join(''), { tint: 'mars' }));
  const WR = 10.5;
  const wheel = (x: number, y: number, outer: boolean) => {
    const F = alongY(x, y, WR);
    st.put([x, y + 3.5, WR], S(G.disc(0, 7, WR, F, P), 'mid', {
      inner: [1.75, 3.5, 5.25].map((s) => L(G.arcOf(F, s, WR, P), 'faint')).join('') +
        // spokes live in the wheel's own face plane, so a plain rotation there is a true roll
        (outer
          ? L(G.circleOf(F, 7, 7.4, P), 'mid') +
            `<g transform="${k.sideMatrix([x, y + 7], WR, P, 'left')}"><g class="iso-wheel-spin">` +
            L(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `M${(Math.cos(a) * 2.8).toFixed(2)} ${(Math.sin(a) * 2.8).toFixed(2)}L${(Math.cos(a) * 7.4).toFixed(2)} ${(Math.sin(a) * 7.4).toFixed(2)}`; }).join(''), 'lo') +
            `</g></g>` + L(G.circleOf(F, 7, 2.8, P), 'mid')
          : ''),
    }), outer ? 8 : -8, { tint: 'violet' });
  };
  [-30, 0, 30].forEach((x) => wheel(x, -23, false));

  const chassis = rect(-43, -15, 86, 30, 3);
  st.box(chassis, 10, 6, 'mid', { inner: L(k.sideSeam(chassis, 13, P, 5), 'faint') }, 0, { tint: 'violet', part: 'body' });
  // life-support pack at the rear, with radiator fins
  st.box(rect(-43, -12, 11, 24, 1.5), 16, 15, 'mid', {
    inner: [0, 1, 2, 3].map((i) => L(seg([-41 + i * 2.4, 12, 18], [-41 + i * 2.4, 12, 29]), 'lo')).join(''),
  }, 0, { tint: 'cyan', part: 'body' });
  // the pressurised cabin: band, hatch, side windows and windshield
  const cabin = rect(-31, -14, 68, 28, 8);
  st.box(cabin, 16, 27, 'hi', {
    lit: true,
    inner: L(k.sideSeam(cabin, 22, P, 5), 'faint') +
      L(k.sideRing([-19, 14, 30], 6.4, 'y', P), 'mid') + L(k.sideRing([-19, 14, 30], 4.4, 'y', P), 'lo') +
      paneY(14, -8, 4, 27.5, 37.5) + paneY(14, 7, 19, 27.5, 37.5) +
      paneX(37, -9, -0.8, 27.5, 38) + paneX(37, 0.8, 9, 27.5, 38),
  }, 0, { tint: 'amber', part: 'body' });
  // nose: bumper bar with two lamps
  st.box(rect(43, -13, 3, 26, 1), 11, 4, 'mid', {}, 4, { tint: 'emerald', part: 'body' });
  st.put([46.5, 0, 16], dots([[46.05, -8, 13], [46.05, 8, 13]], 1.3, 'hi', true), 6, { tint: 'emerald', part: 'body' });
  // roof: solar panel, comms mast with dish, camera mast
  st.put([-10, 0, 44], pvPanel(rect(-27, -10, 34, 20, 1), 43, 4, 2), 6, { part: 'body' });
  st.post(14, -7, 1.2, 43, 20, 'mid', {}, 8, { part: 'body' });
  st.put([14, -7, 66], S(G.disc(0, 1.6, 7.5, G.frameAlong([14, -7, 63.5], [0.5, 0.45, 0.74]), P), 'mid', {
    inner: L(G.circleOf(G.frameAlong([14, -7, 63.5], [0.5, 0.45, 0.74]), 1.6, 4.4, P), 'faint'),
  }), 10, { tint: 'cyan', part: 'body' });
  st.post(26, 8, 1.2, 43, 9, 'mid', {}, 8, { part: 'body' });
  st.put([26, 8, 54], box(rect(23.4, 5.4, 6, 5, 1), 52, 4, 'mid', { inner: paneX(29.4, 6.6, 9.2, 53, 55.2) }), 10, { tint: 'coral', part: 'cam' });

  [-30, 0, 30].forEach((x) => wheel(x, 16, true));
  // dust kicked up behind the rear wheels
  st.put([-46, 20, 1], dots([[-45, 22, 1.5], [-49, 18, 2.6], [-53, 21, 1.2], [-47, -20, 1.5], [-52, -18, 2.4]], 1.1, 'hi', true), 0, { tint: 'mars' });

  // the astronaut the rover drives past, in the near lane; it leaves on the left and comes back in on the right
  const walker = stage();
  astronaut(walker, 20, 44);

  return svgOf('A pressurised rover driving across a Mars-like plain: a rounded cabin with windows and a hatch on six turning wheels, passing an astronaut and rocks.',
    // clipped to the plate, so it slips out of frame instead of walking over the page
    [...st.done(), `<g clip-path="url(#bd-rover)">${passing(0, walker.done().join(''))}</g>`], 'rover', 'mars', scene);
}

/* ───────────── Spacesuit: on a spacewalk, tethered to a small station ───────────── */
function suit() {
  const st = stage();
  // a small station in the distance, up and to the left: node, three modules, a truss with two arrays
  const far = stage();
  const [sx, sy, sz] = [-50, 20, 56];
  const hull = (F: G.Frame, len: number, at: k.Point3, tint: Tint) =>
    far.put(at, S(G.solidOf([[0, 2.8], [1.4, 4], [len - 1.4, 4], [len, 3]], F, P), 'mid', { inner: L(G.arcOf(F, len / 2, 4, P), 'faint') }), 0, { tint });
  hull(alongX(sx - 19, sy, sz), 14, [sx - 12, sy, sz], 'violet');
  far.put([sx, sy, sz], S(G.sphereOf([sx, sy, sz], 5.2, P), 'hi', { lit: true }), 0, { tint: 'amber' });
  hull(alongX(sx + 5, sy, sz), 13, [sx + 11, sy, sz], 'violet');
  hull(alongY(sx, sy + 5, sz), 11, [sx, sy + 10, sz], 'emerald');
  far.put([sx, sy, sz + 7], box(rect(sx - 1, sy - 1, 2, 2, 0.4), sz + 5, 4, 'lo'), 2);
  far.put([sx - 21, sy, sz + 9.6], pvPanel(rect(sx - 26, sy - 9, 9, 18, 0.6), sz + 9, 1, 4), 3);
  far.put([sx, sy, sz + 9.4], box(rect(sx - 26, sy - 1, 52, 2, 0.4), sz + 8.6, 1.4, 'mid'), 4);
  far.put([sx + 21, sy, sz + 9.6], pvPanel(rect(sx + 17, sy - 9, 9, 18, 0.6), sz + 9, 1, 4), 5);
  // the tether: from the station's near hatch, sagging, to the back of the life-support pack
  const [t0, t1, t2] = [k.iso([sx, sy + 16, sz], P), k.iso([sx + 6, sy + 22, sz - 30], P), k.iso([-23, 2, 44], P)];
  const tether =
    `<path class="iso-tether" d="M${t0[0].toFixed(1)} ${t0[1].toFixed(1)}Q${t1[0].toFixed(1)} ${t1[1].toFixed(1)} ${t2[0].toFixed(1)} ${t2[1].toFixed(1)}"/>` +
    dots([[sx, sy + 16, sz], [-23, 2, 44]], 1.2, 'hi');

  const leg = (y: number, bias: number) => {
    st.box(rect(-6.5, y - 5.8, 19, 11.6, 4), 2.4, 6, 'mid', {}, bias, { tint: 'solar' });
    st.post(0, y, 5.6, 8.4, 20, 'mid', { inner: [16, 18.4].map((z) => L(k.sideArc(0, y, 5.6, z, P, 20), 'lo')).join('') + L(k.sideArc(0, y, 5.6, 24, P, 20), 'faint') }, bias, { tint: 'amber' });
  };
  const arm = (y: number, bias: number) => {
    st.put([0, y, 29], S(G.sphereOf([0, y, 29.5], 4.6, P), 'mid'), bias, { tint: 'coral', part: 'upper' });
    st.post(0, y, 4.4, 31.5, 18, 'mid', { inner: L(k.sideArc(0, y, 4.4, 40.5, P, 20), 'faint') + L(k.sideArc(0, y, 4.4, 34, P, 20), 'lo') }, bias, { tint: 'amber', part: 'upper' });
    st.put([0, y, 50], S(G.sphereOf([0, y, 50], 5.8, P), 'mid'), bias + 1, { tint: 'coral', part: 'upper' });
  };

  // life-support backpack with antenna
  const pack = rect(-23, -14, 13, 28, 3);
  st.box(pack, 29, 30, 'mid', { inner: L(k.sideSeam(pack, 44, P, 5), 'faint') + L(k.sideSeam(pack, 52, P, 5), 'faint') }, -8, { tint: 'violet', part: 'upper' });
  st.post(-17, -9, 0.7, 59, 10, 'mid', {}, -6, { tint: 'emerald', part: 'upper' });
  st.put([-17, -9, 70], dots([[-17, -9, 69.3]], 0.9, 'hi', true), -5, { tint: 'coral', part: 'upper' });
  leg(-8.2, -4);
  arm(-21.5, -6);
  leg(8.2, 2);
  const hip = rect(-8.5, -15.5, 17, 31, 6);
  st.box(hip, 27, 7.5, 'mid', { inner: L(k.sideSeam(hip, 31, P, 5), 'lo') }, 4, { tint: 'violet', part: 'upper' });
  const torso = rect(-10, -17, 20, 34, 7.5);
  st.box(torso, 34.5, 19.5, 'mid', { inner: L(k.sideSeam(torso, 48, P, 5), 'faint') }, 6, { tint: 'amber', part: 'upper' });
  // chest control unit with three switches
  st.box(rect(10, -7, 3.6, 14, 1), 39.5, 9, 'lo', { inner: paneX(13.6, -5, 5, 44.5, 47) }, 9, { tint: 'cyan', part: 'upper' });
  st.put([14, 0, 44], dots([[13.65, -3.6, 42], [13.65, 0, 42], [13.65, 3.6, 42]], 0.85, 'hi', true), 11, { tint: 'emerald', part: 'upper' });
  arm(21.5, 10);
  st.post(0, 0, 9.4, 54, 2.6, 'lo', {}, 12, { tint: 'coral', part: 'upper' });
  // the helmet and its dark visor, facing +x
  const HR = 11.5, HZ = 66.5;
  st.put([0, 0, HZ], S(G.sphereOf([0, 0, HZ], HR, P), 'hi', { lit: true }), 14, { tint: 'cyan', part: 'upper' });
  const V = alongX(0, 0, HZ);
  const VR = HR + 0.25;
  const vRad = (s: number) => Math.sqrt(Math.max(0, VR * VR - s * s));
  const vSlope = (s: number) => -s / Math.max(0.5, vRad(s));
  st.put([0, 0, HZ], S(G.solidOf([[3.6, vRad(3.6)], [VR * 0.99, vRad(VR * 0.99)]], V, P, { smooth: { slope: vSlope, radius: vRad } }), 'hi', {
    inner: `<path class="iso-glint" d="${G.arcOf(V, 7.4, vRad(7.4), P, { slope: vSlope(7.4), from: 0.5, to: 1.6 })}"/>`,
  }), 16, { tint: 'glass', part: 'upper' });

  // station, tether and suit drift as one body, so the tether never slips
  return svgOf('A spacesuit on a spacewalk above a planet, tethered to a small space station: helmet with visor, life-support backpack, chest control unit, gloves and boots.',
    [`<g data-part="float">${far.done().join('')}${tether}${st.done().join('')}</g>`], 'suit', 'sky',
    B.stars(43, W, H) + B.planet('bd-earth-suit', 236, 262, 104, 'earth', -28));
}

/* ───────────── Custom: a control console where every value is set by hand ───────────── */
function custom() {
  const st = stage();
  const body = rect(-52, -37, 104, 74, 6);
  const Z = 17;
  const rows = [-21, -5, 11];
  const knobs = [-8, -26, 4]; // slider positions along x
  const knobTints: Tint[] = ['cyan', 'amber', 'emerald'];
  const deck = [
    L(k.planOutline(k.insetPlan(body, 4), Z + 0.05, P, 6), 'faint'),
    ...rows.flatMap((y, i) => {
      const t = k.topTicks(-42, 16, 4, 4, y + 5, Z + 0.05, [1.4, 2.8], P);
      return [tag(box(rect(-44, y - 1.5, 62, 3, 1.5), Z, 0.5, 'mid', { flat: true }), { tint: 'glass' }), L(t.minor, 'lo'), L(t.major, i === 1 ? 'hi' : 'mid')];
    }),
    // small display with three rule lines
    tag(box(rect(20, 14, 28, 15, 1.5), Z, 0.8, 'mid') +
      [0, 1, 2].map((i) => L(k.lineOnTop([23.5, 18 + i * 3.6], [i === 1 ? 34 : 44, 18 + i * 3.6], Z + 0.85, P), i === 0 ? 'green' : 'lo', { free: true, flow: i === 0 })).join(''), { tint: 'glass' }),
    dots(k.corners(body, 7).map(([x, y]): k.Point3 => [x, y, Z + 0.05]), 0.7, 'hi'),
  ];

  st.put([0, 0, Z / 2], S(k.slabOf(body, 0, Z, P, 6, 1), 'mid', {
    inner: L(k.sideSeam(body, 5, P, 6), 'faint') + L(k.sideSeam(body, 13, P, 6), 'faint') +
      L(k.sideRing([-30, 37, 9], 2.8, 'y', P), 'mid') + L(k.sideRing([-20, 37, 9], 2.8, 'y', P), 'mid') +
      paneY(37, 8, 36, 6.5, 11.5) +
      paneX(52, -16, 16, 6, 12) + [0, 1, 2].map((i) => L(seg([52, -8 + i * 8, 6], [52, -8 + i * 8, 12]), 'lo')).join(''),
  }) + deck.join(''), -40, { tint: 'violet' });

  rows.forEach((y, i) => st.box(rect(knobs[i] - 3.5, y - 5.2, 7, 10.4, 1.6), Z + 0.5, 7, i === 1 ? 'hi' : 'mid', { lit: i === 1, inner: L(k.lineOnTop([knobs[i], y - 3.6], [knobs[i], y + 3.6], Z + 7.55, P), 'mid') }, i * 2, { tint: knobTints[i], part: `knob-${i}` }));
  // two knurled dials with tick rings and pointers
  const dialTints: Tint[] = ['solar', 'cyan'];
  [[34, -20, 10], [36, 2, 6.5]].forEach(([x, y, r], i) => {
    const t = k.radialTicks(x, y, r + 2.6, 20, 5, Z + 0.05, [1.1, 2], P);
    st.put([x, y, Z], L(t.minor, 'lo') + L(t.major, 'mid'), -30);
    st.post(x, y, r, Z, 6, 'mid', { inner: L(k.knurl(x, y, r, Z + 0.6, Z + 5.4, r > 7 ? 28 : 20, P), 'lo') }, 4 + i, { tint: dialTints[i] });
    st.put([x, y, Z + 7], L(k.ring(x, y, r - 2.4, Z + 6.05, P, 24), 'lo') + L(k.lineOnTop([x, y], [x + (r - 2.8) * 0.7, y - (r - 2.8) * 0.7], Z + 6.05, P), 'red'), 6 + i, { tint: 'coral', part: `dial-${i}` });
  });
  // two toggle switches
  [[-42, 27], [-32, 27]].forEach(([x, y], i) => {
    st.post(x, y, 2.2, Z, 1.4, 'lo', {}, 8);
    st.post(x, y, 0.9, Z + 1.4, 5, 'mid', {}, 9, { part: `toggle-${i}` });
    st.put([x, y, Z + 7.4], S(G.sphereOf([x, y, Z + 7.2], 1.9, P), 'mid'), 10, { tint: i ? 'emerald' : 'coral', part: `toggle-${i}` });
  });
  const cable = [L(k.onTop([[-25, 37], [-25, 48], [-10, 56]], 0.05, P), 'blue', { flow: true }), dots([[-10, 56, 0.05]], 1, 'hi', true)];

  return svgOf('A control console with three sliders on ruled tracks, two knurled dials, toggle switches and a small display: set your own values.', [...tile(cable), ...st.done()], 'lab', 'lab', B.floorGrid(P, -11, 12, 360));
}

const BUILDERS: Record<string, () => string> = {
  moon_base: moonBase,
  lunar_base: moonBase,
  lunar: moonBase,
  spacecraft,
  station,
  iss: station,
  rover,
  suit,
  generic: custom,
  custom,
};
const cache = new Map<string, string>();

/** The figure for an `art` key of the fixed catalogue, or null when that key has no isometric model. */
export function habitatSvg(art: string): string | null {
  const build = BUILDERS[art];
  if (!build) return null;
  if (!cache.has(art)) cache.set(art, build()); // geometry is computed once per figure
  return cache.get(art)!;
}

export const HABITAT_FIGURES = Object.keys(BUILDERS);
