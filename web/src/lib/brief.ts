/**
 * The Mission Brief: the words and layout of a one-page-per-side report for a site and landing.
 * Every number here comes from the engine's own results (siteSummary, timelineRows, relay,
 * runPower, the ellipse scores, the nudge plan, the date search); this file only words them.
 * Nothing here is written by AI.
 */
import { formatChange, isSameAnswer, SAME_HOURS } from "./datesPlan";
import { ELEVATION_MASK_DEG } from "./dsnRelay";
import { formatSpan } from "./powerPlan";
import { formatHours } from "./timeline";
import type { TerrainRow, ValidationFile } from "./data/validate";
import type { Span } from "./dsnRelay";
import type { ZoneSummary } from "./ellipse";
import type { BestDate, SlipPlan } from "./planning";
import type { PowerRun } from "./power";
import { formatDays, formatDuration, MISSION_DAYS, type SiteSummary } from "./siteSummary";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const MISSION_MS = MISSION_DAYS * DAY_MS;
const MISSION_HOURS = MISSION_DAYS * 24;
/** A landing zone counts as risky when its worst point keeps under this share of the target's hours. */
const RISKY_SHARE = 0.9;
export const ALTERNATIVE_COUNT = 3;

/** The stamp on the first page: how much of the mission is Golden. */
export function briefStamp(goldenHours: number): string {
  if (goldenHours < SAME_HOURS) return "NO GOLDEN HOURS";
  // under a tenth of a day, days would read 0, so it is said in hours
  if (formatDays(goldenHours) === "0") return goldenHours < 1 ? "GOLDEN · UNDER 1 HOUR" : `GOLDEN · ${Math.floor(goldenHours)} ${Math.floor(goldenHours) === 1 ? "HOUR" : "HOURS"}`;
  if (isSameAnswer(goldenHours, MISSION_HOURS)) return `GOLDEN · ${MISSION_DAYS} OF ${MISSION_DAYS} DAYS`;
  return `GOLDEN · ${formatDays(goldenHours)} OF ${MISSION_DAYS} DAYS`;
}

/** Where an event falls against the mission: "3h after the mission ends" or "during the mission, on day 9". */
export function againstMission(eventMs: number, landingMs: number): string {
  const endMs = landingMs + MISSION_MS;
  if (eventMs >= endMs) return eventMs === endMs ? "as the mission ends" : `${formatSpan((eventMs - endMs) / HOUR_MS)} after the mission ends`;
  return `during the mission, on day ${Math.floor((eventMs - landingMs) / DAY_MS) + 1}`;
}

export interface WatchItem {
  isRisk: boolean;
  title: string;
  text: string;
}

export interface WatchInput {
  landingMs: number;
  summary: SiteSummary;
  /** The hours with no DSN station during the mission, and the gaps themselves. */
  missionGaps: readonly Span[];
  zone: ZoneSummary | null;
  slip: SlipPlan | null;
  power: PowerRun | null;
}

function hoursWord(hours: number): string {
  if (hours < SAME_HOURS) return "0 hours";
  if (hours < 1) return "under 1 hour";
  return `${Math.floor(hours)} ${Math.floor(hours) === 1 ? "hour" : "hours"}`;
}

function bodyWatch(name: "Earth" | "the Sun", isUp: boolean, eventMs: number | null, isSearchCut: boolean, landingMs: number, upWord: string, downWord: string): WatchItem {
  const subject = name === "Earth" ? "Earth" : "The Sun";
  if (eventMs === null) {
    const where = isSearchCut ? "before our data ends" : "in the 60 days after landing";
    const title = `No ${isUp ? downWord : upWord} ${where}`;
    const span = isSearchCut ? "as far as our data goes" : "for at least 60 days";
    return isUp
      ? { isRisk: false, title, text: `${subject} is up at landing and stays up ${span}.` }
      : { isRisk: true, title, text: `${subject} is down at landing and stays down ${span}.` };
  }
  const when = againstMission(eventMs, landingMs);
  const isDuring = eventMs < landingMs + MISSION_MS;
  if (isUp) {
    const effect = name === "Earth" ? "direct contact with Earth ends then" : "the lander faces night from then";
    return { isRisk: isDuring, title: `${subject === "Earth" ? "Earthset" : "Sunset"} ${formatDuration(eventMs - landingMs)} after landing`, text: isDuring ? `That is ${when}: ${effect}.` : `That is ${when}.` };
  }
  return { isRisk: true, title: `${subject} is down at landing`, text: `${subject === "Earth" ? "Earthrise" : "Sunrise"} comes ${formatDuration(eventMs - landingMs)} after landing, ${when}.` };
}

