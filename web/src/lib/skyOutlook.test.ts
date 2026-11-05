import { describe, expect, test } from "vitest";
import { countdown } from "./countdown";
import { DATA_END_MS } from "./dataRange";
import { DEFAULT_TIME_MS } from "./selection";
import { eventWindows, goldenStatus, outlookAt, skyHeadline, skyDataEnd } from "./skyOutlook";
import { outlookFrom } from "./siteSummary";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile, REPRESENTATIVE_SITES } from "./testData";
import { stateAt, type SiteState } from "./windows";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const eph = loadEphemeris([2027, 2028]);
const UP = { lit: true, earthVisible: true };
const DOWN = { lit: false, earthVisible: false };

describe("outlookAt over a longer run", () => {
  test("a 30-day run reads events up to 60 days past its last frame", () => {
    const site = findSite("shackleton-rim")!;
    const profile = loadProfile("shackleton-rim");
    const start = DEFAULT_TIME_MS;
    const runEnd = start + 30 * DAY_MS;
    const events = eventWindows(eph, site, profile, start, runEnd);
    for (const t of [start + 20 * DAY_MS, start + 29 * DAY_MS]) {
      const quick = outlookAt(events, t, stateAt(eph, site, profile, t));
      const direct = outlookFrom(countdown(eph, site, profile, t));
      expect(quick.sun.eventMs === null).toBe(direct.sun.eventMs === null);
      expect(quick.earth.eventMs === null).toBe(direct.earth.eventMs === null);
      if (quick.earth.eventMs !== null && direct.earth.eventMs !== null) expect(Math.abs(quick.earth.eventMs - direct.earth.eventMs)).toBeLessThan(HOUR_MS);
    }
    expect(skyDataEnd(start, runEnd)).toBe(runEnd + 60 * DAY_MS);
  });
});

describe("outlookAt", () => {
  test.each(REPRESENTATIVE_SITES)("%s: every frame agrees with the engine's countdown", (id) => {
    const site = findSite(id)!;
    const profile = loadProfile(id);
    for (const startMs of [Date.UTC(2027, 0, 3, 5), DEFAULT_TIME_MS - 200 * DAY_MS, Date.UTC(2027, 7, 18, 12)]) {
      const events = eventWindows(eph, site, profile, startMs);
      for (let t = startMs; t <= startMs + 14 * DAY_MS; t += 13 * HOUR_MS) {
        const quick = outlookAt(events, t, stateAt(eph, site, profile, t));
        const direct = outlookFrom(countdown(eph, site, profile, t));
        expect(quick.sun.isUp).toBe(direct.sun.isUp);
        expect(quick.earth.isUp).toBe(direct.earth.isUp);
        expect(quick.isSearchCut).toBe(direct.isSearchCut);
        for (const body of ["sun", "earth"] as const) {
          // the two searches start 10-minute scans at different moments; each refines to 30 s
          if (direct[body].eventMs === null || quick[body].eventMs === null) expect(quick[body].eventMs).toBe(direct[body].eventMs);
          else expect(Math.abs(quick[body].eventMs - direct[body].eventMs)).toBeLessThanOrEqual(60_000);
        }
      }
    }
  }, 60_000);

  test("the published sunset and Earthset of the default view", () => {
    const site = findSite("shackleton-rim")!;
    const { sun, earth } = outlookAt(eventWindows(eph, site, loadProfile("shackleton-rim"), DEFAULT_TIME_MS), DEFAULT_TIME_MS, UP);
    expect(sun.eventMs).toBe(Date.parse("2028-01-21T19:44:41.250Z"));
    expect(earth.eventMs).toBe(Date.parse("2028-01-13T00:34:03.750Z"));
  });

  test("reports no event when none comes within 60 days", () => {
    const farSide = { lat: 0, lon: 180 };
    const flat = Array.from({ length: 360 }, () => 0);
    const { earth, isSearchCut } = outlookAt(eventWindows(eph, farSide, flat, DEFAULT_TIME_MS), DEFAULT_TIME_MS, DOWN);
    expect(earth).toEqual({ isUp: false, eventMs: null });
    expect(isSearchCut).toBe(false);
  });

  test("an event more than 60 days after a frame is not shown, as in the engine", () => {
    const site = findSite("shackleton-rim")!;
    const profile = loadProfile("shackleton-rim");
    const start = Date.parse("2027-11-20T00:00Z");
    const events = eventWindows(eph, site, profile, start);
    const limited = { ...events, lit: [{ start: start - DAY_MS, end: start + 61 * DAY_MS, startClipped: true, endClipped: false }] };
    expect(outlookAt(limited, start, UP).sun.eventMs).toBeNull();
    expect(outlookAt(limited, start + 2 * DAY_MS, UP).sun.eventMs).toBe(start + 61 * DAY_MS);
  });

  test("says when the data ended before the full search", () => {
    const last = loadEphemeris([2030]);
    const site = findSite("im-2")!;
    const start = DATA_END_MS - 30 * DAY_MS;
    expect(outlookAt(eventWindows(last, site, loadProfile("im-2"), start), start, UP).isSearchCut).toBe(true);
  });

  test("frames through the last days of the data agree with the engine", () => {
    const last = loadEphemeris([2030]);
    const site = findSite("shackleton-rim")!;
    const profile = loadProfile("shackleton-rim");
    const start = DATA_END_MS - 19 * DAY_MS;
    const events = eventWindows(last, site, profile, start);
    for (let t = start; t <= start + 14 * DAY_MS; t += 3 * HOUR_MS + 433_000) {
      const now = stateAt(last, site, profile, t);
      const quick = outlookAt(events, t, now);
      const direct = outlookFrom(countdown(last, site, profile, t));
      expect(quick.isSearchCut).toBe(direct.isSearchCut);
      for (const body of ["sun", "earth"] as const) {
        expect(quick[body].isUp).toBe(direct[body].isUp);
        expect(quick[body].eventMs === null).toBe(direct[body].eventMs === null);
        if (quick[body].eventMs !== null) expect(Math.abs(quick[body].eventMs! - direct[body].eventMs!)).toBeLessThanOrEqual(60_000);
      }
    }
  }, 60_000);

  test("up or down follows the engine's state, even inside a window edge's rounding", () => {
    const edge = Date.UTC(2027, 5, 1);
    const events = { lit: [{ start: edge, end: edge + DAY_MS, startClipped: false, endClipped: false }], earth: [], dataEndMs: edge + 400 * DAY_MS };
    const justRisen = outlookAt(events, edge - 10_000, { lit: true, earthVisible: false });
    expect(justRisen.sun).toEqual({ isUp: true, eventMs: edge + DAY_MS });
  });
});

