import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createDataLoader } from "./data/loader";
import { MOON_RADIUS_KM } from "./geometry";
import { missionScore } from "./planning";
import { formatChange, formatPercent } from "./datesPlan";
import { canNudge, changeText, movedPoint, nudgeHeadline, nudgePlan, nudgeRange, type NudgePlan } from "./nudgePlan";
import { DEFAULT_TIME_MS } from "./selection";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";

const DATA = join(__dirname, "..", "..", "public", "data");
const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;
const diskLoader = () =>
  createDataLoader(async (input) => {
    const path = join(DATA, String(input).replace("/data/", ""));
    return new Response(readFileSync(path), { status: 200 });
  });

const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const h = Math.sin(((b.lat - a.lat) * DEG) / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(((b.lon - a.lon) * DEG) / 2) ** 2;
  return 2 * MOON_RADIUS_KM * Math.asin(Math.sqrt(h));
};

describe("movedPoint", () => {
  test("lands the given distance away, in the given direction", () => {
    const im2 = findSite("im-2")!;
    for (const [bearing, km] of [[0, 1], [90, 2], [180, 2], [270, 1]]) {
      const p = movedPoint(im2, bearing, km);
      expect(distanceKm(im2, p)).toBeCloseTo(km, 9);
    }
    expect(movedPoint(im2, 0, 1).lat).toBeGreaterThan(im2.lat);
    expect(movedPoint(im2, 180, 1).lat).toBeLessThan(im2.lat);
  });

  test("north from beside the south pole still moves away from the pole", () => {
    const rim = findSite("shackleton-rim")!;
    expect(movedPoint(rim, 0, 2).lat).toBeGreaterThan(rim.lat);
    expect(distanceKm(rim, movedPoint(rim, 90, 2))).toBeCloseTo(2, 9);
  });
});

describe("canNudge", () => {
  test("only where height tiles reach every moved point", () => {
    expect(canNudge(findSite("shackleton-rim")!)).toBe(true);
    expect(canNudge(findSite("im-1")!)).toBe(true);
    expect(canNudge(findSite("apollo-11")!)).toBe(false);
  });
});

describe("nudgePlan", () => {
  const eph = loadEphemeris([2027, 2028]);
  const rim = findSite("shackleton-rim")!;
  const profile = loadProfile("shackleton-rim");

  test("each moved point's hours are the engine's, from that point's own tile horizon", async () => {
    const loader = diskLoader();
    const plan = await nudgePlan(loader, eph, rim, profile, DEFAULT_TIME_MS);
    expect(plan.moved).toHaveLength(8);
    for (const m of plan.moved.slice(0, 3)) {
      const terrain = await loader.loadCustomTerrain(m.point.lat, m.point.lon);
      expect(m.goldenHours).toBe(missionScore(eph, m.point, terrain.profile, DEFAULT_TIME_MS, 14 * DAY_MS).goldenHours);
    }
    // the dates use the site's own horizon, as the rest of the page does
    expect(plan.chosenHours).toBe(missionScore(eph, rim, profile, DEFAULT_TIME_MS, 14 * DAY_MS).goldenHours);
    expect(plan.dates.map(({ days }) => days)).toEqual([-1, 1]);
    expect(plan.dates[1].goldenHours).toBe(missionScore(eph, rim, profile, DEFAULT_TIME_MS + DAY_MS, 14 * DAY_MS).goldenHours);
    // the tiles and the horizon file agree at the chosen point to within an hour
    expect(Math.abs(plan.centreHours - plan.chosenHours)).toBeLessThan(1);
  }, 120_000);

  test("a day earlier than our data is left out, not guessed", async () => {
    const early = loadEphemeris([2026]);
    const plan = await nudgePlan(diskLoader(), early, rim, profile, Date.UTC(2026, 0, 1));
    expect(plan.dates[0].goldenHours).toBeNull();
  }, 120_000);
});

describe("moved points against the pipeline", () => {
  const eph = loadEphemeris([2027, 2028]);

  test.each(["shackleton-rim", "im-1", "im-2"])("%s: the 1 km points match the Ellipse file's, in place, horizon and Golden hours", async (id) => {
    const loader = diskLoader();
    const site = findSite(id)!;
    const file = JSON.parse(readFileSync(join(DATA, "horizon", `${id}-ellipse.json`), "utf-8")) as {
      points: { ring_m: number; bearing_deg: number; lat: number; lon: number; elevation_deg: number[] }[];
    };
    for (const bearing of [0, 90, 180, 270]) {
      const fromFile = file.points.find((p) => p.ring_m === 1000 && p.bearing_deg === bearing)!;
      const moved = movedPoint(site, bearing, 1);
      expect(distanceKm(moved, fromFile) * 1000).toBeLessThan(0.1);
      const { profile } = await loader.loadCustomTerrain(moved.lat, moved.lon);
      expect(Math.max(...profile.map((deg, az) => Math.abs(deg - fromFile.elevation_deg[az])))).toBeLessThan(0.05);
      const tiles = missionScore(eph, moved, profile, DEFAULT_TIME_MS, 14 * DAY_MS).goldenHours;
      const pipeline = missionScore(eph, fromFile, fromFile.elevation_deg, DEFAULT_TIME_MS, 14 * DAY_MS).goldenHours;
      expect(Math.abs(tiles - pipeline)).toBeLessThan(0.1);
    }
  }, 120_000);
});

