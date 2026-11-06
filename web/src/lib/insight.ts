/**
 * The plain-language insight. The rule-based text and the AI's prompt are both built from the
 * same engine figures, and AI text is only shown if every number in it is one of those figures.
 */
import { DEFAULT_SEARCH_MS } from "./countdown";
import { DATA_END_MS, DATA_START_MS } from "./dataRange";
import { formatUtc } from "./selection";
import { formatCoordinates, formatDuration, MISSION_DAYS, type BodyOutlook, type SiteSummary } from "./siteSummary";
import { findSite, hasHeightTiles, shortName, type SelectedSite } from "./sites";
import { formatHours } from "./timeline";

const DAY_MS = 86_400_000;
const MISSION_HOURS = MISSION_DAYS * 24;
const SEARCH_DAYS = DEFAULT_SEARCH_MS / DAY_MS;
/** Window edges are known to 30 s, so two totals this close are the same answer. */
const SAME_HOURS = 1 / 60;

export interface InsightFacts {
  siteId: string | null;
  lat: number;
  lon: number;
  hasTerrain: boolean;
  landingMs: number;
  goldenHours: number;
  litHours: number;
  commsHours: number;
  sunUp: boolean;
  sunEventMs: number | null;
  earthUp: boolean;
  earthEventMs: number | null;
  isSearchCut: boolean;
}

export function factsFrom(site: SelectedSite, landingMs: number, summary: SiteSummary, hasTerrain: boolean): InsightFacts {
  return {
    siteId: site.id,
    lat: site.lat,
    lon: site.lon,
    hasTerrain,
    landingMs,
    goldenHours: summary.hours.golden,
    litHours: summary.hours.lit,
    commsHours: summary.hours.comms,
    sunUp: summary.sun.isUp,
    sunEventMs: summary.sun.eventMs,
    earthUp: summary.earth.isUp,
    earthEventMs: summary.earth.eventMs,
    isSearchCut: summary.isSearchCut,
  };
}

