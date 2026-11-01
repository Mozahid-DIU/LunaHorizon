/**
 * Checks each generated data file before the engine may use it. A wrong file must stop here:
 * the ranges are physical limits, so swapped Sun and Earth data or a damaged value cannot pass.
 */
import type { SubpointYear, Track } from "../geometry";
import type { CuratedSite } from "../sites";
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
