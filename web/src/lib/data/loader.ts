/**
 * Loads the generated data files on demand. Each file is fetched once, checked by validate.ts,
 * and kept only if it passes, so a failed or damaged file can be tried again.
 */
import { DATA_END_MS } from "../dataRange";
import { findSite } from "../sites";
import { Ephemeris, type DsnYear, type YearData } from "../windows";
import type { SubpointYear } from "../geometry";
import { type HorizonFile, type MapGrid, parseDsnYear, parseHorizon, parseMapGrid, parseSubpointYear } from "./validate";

export const DATA_YEARS = [2026, 2027, 2028, 2029, 2030] as const;

const TIMEOUT_MS = 20_000;

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

async function readJson(fetchFn: FetchFn, baseUrl: string, file: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetchFn(`${baseUrl}/${file}`, { signal: controller.signal });
    if (response.status === 404) throw new DataFileError("missing", file, "file not found");
    if (!response.ok) throw new DataFileError("network", file, `server answered ${response.status}`);
    text = await response.text();
  } catch (error: unknown) {
    if (error instanceof DataFileError) throw error;
    if (controller.signal.aborted) throw new DataFileError("timeout", file, "no answer in time");
    throw new DataFileError("network", file, error instanceof Error ? error.message : "request failed");
  } finally {
    clearTimeout(timer);
  }
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
}

export function createDataLoader(fetchFn: FetchFn = (input, init) => fetch(input, init), baseUrl = "/data"): DataLoader {
  const cache = new Map<string, Promise<unknown>>();

  function load<T>(file: string, parse: (raw: unknown) => T): Promise<T> {
    const cached = cache.get(file);
    if (cached) return cached as Promise<T>;
    const pending = readJson(fetchFn, baseUrl, file).then((raw) => {
      try {
        return parse(raw);
      } catch (error: unknown) {
        throw new DataFileError("invalid", file, error instanceof Error ? error.message : "failed its checks");
      }
    });
    cache.set(file, pending);
    pending.catch(() => {
      if (cache.get(file) === pending) cache.delete(file);
    });
    return pending;
  }

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
  };
}

/**
 * The years needed to evaluate a time range, in order. The year after the range is included
 * when it exists, because the last hour of a year blends into the next year's first sample.
 */
export function yearsForRange(startMs: number, endMs: number): number[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  // the engine treats the end as exclusive
  const lastInstant = Math.max(startMs, endMs - 1);
  const first = new Date(startMs).getUTCFullYear();
  if (first < DATA_YEARS[0] || lastInstant > DATA_END_MS) return [];
  const last = new Date(lastInstant).getUTCFullYear();
  return DATA_YEARS.filter((year) => year >= first && year <= last + 1);
}

/** The app's shared loader, so every page reuses files already fetched. */
export const dataLoader = createDataLoader();
