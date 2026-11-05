import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { againstMission, alternatives, briefStamp, dayLate, evidenceOf, gapsWithin, MISSION_MS, skyFrame, watchList } from "./brief";
import { parseEllipse, parseValidation } from "./data/validate";
import { planDates } from "./datesPlan";
import { relay } from "./dsnRelay";
import { ellipseScores, zoneSummary } from "./ellipse";
import { DEFAULT_SETUP, runPower } from "./powerPlan";
import { DEFAULT_TIME_MS } from "./selection";
import { siteSummary } from "./siteSummary";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DATA = join(__dirname, "..", "..", "public", "data");

describe("briefStamp", () => {
  test("whole mission, part of it, and none", () => {
    expect(briefStamp(336)).toBe("GOLDEN · 14 OF 14 DAYS");
    expect(briefStamp(335.99)).toBe("GOLDEN · 13.9 OF 14 DAYS");
    expect(briefStamp(228.66)).toBe("GOLDEN · 9.5 OF 14 DAYS");
    expect(briefStamp(0)).toBe("NO GOLDEN HOURS");
    expect(briefStamp(0.5)).toBe("GOLDEN · UNDER 1 HOUR");
    expect(briefStamp(1.5)).toBe("GOLDEN · 1 HOUR");
    expect(briefStamp(2.2)).toBe("GOLDEN · 2 HOURS");
    expect(briefStamp(2.41)).toBe("GOLDEN · 0.1 OF 14 DAYS");
  });
});

describe("againstMission", () => {
  const t = DEFAULT_TIME_MS;
  test("after, at, and during the mission", () => {
    expect(againstMission(t + MISSION_MS + 3 * HOUR_MS, t)).toBe("3h after the mission ends");
    expect(againstMission(t + MISSION_MS + 30 * 60_000, t)).toBe("30 min after the mission ends");
    expect(againstMission(t + MISSION_MS, t)).toBe("as the mission ends");
    expect(againstMission(t + 8.5 * DAY_MS, t)).toBe("during the mission, on day 9");
    expect(againstMission(t + 1, t)).toBe("during the mission, on day 1");
  });
});

describe("gapsWithin and alternatives", () => {
  test("gaps are cut to the mission", () => {
    const t = 0;
    expect(gapsWithin([{ start: -HOUR_MS, end: HOUR_MS }, { start: 13.9 * DAY_MS, end: 14.1 * DAY_MS }, { start: 20 * DAY_MS, end: 21 * DAY_MS }], t)).toEqual([
      { start: 0, end: HOUR_MS },
      { start: 13.9 * DAY_MS, end: 14 * DAY_MS },
    ]);
  });

  test("the chosen date is left out of the alternatives", () => {
    const best = [0, 20, 40, 60, 80].map((d) => ({ landingMs: d * DAY_MS, score: { goldenHours: 300, litHours: 300, commsHours: 300 } }));
    expect(alternatives(best, 20 * DAY_MS).map(({ landingMs }) => landingMs / DAY_MS)).toEqual([0, 40, 60]);
  });
});

