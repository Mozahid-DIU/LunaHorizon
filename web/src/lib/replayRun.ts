/**
 * What the engine says about a real landing, from the moment it touched down: where the Sun and
 * Earth stood, when the site's own skyline next hid them, and how many hours of light and contact
 * fell between touchdown and the end of the mission as it really happened.
 */
import { countdown } from "./countdown";
import type { Site } from "./geometry";
import { findWindows, stateAt, type Ephemeris, type SiteState, type Window, type WindowKind } from "./windows";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How far after touchdown the next sunset and Earthset are looked for. */
export const REPLAY_SEARCH_DAYS = 30;

export interface ReplayRun {
  landing: SiteState;
  /** The next sunset after touchdown; null if the Sun was down or does not set within the search. */
  sunsetMs: number | null;
  /** The next sunrise after touchdown, when the Sun was down. */
  sunriseMs: number | null;
  earthsetMs: number | null;
  earthriseMs: number | null;
  /** The sunrise after that sunset: when a lander that slept through the night could see the Sun again. */
  nextSunriseMs: number | null;
  /** Hours from touchdown to the mission's real end, by kind; null when only the end's date is known. */
  hours: Record<"lit" | "earth" | "comms" | "golden", number> | null;
}

const hoursIn = (windows: readonly Window[]) => windows.reduce((sum, w) => sum + (w.end - w.start), 0) / HOUR_MS;

export function replayRun(eph: Ephemeris, site: Site, profile: readonly number[], landedMs: number, endMs: number | null): ReplayRun {
  if (endMs !== null && !(endMs > landedMs)) throw new RangeError("a mission must end after it lands");
  const clock = countdown(eph, site, profile, landedMs, REPLAY_SEARCH_DAYS * DAY_MS);
  const hours = (kind: WindowKind, end: number) => hoursIn(findWindows(eph, site, profile, landedMs, end, kind));
  const sunset = clock.nextSunset;
  const night = sunset === null ? null : countdown(eph, site, profile, sunset + MINUTE_MS, REPLAY_SEARCH_DAYS * DAY_MS);
  return {
    landing: stateAt(eph, site, profile, landedMs),
    sunsetMs: clock.nextSunset,
    sunriseMs: clock.nextSunrise,
    earthsetMs: clock.nextEarthset,
    earthriseMs: clock.nextEarthrise,
    nextSunriseMs: night?.nextSunrise ?? null,
    hours: endMs === null ? null : { lit: hours("lit", endMs), earth: hours("earth", endMs), comms: hours("comms", endMs), golden: hours("golden", endMs) },
  };
}

/** How long after a known end, or after the end of a date-only end's day, the replay keeps going. */
const AFTER_END_MS = 12 * HOUR_MS;
/** A sunset this soon after the mission's end is played too, so the two can be seen together. */
const SUNSET_REACH_MS = 3 * DAY_MS;

export interface RecordEnd {
  endMs: number | null;
  /** The UTC date of the end, YYYY-MM-DD. */
  endDate: string;
}

/** The latest moment the reported end could be: its time, or the end of its day when only the date is known. */
export function latestEnd(record: RecordEnd): number {
  return record.endMs ?? Date.parse(`${record.endDate}T00:00:00Z`) + DAY_MS;
}

/** How long the replay plays, from touchdown: past the reported end, and on to a sunset just after it. */
export function replayLength(landedMs: number, record: RecordEnd, sunsetMs: number | null): number {
  const end = latestEnd(record);
  const reach = sunsetMs !== null && sunsetMs > end && sunsetMs - end <= SUNSET_REACH_MS ? sunsetMs : end;
  return reach + AFTER_END_MS - landedMs;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const span = (ms: number) => {
  const hours = Math.round(ms / HOUR_MS);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours} h`;
};

/** One sentence that sets the reported end beside the engine's sunset at this site. */
export function endBesideSunset(record: RecordEnd, sunsetMs: number | null, landedLit: boolean): string {
  if (!landedLit) return "The Sun was below this site's skyline at touchdown.";
  if (sunsetMs === null) return `The Sun did not set behind this site's skyline within ${REPLAY_SEARCH_DAYS} days of touchdown.`;
  if (record.endMs !== null) {
    const gap = record.endMs - sunsetMs;
    if (Math.abs(gap) < HOUR_MS) return "The mission ended within an hour of the Sun setting behind this site's skyline.";
    return gap < 0
      ? `The mission ended ${span(-gap)} before the Sun set behind this site's skyline.`
      : `The mission's last data came ${span(gap)} after the Sun set behind this site's skyline.`;
  }
  const endDay = Date.parse(`${record.endDate}T00:00:00Z`);
  const sunsetDay = Math.floor(sunsetMs / DAY_MS) * DAY_MS;
  const days = Math.round((sunsetDay - endDay) / DAY_MS);
  if (days === 0) return `The Sun set behind this site's skyline on ${formatDate(sunsetMs)}, the same day the team reported.`;
  return `The Sun set behind this site's skyline on ${formatDate(sunsetMs)}, ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ${days > 0 ? "after" : "before"} the day the team reported.`;
}
