import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseEllipse } from "./data/validate";
import { ellipseHeadline, ellipseScores, plotRadius, pointName, RINGS_M, zoneSummary } from "./ellipse";
import { missionScore } from "./planning";
import { DEFAULT_TIME_MS } from "./selection";
import { MISSION_DAYS } from "./siteSummary";
import { findSite } from "./sites";
import { loadEphemeris } from "./testData";

const DAY_MS = 86_400_000;
const raw = (id: string) => JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "horizon", `${id}-ellipse.json`), "utf-8"));
const eph = loadEphemeris([2027, 2028]);

describe("parseEllipse", () => {
  test.each(["im-1", "im-2", "shackleton-rim"])("accepts the published %s file", (id) => {
    const file = parseEllipse(raw(id), findSite(id)!);
    expect(file.points).toHaveLength(25);
    expect(file.touchdown === null).toBe(id !== "im-2");
  });

  test.each<[string, (f: Record<string, unknown> & { points: Record<string, unknown>[] }) => void]>([
    ["a missing point", (f) => { f.points.pop(); }],
    ["a ring that is not offered", (f) => { f.points[3].ring_m = 250; }],
    ["a short horizon", (f) => { (f.points[2].elevation_deg as number[]).pop(); }],
    ["an impossible horizon", (f) => { (f.points[2].elevation_deg as number[])[10] = 95; }],
    ["a centre that is not the site", (f) => { f.points[0].lat = -80; }],
    ["another site's file", (f) => { f.site = "im-1"; }],
    ["a touchdown whose distance does not match its position", (f) => { (f.touchdown as Record<string, unknown>).distance_m = 100; }],
    ["a touchdown whose bearing does not match its position", (f) => { (f.touchdown as Record<string, unknown>).bearing_deg = 20; }],
    ["two points swapped between north and south", (f) => {
      const north = f.points.find((p) => p.ring_m === 500 && p.bearing_deg === 0)!;
      const south = f.points.find((p) => p.ring_m === 500 && p.bearing_deg === 180)!;
      [north.bearing_deg, south.bearing_deg] = [180, 0];
    }],
  ])("refuses %s", (_, change) => {
    const file = raw("im-2");
    change(file);
    expect(() => parseEllipse(file, findSite("im-2")!)).toThrow();
  });
});

describe("ellipseScores", () => {
  const file = parseEllipse(raw("im-2"), findSite("im-2")!);
  const scores = ellipseScores(eph, file, DEFAULT_TIME_MS)!;

  test("every point's hours are the engine's, from that point's own horizon", () => {
    expect(scores.points).toHaveLength(25);
    for (const [i, point] of file.points.entries()) {
      const direct = missionScore(eph, { lat: point.lat, lon: point.lon }, point.elevation_deg, DEFAULT_TIME_MS, MISSION_DAYS * DAY_MS);
      expect(scores.points[i].score).toEqual(direct);
    }
  });

  test("Athena's own point is scored too", () => {
    const { touchdown } = file;
    expect(scores.touchdown?.score).toEqual(missionScore(eph, { lat: touchdown!.lat, lon: touchdown!.lon }, touchdown!.elevation_deg, DEFAULT_TIME_MS, MISSION_DAYS * DAY_MS));
  });

  test("a date too late for a mission gives nothing", () => {
    const late = loadEphemeris([2030]);
    expect(ellipseScores(late, file, Date.UTC(2030, 11, 25))).toBeNull();
  });
});

describe("zoneSummary", () => {
  const file = parseEllipse(raw("shackleton-rim"), findSite("shackleton-rim")!);
  const scores = ellipseScores(eph, file, Date.UTC(2028, 6, 1))!;

  test("a zone holds the target and every ring up to its size", () => {
    expect(RINGS_M).toEqual([100, 500, 1000]);
    expect(zoneSummary(scores, 100).count).toBe(9);
    expect(zoneSummary(scores, 500).count).toBe(17);
    expect(zoneSummary(scores, 1000).count).toBe(25);
  });

  test("best, median and worst are taken from the points in the zone", () => {
    const zone = zoneSummary(scores, 1000);
    const golden = scores.points.map(({ score }) => score.goldenHours).sort((a, b) => a - b);
    expect(zone.worst.score.goldenHours).toBe(golden[0]);
    expect(zone.median.score.goldenHours).toBe(golden[12]);
    expect(zone.best.score.goldenHours).toBe(golden[24]);
    expect(zone.target.point.ring_m).toBe(0);
  });
});

describe("pointName", () => {
  test("names the target and each ring point by distance and direction", () => {
    expect(pointName({ ring_m: 0, bearing_deg: 0 })).toBe("the target");
    expect(pointName({ ring_m: 100, bearing_deg: 0 })).toBe("100 m north");
    expect(pointName({ ring_m: 500, bearing_deg: 135 })).toBe("500 m south-east");
    expect(pointName({ ring_m: 1000, bearing_deg: 270 })).toBe("1 km west");
  });
});

describe("ellipseHeadline", () => {
  const zone = (worst: number, best: number) => ({ worst: { score: { goldenHours: worst } }, best: { score: { goldenHours: best } } });

  test("gives the range in the hours the page shows", () => {
    expect(ellipseHeadline(zone(120.7, 336), 500)).toEqual({ lead: "Within 500 m of the target, Golden ranges from ", emphasis: "120 to 336 hours." });
    expect(ellipseHeadline(zone(0, 12.2), 1000)).toEqual({ lead: "Within 1 km of the target, Golden ranges from ", emphasis: "0 to 12 hours." });
  });

  test("says when every point reads the same", () => {
    expect(ellipseHeadline(zone(336, 336), 100)).toEqual({ lead: "Within 100 m of the target, every point gets ", emphasis: "336 Golden hours." });
  });

  test("hours under one read as the cards do", () => {
    expect(ellipseHeadline(zone(0.2, 0.7), 100).emphasis).toBe("under 1 Golden hour.");
    expect(ellipseHeadline(zone(0, 0.7), 100).emphasis).toBe("0 to under 1 hour.");
    expect(ellipseHeadline(zone(0, 0), 100).emphasis).toBe("0 Golden hours.");
  });
});

describe("plotRadius", () => {
  test("rings sit evenly apart, and distances between them are shared out", () => {
    expect([0, 100, 500, 1000].map((d) => plotRadius(d, 120))).toEqual([0, 40, 80, 120]);
    expect(plotRadius(300, 120)).toBeCloseTo(60, 10);
  });

  test("a point beyond the outer ring sits on it, never at the centre", () => {
    expect(plotRadius(1500, 120)).toBe(120);
  });
});