describe("watchList at the Shackleton rim, from the engine's own results", () => {
  const eph = loadEphemeris([2027, 2028, 2029]);
  const site = findSite("shackleton-rim")!;
  const profile = loadProfile("shackleton-rim");
  const t = DEFAULT_TIME_MS;
  const summary = siteSummary(eph, site, profile, t)!;
  const plan = relay(eph, t, t + 30 * DAY_MS);
  const file = parseEllipse(JSON.parse(readFileSync(join(DATA, "horizon", "shackleton-rim-ellipse.json"), "utf-8")), site);
  const zone = zoneSummary(ellipseScores(eph, file, t)!, 500);
  const power = runPower(eph, site, profile, t, DEFAULT_SETUP);
  const slip = planDates(eph, site, profile, t, []).slip;

  const items = watchList({ landingMs: t, summary, missionGaps: gapsWithin(plan.gaps, t), zone, slip, power: power.status === "ready" ? power.run : null });

  test("risks first, each a fact from the results", () => {
    expect(items.map(({ title }) => title)).toEqual([
      "Landing accuracy matters",
      "A day late costs 21 Golden hours",
      "Earthset 14d 3h after landing",
      "Sunset 22d 22h after landing",
      "A DSN station always listens",
    ]);
    expect(items[0].text).toBe("Within 500 m of the target the points range from 0 hours to 336 hours; half of the 17 points get 89 hours or less.");
    expect(items[2].text).toBe("That is 3h after the mission ends.");
    expect(items[3].text).toBe("That is 8d 22h after the mission ends.");
    expect(items[1].text).toBe("336 h as planned, 315 h a day later.");
  }, 60_000);

  test("the gaps of the 30 days fall outside this mission", () => {
    expect(plan.gaps.length).toBe(9);
    expect(gapsWithin(plan.gaps, t)).toEqual([]);
  });

  test("an Earthset during the mission is a risk, and so is a mission with gaps", () => {
    const early = { ...summary, earth: { isUp: true, eventMs: t + 9.5 * DAY_MS } };
    const list = watchList({ landingMs: t, summary: early, missionGaps: [{ start: t, end: t + 2 * HOUR_MS }], zone: null, slip: null, power: null });
    expect(list[0]).toEqual({ isRisk: true, title: "Earthset 9d 12h after landing", text: "That is during the mission, on day 10: direct contact with Earth ends then." });
    expect(list[1]).toEqual({ isRisk: true, title: "1 DSN gap during the mission", text: "No station listens for 2 hours in all; plan contact around them." });
  });

  test("a body down at landing, and one that never sets", () => {
    const down = { ...summary, sun: { isUp: false, eventMs: t + 2 * DAY_MS }, earth: { isUp: true, eventMs: null } };
    const list = watchList({ landingMs: t, summary: down, missionGaps: [], zone: null, slip: null, power: null });
    expect(list.find(({ title }) => title === "The Sun is down at landing")?.text).toBe("Sunrise comes 2d 0h after landing, during the mission, on day 3.");
    expect(list.find(({ title }) => title === "No Earthset in the 60 days after landing")?.text).toBe("Earth is up at landing and stays up for at least 60 days.");
    const cut = watchList({ landingMs: t, summary: { ...down, isSearchCut: true }, missionGaps: [], zone: null, slip: null, power: null });
    expect(cut.find(({ title }) => title === "No Earthset before our data ends")?.text).toBe("Earth is up at landing and stays up as far as our data goes.");
  });
});

describe("power in the watch list", () => {
  test("a lander that runs out is a risk, worded in hours under a day", () => {
    const eph = loadEphemeris([2027, 2028]);
    const summary = siteSummary(eph, findSite("apollo-11")!, loadProfile("apollo-11"), DEFAULT_TIME_MS)!;
    const run = { minSocWh: 0, emptyAtMs: DEFAULT_TIME_MS + 20 * HOUR_MS, generatedWh: 0, wastedWh: 0, unmetWh: 1, longestDeficitHours: 30, survives: false, samples: [] };
    const list = watchList({ landingMs: DEFAULT_TIME_MS, summary, missionGaps: [], zone: null, slip: null, power: run });
    expect(list.find(({ title }) => title === "The example lander runs out of power")?.text).toBe("After 20h; see the Power page to size the battery.");
  });
});

describe("dayLate", () => {
  test("counts as the slip table does, with the right plural", () => {
    expect(dayLate(315.4, 336)).toBe("costs 21 Golden hours");
    expect(dayLate(335.2, 336)).toBe("costs 1 Golden hour");
    expect(dayLate(335.2, 335.9)).toBe("costs under 1 Golden hour");
    expect(dayLate(337.5, 336)).toBe("gains 1 Golden hour");
    expect(dayLate(336, 336)).toBe("changes nothing");
  });
});

describe("skyFrame", () => {
  test("holds the skyline and the bodies with a degree to spare, and says how much it stretches", () => {
    const frame = skyFrame([-2.5, 1.2, 0.3], [0.8, -0.7, 2.4], 360, 160);
    expect(frame).toEqual({ topDeg: 4, bottomDeg: -4, stretch: 20 });
  });
});

describe("evidenceOf", () => {
  test("states the file's summary and never understates a difference", () => {
    const file = parseValidation(JSON.parse(readFileSync(join(DATA, "validation.json"), "utf-8")));
    const evidence = evidenceOf(file);
    expect(evidence.checks).toBe(128);
    expect(evidence.passed).toBe(128);
    expect(Number(evidence.maxAngleDeg)).toBeGreaterThanOrEqual(file.summary.max_angle_diff_deg);
    expect(evidence.maxAngleDeg).toBe("0.0008");
    expect(evidence.heightChecks).toBe(11);
    expect(evidence.heightsPassed).toBe(11);
    expect(evidence.maxHeightDiffM).toBe(28);
    expect(evidence.heightToleranceM).toBe(150);
  });
});
