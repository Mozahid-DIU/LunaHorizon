/**
 * Terrain for a custom site, computed in the browser with the same method as pipeline/horizon.py.
 * Heights come from tiles of the LOLA maps: the finest map within 10 km, 240 m or finer within
 * 40 km, and 480 m beyond. Checked against the full maps at 32 points from 80 S and 65 S to the
 * pole, the worst error was 0.061 degrees of horizon and 0.14% of sunlit hours in 2027.
 */
const FIRST_STEP_M = 10;
const STEP_GROWTH = 1.002;
const MAX_DISTANCE_M = 150_000;
const OBSERVER_HEIGHT_M = 2;
const MOON_RADIUS_M = 1_737_400;
const AZIMUTHS = 360;
const RAYS_PER_SLICE = 20;
const DEG = Math.PI / 180;

export interface HeightProduct {
  name: string;
  lines: number;
  samples: number;
  scale_m: number;
  line_offset: number;
  sample_offset: number;
  scaling: number;
  max_lat: number;
  tiles: readonly (readonly [number, number])[];
}

export interface HeightManifest {
  tile_cells: number;
  coverage_lat: number;
  near_radius_m: number;
  mid_radius_m: number;
  products: readonly HeightProduct[];
}

export interface TileRef {
  product: HeightProduct;
  row: number;
  column: number;
}

/** Height at a point `distanceM` along a ray from the site; NaN where no map covers it. */
export type HeightAt = (lat: number, lon: number, distanceM: number) => number;

export interface CustomTerrain {
  profile: readonly number[];
  groundM: number;
  heightAt: HeightAt;
}

/** Rebuilds a tile's values from gzipped differences along each row. */
export async function decodeTile(bytes: ArrayBuffer, width: number, height: number): Promise<Int16Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const deltas = new Int16Array(await new Response(stream).arrayBuffer());
  const expected = width * height;
  if (deltas.length !== expected) throw new Error(`tile has ${deltas.length} values, expected ${expected} values`);
  const values = new Int16Array(expected);
  for (let line = 0; line < height; line++) {
    let sum = 0;
    for (let i = line * width; i < (line + 1) * width; i++) {
      sum += deltas[i];
      values[i] = sum;
    }
  }
  return values;
}

export function tileSize({ product, row, column }: TileRef, cells: number): { width: number; height: number } {
  return {
    width: Math.min(column * cells + cells + 1, product.samples) - column * cells,
    height: Math.min(row * cells + cells + 1, product.lines) - row * cells,
  };
}

export function rayDistances(): Float64Array {
  const count = Math.ceil(Math.log(MAX_DISTANCE_M / FIRST_STEP_M) / Math.log(STEP_GROWTH)) + 1;
  return Float64Array.from({ length: count }, (_, i) => Math.min(FIRST_STEP_M * STEP_GROWTH ** i, MAX_DISTANCE_M));
}

const DISTANCES = rayDistances();

/** Calls `visit` for every point of every ray; the per-ray trigonometry is kept out of the loop. */
export function forEachRayPoint(
  lat: number,
  lon: number,
  azimuths: readonly number[],
  visit: (rayIndex: number, sample: number, lat: number, lon: number, distanceM: number) => void,
  sampleStride = 1,
): void {
  const sinPhi1 = Math.sin(lat * DEG);
  const cosPhi1 = Math.cos(lat * DEG);
  const count = DISTANCES.length;
  for (let rayIndex = 0; rayIndex < azimuths.length; rayIndex++) {
    const sinTheta = Math.sin(azimuths[rayIndex] * DEG);
    const cosTheta = Math.cos(azimuths[rayIndex] * DEG);
    for (let sample = 0; sample < count; sample += sampleStride) {
      const delta = DISTANCES[sample] / MOON_RADIUS_M;
      const sinDelta = Math.sin(delta);
      const cosDelta = Math.cos(delta);
      const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * cosTheta;
      const lam2 = lon * DEG + Math.atan2(sinTheta * sinDelta * cosPhi1, cosDelta - sinPhi1 * sinPhi2);
      const lon2 = ((((lam2 / DEG + 180) % 360) + 360) % 360) - 180;
      visit(rayIndex, sample, Math.asin(Math.min(1, Math.max(-1, sinPhi2))) / DEG, lon2, DISTANCES[sample]);
    }
  }
}

/** The angle up to terrain at a ray sample, from an observer at `observerRadius`. */
export function elevationDeg(heightM: number, sample: number, observerRadius: number): number {
  const theta = DISTANCES[sample] / MOON_RADIUS_M;
  const target = MOON_RADIUS_M + heightM;
  return Math.atan2(target * Math.cos(theta) - observerRadius, target * Math.sin(theta)) / DEG;
}

