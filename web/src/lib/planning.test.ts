import { describe, expect, it } from "vitest";

import reference from "./__fixtures__/windows.json";
import { bestDates, missionScore, slipPlanner } from "./planning";
import { loadEphemeris, loadProfile } from "./testData";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MISSION = 14 * DAY;
const eph = loadEphemeris([2027, 2028]);

const rim = { site: { lat: -89.7804, lon: -156.18 }, profile: loadProfile("shackleton-rim") };
const im2 = { site: { lat: -84.78, lon: 29.13 }, profile: loadProfile("im-2") };

function hours(windows: { start: string; end: string }[]): number {
  return windows.reduce((sum, w) => sum + (Date.parse(w.end) - Date.parse(w.start)), 0) / HOUR;
}

describe("missionScore matches the brute-force windows", () => {
  for (const c of reference.cases) {
    it(`${c.site} ${c.start.slice(0, 10)}`, () => {
      const start = Date.parse(c.start);
      const score = missionScore(eph, { lat: c.lat, lon: c.lon }, loadProfile(c.site), start, Date.parse(c.end) - start);
      // each window edge may differ by up to 2 minutes
      const tol = (n: number) => (n * 2 * 2) / 60 + 1e-9;
      expect(Math.abs(score.goldenHours - hours(c.windows.golden))).toBeLessThanOrEqual(tol(c.windows.golden.length));
      expect(Math.abs(score.litHours - hours(c.windows.lit))).toBeLessThanOrEqual(tol(c.windows.lit.length));
      expect(Math.abs(score.commsHours - hours(c.windows.comms))).toBeLessThanOrEqual(tol(c.windows.comms.length));
    });
  }
});

describe("bestDates", () => {
  const from = Date.parse("2027-03-01T00:00Z");
  const search = 60 * DAY;
  const best = bestDates(eph, im2.site, im2.profile, from, search, MISSION);

  it("returns five dates, best first, at least a day apart, inside the search range", () => {
    expect(best).toHaveLength(5);
    best.slice(1).forEach((b, i) => expect(b.score.goldenHours).toBeLessThanOrEqual(best[i].score.goldenHours));
    for (let i = 0; i < best.length; i++) {
      expect(best[i].landingMs).toBeGreaterThanOrEqual(from);
      expect(best[i].landingMs).toBeLessThanOrEqual(from + search);
      for (let j = i + 1; j < best.length; j++) {
        expect(Math.abs(best[i].landingMs - best[j].landingMs)).toBeGreaterThanOrEqual(DAY);
      }
    }
  });

  it("each score equals a direct missionScore for that landing time", () => {
    for (const b of best) {
      const direct = missionScore(eph, im2.site, im2.profile, b.landingMs, MISSION);
      expect(b.score.goldenHours).toBeCloseTo(direct.goldenHours, 6);
    }
  });

  it("no daily landing time in the range beats the top result", () => {
    for (let t = from; t <= from + search; t += DAY) {
      const direct = missionScore(eph, im2.site, im2.profile, t, MISSION);
      // separate scans can place window edges up to 30 s apart, so allow 3 minutes in total
      expect(direct.goldenHours).toBeLessThanOrEqual(best[0].score.goldenHours + 0.05);
    }
  });

  it("stops where the data ends instead of failing", () => {
    const late = bestDates(eph, im2.site, im2.profile, Date.parse("2028-12-01T00:00Z"), 60 * DAY, MISSION);
    for (const b of late) expect(b.landingMs + MISSION).toBeLessThanOrEqual(eph.dataEnd());
  });
});

describe("slipPlanner", () => {
  const landing = Date.parse("2027-05-10T12:00Z");
  const plan = slipPlanner(eph, rim, landing, MISSION, [1, 7, 30], [{ id: "im-2", ...im2 }]);

  it("baseline equals a direct missionScore", () => {
    expect(plan.baseline.goldenHours).toBeCloseTo(missionScore(eph, rim.site, rim.profile, landing, MISSION).goldenHours, 6);
  });

  it("each slip row is the score at the shifted date and its change from baseline", () => {
    const slips = plan.rows.filter((r) => r.kind === "slip");
    expect(slips.map((r) => r.days)).toEqual([1, 7, 30]);
    for (const r of slips) {
      const direct = missionScore(eph, rim.site, rim.profile, landing + r.days! * DAY, MISSION);
      expect(r.score!.goldenHours).toBeCloseTo(direct.goldenHours, 6);
      expect(r.deltaGoldenHours!).toBeCloseTo(direct.goldenHours - plan.baseline.goldenHours, 6);
    }
  });

  it("alternative sites use the same landing time", () => {
    const alt = plan.rows.find((r) => r.kind === "site")!;
    expect(alt.siteId).toBe("im-2");
    expect(alt.score!.goldenHours).toBeCloseTo(missionScore(eph, im2.site, im2.profile, landing, MISSION).goldenHours, 6);
  });

  it("marks slips past the end of the data as unavailable", () => {
    const late = slipPlanner(eph, rim, Date.parse("2028-12-01T00:00Z"), MISSION, [30]);
    expect(late.rows[0].score).toBeNull();
    expect(late.rows[0].deltaPercent).toBeNull();
  });
});
