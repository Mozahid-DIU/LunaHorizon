/**
 * The 3D terrain tiles that pipeline/terrain.py writes: three nested height grids centred on a
 * site, int16 steps of height_scale_m above the site's ground. This file reads them and turns
 * them into points for the scene, which uses x = east, y = up and z = south.
 *
 * The tiles are for display. Every number on the page comes from the horizon files.
 */
import type { CuratedSite } from "../sites";

export const MOON_RADIUS_M = 1_737_400;
const LEVELS = 3;
const BYTES_PER_NODE = 2;
const DEG = Math.PI / 180;
const MAX_DISTANCE_M = 150_000;

export interface TerrainLevelMeta {
  half_size_m: number;
  step_m: number;
  oversample: number;
  size: number;
  offset_bytes: number;
}

export interface TerrainMeta {
  site: string;
  lat: number;
  lon: number;
  ground_m: number;
  observer_height_m: number;
  height_scale_m: number;
  nodata: number;
  levels: TerrainLevelMeta[];
  source: string;
}

export interface TerrainLevel {
  half_size_m: number;
  step_m: number;
  size: number;
  /** Row-major from the north-west corner; metres above the site's ground, NaN where unknown. */
  heights: Float32Array;
}

export type TerrainLevels = readonly TerrainLevel[];

type Fields = Record<string, unknown>;

function field(value: unknown, name: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} is not an object`);
  return value as Fields;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} is not a number`);
  return value;
}

function same(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw new Error(`${name} is ${String(actual)}, expected ${String(expected)}`);
}

function parseLevel(raw: unknown, index: number, offset: number): TerrainLevelMeta {
  const data = field(raw, `levels[${index}]`);
  const half_size_m = number(data.half_size_m, "half_size_m");
  const step_m = number(data.step_m, "step_m");
  const oversample = number(data.oversample, "oversample");
  const size = number(data.size, "size");
  if (half_size_m <= 0 || step_m <= 0 || !Number.isInteger(oversample) || oversample < 1) throw new Error(`levels[${index}] has a bad extent`);
  same(size, Math.round((2 * half_size_m) / step_m) + 1, `levels[${index}].size`);
  same(data.offset_bytes, offset, `levels[${index}].offset_bytes`);
  return { half_size_m, step_m, oversample, size, offset_bytes: offset };
}

export function parseTerrainMeta(raw: unknown, site: CuratedSite): TerrainMeta {
  const data = field(raw, "file");
  same(data.site, site.id, "site");
  same(data.lat, site.lat, "lat");
  same(data.lon, site.lon, "lon");
  const ground_m = number(data.ground_m, "ground_m");
  const observer_height_m = number(data.observer_height_m, "observer_height_m");
  const height_scale_m = number(data.height_scale_m, "height_scale_m");
  const nodata = number(data.nodata, "nodata");
  if (height_scale_m <= 0 || !Number.isInteger(nodata)) throw new Error("height scale or nodata is bad");
  if (!Array.isArray(data.levels) || data.levels.length !== LEVELS) throw new Error(`levels must have ${LEVELS} entries`);
  if (typeof data.source !== "string") throw new Error("source is missing");
  let offset = 0;
  const levels = data.levels.map((raw, i) => {
    const level = parseLevel(raw, i, offset);
    offset += level.size * level.size * BYTES_PER_NODE;
    return level;
  });
  // finer levels come first and each lies inside the next
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].half_size_m <= levels[i - 1].half_size_m || levels[i].step_m <= levels[i - 1].step_m) throw new Error("levels are not nested");
  }
  return { site: site.id, lat: site.lat, lon: site.lon, ground_m, observer_height_m, height_scale_m, nodata, levels, source: data.source };
}

/** The binary file's int16 steps as metres above the site, one grid per level. */
export function decodeLevels(meta: TerrainMeta, bytes: ArrayBuffer): TerrainLevels {
  const expected = meta.levels.reduce((sum, { size }) => sum + size * size * BYTES_PER_NODE, 0);
  if (bytes.byteLength !== expected) throw new Error(`file has ${bytes.byteLength} bytes, expected ${expected} bytes`);
  const view = new DataView(bytes);
  return meta.levels.map(({ half_size_m, step_m, size, offset_bytes }) => {
    const heights = new Float32Array(size * size);
    for (let i = 0; i < heights.length; i++) {
      const value = view.getInt16(offset_bytes + i * BYTES_PER_NODE, true);
      heights[i] = value === meta.nodata ? NaN : value * meta.height_scale_m;
    }
    return { half_size_m, step_m, size, heights };
  });
}

