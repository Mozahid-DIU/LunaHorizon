/**
 * What the Atlas site card shows, taken straight from the engine: a 14-day mission from the
 * landing time, and the next change of Sun and Earth. Nothing here does its own astronomy.
 */
import { countdown, DEFAULT_SEARCH_MS, type Countdown } from "./countdown";
import type { Site } from "./geometry";
import { totalHours } from "./planning";
import { type Ephemeris, type Window, type WindowKind, findWindows } from "./windows";

export const MISSION_DAYS = 14;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Part of the mission, as shares of its length from 0 to 1. */
export interface Span {
  from: number;
  to: number;
}

export interface BodyOutlook {
  isUp: boolean;
  /** When it next sets if it is up, or rises if it is down; null if not within the search. */
  eventMs: number | null;
}

type MissionKind = Exclude<WindowKind, "earth" | "dsn">;

export interface SiteOutlook {
  sun: BodyOutlook;
  earth: BodyOutlook;
  /** The data ended before the full search, so a missing event may still happen. */
  isSearchCut: boolean;
}

export interface SiteSummary extends SiteOutlook {
  hours: Record<MissionKind, number>;
  spans: Record<MissionKind, Span[]>;
}

/** What comes next, from the engine's countdown: a setting if the body is up, else a rising. */
export function outlookFrom(clock: Countdown): SiteOutlook {
  return {
    sun: { isUp: clock.now.lit, eventMs: clock.now.lit ? clock.nextSunset : clock.nextSunrise },
    earth: { isUp: clock.now.earthVisible, eventMs: clock.now.earthVisible ? clock.nextEarthset : clock.nextEarthrise },
    isSearchCut: clock.searchedUntil < clock.now.utcMs + DEFAULT_SEARCH_MS,
  };
}

/** The engine's answer for this site and time, or null if the mission runs past the data. */
export function siteSummary(eph: Ephemeris, site: Site, profile: readonly number[], landingMs: number): SiteSummary | null {
  const missionMs = MISSION_DAYS * DAY_MS;
  const endMs = landingMs + missionMs;
  if (endMs > eph.dataEnd()) return null;

  const windowsOf = (kind: WindowKind) => findWindows(eph, site, profile, landingMs, endMs, kind);
  const toSpans = (windows: Window[]) =>
    windows.map((w) => ({ from: (w.start - landingMs) / missionMs, to: (w.end - landingMs) / missionMs }));

  const [lit, comms, golden] = [windowsOf("lit"), windowsOf("comms"), windowsOf("golden")];
  return {
    ...outlookFrom(countdown(eph, site, profile, landingMs)),
    hours: { lit: totalHours(lit), comms: totalHours(comms), golden: totalHours(golden) },
    spans: { lit: toSpans(lit), comms: toSpans(comms), golden: toSpans(golden) },
  };
}

/** Days to one decimal, rounded down so a nearly full mission never reads as full. */
export function formatDays(hours: number): string {
  return String(Math.floor((hours / 24) * 10) / 10);
}

export function formatDuration(ms: number): string {
  if (ms < MINUTE_MS) return "under 1 min";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)} min`;
  return `${Math.floor(ms / DAY_MS)}d ${Math.floor((ms % DAY_MS) / HOUR_MS)}h`;
}

export function formatCoordinates(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;
}