describe("the end of the data", () => {
  test("a landing whose mission just fits loads only the data there is, and leaves the later day out", async () => {
    const eph = loadEphemeris([2030]);
    const rim = findSite("shackleton-rim")!;
    const landing = eph.dataEnd() - 14 * DAY_MS;
    const [, to] = nudgeRange(landing);
    expect(to).toBeLessThanOrEqual(eph.dataEnd() + 1);
    const plan = await nudgePlan(diskLoader(), eph, rim, loadProfile("shackleton-rim"), landing);
    expect(plan.dates[1].goldenHours).toBeNull();
    expect(plan.dates[0].goldenHours).not.toBeNull();
  }, 120_000);
});

describe("words", () => {
  const plan = (moved: number[], chosen: number, later: number | null): NudgePlan => ({
    centreHours: chosen,
    chosenHours: chosen,
    moved: moved.map((goldenHours, i) => ({
      direction: (["north", "east", "south", "west"] as const)[i % 4],
      letter: "NESW"[i % 4],
      km: i < 4 ? 1 : 2,
      point: { lat: 0, lon: 0 },
      goldenHours,
    })),
    dates: [
      { days: -1, landingMs: 0, goldenHours: chosen },
      { days: 1, landingMs: 0, goldenHours: later },
    ],
  });

  test("names the worst move and the cost of a day's delay, as the slip table words them", () => {
    expect(nudgeHeadline(plan([300, 290, 52.7, 310, 140, 190, 0, 260], 315.4, 291.9))).toEqual({
      lead: "Move 2 km south and the landing loses ",
      emphasis: "all 315 Golden hours",
      tail: "; a day's delay costs 24.",
      isLoss: true,
    });
    const gain = nudgeHeadline(plan([300, 290, 52.7, 310, 140, 190, 10, 260], 315.4, 320));
    expect(gain.emphasis).toBe("305 of 315 Golden hours");
    expect(gain.tail).toBe("; a day's delay gains 5.");
  });

  test("a point with under an hour left has not lost them all", () => {
    expect(nudgeHeadline(plan([300, 0.6, 310, 310, 310, 310, 310, 310], 315.4, null)).emphasis).toBe("315 of 315 Golden hours, all but under 1 h");
  });

  test("a change under an hour is said as such, not as nothing", () => {
    expect(nudgeHeadline(plan([315.1, 316, 316, 316, 316, 316, 316, 316], 315.4, 315.0)).tail).toBe("; a day's delay costs under 1.");
    expect(nudgeHeadline(plan([315.4, 316, 316, 316, 316, 316, 316, 316], 315.4, 315.4)).tail).toBe("; a day's delay changes nothing.");
  });

  test("no loss among the points checked is said plainly, and the delay left out past our data", () => {
    expect(nudgeHeadline(plan([320, 330, 316, 315.9, 340, 336, 315.4, 318], 315.4, null))).toEqual({
      lead: "Each of the 8 points checked keeps ",
      emphasis: "at least as many Golden hours",
      tail: ".",
      isLoss: false,
    });
  });

  test("with no Golden hours here there is nothing to lose", () => {
    expect(nudgeHeadline(plan([0, 0, 0, 0, 0, 0, 0, 0], 0, 0))).toEqual({ lead: "This landing has ", emphasis: "no Golden hours to lose", tail: ".", isLoss: false });
  });

  test("one hour is singular", () => {
    expect(nudgeHeadline(plan([0, 1, 1, 1, 1, 1, 1, 1], 1.2, null)).emphasis).toBe("all 1 Golden hour");
  });

  test("changes are worded exactly as the slip table's", () => {
    for (const [hours, base] of [[95.1, 100.9], [315.0, 315.4], [316, 315.4], [0, 315.4], [336, 315.4]]) {
      const percent = formatPercent((100 * (hours - base)) / base);
      expect(changeText(hours, base)).toBe(percent ? `${formatChange(hours, base)} (${percent})` : formatChange(hours, base));
    }
    expect(changeText(5, 0)).toBe("+5 h");
  });
});
