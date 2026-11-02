/**
 * The Compare page's columns. The first column is the chosen site and date; the others live in
 * the address as `with` values, so a comparison can be shared and survives moving between pages.
 * The hours themselves always come from siteSummary; this file never does its own astronomy.
 */
import { customSite, formatUtc, parseCoordinate, parseLinkTime, toDateInput, type QueryValues, type Selection } from "./selection";
import { formatCoordinates } from "./siteSummary";
import { findSite, shortName, SITES, type SelectedSite } from "./sites";

export const MAX_COLUMNS = 3;
export const COMPARE_PARAM = "with";

const MAX_LAT = 90;
const MAX_LON = 180;
/** Window edges are known to 30 s, so two totals this close are the same answer. */
const LEVEL_HOURS = 1 / 60;

/** Level only if the page shows the same figure, so the headline never disagrees with the cards. */
const isSameAnswer = (hours: number, best: number) => Math.floor(hours) === Math.floor(best) && best - hours < LEVEL_HOURS;

export interface CompareExtra {
  site: SelectedSite;
  /** The column's own date; null follows the chosen date. */
  ownTimeMs: number | null;
}

export interface ParsedCompare {
  extras: CompareExtra[];
  problems: string[];
}

const siteKey = (site: SelectedSite) => site.id ?? `${site.lat},${site.lon}`;
const columnKey = ({ site, timeMs }: Selection) => `${siteKey(site)}|${timeMs}`;

function parseSiteRef(text: string): SelectedSite | null {
  const parts = text.split(",");
  if (parts.length === 1) return findSite(text) ?? null;
  if (parts.length !== 2) return null;
  const lat = parseCoordinate(parts[0], MAX_LAT);
  const lon = parseCoordinate(parts[1], MAX_LON);
  return lat !== null && lon !== null ? customSite(lat, lon) : null;
}

function parseExtra(value: string): CompareExtra | null {
  const [ref, time, ...rest] = value.split("@");
  if (rest.length > 0) return null;
  const site = parseSiteRef(ref);
  const ownTimeMs = time === undefined ? null : parseLinkTime(time);
  if (!site || (time !== undefined && ownTimeMs === null)) return null;
  return { site, ownTimeMs };
}

export function columnsOf(main: Selection, extras: readonly CompareExtra[]): Selection[] {
  return [main, ...extras.map(({ site, ownTimeMs }) => ({ site, timeMs: ownTimeMs ?? main.timeMs }))];
}

/** Reads the extra columns; parts of a link that cannot be used are left out and reported. */
export function parseCompare(query: QueryValues, main: Selection): ParsedCompare {
  const values = query.getAll(COMPARE_PARAM);
  const problems: string[] = [];
  const extras: CompareExtra[] = [];
  for (const value of values) {
    if (extras.length === MAX_COLUMNS - 1) {
      problems.push("Compare shows three columns, so the rest of the link is left out.");
      break;
    }
    const extra = parseExtra(value);
    if (!extra) {
      problems.push("A compared site or date in the link was not valid, so it is left out.");
      continue;
    }
    const [added] = columnsOf(main, [extra]).slice(1);
    if (columnsOf(main, extras).some((column) => columnKey(column) === columnKey(added))) {
      problems.push("The link repeats a column, so the repeat is left out.");
      continue;
    }
    extras.push(extra);
  }
  return { extras, problems };
}

/** True if two columns are the same site at the same time. */
export function hasRepeat(columns: readonly Selection[]): boolean {
  return new Set(columns.map(columnKey)).size < columns.length;
}

export function compareValue({ site, ownTimeMs }: CompareExtra): string {
  const ref = site.id ?? `${site.lat},${site.lon}`;
  return ownTimeMs === null ? ref : `${ref}@${toDateInput(ownTimeMs)}Z`;
}

/** The address query for link values, keeping them readable and unable to add parameters. */
export function compareQuery(values: readonly string[]): string {
  return values
    .map((value) => `${COMPARE_PARAM}=${encodeURIComponent(value).replace(/%2C/g, ",").replace(/%40/g, "@").replace(/%3A/g, ":")}`)
    .join("&");
}

