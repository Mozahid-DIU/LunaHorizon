/**
 * Checks each generated data file before the engine may use it. A wrong file must stop here:
 * the ranges are physical limits, so swapped Sun and Earth data or a damaged value cannot pass.
 */
import { MOON_RADIUS_KM, type SubpointYear, type Track } from "../geometry";
import { findSite, TERRAIN_COVERAGE_LAT, type CuratedSite } from "../sites";
import type { HeightManifest } from "../terrain/customTerrain";
import type { DsnYear } from "../windows";

const PROFILE_POINTS = 360;
const STATIONS = 3;
const MAX_MASK = 2 ** STATIONS - 1;
const SUN_KM: readonly [number, number] = [1.3e8, 1.7e8];
const EARTH_KM: readonly [number, number] = [3e5, 4.5e5];
const MAP_SIZE = 121;
const MAP_STEP_KM = 5;
const MAP_RADIUS_KM = 300;
const PER_MILLE = 1000;
const HEIGHT_TILE_CELLS = 512;
const HEIGHT_NEAR_RADIUS_M = 10_000;
const HEIGHT_MID_RADIUS_M = 40_000;
/** Finest first: the order in which a point looks for its height. */
const HEIGHT_PRODUCTS = ["ldem_875s_20m", "ldem_80s_80m", "ldem_75s_120m", "ldem_60s_240m", "far"];

export interface HorizonFile {
  site: string;
  lat: number;
  lon: number;
  ground_m: number;
  observer_height_m: number;
  elevation_deg: readonly number[];
  source: string;
}

/** Shares of hours in per mille at each node; null marks nodes outside the map's circle. */
export interface MapGrid {
  size: number;
  step_km: number;
  radius_km: number;
  lit: readonly (number | null)[];
  earth: readonly (number | null)[];
  golden: readonly (number | null)[];
}

type Fields = Record<string, unknown>;

function requireObject(value: unknown, name: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} is not an object`);
  return value as Fields;
}

function requireEqual(actual: unknown, expected: unknown, name: string): void {
  if (actual !== expected) throw new Error(`${name} is ${String(actual)}, expected ${String(expected)}`);
}

function requireNumber(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} is ${String(value)}, outside ${min} to ${max}`);
  }
  return value;
}

function requireSeries(value: unknown, length: number, min: number, max: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== length) throw new Error(`${name} must have ${length} values`);
  value.forEach((item, i) => requireNumber(item, min, max, `${name}[${i}]`));
  return value as number[];
}

/** Hours in a UTC calendar year: 8760, or 8784 in a leap year. */
export function hoursInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 3_600_000;
}

function parseTrack(value: unknown, hours: number, km: readonly [number, number], body: string): Track {
  const track = requireObject(value, body);
  return {
    lat: requireSeries(track.lat, hours, -90, 90, `${body}.lat`),
    lon: requireSeries(track.lon, hours, -180, 180, `${body}.lon`),
    dist_km: requireSeries(track.dist_km, hours, km[0], km[1], `${body}.dist_km`),
  };
}

export function parseSubpointYear(raw: unknown, year: number): SubpointYear {
  const data = requireObject(raw, "file");
  requireEqual(data.start, `${year}-01-01T00:00Z`, "start");
  requireEqual(data.step_hours, 1, "step_hours");
  const hours = hoursInYear(year);
  return {
    start: data.start as string,
    step_hours: 1,
    sun: parseTrack(data.sun, hours, SUN_KM, "sun"),
    earth: parseTrack(data.earth, hours, EARTH_KM, "earth"),
  };
}

export function parseDsnYear(raw: unknown, year: number): DsnYear {
  const data = requireObject(raw, "file");
  requireEqual(data.start, `${year}-01-01T00:00Z`, "start");
  requireEqual(data.step_hours, 1, "step_hours");
  const mask = requireSeries(data.mask, hoursInYear(year), 0, MAX_MASK, "mask");
  mask.forEach((value, i) => {
    if (!Number.isInteger(value)) throw new Error(`mask[${i}] is ${value}, not a whole number`);
  });
  return { start: data.start as string, step_hours: 1, mask };
}

