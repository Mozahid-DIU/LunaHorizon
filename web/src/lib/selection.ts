/**
 * The chosen site and time live in the address, so any view can be shared as a link.
 * Parts of a link that cannot be trusted are refused and reported, never guessed at.
 */
import { DATA_END_MS, DATA_START_MS } from "./dataRange";
import { findSite, type CuratedSite, type SelectedSite } from "./sites";

export const DEFAULT_SITE_ID = "shackleton-rim";
/** The engine's best 2027 landing date for the default site. */
export const DEFAULT_TIME_MS = Date.UTC(2027, 11, 29, 21);

const MAX_LAT = 90;
const MAX_LON = 180;
const COORDINATE_DECIMALS = 1e4;
const COORDINATE = /^-?\d+(\.\d+)?$/;
const LINK_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z$/;
const INPUT_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Selection {
  site: SelectedSite;
  timeMs: number;
}

export interface ParsedSelection {
  selection: Selection;
  problems: string[];
}

interface QueryValues {
  getAll(name: string): string[];
}

const defaultSite = (): CuratedSite => findSite(DEFAULT_SITE_ID) as CuratedSite;

export function customSite(lat: number, lon: number): SelectedSite {
  return { id: null, name: "Custom site", lat, lon, has_terrain: false };
}

/** A plain decimal within ±max, rounded to 4 decimals (about 3 metres on the Moon); null if invalid. */
export function parseCoordinate(text: string, max: number): number | null {
  const trimmed = text.trim();
  if (!COORDINATE.test(trimmed)) return null;
  const value = Number(trimmed);
  if (Math.abs(value) > max) return null;
  const rounded = Math.round(value * COORDINATE_DECIMALS) / COORDINATE_DECIMALS;
  return rounded === 0 ? 0 : rounded;
}

/** UTC minutes as written in a date input, or null if the date does not exist or has no data. */
export function fromDateInput(text: string): number | null {
  if (!INPUT_TIME.test(text)) return null;
  const ms = Date.parse(`${text}Z`);
  if (!Number.isFinite(ms) || ms < DATA_START_MS || ms > DATA_END_MS) return null;
  return toDateInput(ms) === text ? ms : null;
}

export function toDateInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const time = d.toISOString().slice(11, 16);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${time} UTC`;
}

function parseSite(query: QueryValues, problems: string[]): SelectedSite {
  const ids = query.getAll("site");
  const lats = query.getAll("lat");
  const lons = query.getAll("lon");
  const hasCoordinates = lats.length > 0 || lons.length > 0;

  if (ids.length > 0) {
    const site = ids.length === 1 ? findSite(ids[0]) : undefined;
    if (!site) {
      problems.push("The link's site was not recognised, so the default site is shown.");
      return defaultSite();
    }
    if (hasCoordinates) problems.push("The link gives both a site and coordinates, so the named site is shown.");
    return site;
  }

  if (!hasCoordinates) return defaultSite();
  const lat = lats.length === 1 ? parseCoordinate(lats[0], MAX_LAT) : null;
  const lon = lons.length === 1 ? parseCoordinate(lons[0], MAX_LON) : null;
  if (lat !== null && lon !== null) return customSite(lat, lon);
  problems.push("The link's coordinates are not valid, so the default site is shown.");
  return defaultSite();
}

function parseTime(query: QueryValues, problems: string[]): number {
  const times = query.getAll("t");
  if (times.length === 0) return DEFAULT_TIME_MS;
  const match = times.length === 1 ? LINK_TIME.exec(times[0]) : null;
  const ms = match ? fromDateInput(match[1]) : null;
  if (ms !== null) return ms;
  problems.push("The link's date is not valid or has no data, so the default date is shown.");
  return DEFAULT_TIME_MS;
}

export function parseSelection(query: QueryValues): ParsedSelection {
  const problems: string[] = [];
  const site = parseSite(query, problems);
  const timeMs = parseTime(query, problems);
  return { selection: { site, timeMs }, problems };
}

/** The address query for a selection; defaults are left out so plain links stay clean. */
export function selectionQuery({ site, timeMs }: Selection): string {
  const parts: string[] = [];
  if (site.id === null) parts.push(`lat=${site.lat}`, `lon=${site.lon}`);
  else if (site.id !== DEFAULT_SITE_ID) parts.push(`site=${site.id}`);
  if (timeMs !== DEFAULT_TIME_MS) parts.push(`t=${toDateInput(timeMs)}Z`);
  return parts.join("&");
}

/** A same-site address; a doubled leading slash would otherwise point to another website. */
export function withQuery(href: string, query: string): string {
  const path = href.replace(/^\/+/, "/");
  return query ? `${path}?${query}` : path;
}
