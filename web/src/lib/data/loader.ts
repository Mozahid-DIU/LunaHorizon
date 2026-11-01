/**
 * Loads the generated data files on demand. Each file is fetched once, checked by validate.ts,
 * and kept only if it passes, so a failed or damaged file can be tried again.
 */
import { DATA_END_MS } from "../dataRange";
import { findSite, hasHeightTiles } from "../sites";
import {
  computeHorizon,
  decodeTile,
  heightsFromTiles,
  tilePath,
  tileSize,
  tilesForSite,
  type CustomTerrain,
  type HeightAt,
  type HeightManifest,
  type TileRef,
} from "../terrain/customTerrain";
import { Ephemeris, type DsnYear, type YearData } from "../windows";
import type { SubpointYear } from "../geometry";
import { type HorizonFile, type MapGrid, parseDsnYear, parseHeightManifest, parseHorizon, parseMapGrid, parseSubpointYear } from "./validate";

export const DATA_YEARS = [2026, 2027, 2028, 2029, 2030] as const;

const TIMEOUT_MS = 20_000;
const MAX_CACHED_SITES = 4;
const MAX_CACHED_TILES = 150;

export type DataFailure = "missing" | "network" | "timeout" | "invalid" | "unavailable";

/** Why a data file could not be used; the app shows this in place of any result. */
export class DataFileError extends Error {
  constructor(
    readonly kind: DataFailure,
    readonly file: string,
    detail: string,
  ) {
    super(`${file}: ${detail}`);
    this.name = "DataFileError";
  }
}

export const asDataError = (error: unknown): DataFileError =>
  error instanceof DataFileError
    ? error
    : new DataFileError("invalid", "data", error instanceof Error ? error.message : "could not be read");

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function readFile<T>(fetchFn: FetchFn, baseUrl: string, file: string, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchFn(`${baseUrl}/${file}`, { signal: controller.signal });
    if (response.status === 404) throw new DataFileError("missing", file, "file not found");
    if (!response.ok) throw new DataFileError("network", file, `server answered ${response.status}`);
    return await read(response);
  } catch (error: unknown) {
    if (error instanceof DataFileError) throw error;
    if (controller.signal.aborted) throw new DataFileError("timeout", file, "no answer in time");
    throw new DataFileError("network", file, error instanceof Error ? error.message : "request failed");
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(fetchFn: FetchFn, baseUrl: string, file: string): Promise<unknown> {
  const text = await readFile(fetchFn, baseUrl, file, (response) => response.text());
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DataFileError("invalid", file, "not valid JSON");
  }
}

export interface DataLoader {
  loadEphemeris(years: readonly number[]): Promise<Ephemeris>;
  loadHorizon(siteId: string): Promise<HorizonFile>;
  loadMapGrid(): Promise<MapGrid>;
  loadHeightManifest(): Promise<HeightManifest>;
  loadCustomTerrain(lat: number, lon: number): Promise<CustomTerrain>;
}