export function parseHorizon(raw: unknown, site: CuratedSite): HorizonFile {
  const data = requireObject(raw, "file");
  requireEqual(data.site, site.id, "site");
  requireEqual(data.lat, site.lat, "lat");
  requireEqual(data.lon, site.lon, "lon");
  requireEqual(data.az_step_deg, 1, "az_step_deg");
  if (typeof data.source !== "string") throw new Error("source is missing");
  return {
    site: site.id,
    lat: site.lat,
    lon: site.lon,
    ground_m: requireNumber(data.ground_m, -20_000, 20_000, "ground_m"),
    observer_height_m: requireNumber(data.observer_height_m, 0, 100, "observer_height_m"),
    elevation_deg: requireSeries(data.elevation_deg, PROFILE_POINTS, -90, 90, "elevation_deg"),
    source: data.source,
  };
}

function requireMapLayer(value: unknown, name: string): (number | null)[] {
  const nodes = MAP_SIZE * MAP_SIZE;
  if (!Array.isArray(value) || value.length !== nodes) throw new Error(`${name} must have ${nodes} values`);
  value.forEach((item: unknown, i) => {
    const column = i % MAP_SIZE;
    const row = Math.floor(i / MAP_SIZE);
    const isInside = Math.hypot(column * MAP_STEP_KM - MAP_RADIUS_KM, row * MAP_STEP_KM - MAP_RADIUS_KM) <= MAP_RADIUS_KM;
    if (!isInside) {
      requireEqual(item, null, `${name}[${i}]`);
    } else if (!Number.isInteger(requireNumber(item, 0, PER_MILLE, `${name}[${i}]`))) {
      throw new Error(`${name}[${i}] is ${String(item)}, not a whole number`);
    }
  });
  return value as (number | null)[];
}

export function parseHeightManifest(raw: unknown): HeightManifest {
  const data = requireObject(raw, "file");
  requireEqual(data.tile_cells, HEIGHT_TILE_CELLS, "tile_cells");
  requireEqual(data.coverage_lat, TERRAIN_COVERAGE_LAT, "coverage_lat");
  requireEqual(data.near_radius_m, HEIGHT_NEAR_RADIUS_M, "near_radius_m");
  requireEqual(data.mid_radius_m, HEIGHT_MID_RADIUS_M, "mid_radius_m");
  if (!Array.isArray(data.products) || data.products.length !== HEIGHT_PRODUCTS.length) {
    throw new Error(`products must have ${HEIGHT_PRODUCTS.length} entries`);
  }
  (data.products as unknown[]).forEach((entry, i) => {
    const product = requireObject(entry, "product");
    const name = HEIGHT_PRODUCTS[i];
    requireEqual(product.name, name, `products[${i}].name`);
    const lines = requireNumber(product.lines, 2, 1e6, `${name}.lines`);
    const samples = requireNumber(product.samples, 2, 1e6, `${name}.samples`);
    requireNumber(product.scale_m, 1, 1000, `${name}.scale_m`);
    requireNumber(product.scaling, 0.01, 10, `${name}.scaling`);
    requireNumber(product.max_lat, -90, 0, `${name}.max_lat`);
    requireNumber(product.line_offset, 0, lines, `${name}.line_offset`);
    requireNumber(product.sample_offset, 0, samples, `${name}.sample_offset`);
    if (!Array.isArray(product.tiles) || product.tiles.length === 0) throw new Error(`${name} has no tiles`);
    for (const tile of product.tiles as unknown[]) {
      const [row, column] = Array.isArray(tile) ? (tile as unknown[]) : [];
      if (!Number.isInteger(row) || !Number.isInteger(column) || (row as number) * HEIGHT_TILE_CELLS >= lines || (column as number) * HEIGHT_TILE_CELLS >= samples) {
        throw new Error(`${name} lists a tile outside the map`);
      }
    }
  });
  return data as unknown as HeightManifest;
}