export function siteName({ siteId, lat, lon }: InsightFacts): string {
  const site = siteId === null ? undefined : findSite(siteId);
  return site ? shortName(site) : `the custom site at ${formatCoordinates(lat, lon)}`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `name` as written mid-sentence, such as "the Sun" or "Earth". */
export function nextChange(name: string, outlook: BodyOutlook, landingMs: number, isSearchCut: boolean): string {
  const verb = outlook.isUp ? "sets" : "rises";
  if (outlook.eventMs === null) {
    return isSearchCut ? `Our data ends before ${name} ${verb}.` : `${capitalised(name)} does not ${verb.slice(0, -1)} within ${SEARCH_DAYS} days.`;
  }
  return `${capitalised(name)} ${verb} in ${formatDuration(outlook.eventMs - landingMs)}.`;
}

function goldenCount(hours: number): string {
  if (hours < 1) return "under 1 Golden hour";
  return `${Math.floor(hours)} Golden ${Math.floor(hours) === 1 ? "hour" : "hours"}`;
}

export function limitSentence({ goldenHours, litHours, commsHours }: InsightFacts): string {
  const isSame = (a: number, b: number) => Math.abs(a - b) < SAME_HOURS;
  if (isSame(goldenHours, MISSION_HOURS)) return "Every mission hour is Golden.";
  if (isSame(litHours, commsHours) && isSame(goldenHours, litHours)) return `Sunlight and contact come and go together, for ${formatHours(litHours)}.`;
  if (isSame(goldenHours, litHours)) return `Sunlight is what limits it: the Sun is up for ${formatHours(litHours)}, while contact is possible for ${formatHours(commsHours)}.`;
  if (isSame(goldenHours, commsHours)) return `Contact is what limits it: contact is possible for ${formatHours(commsHours)}, while the Sun is up for ${formatHours(litHours)}.`;
  return `Sunlight and contact do not always overlap: the Sun is up for ${formatHours(litHours)} and contact is possible for ${formatHours(commsHours)}, but both only at once for ${formatHours(goldenHours)}.`;
}

/** The plain-language summary, built from the engine's figures by fixed rules. */
export function ruleInsight(facts: InsightFacts): string {
  const { landingMs, goldenHours, hasTerrain, isSearchCut } = facts;
  const golden = goldenHours < SAME_HOURS ? "gets no Golden hours" : `gets ${goldenCount(goldenHours)} out of ${MISSION_HOURS}`;
  return [
    `Land at ${siteName(facts)} on ${formatUtc(landingMs)} and the ${MISSION_DAYS}-day mission ${golden}: hours with sunlight, Earth in view and a DSN station listening, all at once.`,
    goldenHours < SAME_HOURS ? "" : limitSentence(facts),
    nextChange("Earth", { isUp: facts.earthUp, eventMs: facts.earthEventMs }, landingMs, isSearchCut),
    nextChange("the Sun", { isUp: facts.sunUp, eventMs: facts.sunEventMs }, landingMs, isSearchCut),
    hasTerrain ? "" : "This point has no terrain, so hills that could block the Sun or Earth are not included.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The facts as lines for the AI, worded exactly as the page shows them. */
export function factLines(facts: InsightFacts): string[] {
  const { landingMs, isSearchCut } = facts;
  return [
    `Site: ${siteName(facts)}`,
    `Landing: ${formatUtc(landingMs)}`,
    `Mission length: ${MISSION_DAYS} days (${MISSION_HOURS} hours)`,
    `Golden hours (sunlight, Earth in view and a DSN station listening, all at once): ${formatHours(facts.goldenHours)}`,
    `Hours with the Sun up: ${formatHours(facts.litHours)}`,
    `Hours with contact possible (Earth in view and a DSN station listening): ${formatHours(facts.commsHours)}`,
    `Next change of Earth: ${nextChange("Earth", { isUp: facts.earthUp, eventMs: facts.earthEventMs }, landingMs, isSearchCut)}`,
    `Next change of the Sun: ${nextChange("the Sun", { isUp: facts.sunUp, eventMs: facts.sunEventMs }, landingMs, isSearchCut)}`,
    `Terrain: ${facts.hasTerrain ? "real horizon from NASA LOLA elevation data" : "not included, the horizon is flat"}`,
  ];
}

/**
 * Every figure in a text, with what it measures, so "3 days" cannot pass on the strength of
 * "14d 3h". Longer forms are matched first and taken out before the next pattern runs.
 */
const QUANTITIES: readonly [RegExp, (match: RegExpMatchArray) => string][] = [
  [/(\d+)d (\d+)h/g, (m) => `${m[1]}d ${m[2]}h`],
  [/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})/g, (m) => `${m[1]} ${m[2]} ${m[3]}`],
  [/(\d{2}):(\d{2})/g, (m) => `${m[1]}:${m[2]}`],
  [/(\d+(?:\.\d+)?)°\s?([NSEW])/g, (m) => `${m[1]}°${m[2]}`],
  [/(\d+(?:\.\d+)?)\s?°/g, (m) => `${m[1]}°`],
  [/(\d+(?:\.\d+)?)\s?km\b/g, (m) => `${m[1]} km`],
  [/(\d+(?:\.\d+)?)\s?(?:m|metres?|meters?)\b/g, (m) => `${m[1]} m`],
  [/(\d+(?:\.\d+)?)\s?(?:px|pixels?)\b/g, (m) => `${m[1]} px`],
  [/(\d+(?:\.\d+)?)\s?%/g, (m) => `${m[1]}%`],
  [/(\d+(?:\.\d+)?)\s?min(?:ute)?s?\b/g, (m) => `${m[1]} min`],
  [/(\d+(?:\.\d+)?)(?:\s|-)?(?:mission |Golden )?(?:h|hours?)\b/g, (m) => `${m[1]} h`],
  [/(\d+(?:\.\d+)?)(?:\s|-)?(?:d|days?)\b/g, (m) => `${m[1]} day`],
  [/\d+(?:\.\d+)?/g, (m) => m[0]],
];
export const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|tens|half|halves|quarters?|thirds?|fourths?|fifths?|first|second|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twice|thrice|double|triple|couple|several|few|pair|weeks?|months?|years?|percent|per cent)\b/gi;
export const OTHER_DIGITS = /[^\P{Nd}0-9]+/gu;

