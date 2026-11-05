import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { dayRing, gapSentence, listeningAt, relay, relayHeadline, stationsOf } from "./dsnRelay";
import { loadEphemeris } from "./testData";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const eph = loadEphemeris([2027, 2028]);
const LANDING = Date.UTC(2027, 11, 29, 21);
const fileStations = (year: number) => JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", `dsn-${year}.json`), "utf-8")).stations as string[];

describe("stationsOf", () => {
  test("names come from the DSN file, in bit order", () => {
    expect(stationsOf(eph).map(({ name }) => name)).toEqual(fileStations(2027));
    expect(fileStations(2028)).toEqual(fileStations(2027));
  });

  test("each name is split into place, country and antenna", () => {
    expect(stationsOf(eph)).toEqual([
      { bit: 0, name: "Goldstone (USA), DSS-14", place: "Goldstone", country: "USA", antenna: "DSS-14" },
      { bit: 1, name: "Madrid (Spain), DSS-63", place: "Madrid", country: "Spain", antenna: "DSS-63" },
      { bit: 2, name: "Canberra (Australia), DSS-43", place: "Canberra", country: "Australia", antenna: "DSS-43" },
    ]);
  });
});

describe("relay", () => {
  const plan = relay(eph, LANDING, LANDING + 30 * DAY_MS);

  test("every hour of every lane is the station's bit in the file", () => {
    for (let t = LANDING; t < LANDING + 30 * DAY_MS; t += HOUR_MS) {
      const mask = eph.dsnMask(t);
      for (const lane of plan.lanes) {
        const isOn = lane.windows.some(({ start, end }) => start <= t && t < end);
        expect(isOn).toBe(((mask >> lane.station.bit) & 1) === 1);
      }
      expect(plan.gaps.some(({ start, end }) => start <= t && t < end)).toBe(mask === 0);
    }
  });

  test("hours add up, and the totals match the file", () => {
    let count = [0, 0, 0];
    let none = 0;
    for (let t = LANDING; t < LANDING + 30 * DAY_MS; t += HOUR_MS) {
      const mask = eph.dsnMask(t);
      count = count.map((n, bit) => n + ((mask >> bit) & 1));
      if (mask === 0) none += 1;
    }
    expect(plan.lanes.map(({ hours }) => hours)).toEqual(count);
    expect(plan.gapHours).toBe(none);
    expect(plan.totalHours).toBe(720);
  });

  test("a start between hours begins the first window there, not on the hour", () => {
    const start = LANDING + 30 * 60_000;
    const first = relay(eph, start, start + DAY_MS).lanes[0].windows[0];
    expect(first.start).toBe(start);
  });
});

describe("listeningAt and dayRing", () => {
  test("at the default landing only Goldstone listens", () => {
    expect(listeningAt(eph, LANDING).map(({ place }) => place)).toEqual(["Goldstone"]);
  });

  test("the ring is the landing day's 24 hourly masks", () => {
    const day = Date.UTC(2027, 11, 29);
    expect(dayRing(eph, LANDING)).toEqual(Array.from({ length: 24 }, (_, h) => eph.dsnMask(day + h * HOUR_MS)));
  });

  test("hours past the data are left empty on the ring", () => {
    const late = loadEphemeris([2030]);
    const ring = dayRing(late, Date.UTC(2030, 11, 31, 23));
    expect(ring).toHaveLength(24);
    expect(ring.every((mask) => mask !== null)).toBe(true);
  });
});

describe("words", () => {
  const plan = relay(eph, LANDING, LANDING + 30 * DAY_MS);

  test("the headline gives the hours with no station, out of all", () => {
    expect(relayHeadline(plan)).toEqual({ lead: "Three stations take turns; the Moon has no station listening for ", emphasis: "9 of 720 hours." });
  });

  test("no gap at all is said plainly", () => {
    expect(relayHeadline({ ...plan, gapHours: 0, gaps: [] })).toEqual({ lead: "Three stations take turns, and ", emphasis: "one is always listening." });
  });

  test("the gap sentence is built from the gaps themselves", () => {
    expect(gapSentence(plan, LANDING)).toBe(
      "A station only counts while the Moon is at least 10° above its horizon. In these 30 days that fails for all three at once 9 times, between day 20 and day 27, for at most 1 hour each.",
    );
  });

  test("a clipped first hour with no station is counted as the part that is in range", () => {
    // 2027-12-29 is in the files; find an hour with no station, then start half-way through it
    const silent = Array.from({ length: 30 * 24 }, (_, h) => LANDING + h * HOUR_MS).find((t) => eph.dsnMask(t) === 0)!;
    const start = silent + 30 * 60_000;
    const part = relay(eph, start, start + 2 * HOUR_MS);
    expect(part.gapHours).toBe(0.5);
    expect(part.totalHours).toBe(2);
    expect(relayHeadline(part).emphasis).toBe("0.5 of 2 hours.");
    expect(gapSentence(part, start)).toMatch(/In these 2 hours that fails for all three at once 1 time, on day 1, for 0.5 hours\.$/);
  });

  test("gaps that all start on one day name that day once", () => {
    const day = (n: number) => LANDING + (n - 1) * DAY_MS;
    const gaps = [{ start: day(3), end: day(3) + HOUR_MS }, { start: day(3) + 5 * HOUR_MS, end: day(3) + 7 * HOUR_MS }];
    expect(gapSentence({ ...plan, gaps, gapHours: 3 }, LANDING)).toMatch(/2 times, on day 3, for at most 2 hours each\.$/);
  });

  test("a range cut short by the end of the data is described in hours, not rounded to days", () => {
    expect(gapSentence({ ...plan, gaps: [], gapHours: 0, totalHours: 167 }, LANDING)).toMatch(/In these 167 hours at least one always does\.$/);
  });

  test("with no gaps the sentence says so", () => {
    expect(gapSentence({ ...plan, gapHours: 0, gaps: [] }, LANDING)).toBe(
      "A station only counts while the Moon is at least 10° above its horizon. In these 30 days at least one always does.",
    );
  });
});
