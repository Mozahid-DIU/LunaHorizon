/**
 * CSV files of what the Sky page shows: the state hour by hour, and every window. Every value
 * comes from the engine (stateAt and timelineRows); this file only writes it out.
 *
 * The files are plain RFC 4180 CSV in ASCII: one header row, then data rows that all have the
 * same columns, so any spreadsheet or parser reads them as they are. Where the numbers come
 * from is carried in columns of their own, not in a comment line.
 */
import { stationsOf } from "./dsnRelay";
import type { Site } from "./geometry";
import { TIMELINE_DAYS, type TimelineRow } from "./timeline";
import { stateAt, type Ephemeris, type WindowKind } from "./windows";

const HOUR_MS = 3_600_000;
const SECOND_MS = 1000;
const ANGLE_DECIMALS = 3;
const HOUR_DECIMALS = 3;
const MAX_ROWS = TIMELINE_DAYS * 24;

/** Where the numbers come from, written into every row. */
export interface CsvSource {
  site: string;
  lat: number;
  lon: number;
  /** The map the horizon was built from, or a note that there is none. */
  horizon: string;
}

/** A value as one CSV cell: quoted when it holds a comma, a quote or a line break. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const line = (cells: readonly (string | number)[]) => cells.map(csvCell).join(",");
/** To the nearest second, as "2027-12-29T21:00:00Z", which a spreadsheet reads as a time. */
const iso = (ms: number) => new Date(Math.round(ms / SECOND_MS) * SECOND_MS).toISOString().replace(/\.\d{3}Z$/, "Z");
const flag = (value: boolean) => (value ? 1 : 0);

/** An angle to 0.001 degree, never "-0.000" and never "360.000" for an azimuth. */
export function angle(value: number, isAzimuth = false): string {
  const text = value.toFixed(ANGLE_DECIMALS);
  if (/^-0\.0+$/.test(text)) return (0).toFixed(ANGLE_DECIMALS);
  if (isAzimuth && text === (360).toFixed(ANGLE_DECIMALS)) return (0).toFixed(ANGLE_DECIMALS);
  return text;
}

const sourceCells = (source: CsvSource) => [source.site, source.lat, source.lon, source.horizon];
const SOURCE_COLUMNS = ["site", "site_lat_deg", "site_lon_deg", "horizon_source"] as const;

/**
 * How many hourly rows a file holds: one each hour from the chosen time, for 30 days or up to
 * the last hour of our data, whichever comes first.
 */
export function hourlyRowCount(startMs: number, dataEndMs: number): number {
  return Math.max(0, Math.min(MAX_ROWS, Math.floor((dataEndMs - startMs) / HOUR_MS) + 1));
}

export const HOURLY_COLUMNS = [
  "utc",
  "sun_az_deg",
  "sun_el_deg",
  "skyline_at_sun_deg",
  "sun_above_skyline",
  "earth_az_deg",
  "earth_el_deg",
  "skyline_at_earth_deg",
  "earth_above_skyline",
  "dsn_stations",
  "comms",
  "golden",
  ...SOURCE_COLUMNS,
] as const;

/** One row each hour from `startMs`; the state at that moment, for the lander's eye 2 m above the ground. */
export function hourlyCsv(eph: Ephemeris, site: Site, profile: readonly number[], startMs: number, source: CsvSource): string {
  const stations = stationsOf(eph);
  const rows = [line(HOURLY_COLUMNS)];
  const count = hourlyRowCount(startMs, eph.dataEnd());
  for (let i = 0; i < count; i++) {
    const t = startMs + i * HOUR_MS;
    const s = stateAt(eph, site, profile, t);
    const listening = stations.filter(({ bit }) => (s.dsnMask >> bit) & 1).map(({ place }) => place);
    rows.push(
      line([
        iso(t),
        angle(s.sun.az, true),
        angle(s.sun.el),
        angle(s.sun.horizon),
        flag(s.lit),
        angle(s.earth.az, true),
        angle(s.earth.el),
        angle(s.earth.horizon),
        flag(s.earthVisible),
        listening.length > 0 ? listening.join(" + ") : "none",
        flag(s.comms),
        flag(s.golden),
        ...sourceCells(source),
      ]),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

/** How exactly a window's edges are known: the search refines to 30 s; DSN changes on the hour. */
const EDGE_RESOLUTION: Record<WindowKind, string> = { lit: "30 s", earth: "30 s", comms: "30 s", golden: "30 s", dsn: "1 h" };

export const WINDOW_COLUMNS = ["kind", "start_utc", "end_utc", "hours", "open_before_range", "open_after_range", "edge_resolution", ...SOURCE_COLUMNS] as const;

/**
 * Every window of every row, in the rows' order. A window already open when the range starts,
 * or still open when it ends, says so: its true edge lies outside the range.
 */
export function windowsCsv(rows: readonly TimelineRow[], source: CsvSource): string {
  const lines = [line(WINDOW_COLUMNS)];
  for (const { kind, windows } of rows) {
    for (const w of windows) {
      const [start, end] = [iso(w.start), iso(w.end)];
      // the hours are those between the times as written, so the columns agree
      const hours = ((Date.parse(end) - Date.parse(start)) / HOUR_MS).toFixed(HOUR_DECIMALS);
      lines.push(line([kind, start, end, hours, flag(w.startClipped), flag(w.endClipped), EDGE_RESOLUTION[kind], ...sourceCells(source)]));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Hands a file to the browser to save. */
export function saveFile(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), SECOND_MS);
}

/** "lunahorizon-im-2-2027-12-29T2100Z-hourly.csv", or "lunahorizon-lat-85.250_lon120.000-..." for a point. */
export function csvFileName(siteId: string | null, lat: number, lon: number, startMs: number, what: "hourly" | "windows"): string {
  const place = siteId ?? `lat${lat.toFixed(3)}_lon${lon.toFixed(3)}`;
  const time = iso(startMs).slice(0, 16).replace(":", "");
  return `lunahorizon-${place}-${time}Z-${what}.csv`;
}