export function quantities(text: string): string[] {
  const found: string[] = [];
  let rest = text;
  for (const [pattern, name] of QUANTITIES) {
    rest = rest.replace(pattern, (...args) => {
      found.push(name(args.slice(0, -2) as unknown as RegExpMatchArray));
      return " ";
    });
  }
  return found;
}

/** Figures in `text` that the given facts do not state; empty means the text is safe to show. */
export function strayNumbers(text: string, facts: InsightFacts): string[] {
  const allowed = new Set([ruleInsight(facts), ...factLines(facts)].flatMap(quantities));
  const words = (text.match(NUMBER_WORDS) ?? []).map((word) => word.toLowerCase());
  const digits = text.match(OTHER_DIGITS) ?? [];
  return [...new Set([...quantities(text).filter((quantity) => !allowed.has(quantity)), ...words, ...digits])];
}

const FIELDS = ["siteId", "lat", "lon", "hasTerrain", "landingMs", "goldenHours", "litHours", "commsHours", "sunUp", "sunEventMs", "earthUp", "earthEventMs", "isSearchCut"];

function number(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${name} is not valid`);
  return value;
}

function flag(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} is not valid`);
  return value;
}

function eventTime(value: unknown, landingMs: number, name: string): number | null {
  return value === null ? null : number(value, landingMs + 1, landingMs + DEFAULT_SEARCH_MS, name);
}

/** Checks facts sent by a browser: only numbers and flags, inside physical limits, nothing else. */
export function parseFacts(raw: unknown): InsightFacts {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("facts are not an object");
  const fields = raw as Record<string, unknown>;
  const keys = Object.keys(fields).sort();
  if (keys.join() !== [...FIELDS].sort().join()) throw new Error("facts have the wrong fields");

  const siteId = fields.siteId === null ? null : typeof fields.siteId === "string" ? fields.siteId : undefined;
  if (siteId === undefined) throw new Error("siteId is not valid");
  const lat = number(fields.lat, -90, 90, "lat");
  const lon = number(fields.lon, -180, 180, "lon");
  const hasTerrain = flag(fields.hasTerrain, "hasTerrain");
  if (siteId !== null) {
    const site = findSite(siteId);
    if (!site || site.lat !== lat || site.lon !== lon || site.has_terrain !== hasTerrain) throw new Error("site does not match");
  } else if (hasTerrain !== hasHeightTiles(lat)) {
    throw new Error("terrain does not match the latitude");
  }

  const landingMs = number(fields.landingMs, DATA_START_MS, DATA_END_MS - MISSION_DAYS * DAY_MS, "landingMs");
  const litHours = number(fields.litHours, 0, MISSION_HOURS, "litHours");
  const commsHours = number(fields.commsHours, 0, MISSION_HOURS, "commsHours");
  const goldenHours = number(fields.goldenHours, 0, Math.min(litHours, commsHours) + SAME_HOURS, "goldenHours");
  return {
    siteId,
    lat,
    lon,
    hasTerrain,
    landingMs,
    goldenHours,
    litHours,
    commsHours,
    sunUp: flag(fields.sunUp, "sunUp"),
    sunEventMs: eventTime(fields.sunEventMs, landingMs, "sunEventMs"),
    earthUp: flag(fields.earthUp, "earthUp"),
    earthEventMs: eventTime(fields.earthEventMs, landingMs, "earthEventMs"),
    isSearchCut: flag(fields.isSearchCut, "isSearchCut"),
  };
}
