import * as k from '../iso-kit';
import * as G from '../lathe.mjs';
import { tonguePath } from '../flame';
import * as B from '../backdrop';

export const W = 360;
export const H = 290;

export type Tint = 'solar' | 'cyan' | 'amber' | 'emerald' | 'coral' | 'violet' | 'glass';
type TagOpts = { tint?: Tint; part?: string };

type Plan = k.Plan;
const BENCH: Plan = { x: -110, y: -58, w: 220, d: 116, r: 8 };
export const P = k.fitProjection(k.boxCorners(BENCH, -11, 78), W, H, { pad: 6 });

/** Vessel axis, flame kernel height and telemetry dial position (world units). */
const CX = -8;
const CY = -4;
const FLAME_Z = 24;
const DIAL: [number, number] = [80, -14];
const DIAL_Z = 28.6;

const flameCenterPt = k.iso([CX, CY, FLAME_Z], P);

export const CHAMBER_VECTORS = {
  /** Screen-space unit vector for +1 world Z unit (vertical motion for scanner & carriage). */
  rise: k.axisVector(P, [0, 0, 1]),
  /** Rotation centre of the dial needle. The needle lives in the dial's own top-plane frame, so it is the local origin. */
  needlePivot: [0, 0] as [number, number],
  /** Projected SVG coordinates [cx, cy] of the microgravity flame kernel center. */
  flameCenter: [flameCenterPt[0], flameCenterPt[1]] as [number, number],
};

const rect = (x: number, y: number, w: number, d: number, r = 1): Plan => ({ x, y, w, d, r });
const S = (paths: k.SolidPaths, tone: k.Tone = 'mid', style: k.SolidStyle = {}) =>
  k.solidSvg(paths, { tone, ...style });
const L = (d: string, tone: k.LineTone = 'lo', style: k.LineStyle = {}) =>
  k.lineSvg(d, { tone, ...style });
const box = (
  plan: Plan,
  z: number,
  h: number,
  tone: k.Tone = 'mid',
  style: k.SolidStyle = {},
  bevel = Math.min(h / 3, 0.8),
) => S(k.slabOf(plan, z, h, P, 5, bevel), tone, style);
const post = (
  x: number,
  y: number,
  r: number,
  z: number,
  h: number,
  tone: k.Tone = 'mid',
  style: k.SolidStyle = {},
) => S(k.cylinder(x, y, r, z, h, P, r > 6 ? 40 : 20), tone, style);
const upAt = (x: number, y: number, z: number) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const seg = (a: k.Point3, b: k.Point3) => k.segment(a, b, P);
const dots = (points: k.Point3[], size = 0.6, tone: k.Tone = 'mid', pulse?: boolean) =>
  k.dotsSvg(k.pointsAt(points, P), { size, tone, pulse });

const tag = (svg: string, opts?: TagOpts) => {
  if (!opts || (!opts.tint && !opts.part)) return svg;
  const attrs = `${opts.tint ? ` data-tint="${opts.tint}"` : ''}${opts.part ? ` data-part="${opts.part}"` : ''}`;
  return `<g${attrs}>${svg}</g>`;
};

const tube = (F: G.Frame, len: number, r: number, tone: k.Tone = 'mid') => S(G.solidOf([[0, r], [len, r]], F, P), tone);
const alongX = (x: number, y: number, z: number) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
/** Part of a horizontal circle, from angle a0 to a1 (radians). */
const arc = (cx: number, cy: number, r: number, z: number, a0: number, a1: number, steps = 24) =>
  k.pathOf(k.pointsAt(Array.from({ length: steps + 1 }, (_, i): k.Point3 => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
  }), P));
const pane = (points: k.Point3[]) => `<path class="iso-pane" d="${k.pathOf(k.pointsAt(points, P), true)}"/>`;
const fmt = (n: number) => n.toFixed(1);

const tongue = (x: number, y: number, z: number, w: number, h: number, lean: number, kind: 'main' | 'side' | 'inner') =>
  `<path class="iso-flame-tongue" data-tongue="${kind}" d="${tonguePath(P, x, y, z, w, h, lean)}"/>`;

