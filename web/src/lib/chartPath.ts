/**
 * Smooth SVG paths through chart points that never bend past the data: a monotone cubic
 * (Fritsch-Carlson), so between two samples the curve stays within their values. A battery at
 * 100% never draws above 100%, and a flat stretch stays flat.
 */
export interface Point {
  x: number;
  y: number;
}

const f = (n: number) => n.toFixed(1);

/** Slopes at each point that keep every segment monotone. */
function tangents(points: readonly Point[]): number[] {
  const n = points.length;
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    delta.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }
  return m;
}

/** A smooth path through the points, in order of x. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)},${f(p.y)}`).join(" ");
  const m = tangents(points);
  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const h = (q.x - p.x) / 3;
    d += ` C${f(p.x + h)},${f(p.y + m[i] * h)} ${f(q.x - h)},${f(q.y - m[i + 1] * h)} ${f(q.x)},${f(q.y)}`;
  }
  return d;
}

/** The same curve closed down to a baseline, for a filled area under it. */
export function smoothArea(points: readonly Point[], baseY: number): string {
  if (points.length === 0) return "";
  const last = points[points.length - 1];
  return `${smoothPath(points)} L${f(last.x)},${f(baseY)} L${f(points[0].x)},${f(baseY)} Z`;
}
