// Backdrops for the isometric figures: flat scene plates drawn behind the model (no gradients, no filters).
// Sky scenes are screen-space art; the lab scene is a floor grid in the figure's own projection.
import * as k from './iso-kit';

const f = (n: number) => n.toFixed(1);

/** Deterministic pseudo-random numbers in [0, 1): the same seed always paints the same sky. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** The plate itself, with a clip of the same shape for whatever is painted on it. */
export function plate(id: string, w: number, h: number, kind: 'sky' | 'lab' | 'mars', inner: string) {
  const shape = `x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="3"`;
  return `<clipPath id="${id}"><rect ${shape}/></clipPath><rect class="iso-plate-bg" data-scene="${kind}" ${shape}/><g clip-path="url(#${id})">${inner}</g><rect class="iso-plate-frame" ${shape}/>`;
}

/** Three magnitudes of stars; only the brightest twinkle. */
export function stars(seed: number, w: number, h: number, count = 46) {
  const next = random(seed);
  const all = Array.from({ length: count }, (): k.Flat => [4 + next() * (w - 8), 4 + next() * (h - 8)]);
  const [far, mid, near] = [all.slice(0, count * 0.55), all.slice(count * 0.55, count * 0.85), all.slice(count * 0.85)];
  return `<g class="iso-stars">${k.dotsSvg(far, { size: 0.45, tone: 'lo' })}${k.dotsSvg(mid, { size: 0.7, tone: 'mid' })}${k.dotsSvg(near, { size: 1, tone: 'hi', pulse: true })}</g>`;
}

/** A closed organic outline through the points: quadratic segments between successive midpoints. */
function smooth(points: k.Flat[]) {
  const n = points.length;
  const mid = (a: k.Flat, b: k.Flat): k.Flat => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(points[n - 1], points[0]);
  return `M${f(start[0])} ${f(start[1])}` + points.map((p, i) => { const m = mid(p, points[(i + 1) % n]); return `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`; }).join('') + 'Z';
}

// Surface features in units of the radius (x right, y down).
const LAND: k.Flat[][] = [
  [[-0.78, -0.3], [-0.6, -0.62], [-0.3, -0.66], [-0.05, -0.5], [0.02, -0.26], [-0.16, -0.1], [-0.2, 0.1], [-0.4, 0.2], [-0.5, 0.02], [-0.72, -0.06]],
  [[-0.22, 0.24], [0.02, 0.22], [0.16, 0.42], [0.1, 0.66], [-0.04, 0.86], [-0.2, 0.74], [-0.3, 0.5]],
  [[0.26, -0.72], [0.52, -0.7], [0.78, -0.42], [0.86, -0.14], [0.66, -0.02], [0.5, -0.2], [0.34, -0.16], [0.2, -0.4]],
  [[0.44, 0.22], [0.7, 0.16], [0.9, 0.36], [0.74, 0.6], [0.5, 0.56], [0.38, 0.4]],
  [[-0.9, 0.34], [-0.72, 0.3], [-0.6, 0.48], [-0.74, 0.62], [-0.9, 0.52]],
];
const HIGHLAND: k.Flat[][] = [
  [[-0.56, -0.44], [-0.36, -0.52], [-0.18, -0.4], [-0.26, -0.24], [-0.48, -0.26]],
  [[-0.12, 0.38], [0.04, 0.4], [0.04, 0.58], [-0.1, 0.62]],
  [[0.42, -0.56], [0.62, -0.46], [0.66, -0.26], [0.48, -0.34]],
];
const CLOUDS: [number, number, number, number][] = [
  [-0.62, -0.12, -0.16, 0.07], [0.06, -0.4, 0.72, 0.06], [-0.3, 0.12, 0.44, 0.08], [0.2, 0.44, 0.76, 0.06], [-0.72, 0.5, -0.26, 0.06], [-0.22, -0.7, 0.3, 0.05],
  [-0.5, -0.5, -0.2, 0.04], [0.5, 0.0, 0.9, 0.05], [-0.1, 0.74, 0.4, 0.05],
];
const CRATERS: [number, number, number][] = [[-0.3, -0.3, 0.17], [0.22, 0.3, 0.13], [-0.52, 0.36, 0.09], [0.3, -0.5, 0.08], [0.56, -0.08, 0.07], [-0.08, 0.62, 0.07], [-0.66, -0.06, 0.06], [0.04, -0.08, 0.05]];

