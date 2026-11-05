/**
 * "Small change, big impact": the same 14-day landing from points 1 km and 2 km away in each
 * direction, and from the chosen point a day earlier or later. Every moved point gets its own
 * horizon from the height tiles, the same way a custom site does; the chosen point is done the
 * same way too, so the moved points are compared like with like.
 */
import { DATA_END_MS, DATA_START_MS } from "./dataRange";
import { formatChange, formatPercent, isSameAnswer, SAME_HOURS } from "./datesPlan";
import type { DataLoader } from "./data/loader";
import { MOON_RADIUS_KM, type Site } from "./geometry";
import { missionScore } from "./planning";
import { MISSION_DAYS } from "./siteSummary";
import { hasHeightTiles, type SelectedSite } from "./sites";
import type { Ephemeris } from "./windows";

const DAY_MS = 86_400_000;
const MISSION_MS = MISSION_DAYS * DAY_MS;
const DEG = Math.PI / 180;

export const NUDGE_KM: readonly number[] = [1, 2];
export const DIRECTIONS: readonly { name: "north" | "east" | "south" | "west"; letter: string; bearing: number }[] = [
  { name: "north", letter: "N", bearing: 0 },
  { name: "east", letter: "E", bearing: 90 },
  { name: "south", letter: "S", bearing: 180 },
  { name: "west", letter: "W", bearing: 270 },
];

/** The place `km` along the surface from a site, setting off on `bearingDeg` (0 = north). */
export function movedPoint(site: Site, bearingDeg: number, km: number): Site {
  const delta = km / MOON_RADIUS_KM;
  const theta = bearingDeg * DEG;
  const phi1 = site.lat * DEG;
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lam2 = site.lon * DEG + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * sinPhi2);
  return { lat: phi2 / DEG, lon: ((((lam2 / DEG + 180) % 360) + 360) % 360) - 180 };
}

export interface MovedResult {
  direction: (typeof DIRECTIONS)[number]["name"];
  letter: string;
  km: number;
  point: Site;
  goldenHours: number;
}

export interface DateResult {
  days: -1 | 1;
  landingMs: number;
  /** null when that landing falls outside our data */
  goldenHours: number | null;
}

export interface NudgePlan {
  /** The chosen point from the tiles, the baseline for the moved points. */
  centreHours: number;
  moved: MovedResult[];
  /** The chosen point's own horizon (the page's), for the dates. */
  chosenHours: number;
  dates: DateResult[];
}

/** Whether every point of the plan lies where height tiles exist. */
export function canNudge(site: SelectedSite): boolean {
  if (!hasHeightTiles(site.lat)) return false;
  return DIRECTIONS.every(({ bearing }) => NUDGE_KM.every((km) => hasHeightTiles(movedPoint(site, bearing, km).lat)));
}

/** The data a plan reads: a day before the landing to a day after the mission ends, within our data. */
export function nudgeRange(landingMs: number): [number, number] {
  return [Math.max(landingMs - DAY_MS, DATA_START_MS), Math.min(landingMs + MISSION_MS + DAY_MS, DATA_END_MS + 1)];
}

const golden = (eph: Ephemeris, site: Site, profile: readonly number[], landingMs: number) => missionScore(eph, site, profile, landingMs, MISSION_MS).goldenHours;

export async function nudgePlan(loader: DataLoader, eph: Ephemeris, site: SelectedSite, profile: readonly number[], landingMs: number): Promise<NudgePlan> {
  const centre = await loader.loadCustomTerrain(site.lat, site.lon);
  const moved: MovedResult[] = [];
  for (const km of NUDGE_KM) {
    for (const { name, letter, bearing } of DIRECTIONS) {
      const point = movedPoint(site, bearing, km);
      const terrain = await loader.loadCustomTerrain(point.lat, point.lon);
      moved.push({ direction: name, letter, km, point, goldenHours: golden(eph, point, terrain.profile, landingMs) });
    }
  }
  const dates = ([-1, 1] as const).map((days): DateResult => {
    const at = landingMs + days * DAY_MS;
    const isInData = at >= DATA_START_MS && at + MISSION_MS <= eph.dataEnd();
    return { days, landingMs: at, goldenHours: isInData ? golden(eph, site, profile, at) : null };
  });
  return { centreHours: golden(eph, site, centre.profile, landingMs), moved, chosenHours: golden(eph, site, profile, landingMs), dates };
}

export interface NudgeHeadline {
  lead: string;
  emphasis: string;
  tail: string;
  /** Whether a moved point loses Golden hours. */
  isLoss: boolean;
}

const plural = (count: number) => (count === 1 ? "hour" : "hours");

/** The change against the chosen landing, worded exactly as the slip table words it. */
export function changeText(hours: number, baseline: number): string {
  const percent = baseline > 0 ? formatPercent((100 * (hours - baseline)) / baseline) : null;
  return percent ? `${formatChange(hours, baseline)} (${percent})` : formatChange(hours, baseline);
}

/** "costs 24", "gains 5", "costs under 1", from the slip table's own wording of the change. */
function delayText(later: number, chosen: number): string {
  if (isSameAnswer(later, chosen)) return "a day's delay changes nothing";
  const gap = formatChange(later, chosen).replace(/^[+−]/, "").replace(/ h$/, "");
  return later < chosen ? `a day's delay costs ${gap}` : `a day's delay gains ${gap}`;
}

/**
 * The biggest loss among the moved points against the chosen landing, then what a day's delay
 * does. Every point and date is measured against the chosen landing as the rest of the page shows it.
 */
export function nudgeHeadline(plan: NudgePlan): NudgeHeadline {
  const base = plan.chosenHours;
  const later = plan.dates.find(({ days }) => days === 1);
  const tail = later?.goldenHours == null ? "." : `; ${delayText(later.goldenHours, base)}.`;
  if (base < SAME_HOURS) return { lead: "This landing has ", emphasis: "no Golden hours to lose", tail: ".", isLoss: false };
  const worst = plan.moved.reduce((a, b) => (b.goldenHours < a.goldenHours ? b : a));
  if (worst.goldenHours >= base || isSameAnswer(worst.goldenHours, base)) {
    return { lead: `Each of the ${plan.moved.length} points checked keeps `, emphasis: "at least as many Golden hours", tail, isLoss: false };
  }
  const shown = Math.floor(base);
  const lead = `Move ${worst.km} km ${worst.direction} and the landing loses `;
  if (worst.goldenHours < SAME_HOURS) return { lead, emphasis: `all ${shown} Golden ${plural(shown)}`, tail, isLoss: true };
  if (worst.goldenHours < 1) return { lead, emphasis: `${shown} of ${shown} Golden ${plural(shown)}, all but under 1 h`, tail, isLoss: true };
  const lost = shown - Math.floor(worst.goldenHours);
  return { lead, emphasis: `${lost > 0 ? lost : "under 1"} of ${shown} Golden ${plural(shown)}`, tail, isLoss: true };
}
