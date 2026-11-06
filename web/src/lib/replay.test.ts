import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPLAY_YEARS } from "./data/loader";
import { findMission, MISSIONS, type Mission } from "./replay";
import { endBesideSunset, latestEnd, replayLength, replayRun } from "./replayRun";
import { findSite } from "./sites";
import { loadProfile, loadReplayEphemeris } from "./testData";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 16));

function place(mission: Mission): { lat: number; lon: number; profile: number[] } {
  if (mission.point === "touchdown") {
    const file = JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "horizon", `${mission.siteId}-ellipse.json`), "utf-8"));
    return { lat: file.touchdown.lat, lon: file.touchdown.lon, profile: file.touchdown.elevation_deg };
  }
  const site = findSite(mission.siteId)!;
  return { lat: site.lat, lon: site.lon, profile: loadProfile(site.id) };
}

function runOf(id: string) {
  const mission = findMission(id)!;
  const { profile, ...site } = place(mission);
  const eph = loadReplayEphemeris(new Date(mission.landedMs).getUTCFullYear());
  return { mission, run: replayRun(eph, site, profile, mission.landedMs, mission.record.endMs) };
}

describe("the missions", () => {
  test("are five real landings at curated sites, in the years we have data for", () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(["apollo-11", "chandrayaan-3", "im-1", "im-2", "blue-ghost-1"]);
    for (const mission of MISSIONS) {
      const site = findSite(mission.siteId)!;
      expect(site.landed, mission.id).toBe(new Date(mission.landedMs).toISOString().slice(0, 10));
      expect(REPLAY_YEARS).toContain(new Date(mission.landedMs).getUTCFullYear());
      expect(latestEnd(mission.record)).toBeGreaterThan(mission.landedMs);
      if (mission.record.endMs !== null) expect(new Date(mission.record.endMs).toISOString().slice(0, 10)).toBe(mission.record.endDate);
      expect(mission.record.quote.length).toBeGreaterThan(20);
      for (const source of mission.record.sources) {
        expect(source.url).toMatch(/^https:\/\/(www\.)?(nasa\.gov|nssdc\.gsfc\.nasa\.gov|cdscc\.nasa\.gov|isro\.gov\.in|pib\.gov\.in|fireflyspace\.com)\//);
      }
    }
    expect(findMission("nope")).toBeNull();
    expect(findMission(null)).toBeNull();
  });

  test("keep the reported times converted to UTC", () => {
    expect(iso(findMission("apollo-11")!.record.endMs)).toBe("1969-07-21T17:54");
    expect(iso(findMission("im-2")!.landedMs)).toBe("2025-03-06T17:30");
    expect(iso(findMission("im-2")!.record.endMs)).toBe("2025-03-07T06:15");
    expect(iso(findMission("blue-ghost-1")!.landedMs)).toBe("2025-03-02T08:34");
    expect(iso(findMission("blue-ghost-1")!.record.endMs)).toBe("2025-03-16T23:15");
  });

  test("only Apollo 11 hides DSN, and only IM-2 replays its touchdown point", () => {
    expect(MISSIONS.filter((m) => !m.hasDsn).map((m) => m.id)).toEqual(["apollo-11"]);
    expect(MISSIONS.filter((m) => m.point === "touchdown").map((m) => m.id)).toEqual(["im-2"]);
  });
});