/**
 * A planet seen from space, in flat tones: sea, land and highlands, polar ice, cloud bands, a two-step night side and
 * an atmosphere rim. `turn` rotates the surface (degrees), so different faces show; the light always comes from the left.
 */
export function planet(id: string, cx: number, cy: number, r: number, kind: 'earth' | 'moon', turn = 0) {
  const at = ([x, y]: k.Flat): k.Flat => [cx + x * r, cy + y * r];
  const outline = (shape: k.Flat[]) => smooth(shape.map(at));
  let surface = '';
  if (kind === 'earth') {
    surface =
      LAND.map((shape) => `<path class="iso-planet-land" d="${outline(shape)}"/>`).join('') +
      HIGHLAND.map((shape) => `<path class="iso-planet-high" d="${outline(shape)}"/>`).join('') +
      `<ellipse class="iso-planet-ice" cx="${f(cx)}" cy="${f(cy - r * 0.97)}" rx="${f(r * 0.42)}" ry="${f(r * 0.14)}"/>` +
      `<ellipse class="iso-planet-ice" cx="${f(cx)}" cy="${f(cy + r * 0.98)}" rx="${f(r * 0.34)}" ry="${f(r * 0.1)}"/>` +
      CLOUDS.map(([x0, y, x1, wide]) => {
        const [a, b, c] = [at([x0, y]), at([(x0 + x1) / 2, y + 0.09]), at([x1, y])];
        return `<path class="iso-planet-cloud" style="stroke-width:${f(wide * r)}px" d="M${f(a[0])} ${f(a[1])}Q${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])}"/>`;
      }).join('');
  } else {
    surface =
      LAND.slice(0, 4).map((shape) => `<path class="iso-planet-land" d="${outline(shape)}"/>`).join('') +
      CRATERS.map(([x, y, cr]) => { const [px, py] = at([x, y]); return `<circle class="iso-planet-crater" cx="${f(px)}" cy="${f(py)}" r="${f(cr * r)}"/>`; }).join('');
  }
  // night side: from the right limb in to a terminator; a wider, lighter one first gives a soft edge without a gradient
  const shade = (inner: number) => `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 0 1 ${f(cx)} ${f(cy + r)}A${f(r * inner)} ${f(r)} 0 0 ${inner < 0 ? 1 : 0} ${f(cx)} ${f(cy - r)}Z`;
  return (
    `<g class="iso-planet" data-planet="${kind}"><clipPath id="${id}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath>` +
    (kind === 'earth' ? `<circle class="iso-planet-air" data-air="far" cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.06 + 1.2)}"/><circle class="iso-planet-air" cx="${f(cx)}" cy="${f(cy)}" r="${f(r * 1.025 + 0.6)}"/>` : '') +
    `<circle class="iso-planet-body" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>` +
    `<g clip-path="url(#${id})"><g transform="rotate(${turn} ${f(cx)} ${f(cy)})">${surface}</g>` +
    `<path class="iso-planet-night" data-step="soft" d="${shade(0.05)}"/><path class="iso-planet-night" d="${shade(0.5)}"/></g>` +
    `<circle class="iso-planet-rim" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></g>`
  );
}

/** Height of a curved horizon at x: the ground is a very large disc whose top sits at `top` and drops `sag` at the edges. */
export function horizonAt(w: number, top: number, sag: number, x: number) {
  const r = ((w * w) / 4 + sag * sag) / (2 * sag);
  return top + r - Math.sqrt(r * r - (x - w / 2) ** 2);
}