export function joinQueries(...parts: readonly string[]): string {
  return parts.filter(Boolean).join("&");
}

/** A column for this site and date; the chosen date itself means "follow it". */
export function extraFor(site: SelectedSite, timeMs: number, mainTimeMs: number): CompareExtra {
  return { site, ownTimeMs: timeMs === mainTimeMs ? null : timeMs };
}

/** The column a new slot starts with: the first site not already on the page. */
export function nextExtra(columns: readonly Selection[]): CompareExtra {
  const site = SITES.find((candidate) => columns.every((column) => column.site.id !== candidate.id)) ?? SITES[0];
  return { site, ownTimeMs: null };
}

const dateOf = (ms: number) => formatUtc(ms).split(",")[0];
const siteName = (site: SelectedSite) => (site.id === null ? formatCoordinates(site.lat, site.lon) : shortName(site));

/** Short names for the headline: the sites, the dates, or both if neither tells columns apart. */
export function columnLabels(columns: readonly Selection[]): string[] {
  const isDistinct = (keys: string[]) => new Set(keys).size === keys.length;
  const isSameSite = new Set(columns.map(({ site }) => siteKey(site))).size === 1;
  if (isSameSite && columns.length > 1) return columns.map(({ timeMs }) => dateOf(timeMs));
  if (isDistinct(columns.map(({ site }) => siteKey(site)))) return columns.map(({ site }) => siteName(site));
  return columns.map(({ site, timeMs }) => `${siteName(site)} on ${dateOf(timeMs)}`);
}

/** The gap in the hours as shown, rounded down there; a real lead never reads as level. */
function gapHours(hours: number, best: number): string {
  const gap = Math.floor(best) - Math.floor(hours);
  return gap > 0 ? String(gap) : "under 1";
}

export interface CompareEntry {
  label: string;
  /** null when the mission runs past the data. */
  goldenHours: number | null;
  hasTerrain: boolean;
}

export interface CompareLead {
  lead: string;
  emphasis: string;
  /** The most Golden hours of any column, whatever the headline says. */
  best: number;
  isBest: boolean[];
}

/** What the comparison comes to, or null with fewer than two results. */
export function compareLead(entries: readonly CompareEntry[]): CompareLead | null {
  // a flat horizon blocks nothing, so it cannot outrank a site with real terrain
  const isAnyReal = entries.some(({ goldenHours, hasTerrain }) => goldenHours !== null && hasTerrain);
  const ranked = entries.map(({ goldenHours, hasTerrain }) => (isAnyReal && !hasTerrain ? null : goldenHours));
  const hours = ranked.flatMap((value) => (value === null ? [] : [value]));
  if (hours.length < 2) return null;
  const best = Math.max(...hours);
  const isLeading = (value: number | null) => value !== null && isSameAnswer(value, best);
  const isLevel = hours.every(isLeading);
  const isBest = ranked.map((value) => !isLevel && isLeading(value));

  if (best === 0) return { lead: "No Golden hours in ", emphasis: "any of these.", best, isBest };
  if (isLevel) return { lead: "Level at ", emphasis: best < 1 ? "under 1 Golden hour." : `${Math.floor(best)} Golden ${best < 2 ? "hour" : "hours"}.`, best, isBest };

  const gap = gapHours(Math.max(...hours.filter((value) => !isLeading(value))), best);
  const leaders = entries.filter((_, i) => isBest[i]).map(({ label }) => label);
  return {
    lead: `${leaders.join(" and ")} ${leaders.length > 1 ? "lead" : "leads"} by `,
    emphasis: `${gap} Golden ${gap === "1" || gap === "under 1" ? "hour" : "hours"}.`,
    best,
    isBest,
  };
}

/** How far a column trails the best one, or null if it does not. */
export function shortfall(hours: number, best: number): string | null {
  return hours >= best || isSameAnswer(hours, best) ? null : `${gapHours(hours, best)} h behind`;
}