describe("the engine at each landing", () => {
  test("Apollo 11 lands in the early morning Sun with Earth high, and lifts off long before sunset", () => {
    const { mission, run } = runOf("apollo-11");
    expect(run.landing.sun.el).toBeCloseTo(10.7, 1);
    expect(run.landing.earth.el).toBeCloseTo(59.2, 1);
    expect(run.earthsetMs).toBeNull();
    expect(endBesideSunset(mission.record, run.sunsetMs, run.landing.lit)).toBe("The mission ended 12d 19h before the Sun set behind this site's skyline.");
  });

  test("Chandrayaan-3's sunset falls on the day ISRO put the lander to sleep, and the Sun returns on 20 Sep", () => {
    const { mission, run } = runOf("chandrayaan-3");
    expect(iso(run.sunsetMs)).toBe("2023-09-04T06:06");
    expect(iso(run.nextSunriseMs)).toBe("2023-09-19T23:59");
    expect(endBesideSunset(mission.record, run.sunsetMs, true)).toBe("The Sun set behind this site's skyline on 4 Sep 2023, the same day the team reported.");
  });

  test("IM-1's site keeps the Sun until 2 Mar 2024, after the day operations ended", () => {
    const { mission, run } = runOf("im-1");
    expect(iso(run.sunsetMs)).toBe("2024-03-02T14:25");
    expect(run.hours).toBeNull();
    expect(endBesideSunset(mission.record, run.sunsetMs, true)).toBe("The Sun set behind this site's skyline on 2 Mar 2024, 2 days after the day the team reported.");
  });

  test("Athena's touchdown point had the Sun and Earth up for the whole short mission", () => {
    const { mission, run } = runOf("im-2");
    const length = (mission.record.endMs! - mission.landedMs) / HOUR_MS;
    expect(length).toBe(12.75);
    expect(run.hours?.lit).toBeCloseTo(length, 5);
    expect(run.hours?.earth).toBeCloseTo(length, 5);
    expect(iso(run.sunsetMs)).toBe("2025-03-19T19:46");
    expect(endBesideSunset(mission.record, run.sunsetMs, true)).toBe("The mission ended 12d 14h before the Sun set behind this site's skyline.");
  });

  test("Blue Ghost's last data comes after the engine's sunset, as Firefly reports it worked into the night", () => {
    const { mission, run } = runOf("blue-ghost-1");
    expect(iso(run.sunsetMs)).toBe("2025-03-16T19:45");
    expect(mission.record.endMs!).toBeGreaterThan(run.sunsetMs!);
    expect(endBesideSunset(mission.record, run.sunsetMs, true)).toBe("The mission's last data came 3 h after the Sun set behind this site's skyline.");
  });
});

describe("replay helpers", () => {
  const record = (endMs: number | null, endDate: string) => ({ endMs, endDate });
  const t0 = Date.UTC(2024, 1, 22, 23, 24);

  test("a date-only end counts to the end of its day", () => {
    expect(latestEnd(record(null, "2024-02-29"))).toBe(Date.UTC(2024, 2, 1));
    expect(latestEnd(record(t0 + DAY_MS, "2024-02-23"))).toBe(t0 + DAY_MS);
  });

  test("the replay runs half a day past the end, and on to a sunset within 3 days of it", () => {
    const end = record(t0 + 2 * DAY_MS, "2024-02-24");
    expect(replayLength(t0, end, null)).toBe(2.5 * DAY_MS);
    expect(replayLength(t0, end, t0 + 4 * DAY_MS)).toBe(4.5 * DAY_MS);
    expect(replayLength(t0, end, t0 + 9 * DAY_MS)).toBe(2.5 * DAY_MS);
    expect(replayLength(t0, end, t0 + DAY_MS)).toBe(2.5 * DAY_MS);
  });

  test("says how the end sits beside the sunset in every case", () => {
    expect(endBesideSunset(record(t0, "2024-02-22"), null, false)).toBe("The Sun was below this site's skyline at touchdown.");
    expect(endBesideSunset(record(t0, "2024-02-22"), null, true)).toBe("The Sun did not set behind this site's skyline within 30 days of touchdown.");
    expect(endBesideSunset(record(t0, "2024-02-22"), t0 + 30 * 60_000, true)).toBe("The mission ended within an hour of the Sun setting behind this site's skyline.");
    expect(endBesideSunset(record(null, "2024-02-22"), Date.UTC(2024, 1, 21, 5), true)).toBe(
      "The Sun set behind this site's skyline on 21 Feb 2024, 1 day before the day the team reported.",
    );
  });

  test("refuses a mission that ends before it lands", () => {
    const { mission } = runOf("im-1");
    const { profile, ...site } = place(mission);
    expect(() => replayRun(loadReplayEphemeris(2024), site, profile, t0, t0)).toThrow(RangeError);
  });
});