export function parseMapGrid(raw: unknown): MapGrid {
  const data = requireObject(raw, "file");
  requireEqual(data.size, MAP_SIZE, "size");
  requireEqual(data.step_km, MAP_STEP_KM, "step_km");
  requireEqual(data.radius_km, MAP_RADIUS_KM, "radius_km");
  const lit = requireMapLayer(data.lit, "lit");
  const earth = requireMapLayer(data.earth, "earth");
  const golden = requireMapLayer(data.golden, "golden");
  golden.forEach((value, i) => {
    if (value !== null && value > Math.min(lit[i]!, earth[i]!)) throw new Error(`golden[${i}] is above its lit or earth value`);
  });
  return { size: MAP_SIZE, step_km: MAP_STEP_KM, radius_km: MAP_RADIUS_KM, lit, earth, golden };
}

interface RowBase {
  pass: boolean;
}

interface AngleRow extends RowBase {
  utc: string;
  diff_deg: number;
  tolerance_deg: number;
}

export interface HorizonsRow extends AngleRow {
  kind: "horizons";
  site: string;
  body: "sun" | "earth";
  ours: { az: number; el: number };
  reference: { az: number; el: number };
}

export interface BrowserRow extends AngleRow {
  kind: "browser";
  site: string;
}

export interface DsnRow extends AngleRow {
  kind: "dsn";
  station: string;
  ours_el: number;
  reference_el: number;
}

export interface TerrainRow extends RowBase {
  kind: "terrain";
  check: string;
  ours: number;
  reference: number;
  unit: string;
  reference_source: string;
  diff: number;
  tolerance: number;
}

export type ValidationRow = HorizonsRow | BrowserRow | DsnRow | TerrainRow;

export interface ValidationSection {
  id: string;
  title: string;
  method: string;
  rows: ValidationRow[];
}

export interface ValidationSummary {
  checks: number;
  passed: number;
  max_angle_diff_deg: number;
}

export interface ValidationFile {
  generated: string;
  summary: ValidationSummary;
  sections: ValidationSection[];
}

const VALIDATION_SECTIONS = ["horizons-sun-earth", "browser-engine", "dsn-moon", "terrain"];
const VALIDATION_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const VALIDATION_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ANGLE_LIMIT = 360;
const MAX_ANGLE_DIFF = 180;
/** No check may loosen its limit past this: any angle would then count as a pass. */
const MAX_ANGLE_TOLERANCE = 1;
const FIGURE_LIMIT = 100_000;
/** The polar point the Horizons checks use; it is a test point, not a listed site. */
export const POLAR_TEST_POINT = "south-pole-89s";
/** The file rounds figures to 6 decimals and differences to 6; this absorbs that rounding. */
const ANGLE_ROUNDING = 2e-5;
/** Terrain figures are rounded before they are written; a limit past these would prove nothing. */
const TERRAIN_UNITS: Readonly<Record<string, { rounding: number; maxTolerance: number }>> = {
  m: { rounding: 1, maxTolerance: 500 },
  "%": { rounding: 0.15, maxTolerance: 10 },
};

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${name} is not text`);
  return value;
}

function requireMatch(value: unknown, pattern: RegExp, name: string): string {
  const text = requireText(value, name);
  if (!pattern.test(text)) throw new Error(`${name} is ${text}`);
  return text;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} is not true or false`);
  return value;
}

/**
 * A pass must be a difference inside its limit, so a row cannot simply claim one. The pipeline
 * judges before rounding, so a figure rounded onto its limit may read either way.
 */
function requireVerdict(pass: unknown, diff: number, tolerance: number, name: string): boolean {
  const isPass = requireBoolean(pass, `${name}.pass`);
  if (isPass ? diff > tolerance : diff < tolerance) throw new Error(`${name} says pass is ${isPass} for ${diff} against ${tolerance}`);
  return isPass;
}

