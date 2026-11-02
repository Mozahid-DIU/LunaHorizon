import { describe, expect, test } from "vitest";
import reference from "./__fixtures__/windows.json";
import { DATA_END_MS } from "./dataRange";
import { DEFAULT_TIME_MS } from "./selection";
import { findSite, SITES } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { axisPercent, formatEdge, formatHours, TIMELINE_DAYS, TIMELINE_TICKS, timelineCut, timelineRows } from "./timeline";
import { findWindows } from "./windows";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const eph = loadEphemeris([2027, 2028]);

describe("timelineRows", () => {
  test("has the five rows in order", () => {
    const rows = timelineRows(eph, findSite("im-2")!, loadProfile("im-2"), DEFAULT_TIME_MS);
    expect(rows.map((row) => row.label)).toEqual(["Sun", "Earth", "DSN", "Comms", "Golden"]);
  });

  test.each(SITES.map((site) => site.id))("%s: every edge equals findWindows", (id) => {
    const site = findSite(id)!;
    const profile = loadProfile(id);
    for (const start of [Date.UTC(2027, 0, 3, 5), DEFAULT_TIME_MS]) {
      const end = start + TIMELINE_DAYS * DAY_MS;
      for (const row of timelineRows(eph, site, profile, start)) {
        if (row.kind !== "dsn") expect(row.windows).toEqual(findWindows(eph, site, profile, start, end, row.kind));
      }
    }
  }, 30_000);

  test.each(reference.cases.map((c, i) => [c.site, c.start, i] as const))("%s from %s matches the 1-minute SPICE reference", (_site, _start, index) => {
    const reference_case = reference.cases[index];
    const site = { lat: reference_case.lat, lon: reference_case.lon };
    const profile = loadProfile(reference_case.site);
    const start = Date.parse(reference_case.start);
    // the reference and the timeline each cut a window at their own range end
    const end = Math.min(Date.parse(reference_case.end), start + TIMELINE_DAYS * DAY_MS);
    const rows = timelineRows(eph, site, profile, start);
    for (const kind of ["lit", "earth", "comms", "golden"] as const) {
      const shown = rows.find((row) => row.kind === kind)!.windows;
      const expected = reference_case.windows[kind];
      for (const window of expected) {
        const edgeStart = Date.parse(window.start);
        const edgeEnd = Date.parse(window.end);
        if (edgeEnd >= end) continue;
        const match = shown.find((w) => Math.abs(w.start - edgeStart) <= 2 * 60_000 && Math.abs(w.end - edgeEnd) <= 2 * 60_000);
        expect(match, `${kind} ${window.start}`).toBeDefined();
      }
    }
  });

  test.each([
    ["on the hour", Date.UTC(2027, 2, 1)],
    ["at a minute that is off the scan grid", Date.UTC(2027, 2, 1, 0, 7)],
    ["with seconds", Date.UTC(2027, 2, 1, 0, 7, 13)],
  ])("the DSN row follows the hourly station mask exactly, starting %s", (_name, start) => {
    const site = findSite("im-2")!;
    const row = timelineRows(eph, site, loadProfile("im-2"), start).find((r) => r.kind === "dsn")!;
    const firstHour = Math.ceil(start / HOUR_MS) * HOUR_MS;
    for (let t = firstHour; t < start + TIMELINE_DAYS * DAY_MS; t += HOUR_MS) {
      const isInWindow = row.windows.some((w) => w.start <= t && t < w.end);
      expect(isInWindow).toBe(eph.dsnMask(t) > 0);
    }
    for (const w of row.windows) {
      if (!w.startClipped) expect(w.start % HOUR_MS).toBe(0);
      if (!w.endClipped) expect(w.end % HOUR_MS).toBe(0);
    }
  });

  test("Comms never runs outside Earth or DSN, and Golden never outside Comms or Sun", () => {
    const rows = timelineRows(eph, findSite("im-2")!, loadProfile("im-2"), DEFAULT_TIME_MS);
    const inside = (t: number, kind: string) => rows.find((row) => row.kind === kind)!.windows.some((w) => w.start <= t && t <= w.end);
    for (const w of rows.find((row) => row.kind === "golden")!.windows) {
      const middle = (w.start + w.end) / 2;
      expect(inside(middle, "comms") && inside(middle, "lit")).toBe(true);
    }
    for (const w of rows.find((row) => row.kind === "comms")!.windows) {
      const middle = (w.start + w.end) / 2;
      expect(inside(middle, "earth") && inside(middle, "dsn")).toBe(true);
    }
  });

  test("hours are the total of each row's windows", () => {
    for (const row of timelineRows(eph, findSite("im-1")!, loadProfile("im-1"), DEFAULT_TIME_MS)) {
      expect(row.hours).toBeCloseTo(row.windows.reduce((sum, w) => sum + (w.end - w.start), 0) / HOUR_MS, 9);
    }
  });

  test("stops at the end of the data", () => {
    const last = loadEphemeris([2030]);
    const start = DATA_END_MS - 10 * DAY_MS;
    for (const row of timelineRows(last, findSite("im-2")!, loadProfile("im-2"), start)) {
      for (const w of row.windows) expect(w.end).toBeLessThanOrEqual(DATA_END_MS);
    }
  });
});

describe("axisPercent", () => {
  test("places a moment along the 30 days", () => {
    expect(axisPercent(0, 0)).toBe(0);
    expect(axisPercent(15 * DAY_MS, 0)).toBe(50);
    expect(axisPercent(30 * DAY_MS, 0)).toBe(100);
  });
});

test("ticks mark each week", () => {
  expect(TIMELINE_TICKS).toEqual([0, 7, 14, 21, 28]);
});

describe("timelineCut", () => {
  test("is null while the data lasts the full 30 days", () => {
    expect(timelineCut(eph, DEFAULT_TIME_MS)).toBeNull();
  });

  test("gives where the data stops along the axis", () => {
    const last = loadEphemeris([2030]);
    expect(timelineCut(last, DATA_END_MS - 15 * DAY_MS)).toBe(DATA_END_MS);
    expect(axisPercent(DATA_END_MS, DATA_END_MS - 15 * DAY_MS)).toBe(50);
  });
});

describe("formatHours", () => {
  test("never rounds up to the whole axis", () => {
    expect(formatHours(720)).toBe("720 h");
    expect(formatHours(719.9)).toBe("719 h");
  });

  test("a short window is not called nothing", () => {
    expect(formatHours(0.3)).toBe("under 1 h");
    expect(formatHours(0)).toBe("0 h");
  });
});

test("edges are written in UTC, to the minute", () => {
  expect(formatEdge(Date.UTC(2028, 0, 13, 0, 34, 3))).toBe("13 Jan 00:34");
});
