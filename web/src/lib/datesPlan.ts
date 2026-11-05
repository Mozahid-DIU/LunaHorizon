/**
 * The Dates page: the best landings in the next 12 months and what a delay or a nearby site
 * would change. Every figure comes from bestDates and slipPlanner; this file only sets their
 * inputs and words the results.
 */
import { DATA_END_MS } from "./dataRange";
import { MOON_RADIUS_KM, type Site } from "./geometry";
import { bestDates, slipPlanner, type BestDate, type SiteInput, type SlipPlan } from "./planning";
import { formatUtc } from "./selection";
import { MISSION_DAYS } from "./siteSummary";
import { SITES, type CuratedSite, type SelectedSite } from "./sites";
import type { Ephemeris } from "./windows";

export const SEARCH_DAYS = 365;
export const BEST_COUNT = 5;
export const SLIP_DAYS: readonly number[] = [1, 7, 30];
export const NEARBY_KM = 500;
/** Closer than this is the same landing area, such as Apollo 12 beside Surveyor 3. */
export const SAME_AREA_KM = 1;
export const NEARBY_COUNT = 3;

const DAY_MS = 86_400_000;
const MISSION_MS = MISSION_DAYS * DAY_MS;
const DEGREES = Math.PI / 180;
/** Window edges are known to 30 s, so two totals this close are the same answer. */
export const SAME_HOURS = 1 / 60;

export interface DatesPlan {
  best: BestDate[];
  /** null when a mission from the chosen date runs past the data. */
  slip: SlipPlan | null;
  /** The data ended before the full search. */
  isSearchCut: boolean;
}

/** The end of the data this plan reads. */
export function planEnd(landingMs: number): number {
  return Math.min(landingMs + (SEARCH_DAYS + MISSION_DAYS) * DAY_MS, DATA_END_MS);
}

export function planDates(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  landingMs: number,
  alternatives: readonly (SiteInput & { id: string })[],
): DatesPlan {
  const searchMs = SEARCH_DAYS * DAY_MS;
  const canLand = landingMs + MISSION_MS <= eph.dataEnd();
  return {
    // a mission apart, or the five best would be five neighbouring days of one chance
    best: bestDates(eph, site, profile, landingMs, searchMs, MISSION_MS, BEST_COUNT, MISSION_MS),
    slip: canLand ? slipPlanner(eph, { site, profile }, landingMs, MISSION_MS, SLIP_DAYS, alternatives) : null,
    isSearchCut: landingMs + searchMs + MISSION_MS > eph.dataEnd(),
  };
}

function distanceKm(a: Site, b: Site): number {
  const dLat = (b.lat - a.lat) * DEGREES;
  const dLon = (b.lon - a.lon) * DEGREES;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEGREES) * Math.cos(b.lat * DEGREES) * Math.sin(dLon / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface NearbySite {
  site: CuratedSite;
  km: number;
}

/** The closest curated sites within reach of a change of plan, nearest first. */
export function nearbySites(site: SelectedSite, list: readonly CuratedSite[] = SITES): NearbySite[] {
  return list
    .map((candidate) => ({ site: candidate, km: distanceKm(site, candidate) }))
    .filter(({ km }) => km >= SAME_AREA_KM && km <= NEARBY_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, NEARBY_COUNT);
}

export interface DatesHeadline {
  lead: string;
  emphasis: string;
}

export const isSameAnswer = (a: number, b: number) => Math.floor(a) === Math.floor(b) && Math.abs(a - b) < SAME_HOURS;

function hoursText(hours: number): string {
  if (hours < 1) return "under 1 Golden hour.";
  return `${Math.floor(hours)} Golden ${Math.floor(hours) === 1 ? "hour" : "hours"}.`;
}

/** What the search comes to. A date level with the top one counts as the best, whichever sorted first. */
export function datesHeadline(best: readonly BestDate[], chosenHours: number | null, isSearchCut: boolean): DatesHeadline | null {
  if (best.length === 0) return null;
  const hours = best[0].score.goldenHours;
  if (hours < SAME_HOURS) return { lead: "No Golden hours ", emphasis: isSearchCut ? "before our data ends." : "in these 12 months." };
  const isChosenBest = chosenHours !== null && isSameAnswer(chosenHours, hours);
  const span = isSearchCut ? "before our data ends" : "in 12 months";
  return { lead: isChosenBest ? `This date is the best ${span}: ` : `${formatUtc(best[0].landingMs).split(",")[0]} gives `, emphasis: hoursText(hours) };
}

/** The change in the hours as shown, rounded down there; a real change never reads as none. */
export function formatChange(hours: number, baseline: number): string {
  if (isSameAnswer(hours, baseline)) return "No change";
  const sign = hours > baseline ? "+" : "−";
  const gap = Math.abs(Math.floor(hours) - Math.floor(baseline));
  return `${sign}${gap > 0 ? gap : "under 1"} h`;
}

/** A whole-percent change with its sign, or null if it rounds to nothing or has no baseline. */
export function formatPercent(percent: number | null): string | null {
  if (percent === null || Math.round(percent) === 0) return null;
  return `${percent > 0 ? "+" : "−"}${Math.abs(Math.round(percent))}%`;
}
