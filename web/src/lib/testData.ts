/** Test-only helpers that read the generated data files from public/data. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Ephemeris, type DsnYear, type YearData } from "./windows";
import type { SubpointYear } from "./geometry";

const DATA = join(__dirname, "..", "..", "public", "data");

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(DATA, ...parts), "utf-8")) as T;
}

export function loadEphemeris(years: number[]): Ephemeris {
  const map = new Map<number, YearData>();
  for (const y of years) {
    map.set(y, {
      subpoints: readJson<SubpointYear>(`subpoints-${y}.json`),
      dsn: readJson<DsnYear>(`dsn-${y}.json`),
    });
  }
  return new Ephemeris(map);
}

/** Terrain horizon for a site, or a flat 0° horizon where no terrain file exists. */
export function loadProfile(siteId: string): number[] {
  if (!existsSync(join(DATA, "horizon", `${siteId}.json`))) {
    return Array.from({ length: 360 }, () => 0);
  }
  return readJson<{ elevation_deg: number[] }>("horizon", `${siteId}.json`).elevation_deg;
}
