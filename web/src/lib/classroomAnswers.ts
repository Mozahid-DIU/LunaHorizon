/**
 * Classroom answers, built only from the numbers each page has already worked out, so a lesson
 * never shows a number the page itself does not stand behind.
 */
import shares from "@/data/site-shares.json";
import { isSameAnswer, SAME_HOURS } from "./datesPlan";
import { formatUtc } from "./selection";
import { MISSION_DAYS } from "./siteSummary";
import { formatHours } from "./timeline";

export type LessonAnswer =
  | { kind: "ready"; big: string; why: string; source: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "calculating" };

export const CALCULATING: LessonAnswer = { kind: "calculating" };
export const DATA_FAILED: LessonAnswer = { kind: "unavailable", reason: "The data did not load. Press Try again on the page." };
const ENGINE = "Worked out by the engine for this site and date";
const ready = (big: string, why: string, source = ENGINE): LessonAnswer => ({ kind: "ready", big, why, source });
const unavailable = (reason: string): LessonAnswer => ({ kind: "unavailable", reason });

const MISSION_HOURS = MISSION_DAYS * 24;
/** How wide the Sun looks from the Moon, as the Proof page says. */
export const SUN_WIDTH_DEG = 0.53;
const EQUATOR_SITE = "apollo-11";
const PAST_DATA = "A 14-day mission from this date runs past our data, which ends in 2030. Choose an earlier date.";

type ShareTable = Record<string, { lit: number }>;
const percent = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;

export function atlasAnswer(siteId: string | null, siteName: string): LessonAnswer {
  const table = shares as ShareTable;
  const own = siteId === null ? undefined : table[siteId];
  if (!own) return unavailable("Choose one of the listed sites in the bar at the top to see this answer.");
  const equator = table[EQUATOR_SITE];
  const versus = siteId === EQUATOR_SITE ? "" : ` For comparison, the Apollo 11 site near the equator gets ${percent(equator.lit)}.`;
  return ready(percent(own.lit), `${siteName} has the Sun above its own skyline in ${percent(own.lit)} of the hours (the Sunlight layer on the map).${versus}`, "From our hour-by-hour count for 2026 to 2030");
}

/** `litHours`: sunlit hours in the 14 days from landing, or null when the mission runs past the data. */
export function skyAnswer(litHours: number | null): LessonAnswer {
  if (litHours === null) return unavailable(PAST_DATA);
  // the dark hours are what is left of the hours shown, so the two always add up to 336
  const dark = MISSION_HOURS - Math.floor(litHours);
  const rest = litHours < 1 ? "For the rest of the time" : `For the other ${dark} h`;
  const why =
    dark === 0
      ? "The Sun stays above this site's skyline for all 14 days."
      : `${rest} the Sun is below this site's skyline: it has set, or the ground hides it.`;
  return ready(`${formatHours(litHours)} of ${MISSION_HOURS} h`, why);
}

export interface DatedScore {
  landingMs: number;
  goldenHours: number;
}

/** `best`: the page's top date; `chosen`: the chosen date's own score, null if its mission runs past the data. */
export function datesAnswer(best: DatedScore | null, chosen: DatedScore | null, isSearchCut: boolean): LessonAnswer {
  if (best === null) return unavailable(PAST_DATA);
  const span = isSearchCut ? "before our data ends" : "in these 12 months";
  if (best.goldenHours < SAME_HOURS) return ready("None", `No landing date ${span} gives this site any Golden hours.`);
  // a date level with the top one counts as the best, as the page's headline says
  if (chosen && isSameAnswer(chosen.goldenHours, best.goldenHours)) {
    return ready("The chosen date", `Landing at ${formatUtc(chosen.landingMs)} already gives the most: ${formatHours(chosen.goldenHours)} of Golden hours in a 14-day mission.`);
  }
  return ready(formatUtc(best.landingMs).split(",")[0], `Landing at ${formatUtc(best.landingMs)} gives ${formatHours(best.goldenHours)} of Golden hours in a 14-day mission.`);
}

/** `headline`: the Power page's own headline; `lowestPct`: the lowest charge it shows. */
export function powerAnswer(headline: { lead: string; emphasis: string; survives: boolean } | null, lowestPct: number | null, isPastData: boolean): LessonAnswer {
  if (isPastData) return unavailable("A mission this long from this date runs past our data, which ends in 2030.");
  if (headline === null || lowestPct === null) return unavailable("Fix the values marked in the form to see this answer.");
  return ready(headline.survives ? "Yes" : "No", `${headline.lead}${headline.emphasis} The lowest charge is ${lowestPct}%.`);
}

/** `lead`: the Compare page's own ranking, or null when fewer than two columns have a result. */
export function compareAnswer(lead: { best: number; isBest: readonly boolean[] } | null, labels: readonly string[]): LessonAnswer {
  if (lead === null) return unavailable("Add a second site or date. The answer needs at least two columns with a result.");
  const hours = formatHours(lead.best);
  if (lead.best < SAME_HOURS) return ready("None", "No column on this page gets any Golden hours.");
  const winners = labels.filter((_, i) => lead.isBest[i]);
  if (winners.length === 0) return ready("A tie", `The columns that count all get ${hours} of Golden hours.`);
  return ready(winners.join(" and "), `${hours} of Golden hours in a 14-day mission, the most on this page.`);
}

export function ellipseAnswer(zone: { best: number; worst: number } | null, hasZone: boolean): LessonAnswer {
  if (!hasZone) return unavailable("This page works for the Shackleton rim, IM-1 and IM-2 sites. Choose one of them in the bar at the top.");
  if (zone === null) return unavailable(PAST_DATA);
  // the gap between the hours as shown, so a reader's own subtraction agrees; a real gap never reads as none
  const shownGap = Math.floor(zone.best) - Math.floor(zone.worst);
  const gap = shownGap === 0 && zone.best - zone.worst >= SAME_HOURS ? "under 1 h" : `${shownGap} h`;
  return ready(gap, `The best point gets ${formatHours(zone.best)} of Golden hours and the worst ${formatHours(zone.worst)}. Landing off target can cost that difference.`);
}

/** Angles as the 3D page writes them, with one decimal. */
export function threeAnswer(sun: { el: number; horizon: number } | null, isLit: boolean, degrees: (value: number) => string): LessonAnswer {
  if (sun === null) return unavailable("This page needs a site with 3D terrain.");
  const where = isLit ? "above it, so the lander is in sunlight" : "below it, so the lander is in shadow";
  return ready(degrees(sun.horizon), `The Sun is at ${degrees(sun.el)}, ${where}. The answer changes as the film plays.`, "Worked out by the engine for the moment shown");
}

const PROOF = "From the checks listed on this page";

/** The largest angle difference as the Proof page writes it. */
export function proofAnswer(maxDeg: number, formatted: string): LessonAnswer {
  if (!(maxDeg > 0)) return ready(formatted, "Every check matched its reference exactly at the precision shown.", PROOF);
  // strictly below the ratio, so "more than" is always true
  const times = Math.ceil(SUN_WIDTH_DEG / maxDeg) - 1;
  const why =
    times >= 2
      ? `The Sun looks about ${SUN_WIDTH_DEG}° wide from the Moon. Our largest difference would fit across it more than ${times.toLocaleString("en-US")} times.`
      : `The Sun looks about ${SUN_WIDTH_DEG}° wide from the Moon, for scale.`;
  return ready(formatted, why, PROOF);
}
