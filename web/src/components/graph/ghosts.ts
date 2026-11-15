/**
 * Decorative texture behind the evidence network: faint points and hairlines that give the
 * impression of a larger information space. This is NOT data: it carries no labels, is never
 * interactive, never enters the accessibility tree and is hidden when printing. Positions are
 * deterministic (seeded from the pack), so the same pack always draws the same texture and it
 * does not move when the scenario changes.
 */

export type GhostNode = { x: number; y: number; r: number; o: number };
export type GhostEdge = { a: number; b: number; o: number };
export type Ghosts = { nodes: GhostNode[]; edges: GhostEdge[] };

/** FNV-1a: small, dependency free, stable across engines. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param size   viewBox side, same units as the real network
 * @param seed   stable string (pack contract + id), never the scenario
 * @param count  number of ghost points
 */
export function ghostNetwork(size: number, seed: string, count = 58): Ghosts {
  const next = rng(hashSeed(seed));
  const c = size / 2;
  const nodes: GhostNode[] = [];
  for (let i = 0; i < count; i++) {
    const ang = next() * Math.PI * 2;
    // sqrt keeps the points evenly spread over the disc instead of piling up in the centre
    const rad = Math.sqrt(next()) * (size * 0.47);
    nodes.push({
      x: Math.round((c + rad * Math.cos(ang)) * 10) / 10,
      y: Math.round((c + rad * Math.sin(ang)) * 10) / 10,
      r: Math.round((1.2 + next() * 1.7) * 10) / 10,
      o: Math.round((0.13 + next() * 0.15) * 100) / 100,
    });
  }
  const seen = new Set<string>();
  const edges: GhostEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const links = 1 + Math.floor(next() * 2);
    for (let j = 0; j < links; j++) {
      const b = Math.floor(next() * nodes.length);
      if (b === i) continue;
      const a = Math.min(i, b);
      const key = `${a}|${Math.max(i, b)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b: Math.max(i, b), o: Math.round((0.07 + next() * 0.08) * 100) / 100 });
    }
  }
  edges.sort((p, q) => (p.a === q.a ? p.b - q.b : p.a - q.a));
  return { nodes, edges };
}