export function createDataLoader(fetchFn: FetchFn = (input, init) => fetch(input, init), baseUrl = "/data"): DataLoader {
  const cache = new Map<string, Promise<unknown>>();

  function remember<T>(key: string, make: () => Promise<T>): Promise<T> {
    const cached = cache.get(key);
    if (cached) return cached as Promise<T>;
    const pending = make();
    cache.set(key, pending);
    pending.catch(() => {
      if (cache.get(key) === pending) cache.delete(key);
    });
    return pending;
  }

  function load<T>(file: string, parse: (raw: unknown) => T): Promise<T> {
    return remember(file, () =>
      readJson(fetchFn, baseUrl, file).then((raw) => {
        try {
          return parse(raw);
        } catch (error: unknown) {
          throw new DataFileError("invalid", file, error instanceof Error ? error.message : "failed its checks");
        }
      }),
    );
  }

  function loadTile(ref: TileRef, cells: number): Promise<Int16Array> {
    const file = tilePath(ref);
    const { width, height } = tileSize(ref, cells);
    return remember(file, async () => {
      const bytes = await readFile(fetchFn, baseUrl, file, (response) => response.arrayBuffer());
      try {
        return await decodeTile(bytes, width, height);
      } catch (error: unknown) {
        throw new DataFileError("invalid", file, error instanceof Error ? error.message : "failed its checks");
      }
    });
  }

  /** Keeps memory bounded when many coordinates are tried; the oldest entries go first. */
  function trimTerrainCache(): void {
    const dropOldest = (matches: (key: string) => boolean, keep: number) => {
      const keys = [...cache.keys()].filter(matches);
      keys.slice(0, Math.max(0, keys.length - keep)).forEach((key) => cache.delete(key));
    };
    dropOldest((key) => key.startsWith("terrain/"), MAX_CACHED_SITES);
    dropOldest((key) => key.endsWith(".i2z"), MAX_CACHED_TILES);
  }

  const loadHeightManifest = () => load("heights/manifest.json", parseHeightManifest);

  const loadSubpoints = (year: number): Promise<SubpointYear> =>
    load(`subpoints-${year}.json`, (raw) => parseSubpointYear(raw, year));
  const loadDsn = (year: number): Promise<DsnYear> => load(`dsn-${year}.json`, (raw) => parseDsnYear(raw, year));

  return {
    async loadEphemeris(years) {
      const known: readonly number[] = DATA_YEARS;
      if (years.length === 0 || !years.every((year) => known.includes(year))) {
        throw new DataFileError("unavailable", "ephemeris", `no data for ${years.join(", ") || "this date"}`);
      }
      const loaded = await Promise.all(
        years.map(async (year): Promise<[number, YearData]> => {
          const [subpoints, dsn] = await Promise.all([loadSubpoints(year), loadDsn(year)]);
          return [year, { subpoints, dsn }];
        }),
      );
      try {
        return new Ephemeris(new Map(loaded));
      } catch (error: unknown) {
        throw new DataFileError("invalid", "ephemeris", error instanceof Error ? error.message : "files do not line up");
      }
    },

    async loadHorizon(siteId) {
      const site = findSite(siteId);
      if (!site?.has_terrain) throw new DataFileError("unavailable", "horizon", "no terrain for this site");
      return load(`horizon/${site.id}.json`, (raw) => parseHorizon(raw, site));
    },

    loadMapGrid: () => load("map/golden-grid.json", parseMapGrid),

    loadHeightManifest,

    loadCustomTerrain(lat, lon) {
      return remember(`terrain/${lat},${lon}`, async () => {
        if (!hasHeightTiles(lat)) throw new DataFileError("unavailable", "terrain", "no height tiles for this latitude");
        const manifest = await loadHeightManifest();
        const refs = await tilesForSite(manifest, lat, lon);
        const loaded = await Promise.all(refs.map(async (ref) => [ref, await loadTile(ref, manifest.tile_cells)] as const));
        const heightAt = heightsFromTiles(manifest, loaded);
        // inside the coverage every ray point has a height; a gap would quietly lower the horizon
        let gaps = 0;
        const counted: HeightAt = (pointLat, pointLon, distanceM) => {
          const height = heightAt(pointLat, pointLon, distanceM);
          if (Number.isNaN(height)) gaps += 1;
          return height;
        };
        const groundM = counted(lat, lon, 0);
        const profile = await computeHorizon(counted, lat, lon);
        if (gaps > 0) throw new DataFileError("invalid", "terrain", `${gaps} points have no height`);
        trimTerrainCache();
        return { profile, groundM, heightAt };
      });
    },
  };
}

/**
 * The years needed to evaluate a time range, in order. A range reaching the last hour of a year
 * also needs the next year when it exists, because that hour blends into its first sample.
 */
export function yearsForRange(startMs: number, endMs: number): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  // the engine treats the end as exclusive
  const lastInstant = Math.max(startMs, endMs - 1);
  const first = new Date(startMs).getUTCFullYear();
  if (first < DATA_YEARS[0] || lastInstant > DATA_END_MS) return [];
  const last = new Date(lastInstant).getUTCFullYear();
  const reachesLastHour = lastInstant >= Date.UTC(last, 11, 31, 23);
  return DATA_YEARS.filter((year) => year >= first && year <= (reachesLastHour ? last + 1 : last));
}

/** The app's shared loader, so every page reuses files already fetched. */
export const dataLoader = createDataLoader();