/** Runs through the compass a few rays at a time, so the page stays responsive. */
async function forEachRayInSlices(lat: number, lon: number, visit: (azimuth: number, sample: number, lat: number, lon: number, distanceM: number) => void): Promise<void> {
  for (let start = 0; start < AZIMUTHS; start += RAYS_PER_SLICE) {
    const azimuths = Array.from({ length: Math.min(RAYS_PER_SLICE, AZIMUTHS - start) }, (_, i) => start + i);
    forEachRayPoint(lat, lon, azimuths, (ray, sample, pointLat, pointLon, distance) => visit(start + ray, sample, pointLat, pointLon, distance));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** The skyline in each whole degree of azimuth; directions with no terrain give -90. */
export async function computeHorizon(heightAt: HeightAt, lat: number, lon: number): Promise<number[]> {
  const ground = heightAt(lat, lon, 0);
  const observerRadius = MOON_RADIUS_M + ground + OBSERVER_HEIGHT_M;
  const horizon = new Array<number>(AZIMUTHS).fill(-90);
  await forEachRayInSlices(lat, lon, (azimuth, sample, pointLat, pointLon, distance) => {
    const height = heightAt(pointLat, pointLon, distance);
    if (Number.isNaN(height)) return;
    const elevation = elevationDeg(height, sample, observerRadius);
    if (elevation > horizon[azimuth]) horizon[azimuth] = elevation;
  });
  return horizon;
}

const tileNumber = (row: number, column: number) => row * 100_000 + column;

interface Located {
  product: HeightProduct;
  row: number;
  column: number;
  line: number;
  sample: number;
}

/** Finds the stored tile serving a point, finest map first. Reuses one result to stay fast. */
class TileIndex {
  private readonly stored = new Map<HeightProduct, Set<number>>();
  private readonly bands: readonly (readonly HeightProduct[])[];
  private readonly hit: Located;
  readonly cells: number;

  constructor(private readonly manifest: HeightManifest) {
    this.cells = manifest.tile_cells;
    for (const product of manifest.products) {
      this.stored.set(product, new Set(product.tiles.map(([row, column]) => tileNumber(row, column))));
    }
    const maps = manifest.products.slice(0, -1);
    this.bands = [maps, maps.slice(1), manifest.products.slice(-1)];
    this.hit = { product: manifest.products[0], row: 0, column: 0, line: 0, sample: 0 };
  }

  private band(distanceM: number): readonly HeightProduct[] {
    if (distanceM < this.manifest.near_radius_m) return this.bands[0];
    return distanceM < this.manifest.mid_radius_m ? this.bands[1] : this.bands[2];
  }

  locate(lat: number, lon: number, distanceM: number): Located | null {
    const r = 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + (lat * DEG) / 2);
    const north = r * Math.cos(lon * DEG);
    const east = r * Math.sin(lon * DEG);
    for (const product of this.band(distanceM)) {
      if (lat > product.max_lat) continue;
      const line = product.line_offset - north / product.scale_m;
      const sample = product.sample_offset + east / product.scale_m;
      const i = Math.floor(line);
      const j = Math.floor(sample);
      if (i < 0 || i >= product.lines - 1 || j < 0 || j >= product.samples - 1) continue;
      const row = Math.floor(i / this.cells);
      const column = Math.floor(j / this.cells);
      if (!this.stored.get(product)!.has(tileNumber(row, column))) continue;
      const hit = this.hit;
      hit.product = product;
      hit.row = row;
      hit.column = column;
      hit.line = line;
      hit.sample = sample;
      return hit;
    }
    return null;
  }
}

/** Every tile a site's horizon reads, each once. */
export async function tilesForSite(manifest: HeightManifest, lat: number, lon: number): Promise<TileRef[]> {
  const index = new TileIndex(manifest);
  const seen = new Map<HeightProduct, Map<number, TileRef>>(manifest.products.map((product) => [product, new Map()]));
  const note = (pointLat: number, pointLon: number, distance: number) => {
    const found = index.locate(pointLat, pointLon, distance);
    if (!found) return;
    const tiles = seen.get(found.product)!;
    const id = tileNumber(found.row, found.column);
    if (!tiles.has(id)) tiles.set(id, { product: found.product, row: found.row, column: found.column });
  };
  note(lat, lon, 0);
  await forEachRayInSlices(lat, lon, (_azimuth, _sample, pointLat, pointLon, distance) => note(pointLat, pointLon, distance));
  return [...seen.values()].flatMap((tiles) => [...tiles.values()]);
}

/** Bilinear heights from loaded tiles, blended exactly as pipeline/dem.py does. */
export function heightsFromTiles(manifest: HeightManifest, tiles: readonly (readonly [TileRef, Int16Array])[]): HeightAt {
  const index = new TileIndex(manifest);
  const loaded = new Map<HeightProduct, Map<number, { data: Int16Array; width: number }>>(manifest.products.map((product) => [product, new Map()]));
  for (const [ref, data] of tiles) {
    loaded.get(ref.product)!.set(tileNumber(ref.row, ref.column), { data, width: tileSize(ref, manifest.tile_cells).width });
  }
  return (lat, lon, distanceM) => {
    const found = index.locate(lat, lon, distanceM);
    if (!found) return Number.NaN;
    const tile = loaded.get(found.product)!.get(tileNumber(found.row, found.column));
    if (!tile) return Number.NaN;
    const { data, width } = tile;
    const i = Math.floor(found.line);
    const j = Math.floor(found.sample);
    const fi = found.line - i;
    const fj = found.sample - j;
    const at = (i - found.row * index.cells) * width + (j - found.column * index.cells);
    const top = data[at] * (1 - fj) + data[at + 1] * fj;
    const bottom = data[at + width] * (1 - fj) + data[at + width + 1] * fj;
    return (top * (1 - fi) + bottom * fi) * found.product.scaling;
  };
}

export const tilePath = ({ product, row, column }: TileRef) => `heights/${product.name}/${row}_${column}.i2z`;