/** East and north of a node, in metres from the site. */
function nodeOffset(level: TerrainLevel, row: number, col: number): [number, number] {
  return [col * level.step_m - level.half_size_m, level.half_size_m - row * level.step_m];
}

/**
 * Scene points for every node: x east, y up and z south, with the Moon's curve so that far
 * ground drops below the site, as terrain.py describes. Unknown nodes get 0, 0, 0 and no faces.
 */
export function levelPositions(level: TerrainLevel, groundM = 0): Float32Array {
  const { size, heights } = level;
  const base = MOON_RADIUS_M + groundM;
  const out = new Float32Array(size * size * 3);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      const h = heights[i];
      if (Number.isNaN(h)) continue;
      const [x, y] = nodeOffset(level, row, col);
      const d = Math.hypot(x, y);
      const theta = d / MOON_RADIUS_M;
      const r = base + h;
      const along = d === 0 ? 0 : (r * Math.sin(theta)) / d;
      out[i * 3] = x * along;
      out[i * 3 + 1] = r * Math.cos(theta) - base;
      out[i * 3 + 2] = -y * along;
    }
  }
  return out;
}

/** Triangles for a level, leaving out unknown nodes and the cells a finer level draws instead. */
export function levelIndices(level: TerrainLevel, finer: TerrainLevel | null): Uint32Array {
  const { size, heights } = level;
  const found: number[] = [];
  const inner = finer ? finer.half_size_m : -1;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const a = row * size + col;
      const b = a + 1;
      const c = a + size;
      const d = c + 1;
      if (Number.isNaN(heights[a]) || Number.isNaN(heights[b]) || Number.isNaN(heights[c]) || Number.isNaN(heights[d])) continue;
      const [x0, y1] = nodeOffset(level, row, col);
      const x1 = x0 + level.step_m;
      const y0 = y1 - level.step_m;
      if (Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) <= inner) continue;
      found.push(a, c, b, b, c, d);
    }
  }
  return Uint32Array.from(found);
}

/** Height above the site at a point, from the finest level that holds it; NaN beyond the tiles. */
export function tileHeightAt(levels: TerrainLevels, east: number, north: number): number {
  for (const level of levels) {
    if (Math.abs(east) > level.half_size_m || Math.abs(north) > level.half_size_m) continue;
    const { size, step_m, half_size_m, heights } = level;
    const fc = (east + half_size_m) / step_m;
    const fr = (half_size_m - north) / step_m;
    const c0 = Math.min(Math.floor(fc), size - 2);
    const r0 = Math.min(Math.floor(fr), size - 2);
    const tx = fc - c0;
    const ty = fr - r0;
    const h = (r: number, c: number) => heights[r * size + c];
    return (h(r0, c0) * (1 - tx) + h(r0, c0 + 1) * tx) * (1 - ty) + (h(r0 + 1, c0) * (1 - tx) + h(r0 + 1, c0 + 1) * tx) * ty;
  }
  return NaN;
}

function stepAt(levels: TerrainLevels, distance: number): number {
  for (const level of levels) if (distance < level.half_size_m) return level.step_m;
  return levels[levels.length - 1].step_m;
}

/**
 * The horizon the tiles give, degrees for each whole azimuth, by the same spherical rule as
 * pipeline/horizon.py: the highest angle to any terrain point out to 150 km from an eye
 * `observerHeightM` above the site. Used to check the tiles against the horizon file.
 */
export function skylineFromTiles(levels: TerrainLevels, observerHeightM: number, groundM = 0): number[] {
  const base = MOON_RADIUS_M + groundM;
  const eye = base + observerHeightM;
  return Array.from({ length: 360 }, (_, az) => {
    const dx = Math.sin(az * DEG);
    const dy = Math.cos(az * DEG);
    let best = -90;
    for (let t = stepAt(levels, 0); t <= MAX_DISTANCE_M; t += stepAt(levels, t)) {
      const h = tileHeightAt(levels, t * dx, t * dy);
      if (Number.isNaN(h)) continue;
      const theta = t / MOON_RADIUS_M;
      const r = base + h;
      const angle = Math.atan2(r * Math.cos(theta) - eye, r * Math.sin(theta)) / DEG;
      if (angle > best) best = angle;
    }
    return best;
  });
}

/** A unit vector toward a body, in the scene's frame: x east, y up, z south. */
export function sunVector(azDeg: number, elDeg: number): [number, number, number] {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
