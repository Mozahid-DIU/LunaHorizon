/**
 * Sky View's 30-day timeline. Every row comes straight from findWindows; this file only sets
 * the rows and places moments along the axis.
 */
import type { Site } from "./geometry";
import { totalHours } from "./planning";
import { findWindows, type Ephemeris, type Window, type WindowKind } from "./windows";

export const TIMELINE_DAYS = 30;
export const TIMELINE_TICKS: readonly number[] = [0, 7, 14, 21, 28];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROWS: readonly (readonly [WindowKind, string])[] = [
  ["lit", "Sun"],
  ["earth", "Earth"],
  ["dsn", "DSN"],
  ["comms", "Comms"],
  ["golden", "Golden"],
];

/** The station mask changes on the hour; the window search lands up to 30 s after that. */
function onWholeHours(window: Window): Window {
  const hour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;
  return { ...window, start: window.startClipped ? window.start : hour(window.start), end: window.endClipped ? window.end : hour(window.end) };
}

export interface TimelineRow {
  kind: WindowKind;
  label: string;
  windows: Window[];
  hours: number;
}

/** The rows for 30 days from `startMs`, or up to the end of the data. */
export function timelineRows(eph: Ephemeris, site: Site, profile: readonly number[], startMs: number): TimelineRow[] {
  const endMs = Math.min(startMs + TIMELINE_DAYS * DAY_MS, eph.dataEnd());
  return ROWS.map(([kind, label]) => {
    const found = findWindows(eph, site, profile, startMs, endMs, kind);
    const windows = kind === "dsn" ? found.map(onWholeHours) : found;
    return { kind, label, windows, hours: totalHours(windows) };
  });
}

/** Where the data stops, if that comes before the end of the 30 days. */
export function timelineCut(eph: Ephemeris, startMs: number): number | null {
  const dataEnd = eph.dataEnd();
  return dataEnd < startMs + TIMELINE_DAYS * DAY_MS ? dataEnd : null;
}

/** Whole hours, rounded down: a row's total never reads as more than it is. */
export function formatHours(hours: number): string {
  return hours > 0 && hours < 1 ? "under 1 h" : `${Math.floor(hours)} h`;
}

/** How far along the 30-day axis a moment lies, in percent. */
export function axisPercent(ms: number, startMs: number): number {
  return ((ms - startMs) / (TIMELINE_DAYS * DAY_MS)) * 100;
}

export function formatEdge(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.toISOString().slice(11, 16)}`;
}
