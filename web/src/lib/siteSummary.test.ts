import { describe, expect, test } from "vitest";
import { DATA_END_MS } from "./dataRange";
import { countdown } from "./countdown";
import { missionScore } from "./planning";
import { DEFAULT_TIME_MS } from "./selection";
import { formatCoordinates, formatDays, formatDuration, MISSION_DAYS, siteSummary } from "./siteSummary";
import { findSite, SITES } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { findWindows } from "./windows";

const DAY_MS = 86_400_000;
const eph = loadEphemeris([2027, 2028]);

describe("siteSummary", () => {
  const shackleton = findSite("shackleton-rim")!;
  const profile = loadProfile("shackleton-rim");

  test("the default landing is the published best date", () => {
    const summary = siteSummary(eph, shackleton, profile, DEFAULT_TIME_MS)!;
    expect(summary.hours.golden).toBe(336);
    expect(formatDays(summary.hours.golden)).toBe("14");
    expect(summary.sun).toMatchObject({ isUp: true });
    expect(summary.earth).toMatchObject({ isUp: true });
    // 339.57 h and 550.74 h; a countdown rounds down so it never promises time that is not there
    expect(formatDuration(summary.earth.eventMs! - DEFAULT_TIME_MS)).toBe("14d 3h");
    expect(formatDuration(summary.sun.eventMs! - DEFAULT_TIME_MS)).toBe("22d 22h");
  });

  test.each(SITES.map((site) => site.id))("%s equals the engine at several dates", (id) => {
    const site = findSite(id)!;
    const siteProfile = loadProfile(id);
    for (const landingMs of [Date.UTC(2027, 0, 3, 5), Date.UTC(2027, 5, 18, 12), Date.UTC(2027, 11, 25, 23)]) {
      const summary = siteSummary(eph, site, siteProfile, landingMs)!;
      const score = missionScore(eph, site, siteProfile, landingMs, MISSION_DAYS * DAY_MS);
      const clock = countdown(eph, site, siteProfile, landingMs);
      expect(summary.hours).toEqual({ golden: score.goldenHours, lit: score.litHours, comms: score.commsHours });
      expect(summary.sun.isUp).toBe(clock.now.lit);
      expect(summary.earth.isUp).toBe(clock.now.earthVisible);
      expect(summary.sun.eventMs).toBe(clock.now.lit ? clock.nextSunset : clock.nextSunrise);
      expect(summary.earth.eventMs).toBe(clock.now.earthVisible ? clock.nextEarthset : clock.nextEarthrise);

      const missionEnd = landingMs + MISSION_DAYS * DAY_MS;
      for (const [kind, spans] of [["lit", summary.spans.lit], ["comms", summary.spans.comms], ["golden", summary.spans.golden]] as const) {
        const windows = findWindows(eph, site, siteProfile, landingMs, missionEnd, kind);
        expect(spans).toHaveLength(windows.length);
        spans.forEach((span, i) => {
          expect(span.from).toBeCloseTo((windows[i].start - landingMs) / (missionEnd - landingMs), 12);
          expect(span.to).toBeCloseTo((windows[i].end - landingMs) / (missionEnd - landingMs), 12);
        });
      }
    }
  });

  test("gives no summary when the mission would run past the data", () => {
    const last = loadEphemeris([2030]);
    const site = findSite("im-2")!;
    const siteProfile = loadProfile("im-2");
    expect(siteSummary(last, site, siteProfile, DATA_END_MS - 14 * DAY_MS)).not.toBeNull();
    expect(siteSummary(last, site, siteProfile, DATA_END_MS - 14 * DAY_MS + 1)).toBeNull();
    expect(siteSummary(last, site, siteProfile, DATA_END_MS)).toBeNull();
  });

  test("says when the event search stopped at the end of the data", () => {
    const last = loadEphemeris([2030]);
    const site = findSite("shackleton-rim")!;
    const siteProfile = loadProfile("shackleton-rim");
    expect(siteSummary(last, site, siteProfile, DATA_END_MS - 60 * DAY_MS)!.isSearchCut).toBe(false);
    expect(siteSummary(last, site, siteProfile, DATA_END_MS - 60 * DAY_MS + 1)!.isSearchCut).toBe(true);
    expect(siteSummary(last, site, siteProfile, DATA_END_MS - 14 * DAY_MS)!.isSearchCut).toBe(true);
  });

  test("a site that never sees Earth reports no Earth event", () => {
    const farSide = { lat: 0, lon: 180 };
    const flat = Array.from({ length: 360 }, () => 0);
    const summary = siteSummary(eph, farSide, flat, DEFAULT_TIME_MS)!;
    expect(summary.earth).toEqual({ isUp: false, eventMs: null });
    expect(summary.spans.golden).toEqual([]);
  });
});

describe("formatDays", () => {
  test("never rounds up to a full mission", () => {
    expect(formatDays(336)).toBe("14");
    expect(formatDays(335.9)).toBe("13.9");
    expect(formatDays(0)).toBe("0");
    expect(formatDays(84)).toBe("3.5");
  });
});

describe("formatDuration", () => {
  test("shows days and hours, rounding down", () => {
    expect(formatDuration(14 * DAY_MS + 4 * 3_600_000 + 3_599_000)).toBe("14d 4h");
    expect(formatDuration(3 * 3_600_000)).toBe("0d 3h");
  });

  test("shows minutes in the last hour, so a close event is never 0d 0h", () => {
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(20_000)).toBe("under 1 min");
  });
});

test("coordinates use hemispheres", () => {
  expect(formatCoordinates(-89.7804, -156.18)).toBe("89.78°S 156.18°W");
  expect(formatCoordinates(0.67416, 23.47314)).toBe("0.67°N 23.47°E");
});