let cachedSvg: string | null = null;

/**
 * Builds the isometric microgravity combustion chamber (after the ISS CIR / BASS hardware), painted back to front:
 * gas bottles and manifold, a windowed vessel shown with its dark interior, the diagnostics ring, a camera and the
 * telemetry console. Animated parts:
 * - [data-part="carriage"]: specimen stage lifting the solid fuel sample inside the vessel
 * - [data-part="scanner"]: twin-column diagnostics ring sweeping the vessel (back arc, sliders, beam, front arc)
 * - [data-part="flame"]: flame kernel behind the window, clipped to the glass
 * - [data-part="needle"]: dial needle, rotated in the dial's own plane
 */
export function chamberSvg(): string {
  if (cachedSvg) return cachedSvg;

  const out: string[] = [];
  const add = (svg: string, opts?: TagOpts) => out.push(tag(svg, opts));

  // ── 0. Backdrop: lab floor grid (bleeds past the viewBox; the figure's container clips it) and the rack bay walls ─
  out.push(`<g class="iso-backdrop">${B.floorGrid(P, -11, 20, 640)}</g>`);
  const FLOOR = -11;
  const WALL_H = 60;
  const wallTop = FLOOR + WALL_H;
  const wallB = rect(-118, -66, 4, 94, 1); // along y, behind the gas bottles
  const wallA = rect(-118, -66, 166, 4, 1); // along x, behind the vessel
  const slot = (x: number, z: number) => pane([[x, -62, z], [x + 9, -62, z], [x + 9, -62, z + 2.2], [x, -62, z + 2.2]]);
  add(
    box(wallB, FLOOR, WALL_H, 'mid', {
      inner:
        [-40, -12].map((y) => L(seg([-114, y, FLOOR + 1], [-114, y, wallTop - 1]), 'faint')).join('') +
        L(seg([-114, -65, 32], [-114, 27, 32]), 'faint') +
        // wall gauges above the bottles and the supply rail they hang from
        L(seg([-114, -60, 24], [-114, 24, 24]), 'lo') +
        [-52, 2].map((y) => L(k.sideRing([-114, y, 39], 4.2, 'x', P), 'mid') + L(k.sideRing([-114, y, 39], 2.6, 'x', P), 'faint') + L(seg([-114, y, 39], [-114, y + 2, 41]), 'red')).join(''),
    }),
  );
  add(
    box(wallA, FLOOR, WALL_H, 'mid', {
      inner:
        [-80, -44, -8, 28].map((x) => L(seg([x, -62, FLOOR + 1], [x, -62, wallTop - 1]), 'faint')).join('') +
        L(seg([-113, -62, 32], [47, -62, 32]), 'faint') +
        [0, 1, 2].map((i) => slot(32, 37 + i * 3.6) + slot(-4, 37 + i * 3.6)).join('') +
        dots([[36, -62, 28.5], [40, -62, 28.5], [44, -62, 28.5]], 0.8, 'hi', true),
    }),
  );

  // ── 1. Bench plate, scale, feed and telemetry lines ──────────────────
  const screws = k.corners(BENCH, 10).map(([x, y]): k.Point3 => [x, y, 0.05]);
  const ruler = k.topTicks(-40, 44, 4, 4, 54, 0.05, [1.8, 3.6], P);
  add(k.corners(BENCH, 13).map(([x, y]) => post(x, y, 5.5, -11, 3, 'lo')).join(''));
  add(S(k.slabOf(BENCH, -8, 8, P, 8, 1.2), 'mid', { inner: L(k.sideSeam(BENCH, -4, P, 8), 'faint') }));
  add(
    L(k.planOutline(k.insetPlan(BENCH, 5), 0.05, P, 8), 'faint') +
      screws.map(([x, y, z]) => L(k.ring(x, y, 1.8, z, P, 16), 'lo')).join('') +
      dots(screws, 0.6, 'hi') +
      L(ruler.minor, 'lo') +
      L(ruler.major, 'mid') +
      L(k.onTop([[-72, -30], [-58, -30], [-55, -12]], 0.1, P), 'green', { flow: true }) + // N2 feed
      L(k.onTop([[-71, 16], [-58, 16], [-55, 10]], 0.1, P), 'blue', { flow: true }) + // O2 feed
      L(k.onTop([[23, -10], [56, -10]], 0.1, P), 'blue', { flow: true }) + // telemetry bus
      L(k.onTop([[23, 2], [56, 2]], 0.1, P), 'green', { flow: true }),
  );

  const plate = rect(-98, 34, 48, 13, 2);
  add(
    box(plate, 0, 1.6, 'mid', {
      inner: L(k.lineOnTop([-93, 38.5], [-56, 38.5], 1.65, P), 'green', { free: true, flow: true }) + L(k.lineOnTop([-93, 42.5], [-68, 42.5], 1.65, P), 'lo', { free: true }),
    }),
    { tint: 'solar' },
  );

  // ── 2. Gas supply: N2 and O2 bottles with regulators, mixing manifold ─
  const bottle = (x: number, y: number, r: number, h: number, tint: Tint, lit: boolean) => {
    add(
      post(x, y, r, 0, h, lit ? 'hi' : 'mid', {
        lit,
        inner: [0.3, 0.62].map((t) => L(k.sideArc(x, y, r, h * t, P, 28), 'faint')).join('') + L(k.sideArc(x, y, r, h * 0.82, P, 28), 'lo'),
      }),
      { tint },
    );
    add(post(x, y, r * 0.42, h, 5, 'mid') + post(x, y, r * 0.6, h + 5, 1.6, 'mid', { inner: L(k.knurl(x, y, r * 0.6, h + 5, h + 6.6, 14, P, 0.1), 'lo') }), { tint: 'solar' });
    add(dots([[x, y, h + 6.65]], 0.9, 'hi', true), { tint });
  };
  bottle(-84, -30, 11, 44, 'emerald', false);
  bottle(-84, 16, 12.5, 50, 'cyan', true);

  const manifold = rect(-62, -14, 14, 26, 2);
  add(
    box(manifold, 0, 11, 'mid', {
      inner: L(k.sideSeam(manifold, 5.5, P, 5), 'faint') + L(k.sideRing([-48, 5, 5.5], 2.6, 'x', P), 'mid') + L(k.sideRing([-55, 12, 5.5], 2.4, 'y', P), 'lo'),
    }) +
      post(-55, -7, 2.6, 11, 3, 'mid') +
      post(-55, 5, 2.6, 11, 3, 'mid'),
    { tint: 'solar' },
  );
  add(tube(alongX(-48, CY - 4, 4), 10, 2.2), { tint: 'solar' });

  // ── 3. Diagnostics ring, back half (passes behind the vessel) ────────
  const RING_R = 39.6;
  const scanZ = 36;
  const [colL, colR]: [number, number][] = [[CX - 28, CY + 28], [CX + 28, CY - 28]];
  add(L(arc(CX, CY, RING_R, scanZ, (3 * Math.PI) / 4, (7 * Math.PI) / 4, 30), 'mid', { className: 'iso-rail' }) + L(arc(CX, CY, RING_R, scanZ - 2, (3 * Math.PI) / 4, (7 * Math.PI) / 4, 30), 'lo'), { tint: 'coral', part: 'scanner' });

  // ── 4. The vessel: flange, lower body, windowed test section, head ───
  const VR = 26;
  const [W0, W1] = [22, 50]; // window band
  add(
    post(CX, CY, 32, 0, 6, 'mid', {
      inner: L(k.sideArc(CX, CY, 32, 3, P, 40), 'faint') + L(k.ring(CX, CY, 29, 6.05, P, 40), 'faint') +
        k.dotsSvg(Array.from({ length: 20 }, (_, i) => k.iso([CX + 29 * Math.cos((i / 20) * Math.PI * 2), CY + 29 * Math.sin((i / 20) * Math.PI * 2), 6.05], P)), { size: 0.75, tone: 'hi' }),
    }),
    { tint: 'solar' },
  );
  add(
    post(CX, CY, VR, 6, W0 - 6, 'mid', {
      inner: L(k.sideArc(CX, CY, VR, 10, P, 40), 'lo') + L(k.knurl(CX, CY, VR, 10.5, W0 - 2.5, 30, P), 'faint') + L(k.sideArc(CX, CY, VR, W0 - 2.5, P, 40), 'lo'),
    }),
    { tint: 'violet' },
  );

  // Test section seen through the glass: dark interior, far wall rim, mullions.
  const windowPaths = k.cylinder(CX, CY, VR, W0, W1 - W0, P, 40);
  add(S(windowPaths, 'mid', { inner: L(arc(CX, CY, VR - 1.5, W0 + 0.5, (3 * Math.PI) / 4, (7 * Math.PI) / 4, 30), 'faint') }), { tint: 'glass' });

  // Everything inside the vessel is clipped to the window silhouette, so it reads as behind the glass.
  const inside: string[] = [];
  inside.push(
    tag(
      tag(post(CX, CY, 7, 6, 4.5, 'mid'), { tint: 'violet' }) +
        tag(post(CX, CY, 3.2, 10.5, 6, 'hi', { lit: true }) + L(k.ring(CX, CY, 3.4, 16.5, P, 20), 'red'), { tint: 'amber' }),
      { part: 'carriage' },
    ),
  );
  const d = Math.SQRT1_2;
  const flame =
    `<g data-flame-layer="outer">${S(G.sphereOf([CX, CY, FLAME_Z], 11, P), 'hi', { lit: true, inner: L(k.ring(CX, CY, 11, FLAME_Z, P, 32), 'red') })}</g>` +
    `<g data-flame-layer="plume">` +
    tongue(CX - 5.6 * d, CY + 5.6 * d, FLAME_Z - 2, 4, 12, -2.2, 'side') +
    tongue(CX + 5.8 * d, CY - 5.8 * d, FLAME_Z - 2, 3.8, 10.5, 2, 'side') +
    tongue(CX, CY, FLAME_Z - 3, 6.4, 17, 0.8, 'main') +
    tongue(CX, CY, FLAME_Z - 2.5, 3.8, 11, 0, 'inner') +
    `</g>` +
    `<g data-flame-layer="core">${S(G.sphereOf([CX, CY, FLAME_Z - 1.5], 3.6, P), 'hi', { lit: true })}</g>` +
    `<g data-flame-layer="sparks">${dots(
      [
        [CX - 13 * d, CY + 13 * d, FLAME_Z + 6],
        [CX + 12 * d, CY - 12 * d, FLAME_Z + 8],
        [CX - 7 * d, CY + 7 * d, FLAME_Z + 13],
        [CX + 5 * d, CY - 5 * d, FLAME_Z + 15],
        [CX - 16 * d, CY + 16 * d, FLAME_Z - 2],
        [CX + 16 * d, CY - 16 * d, FLAME_Z],
      ],
      0.95,
      'hi',
      true,
    )}</g>`;
  inside.push(tag(flame, { part: 'flame' }));
  // Laser sheet between the two sliders: only the stretch behind the glass is visible.
  inside.push(tag(`<g data-tint="glass">${L(seg([colL[0], colL[1], scanZ - 1], [colR[0], colR[1], scanZ - 1]), 'red', { free: true, flow: true })}</g>`, { part: 'scanner' }));
  out.push(`<clipPath id="chamber-window"><path d="${windowPaths.fill}"/></clipPath><g clip-path="url(#chamber-window)">${inside.join('')}</g>`);

  // Mullions and reflections on the glass, in front of the flame.
  add(
    L(k.knurl(CX, CY, VR, W0, W1, 10, P, 0), 'lo') +
      `<path class="iso-glint" d="${k.segment([CX + VR * Math.cos(1.15), CY + VR * Math.sin(1.15), W0 + 5], [CX + VR * Math.cos(1.15), CY + VR * Math.sin(1.15), W1 - 6], P)}"/>` +
      `<path class="iso-glint" d="${k.segment([CX + VR * Math.cos(1.3), CY + VR * Math.sin(1.3), W0 + 9], [CX + VR * Math.cos(1.3), CY + VR * Math.sin(1.3), W1 - 12], P)}"/>`,
    { tint: 'glass' },
  );

  // Upper flange, ellipsoidal head and exhaust boss.
  add(
    post(CX, CY, VR + 1.5, W1, 5, 'mid', {
      inner: k.dotsSvg(Array.from({ length: 18 }, (_, i) => k.iso([CX + (VR + 1.5) * Math.cos((i / 18) * Math.PI * 2 + 0.2), CY + (VR + 1.5) * Math.sin((i / 18) * Math.PI * 2 + 0.2), W1 + 2.5], P)).filter((_, i) => { const a = (i / 18) * Math.PI * 2 + 0.2; return Math.cos(a) + Math.sin(a) > 0.3; }), { size: 0.75, tone: 'hi' }),
    }),
    { tint: 'solar' },
  );
  const HEAD_Z = W1 + 5;
  const HEAD_H = 15;
  const headF = upAt(CX, CY, HEAD_Z);
  const hRad = (s: number) => VR * Math.sqrt(Math.max(0, 1 - (s / HEAD_H) ** 2));
  const hSlope = (s: number) => (-VR * s) / (HEAD_H * HEAD_H * Math.max(0.05, Math.sqrt(Math.max(0, 1 - (s / HEAD_H) ** 2))));
  const hTop = HEAD_H * 0.97;
  add(
    S(G.solidOf([[0, VR], [hTop, hRad(hTop)]], headF, P, { smooth: { slope: hSlope, radius: hRad } }), 'hi', {
      lit: true,
      inner: [5, 10].map((s2) => L(G.arcOf(headF, s2, hRad(s2), P, { slope: hSlope(s2) }), 'faint')).join(''),
    }),
    { tint: 'violet' },
  );
  add(post(CX, CY, 6.5, HEAD_Z + hTop - 0.5, 5, 'mid', { inner: L(k.ring(CX, CY, 4, HEAD_Z + hTop + 4.55, P, 20), 'lo') }), { tint: 'solar' });
  add(dots([[CX, CY, HEAD_Z + hTop + 4.6]], 1.1, 'hi', true), { tint: 'coral' });

  // ── 5. Guide columns, sliders and the front half of the ring ─────────
  for (const [gx, gy] of [colL, colR]) {
    add(post(gx, gy, 5, 0, 2.4, 'mid') + post(gx, gy, 2.6, 2.4, 60, 'mid') + post(gx, gy, 3.6, 62.4, 2, 'mid'), { tint: 'solar' });
    add(box(rect(gx - 5.5, gy - 5.5, 11, 11, 2), scanZ - 4, 8, 'hi', { lit: true, inner: L(k.sideSeam(rect(gx - 5.5, gy - 5.5, 11, 11, 2), scanZ, P, 5), 'mid') }), { tint: 'coral', part: 'scanner' });
  }
  add(L(arc(CX, CY, RING_R, scanZ, -Math.PI / 4, (3 * Math.PI) / 4, 30), 'mid', { className: 'iso-rail' }) + L(arc(CX, CY, RING_R, scanZ - 2, -Math.PI / 4, (3 * Math.PI) / 4, 30), 'lo'), { tint: 'coral', part: 'scanner' });

  // ── 6. Diagnostic camera looking into the window ─────────────────────
  const cam = rect(14, 40, 16, 11, 2);
  add(box(rect(16, 41.5, 12, 8, 1.5), 0, 9, 'mid', { inner: L(k.sideSeam(rect(16, 41.5, 12, 8, 1.5), 2, P, 5), 'faint') }));
  add(S(G.solidOf([[0, 3.6], [7, 3.6], [8.5, 4.6]], G.frameOf([22, 40, 13.5], [0, -1, 0], [1, 0, 0], [0, 0, 1]), P), 'mid'), { tint: 'glass' });
  add(box(cam, 9, 9, 'mid', { inner: L(k.sideSeam(cam, 13.5, P, 5), 'faint') + pane([[17, 51, 11.5], [27, 51, 11.5], [27, 51, 16], [17, 51, 16]]) }) + dots([[27.5, 43, 18.05]], 0.9, 'hi', true), { tint: 'cyan' });

  // ── 7. Telemetry console: screen, keys, status lamps and the evidence dial ─
  const consolePlan = rect(54, -42, 50, 74, 5);
  const trace: k.Point3[] = [60, 64, 67, 70, 73, 77, 80, 84, 88, 92, 96].map((x, i) => [x, 32, 10 + [0, 0.6, 2.4, 1, 3.6, 2.2, 4.4, 3, 4.8, 4.2, 5][i]]);
  add(
    box(consolePlan, 0, 20, 'mid', {
      inner:
        L(k.sideSeam(consolePlan, 4, P, 5), 'faint') +
        L(k.planOutline(k.insetPlan(consolePlan, 4), 20.05, P, 5), 'faint') +
        pane([[58, 32, 7], [99, 32, 7], [99, 32, 17], [58, 32, 17]]) +
        `<g data-tint="glass">${L(k.pathOf(k.pointsAt(trace, P)), 'green', { free: true })}</g>` +
        [0, 1, 2].map((i) => L(seg([104, -30 + i * 6, 6], [104, -30 + i * 6, 14]), 'lo')).join(''),
    }) +
      // key grid on the deck
      [0, 1, 2].flatMap((r) => [0, 1, 2, 3].map((c) => box(rect(62 + c * 9, 12 + r * 5.4, 6.5, 3.6, 0.8), 20, 1, 'mid'))).join('') +
      dots([[62, 6, 20.1], [70, 6, 20.1], [78, 6, 20.1]], 1.1, 'hi', true),
    { tint: 'emerald' },
  );
  add(
    post(DIAL[0], DIAL[1], 17, 20, 8.5, 'hi', { lit: true, inner: L(k.sideArc(DIAL[0], DIAL[1], 17, 24, P, 28), 'faint') + L(k.ring(DIAL[0], DIAL[1], 14.5, DIAL_Z - 0.05, P, 32), 'lo') }),
    { tint: 'cyan' },
  );
  // Dial face in its own plane frame (world units, +x/+y of the bench), turned so the sweep is centred on screen-up.
  const tick = (deg: number, r0: number, r1: number) => {
    const a = (deg * Math.PI) / 180;
    return `M${fmt(Math.sin(a) * r0)} ${fmt(-Math.cos(a) * r0)}L${fmt(Math.sin(a) * r1)} ${fmt(-Math.cos(a) * r1)}`;
  };
  const sweep = Array.from({ length: 13 }, (_, i) => -80 + i * 15);
  add(
    `<g transform="${k.topMatrix(DIAL, DIAL_Z, P)}"><g transform="rotate(-50)">` +
      L(sweep.filter((a) => a < 55).map((a) => tick(a, a % 30 === 10 ? 9.2 : 10.6, 13)).join(''), 'mid', { free: true }) +
      L(sweep.filter((a) => a >= 55).map((a) => tick(a, 9.2, 13)).join(''), 'red', { free: true }) +
      tag(`<path class="iso-line iso-needle" data-tone="red" d="M0 2.5L0 -11.5"/><circle class="iso-needle-hub" cx="0" cy="0" r="1.6"/>`, { tint: 'coral', part: 'needle' }) +
      `</g></g>`,
    { tint: 'cyan' },
  );

  // ── 8. Stage-specific diagnostic overlays (0..4), toggled by the figure ─
  const fx = (n: number, tint: Tint, svg: string) => `<g class="chamber-stage-fx" data-stage-fx="${n}" data-tint="${tint}">${svg}</g>`;
  out.push(
    // 0 · load: supply bottles and manifold feeding the vessel, specimen stage highlighted
    fx(0, 'amber',
      L(k.ring(-84, -30, 15, 30, P, 28), 'green', { flow: true }) +
        L(k.ring(-84, 16, 16.5, 34, P, 28), 'blue', { flow: true }) +
        L(k.ring(CX, CY, 35.5, 6, P, 40), 'red', { flow: true }) +
        L(seg([-48, CY - 4, 12], [-36, CY - 4, 12]), 'red', { free: true, flow: true })),
    // 1 · scan: the levels the diagnostics ring sweeps
    fx(1, 'cyan',
      [W0 + 2, scanZ, W1 - 2].map((z, i) => L(k.ring(CX, CY, RING_R + 3, z, P, 40), i === 1 ? 'red' : 'blue', { flow: true })).join('')),
    // 2 · ignition: kernel envelope inside the test section
    fx(2, 'glass',
      L(k.ring(CX, CY, 14, FLAME_Z, P, 32), 'red', { flow: true }) + L(k.ring(CX, CY, 19, FLAME_Z, P, 36), 'red')),
    // 3 · telemetry: readings travel from the vessel to the dial
    fx(3, 'emerald',
      L(seg([CX + 24, CY - 6, 36], [DIAL[0] - 14, DIAL[1], DIAL_Z + 4]), 'green', { free: true, flow: true }) +
        L(seg([CX + 26, CY + 4, 14], [56, 6, 14]), 'blue', { free: true, flow: true }) +
        L(k.ring(DIAL[0], DIAL[1], 20, DIAL_Z, P, 32), 'green', { flow: true })),
    // 4 · ready: every subsystem acknowledged
    fx(4, 'emerald',
      L(k.ring(CX, CY, VR + 5, HEAD_Z, P, 36), 'green', { flow: true }) +
        L(k.ring(DIAL[0], DIAL[1], 20, DIAL_Z, P, 36), 'green', { flow: true }) +
        L(k.ring(-84, 16, 16.5, 50, P, 28), 'green', { flow: true }) +
        L(k.ring(-84, -30, 15, 44, P, 28), 'green', { flow: true })),
  );

  // ── 9. Numbered callouts, one per stage; the figure lights the active one ─
  const callout = (n: number, anchor: k.Point3, label: k.Point3) => {
    const [ax, ay] = k.iso(anchor, P);
    const [bx, by] = k.iso(label, P);
    return (
      `<g class="iso-callout" data-callout="${n}">` +
      `<path class="iso-leader" d="M${fmt(ax)} ${fmt(ay)}L${fmt(bx)} ${fmt(by)}"/>` +
      `<circle class="iso-callout-dot" cx="${fmt(ax)}" cy="${fmt(ay)}" r="1.5"/>` +
      `<circle class="iso-callout-badge" cx="${fmt(bx)}" cy="${fmt(by)}" r="5.6"/>` +
      `<text class="iso-callout-num" x="${fmt(bx)}" y="${fmt(by + 2.3)}" text-anchor="middle">${n}</text></g>`
    );
  };
  out.push(
    callout(1, [-84, 16, 58.6], [-84, 16, 75]), // gas supply and specimen load
    callout(2, [colR[0], colR[1], 64.4], [colR[0], colR[1], 77]), // diagnostics ring
    callout(3, [CX + 3, CY + 25.8, 34], [-30, 52, 8]), // kernel behind the window
    callout(4, [DIAL[0] + 10, DIAL[1] - 10, DIAL_Z], [DIAL[0] + 10, DIAL[1] - 10, 52]), // telemetry dial
  );

  cachedSvg = k.figureSvg({
    width: W,
    height: H,
    label: 'Microgravity combustion chamber in a rack bay: gas bottles and manifold, a windowed vessel with a flame kernel inside, a diagnostics ring on two columns, a camera and a telemetry console with a dial.',
    body: out,
  });
  return cachedSvg;
}
