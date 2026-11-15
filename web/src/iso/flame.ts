// One flame tongue as a billboard facing the camera: rounded base, pointed tip. Shared by the chamber and the bench.
import * as k from './iso-kit';

const fmt = (n: number) => n.toFixed(1);

/** Path of a tongue rooted at world [x, y, z]: `w` half-width, `h` height (negative points down, as engine exhaust), `lean` sideways offset of the tip. */
export function tonguePath(P: k.Projection, x: number, y: number, z: number, w: number, h: number, lean = 0): string {
  const d = Math.SQRT1_2; // (d, -d, 0) is horizontal on screen
  const at = (u: number, v: number) => k.iso([x + u * d, y - u * d, z + v], P);
  const [bl, br, tip, cl, cr, cb] = [at(-w, 0), at(w, 0), at(lean, h), at(-w * 1.25, h * 0.55), at(w * 1.25, h * 0.55), at(0, -Math.sign(h) * w * 0.9)];
  const q = (c: k.Flat, e: k.Flat) => `Q${fmt(c[0])} ${fmt(c[1])} ${fmt(e[0])} ${fmt(e[1])}`;
  return `M${fmt(bl[0])} ${fmt(bl[1])}${q(cl, tip)}${q(cr, br)}${q(cb, bl)}Z`;
}