test("the data range covers the last frame's whole search", () => {
  expect(skyDataEnd(DEFAULT_TIME_MS)).toBe(DEFAULT_TIME_MS + 74 * DAY_MS);
  expect(skyDataEnd(DATA_END_MS - DAY_MS)).toBe(DATA_END_MS);
});

describe("skyHeadline", () => {
  test("a full mission", () => {
    expect(skyHeadline(336)).toEqual({ lead: "Golden for ", emphasis: "all 14 days.", hours: "336" });
  });

  test("a partial mission never rounds up to full", () => {
    expect(skyHeadline(335.9)).toEqual({ lead: "Golden for ", emphasis: "13.9 of 14 days.", hours: "335" });
    expect(skyHeadline(84)).toEqual({ lead: "Golden for ", emphasis: "3.5 of 14 days.", hours: "84" });
  });

  test("no Golden hours at all", () => {
    expect(skyHeadline(0)).toEqual({ lead: "No Golden hours ", emphasis: "in 14 days.", hours: "0" });
  });

  test("a sliver below one tenth of a day is not called none", () => {
    expect(skyHeadline(1).emphasis).toBe("0 of 14 days.");
    expect(skyHeadline(1).lead).toBe("Golden for ");
  });
});

describe("goldenStatus", () => {
  const state = (lit: boolean, earthVisible: boolean, dsnMask: number): SiteState =>
    ({ lit, earthVisible, dsnMask, comms: earthVisible && dsnMask > 0, golden: lit && earthVisible && dsnMask > 0 }) as SiteState;

  test.each([
    [true, true, 1, "Golden window open", true],
    [false, true, 1, "Sun below the horizon", false],
    [true, false, 1, "Earth below the horizon", false],
    [false, false, 1, "Sun and Earth below the horizon", false],
    [true, true, 0, "No DSN station listening", false],
  ])("lit %s, Earth %s, DSN %i", (lit, earth, mask, text, isOpen) => {
    expect(goldenStatus(state(lit, earth, mask))).toEqual({ text, isOpen });
  });

  test("agrees with the engine's Golden flag on real data", () => {
    const site = findSite("im-2")!;
    const profile = loadProfile("im-2");
    for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 41 * HOUR_MS) {
      const now = stateAt(eph, site, profile, t);
      expect(goldenStatus(now).isOpen).toBe(now.golden);
    }
  });
});
