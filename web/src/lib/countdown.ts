/**
 * Sunset / sunrise / Earthset / Earthrise countdown from a moment, built on findWindows.
 * An event is null when it does not happen before `searchedUntil` (e.g. a long polar day,
 * a far-side site that never sees Earth, or the end of the loaded data).
 */
import type { Site } from "./geometry";
import { type Ephemeris, type SiteState, type Window, findWindows, stateAt } from "./windows";

const DAY_MS = 86_400_000;
export const DEFAULT_SEARCH_MS = 60 * DAY_MS;

export interface Countdown {
  now: SiteState;
  nextSunrise: number | null;
  nextSunset: number | null;
  nextEarthrise: number | null;
  nextEarthset: number | null;
  searchedUntil: number;
}

/** First opening and first closing inside the searched range; clipped edges are not events. */
function nextEdges(windows: Window[]): { rise: number | null; set: number | null } {
  const rise = windows.find((w) => !w.startClipped)?.start ?? null;
  const set = windows.find((w) => !w.endClipped)?.end ?? null;
  return { rise, set };
}

export function countdown(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  utcMs: number,
  searchMs: number = DEFAULT_SEARCH_MS,
): Countdown {
  const now = stateAt(eph, site, profile, utcMs);
  const searchedUntil = Math.min(utcMs + searchMs, eph.dataEnd());
  const sun = nextEdges(findWindows(eph, site, profile, utcMs, searchedUntil, "lit"));
  const earth = nextEdges(findWindows(eph, site, profile, utcMs, searchedUntil, "earth"));
  return {
    now,
    nextSunrise: sun.rise,
    nextSunset: sun.set,
    nextEarthrise: earth.rise,
    nextEarthset: earth.set,
    searchedUntil,
  };
}