/** The risks and notes on page two, each one a fact from the results. Risks come first. */
export function watchList({ landingMs, summary, missionGaps, zone, slip, power }: WatchInput): WatchItem[] {
  const items: WatchItem[] = [];
  if (zone && zone.target.score.goldenHours > 0 && zone.worst.score.goldenHours < zone.target.score.goldenHours * RISKY_SHARE) {
    items.push({
      isRisk: true,
      title: "Landing accuracy matters",
      text: `Within ${zone.ringM} m of the target the points range from ${hoursWord(zone.worst.score.goldenHours)} to ${hoursWord(zone.best.score.goldenHours)}; half of the ${zone.count} points get ${hoursWord(zone.median.score.goldenHours)} or less.`,
    });
  }
  items.push(bodyWatch("Earth", summary.earth.isUp, summary.earth.eventMs, summary.isSearchCut, landingMs, "Earthrise", "Earthset"));
  items.push(bodyWatch("the Sun", summary.sun.isUp, summary.sun.eventMs, summary.isSearchCut, landingMs, "sunrise", "sunset"));
  const gapHours = missionGaps.reduce((sum, { start, end }) => sum + (end - start) / HOUR_MS, 0);
  items.push(
    missionGaps.length === 0
      ? { isRisk: false, title: "A DSN station always listens", text: `At least one of the three stations has the Moon ${ELEVATION_MASK_DEG}° up for the whole mission.` }
      : {
          isRisk: true,
          title: `${missionGaps.length} DSN ${missionGaps.length === 1 ? "gap" : "gaps"} during the mission`,
          text: `No station listens for ${hoursWord(gapHours)} in all; plan contact around them.`,
        },
  );
  const later = slip?.rows.find((row) => row.kind === "slip" && row.days === 1);
  if (slip && later?.score) {
    const base = slip.baseline.goldenHours;
    const after = later.score.goldenHours;
    items.push({ isRisk: after < base && !isSameAnswer(after, base), title: `A day late ${dayLate(after, base)}`, text: `${formatHours(base)} as planned, ${formatHours(after)} a day later.` });
  }
  if (power && power.emptyAtMs !== null) {
    items.push({ isRisk: true, title: "The example lander runs out of power", text: power.emptyAtMs <= landingMs ? "At landing; see the Power page to size the battery." : `After ${formatSpan((power.emptyAtMs - landingMs) / HOUR_MS)}; see the Power page to size the battery.` });
  }
  return [...items.filter(({ isRisk }) => isRisk), ...items.filter(({ isRisk }) => !isRisk)];
}

/** "costs 21 Golden hours", "gains 1 Golden hour", "costs under 1 Golden hour", as the slip table counts it. */
export function dayLate(after: number, base: number): string {
  if (isSameAnswer(after, base)) return "changes nothing";
  const gap = formatChange(after, base).replace(/^[+−]/, "").replace(/ h$/, "");
  const unit = gap === "1" || gap === "under 1" ? "hour" : "hours";
  return `${after < base ? "costs" : "gains"} ${gap} Golden ${unit}`;
}

/** The DSN gaps that fall inside the mission. */
export function gapsWithin(gaps: readonly Span[], landingMs: number): Span[] {
  const endMs = landingMs + MISSION_MS;
  return gaps.filter(({ start, end }) => end > landingMs && start < endMs).map(({ start, end }) => ({ start: Math.max(start, landingMs), end: Math.min(end, endMs) }));
}

/** Other landings worth a look: the best dates that are not the chosen one. */
export function alternatives(best: readonly BestDate[], chosenMs: number, count = ALTERNATIVE_COUNT): BestDate[] {
  return best.filter(({ landingMs }) => Math.abs(landingMs - chosenMs) >= MISSION_MS).slice(0, count);
}

export interface SkyFrame {
  /** Degrees at the top and bottom of the picture. */
  topDeg: number;
  bottomDeg: number;
  /** How much the picture stretches heights against widths. */
  stretch: number;
}

/** A frame that holds the skyline, the Sun's path and Earth, with a degree of sky above and below. */
export function skyFrame(profile: readonly number[], elevations: readonly number[], widthPx: number, heightPx: number): SkyFrame {
  const values = [...profile, ...elevations];
  const topDeg = Math.ceil(Math.max(...values) + 1);
  const bottomDeg = Math.floor(Math.min(...values) - 1);
  const pxPerDegUp = heightPx / (topDeg - bottomDeg);
  const pxPerDegAcross = widthPx / 360;
  return { topDeg, bottomDeg, stretch: pxPerDegUp / pxPerDegAcross };
}

export interface Evidence {
  checks: number;
  passed: number;
  /** The largest angle difference, rounded up to 0.0001 degrees so it is never understated. */
  maxAngleDeg: string;
  heightChecks: number;
  heightsPassed: number;
  /** The largest difference among the height checks that passed. */
  maxHeightDiffM: number;
  heightToleranceM: number;
}

/** The validation file's summary as the brief states it. */
export function evidenceOf(file: ValidationFile): Evidence {
  const heights = file.sections.flatMap(({ rows }) => rows).filter((row): row is TerrainRow => row.kind === "terrain" && row.unit === "m");
  const passing = heights.filter(({ pass }) => pass);
  return {
    checks: file.summary.checks,
    passed: file.summary.passed,
    maxAngleDeg: (Math.ceil(file.summary.max_angle_diff_deg * 10_000) / 10_000).toFixed(4),
    heightChecks: heights.length,
    heightsPassed: passing.length,
    maxHeightDiffM: Math.max(...passing.map(({ diff }) => diff)),
    heightToleranceM: Math.max(...heights.map(({ tolerance }) => tolerance)),
  };
}
