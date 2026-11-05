/**
 * Which Deep Space Network station hears the Moon, hour by hour, straight from the DSN files'
 * masks: bit 0, 1 and 2 are the stations the file names, in that order.
 */
import type { Ephemeris } from "./windows";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The Moon must be this high over a station; the loader refuses a DSN file made with any other. */
export const ELEVATION_MASK_DEG = 10;
const NAME = /^(.+) \((.+)\), (DSS-\d+)$/;

export interface Station {
  bit: number;
  name: string;
  place: string;
  country: string;
  antenna: string;
}

export function stationsOf(eph: Ephemeris): Station[] {
  return eph.dsnStations().map((name, bit) => {
    const [, place, country, antenna] = NAME.exec(name) ?? [name, name, "", ""];
    return { bit, name, place, country, antenna };
  });
}

export function listeningAt(eph: Ephemeris, ms: number): Station[] {
  const mask = eph.dsnMask(ms);
  return stationsOf(eph).filter(({ bit }) => (mask >> bit) & 1);
}

export interface Span {
  start: number;
  end: number;
}

export interface Lane {
  station: Station;
  windows: Span[];
  hours: number;
}

export interface Relay {
  lanes: Lane[];
  gaps: Span[];
  gapHours: number;
  totalHours: number;
}

/** Each station's windows in [startMs, endMs), the hours with no station, and the hours in all. */
export function relay(eph: Ephemeris, startMs: number, endMs: number): Relay {
  const stations = stationsOf(eph);
  const lanes: Lane[] = stations.map((station) => ({ station, windows: [], hours: 0 }));
  const gaps: Span[] = [];
  let gapHours = 0;
  const extend = (spans: Span[], start: number, end: number) => {
    const last = spans[spans.length - 1];
    if (last && last.end === start) last.end = end;
    else spans.push({ start, end });
  };
  // whole hours of the file, cut to the range at both ends
  for (let hour = Math.floor(startMs / HOUR_MS) * HOUR_MS; hour < endMs; hour += HOUR_MS) {
    const start = Math.max(hour, startMs);
    const end = Math.min(hour + HOUR_MS, endMs);
    const mask = eph.dsnMask(hour);
    const hours = (end - start) / HOUR_MS;
    for (const lane of lanes) {
      if ((mask >> lane.station.bit) & 1) {
        extend(lane.windows, start, end);
        lane.hours += hours;
      }
    }
    if (mask === 0) {
      extend(gaps, start, end);
      gapHours += hours;
    }
  }
  return { lanes, gaps, gapHours, totalHours: (endMs - startMs) / HOUR_MS };
}

/** The 24 hourly masks of the UTC day holding `ms`; an hour past the data is null. */
export function dayRing(eph: Ephemeris, ms: number): (number | null)[] {
  const day = Math.floor(ms / DAY_MS) * DAY_MS;
  return Array.from({ length: 24 }, (_, h) => (day + h * HOUR_MS <= eph.dataEnd() ? eph.dsnMask(day + h * HOUR_MS) : null));
}

export interface RelayHeadline {
  lead: string;
  emphasis: string;
}

/** Hours as they are: whole numbers plainly, a part hour to one decimal, never rounded away. */
export function hoursText(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** "30 days" when the range is whole days, otherwise its hours. */
const spanText = (totalHours: number) => (totalHours % 24 === 0 ? `${totalHours / 24} days` : `${hoursText(totalHours)} hours`);

export function relayHeadline({ gaps, gapHours, totalHours }: Relay): RelayHeadline {
  if (gaps.length === 0) return { lead: "Three stations take turns, and ", emphasis: "one is always listening." };
  return { lead: "Three stations take turns; the Moon has no station listening for ", emphasis: `${hoursText(gapHours)} of ${hoursText(totalHours)} hours.` };
}

/** Why the gaps happen, worded from the gaps themselves. */
export function gapSentence({ gaps, totalHours }: Relay, startMs: number): string {
  const why = `A station only counts while the Moon is at least ${ELEVATION_MASK_DEG}° above its horizon.`;
  const span = spanText(totalHours);
  if (gaps.length === 0) return `${why} In these ${span} at least one always does.`;
  // day 1 is the first 24 hours from the chosen time
  const dayOf = ({ start }: Span) => Math.floor((start - startMs) / DAY_MS) + 1;
  const [first, last] = [Math.min(...gaps.map(dayOf)), Math.max(...gaps.map(dayOf))];
  const when = first === last ? `on day ${first}` : `between day ${first} and day ${last}`;
  const longest = Math.max(...gaps.map(({ start, end }) => (end - start) / HOUR_MS));
  const length = `${hoursText(longest)} ${longest === 1 ? "hour" : "hours"}`;
  const times = gaps.length === 1 ? "1 time" : `${gaps.length} times`;
  return `${why} In these ${span} that fails for all three at once ${times}, ${when}, ${gaps.length === 1 ? `for ${length}` : `for at most ${length} each`}.`;
}