/** Ground with a curved horizon filling the plate below `top`; `inner` (craters, rocks, tracks) is clipped to it. */
export function ground(id: string, w: number, top: number, sag: number, kind: 'moon' | 'mars' | 'pad', inner: string) {
  const r = ((w * w) / 4 + sag * sag) / (2 * sag);
  const c = `cx="${f(w / 2)}" cy="${f(top + r)}"`;
  return (
    `<g class="iso-ground" data-ground="${kind}"><clipPath id="${id}"><circle ${c} r="${f(r)}"/></clipPath>` +
    `<circle class="iso-ground-body" ${c} r="${f(r)}"/>` +
    `<g clip-path="url(#${id})"><circle class="iso-ground-band" ${c} r="${f(r - 5)}"/><circle class="iso-ground-band" data-band="near" ${c} r="${f(r - 17)}"/>${inner}</g>` +
    `<circle class="iso-ground-rim" ${c} r="${f(r)}"/></g>`
  );
}

/** Rocks drifting across the plate, left to right, each on its own line, pace and spin. Painted behind the model. */
export function asteroids(seed: number, w: number, h: number, count = 5) {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    const size = 4 + next() * 7;
    const sides = 7 + Math.floor(next() * 3);
    const rim = Array.from({ length: sides }, (_, s): k.Flat => {
      const a = (s / sides) * Math.PI * 2;
      const rr = size * (0.72 + next() * 0.4);
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    const path = (points: k.Flat[]) => 'M' + points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
    // shaded half: the points on the lower right, closed through the centre
    const dark = rim.filter(([x, y]) => x + y > -size * 0.2);
    const [y0, y1] = [h * (0.12 + next() * 0.7), h * (0.12 + next() * 0.7)];
    const dur = 16 + next() * 16;
    const style = `--ax0:${f(-size * 3)}px;--ay0:${f(y0)}px;--ax1:${f(w + size * 3)}px;--ay1:${f(y1)}px;--dur:${f(dur)}s;--delay:${f(-next() * dur)}s;--spin:${f(9 + next() * 14)}s`;
    // the transform attribute is the resting place when motion is reduced; the animation overrides it
    return (
      `<g class="iso-asteroid" style="${style}" transform="translate(${f(w * (0.12 + (i / count) * 0.8))} ${f((y0 + y1) / 2)})"><g class="iso-asteroid-spin">` +
      `<path class="iso-asteroid-body" d="${path(rim)}"/><path class="iso-asteroid-shade" d="${path([[0, 0], ...dark])}"/>` +
      `<circle class="iso-asteroid-pit" cx="${f(-size * 0.25)}" cy="${f(-size * 0.2)}" r="${f(size * 0.16)}"/></g></g>`
    );
  }).join('');
}

/** A billowing cloud of exhaust or dust: overlapping discs around a centre, in screen space. */
export function smoke(seed: number, cx: number, cy: number, spread: number, count = 7) {
  const next = random(seed);
  return (
    `<g class="iso-smoke">` +
    Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + next();
      const d = spread * (0.25 + next() * 0.6);
      const r = spread * (0.28 + next() * 0.3);
      return `<circle data-puff="${i % 3}" style="--puff-at:${f(next() * -3)}s" cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d * 0.5)}" r="${f(r)}"/>`;
    }).join('') +
    `</g>`
  );
}

/** A dashed orbit drawn as a tilted ellipse. */
export const orbit = (cx: number, cy: number, rx: number, ry: number, turn: number) =>
  `<ellipse class="iso-orbit" cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(${turn} ${f(cx)} ${f(cy)})"/>`;

/** Floor grid on the plane z, in the figure's projection: minor lines every `step`, a major line every fifth. */
export function floorGrid(P: k.Projection, z: number, step: number, extent: number) {
  const minor: string[] = [];
  const major: string[] = [];
  for (let i = -extent; i <= extent; i += step) {
    const lines = k.segment([i, -extent, z], [i, extent, z], P) + k.segment([-extent, i, z], [extent, i, z], P);
    (Math.round(i / step) % 5 === 0 ? major : minor).push(lines);
  }
  return `<path class="iso-gridline" d="${minor.join('')}"/><path class="iso-gridline" data-major="" d="${major.join('')}"/>`;
}