function requireDate(value: unknown, name: string): string {
  const text = requireMatch(value, VALIDATION_DATE, name);
  const ms = Date.parse(`${text}T00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== text) throw new Error(`${name} is not a date: ${text}`);
  return text;
}

function requireSiteId(value: unknown, name: string): string {
  const id = requireText(value, name);
  if (!findSite(id) && id !== POLAR_TEST_POINT) throw new Error(`${name} is not a known site: ${id}`);
  return id;
}

function requireAngles(raw: Fields, name: string): AngleRow {
  const diff_deg = requireNumber(raw.diff_deg, 0, MAX_ANGLE_DIFF, `${name}.diff_deg`);
  const tolerance_deg = requireNumber(raw.tolerance_deg, Number.MIN_VALUE, MAX_ANGLE_TOLERANCE, `${name}.tolerance_deg`);
  return {
    utc: requireMatch(raw.utc, VALIDATION_TIME, `${name}.utc`),
    diff_deg,
    tolerance_deg,
    pass: requireVerdict(raw.pass, diff_deg, tolerance_deg, name),
  };
}

function requireAltAz(value: unknown, name: string): { az: number; el: number } {
  const fields = requireObject(value, name);
  return { az: requireNumber(fields.az, 0, ANGLE_LIMIT, `${name}.az`), el: requireNumber(fields.el, -90, 90, `${name}.el`) };
}

function parseHorizonsRow(raw: Fields, name: string): HorizonsRow {
  const base = requireAngles(raw, name);
  const ours = requireAltAz(raw.ours, `${name}.ours`);
  const reference = requireAltAz(raw.reference, `${name}.reference`);
  if (raw.body !== "sun" && raw.body !== "earth") throw new Error(`${name}.body is ${String(raw.body)}`);
  // the pipeline's rule: azimuth is ill-defined near the zenith, so it is weighted by cos(elevation)
  const azimuthGap = Math.abs(((ours.az - reference.az + 540) % 360) - 180);
  const expected = Math.max(Math.abs(ours.el - reference.el), azimuthGap * Math.cos((reference.el * Math.PI) / 180));
  if (Math.abs(expected - base.diff_deg) > ANGLE_ROUNDING) throw new Error(`${name} difference does not match its figures`);
  return { ...base, kind: "horizons", site: requireSiteId(raw.site, `${name}.site`), body: raw.body, ours, reference };
}

function parseDsnRow(raw: Fields, name: string): DsnRow {
  const base = requireAngles(raw, name);
  const ours_el = requireNumber(raw.ours_el, -90, 90, `${name}.ours_el`);
  const reference_el = requireNumber(raw.reference_el, -90, 90, `${name}.reference_el`);
  if (Math.abs(Math.abs(ours_el - reference_el) - base.diff_deg) > ANGLE_ROUNDING) throw new Error(`${name} difference does not match its figures`);
  return { ...base, kind: "dsn", station: requireText(raw.station, `${name}.station`), ours_el, reference_el };
}

function parseTerrainRow(raw: Fields, name: string): TerrainRow {
  const ours = requireNumber(raw.ours, -FIGURE_LIMIT, FIGURE_LIMIT, `${name}.ours`);
  const reference = requireNumber(raw.reference, -FIGURE_LIMIT, FIGURE_LIMIT, `${name}.reference`);
  const diff = requireNumber(raw.diff, 0, FIGURE_LIMIT, `${name}.diff`);
  const unit = requireText(raw.unit, `${name}.unit`);
  const limits = TERRAIN_UNITS[unit];
  if (!limits) throw new Error(`${name}.unit is ${unit}`);
  const tolerance = requireNumber(raw.tolerance, Number.MIN_VALUE, limits.maxTolerance, `${name}.tolerance`);
  if (Math.abs(Math.abs(ours - reference) - diff) > limits.rounding) throw new Error(`${name} difference does not match its figures`);
  return {
    kind: "terrain",
    check: requireText(raw.check, `${name}.check`),
    ours,
    reference,
    unit,
    reference_source: requireText(raw.reference_source, `${name}.reference_source`),
    diff,
    tolerance,
    pass: requireVerdict(raw.pass, diff, tolerance, name),
  };
}

function parseValidationRow(id: string, value: unknown, name: string): ValidationRow {
  const raw = requireObject(value, name);
  switch (id) {
    case "horizons-sun-earth":
      return parseHorizonsRow(raw, name);
    case "browser-engine":
      return { ...requireAngles(raw, name), kind: "browser", site: requireSiteId(raw.site, `${name}.site`) };
    case "dsn-moon":
      return parseDsnRow(raw, name);
    default:
      return parseTerrainRow(raw, name);
  }
}

function parseValidationSection(value: unknown, id: string): ValidationSection {
  const raw = requireObject(value, id);
  requireEqual(raw.id, id, "section id");
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) throw new Error(`${id} has no rows`);
  return {
    id,
    title: requireText(raw.title, `${id}.title`),
    method: requireText(raw.method, `${id}.method`),
    rows: raw.rows.map((row, i) => parseValidationRow(id, row, `${id}[${i}]`)),
  };
}

/** The summary must equal the rows: the headline figures are never taken on trust. */
export function parseValidation(raw: unknown): ValidationFile {
  const file = requireObject(raw, "validation");
  if (!Array.isArray(file.sections) || file.sections.length !== VALIDATION_SECTIONS.length) throw new Error("validation has the wrong sections");
  const sections = VALIDATION_SECTIONS.map((id, i) => parseValidationSection((file.sections as unknown[])[i], id));
  const rows = sections.flatMap((section) => section.rows);
  const angles = rows.flatMap((row) => (row.kind === "terrain" ? [] : [row.diff_deg]));

  const summary = requireObject(file.summary, "validation.summary");
  requireEqual(summary.checks, rows.length, "summary.checks");
  requireEqual(summary.passed, rows.filter(({ pass }) => pass).length, "summary.passed");
  requireEqual(summary.max_angle_diff_deg, Math.max(...angles), "summary.max_angle_diff_deg");
  return {
    generated: requireDate(file.generated, "generated"),
    summary: { checks: rows.length, passed: summary.passed as number, max_angle_diff_deg: Math.max(...angles) },
    sections,
  };
}

export interface EllipsePoint {
  ring_m: number;
  bearing_deg: number;
  lat: number;
  lon: number;
  ground_m: number;
  elevation_deg: readonly number[];
}

export interface Touchdown {
  lat: number;
  lon: number;
  ground_m: number;
  elevation_deg: readonly number[];
  distance_m: number;
  bearing_deg: number;
  date: string;
  source: string;
}

export interface EllipseFile {
  site: string;
  points: EllipsePoint[];
  /** Where the lander really came down, when that is known; null otherwise. */
  touchdown: Touchdown | null;
}

const ELLIPSE_RINGS_M = [100, 500, 1000];
const ELLIPSE_BEARINGS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
/** The file rounds positions to 6 decimals, about 3 cm; a metre covers that and any rounding of the distance. */
const ELLIPSE_DISTANCE_TOLERANCE_M = 1;

/** Initial bearing from the first point to the second, degrees from north through east. */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dl = (lon2 - lon1) * rad;
  const y = Math.sin(dl) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) % 360 + 360) % 360;
}

/** The pipeline rounds bearings to whole degrees, so a degree covers rounding and nothing more. */
const ELLIPSE_BEARING_TOLERANCE_DEG = 1;

function requireBearing(site: CuratedSite, lat: number, lon: number, stated: number, name: string): void {
  const gap = Math.abs(((bearingDeg(site.lat, site.lon, lat, lon) - stated + 540) % 360) - 180);
  if (gap > ELLIPSE_BEARING_TOLERANCE_DEG) throw new Error(`${name} is not in the direction it says`);
}

function surfaceDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * MOON_RADIUS_KM * 1000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseEllipsePoint(value: unknown, name: string): EllipsePoint {
  const point = requireObject(value, name);
  return {
    ring_m: requireNumber(point.ring_m, 0, 1000, `${name}.ring_m`),
    bearing_deg: requireNumber(point.bearing_deg, 0, 359, `${name}.bearing_deg`),
    lat: requireNumber(point.lat, -90, 90, `${name}.lat`),
    lon: requireNumber(point.lon, -180, 180, `${name}.lon`),
    ground_m: requireNumber(point.ground_m, -20_000, 20_000, `${name}.ground_m`),
    elevation_deg: requireSeries(point.elevation_deg, PROFILE_POINTS, -90, 90, `${name}.elevation_deg`),
  };
}

function parseTouchdown(value: unknown, site: CuratedSite): Touchdown {
  const raw = requireObject(value, "touchdown");
  const point = parseEllipsePoint({ ...raw, ring_m: 0, bearing_deg: 0 }, "touchdown");
  const distance_m = requireNumber(raw.distance_m, 0, 100_000, "touchdown.distance_m");
  if (Math.abs(surfaceDistanceM(site.lat, site.lon, point.lat, point.lon) - distance_m) > ELLIPSE_DISTANCE_TOLERANCE_M) {
    throw new Error("touchdown distance does not match its position");
  }
  if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error("touchdown date is not valid");
  if (typeof raw.source !== "string" || !raw.source.startsWith("https://")) throw new Error("touchdown source is not valid");
  const bearing_deg = requireNumber(raw.bearing_deg, 0, 359, "touchdown.bearing_deg");
  requireBearing(site, point.lat, point.lon, bearing_deg, "touchdown");
  return {
    lat: point.lat,
    lon: point.lon,
    ground_m: point.ground_m,
    elevation_deg: point.elevation_deg,
    distance_m,
    bearing_deg,
    date: raw.date,
    source: raw.source,
  };
}

/** A site's 25 landing-zone horizons: the target, then 8 directions on each ring, each the ring's distance away. */
export function parseEllipse(raw: unknown, site: CuratedSite): EllipseFile {
  const data = requireObject(raw, "file");
  requireEqual(data.site, site.id, "site");
  requireEqual(data.lat, site.lat, "lat");
  requireEqual(data.lon, site.lon, "lon");
  requireEqual(data.az_step_deg, 1, "az_step_deg");
  const expected = 1 + ELLIPSE_RINGS_M.length * ELLIPSE_BEARINGS_DEG.length;
  if (!Array.isArray(data.points) || data.points.length !== expected) throw new Error(`points must have ${expected} entries`);
  const points = data.points.map((point, i) => parseEllipsePoint(point, `points[${i}]`));

  const [centre, ...ringed] = points;
  if (centre.ring_m !== 0 || centre.lat !== site.lat || centre.lon !== site.lon) throw new Error("the first point is not the site");
  for (const ring of ELLIPSE_RINGS_M) {
    const bearings = ringed.filter((point) => point.ring_m === ring).map((point) => point.bearing_deg).sort((a, b) => a - b);
    if (bearings.join() !== ELLIPSE_BEARINGS_DEG.join()) throw new Error(`ring ${ring} m does not have the 8 compass directions`);
  }
  for (const point of ringed) {
    if (Math.abs(surfaceDistanceM(site.lat, site.lon, point.lat, point.lon) - point.ring_m) > ELLIPSE_DISTANCE_TOLERANCE_M) {
      throw new Error(`a point on the ${point.ring_m} m ring is not ${point.ring_m} m from the site`);
    }
    requireBearing(site, point.lat, point.lon, point.bearing_deg, `the ${point.ring_m} m ring's ${point.bearing_deg} degree point`);
  }
  return { site: site.id, points, touchdown: data.touchdown === undefined ? null : parseTouchdown(data.touchdown, site) };
}

