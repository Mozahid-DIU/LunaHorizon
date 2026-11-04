import { describe, expect, test } from "vitest";
import { DATA_END_MS } from "./dataRange";
import { yearsForRange } from "./data/loader";
import { BEST_COUNT, datesHeadline, formatChange, formatPercent, nearbySites, planDates, planEnd, SEARCH_DAYS, SLIP_DAYS } from "./datesPlan";
import { bestDates, slipPlanner } from "./planning";
import { DEFAULT_TIME_MS, customSite } from "./selection";
import { MISSION_DAYS } from "./siteSummary";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";

const DAY_MS = 86_400_000;
const MISSION_MS = MISSION_DAYS * DAY_MS;
const eph = loadEphemeris([2027, 2028, 2029]);
const site = findSite("shackleton-rim")!;
const profile = loadProfile("shackleton-rim");
const im2 = { id: "im-2", site: findSite("im-2")!, profile: loadProfile("im-2") };

test("the plan keeps its promised shape", () => {
  expect({ SEARCH_DAYS, BEST_COUNT, SLIP_DAYS, MISSION_DAYS }).toEqual({ SEARCH_DAYS: 365, BEST_COUNT: 5, SLIP_DAYS: [1, 7, 30], MISSION_DAYS: 14 });
});

describe("planDates", () => {
  const plan = planDates(eph, site, profile, DEFAULT_TIME_MS, [im2]);

  test("the best dates are the engine's, kept a mission apart so each is a real choice", () => {
    expect(plan.best).toEqual(bestDates(eph, site, profile, DEFAULT_TIME_MS, SEARCH_DAYS * DAY_MS, MISSION_MS, BEST_COUNT, MISSION_MS));
    expect(plan.best).toHaveLength(BEST_COUNT);
    const times = plan.best.map(({ landingMs }) => landingMs);
    for (const a of times) {
      for (const b of times) {
        if (a !== b) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(MISSION_MS);
      }
    }
  });

  test("the slip plan is the engine's", () => {
    expect(plan.slip).toEqual(slipPlanner(eph, { site, profile }, DEFAULT_TIME_MS, MISSION_MS, SLIP_DAYS, [im2]));
    expect(plan.slip?.rows.map(({ days, siteId }) => days ?? siteId)).toEqual([1, 7, 30, "im-2"]);
  });

  test("a full search is not marked as cut", () => {
    expect(plan.isSearchCut).toBe(false);
  });

  test("a date too late for a mission gives no plan, and no error", () => {
    const late = loadEphemeris([2030]);
    const result = planDates(late, site, profile, Date.UTC(2030, 11, 25), []);
    expect(result).toMatchObject({ best: [], slip: null, isSearchCut: true });
  });

  test("a search that reaches the end of the data says so", () => {
    const late = loadEphemeris([2030]);
    const result = planDates(late, site, profile, Date.UTC(2030, 5, 1), []);
    expect(result.isSearchCut).toBe(true);
    expect(result.best.length).toBeGreaterThan(0);
    expect(result.slip).not.toBeNull();
  });
});

describe("planEnd", () => {
  test("loads enough for the search and the longest slip", () => {
    expect(planEnd(DEFAULT_TIME_MS)).toBe(DEFAULT_TIME_MS + (SEARCH_DAYS + MISSION_DAYS) * DAY_MS);
    expect(planEnd(DEFAULT_TIME_MS)).toBeGreaterThanOrEqual(DEFAULT_TIME_MS + (Math.max(...SLIP_DAYS) + MISSION_DAYS) * DAY_MS);
    expect(yearsForRange(DEFAULT_TIME_MS, planEnd(DEFAULT_TIME_MS))).toEqual([2027, 2028, 2029]);
  });

  test("stops at the end of the data", () => {
    expect(planEnd(Date.UTC(2030, 5, 1))).toBe(DATA_END_MS);
    expect(yearsForRange(Date.UTC(2030, 5, 1), DATA_END_MS)).toEqual([2030]);
  });
});

describe("nearbySites", () => {
  test("lists the closest curated sites, nearest first, without the site itself", () => {
    const near = nearbySites(site);
    expect(near.map(({ site: s }) => s.id)).toEqual(["im-2", "im-1"]);
    expect(near[0].km).toBeLessThan(near[1].km);
  });

  test("distances are great-circle kilometres on the Moon", () => {
    // from the pole to 89 S is one degree of latitude
    const [only] = nearbySites(customSite(-90, 0), [{ ...site, lat: -89, lon: 0 }]);
    expect(only.km).toBeCloseTo(30.32, 2);
  });

  test("a far site is not nearby", () => {
    // Chang'e 4 sits alone on the far side
    expect(nearbySites(findSite("change-4")!)).toEqual([]);
  });

  test("a site in the same landing area is not offered as an alternative", () => {
    // Apollo 12 landed about 160 m from Surveyor 3
    expect(nearbySites(findSite("apollo-12")!).map(({ site: s }) => s.id)).not.toContain("surveyor-3");
    expect(nearbySites(findSite("surveyor-3")!).map(({ site: s }) => s.id)).not.toContain("apollo-12");
  });

  test("equatorial sites can be near each other too", () => {
    expect(nearbySites(findSite("apollo-11")!).map(({ site: s }) => s.id)).toEqual(["apollo-16", "slim"]);
  });

  test("a custom point on a curated site does not list that site as nearby", () => {
    expect(nearbySites(customSite(site.lat, site.lon)).map(({ site: s }) => s.id)).not.toContain("shackleton-rim");
  });
});

describe("datesHeadline", () => {
  const best = (landingMs: number, goldenHours: number) => ({ landingMs, score: { goldenHours, litHours: 0, commsHours: 0 } });

  const OTHER = Date.UTC(2028, 7, 31);

  test("says when the chosen date is already the best", () => {
    expect(datesHeadline([best(DEFAULT_TIME_MS, 336)], 336, false)).toEqual({ lead: "This date is the best in 12 months: ", emphasis: "336 Golden hours." });
  });

  test("a date level with the top one is the best, even if another sorted first", () => {
    expect(datesHeadline([best(OTHER, 200.5)], 200.495, false)?.lead).toBe("This date is the best in 12 months: ");
  });

  test("names a better date", () => {
    expect(datesHeadline([best(OTHER, 200.9)], 100, false)).toEqual({ lead: "31 Aug 2028 gives ", emphasis: "200 Golden hours." });
  });

  test("hours that read differently on the page are not level", () => {
    expect(datesHeadline([best(OTHER, 336)], 335.99, false)?.lead).toBe("31 Aug 2028 gives ");
  });

  test("a date with no mission can still be beaten", () => {
    expect(datesHeadline([best(OTHER, 200)], null, false)?.lead).toBe("31 Aug 2028 gives ");
  });

  test("never claims 12 months when the data ended first", () => {
    expect(datesHeadline([best(DEFAULT_TIME_MS, 336)], 336, true)?.lead).toBe("This date is the best before our data ends: ");
    expect(datesHeadline([best(DEFAULT_TIME_MS, 0)], 0, true)).toEqual({ lead: "No Golden hours ", emphasis: "before our data ends." });
  });

  test("says plainly when no date has any", () => {
    expect(datesHeadline([best(DEFAULT_TIME_MS, 0)], 0, false)).toEqual({ lead: "No Golden hours ", emphasis: "in these 12 months." });
  });

  test("hours under one match the rows", () => {
    expect(datesHeadline([best(OTHER, 0.6)], 0, false)?.emphasis).toBe("under 1 Golden hour.");
    expect(datesHeadline([best(OTHER, 1.5)], 0, false)?.emphasis).toBe("1 Golden hour.");
  });

  test("has nothing to say without dates", () => {
    expect(datesHeadline([], null, false)).toBeNull();
  });
});

describe("formatPercent", () => {
  test("carries its sign, and stays out when there is nothing to say", () => {
    expect(formatPercent(47.6)).toBe("+48%");
    expect(formatPercent(-46.1)).toBe("−46%");
    expect(formatPercent(0.2)).toBeNull();
    expect(formatPercent(null)).toBeNull();
  });
});

describe("formatChange", () => {
  test("uses the hours shown, with a real minus sign", () => {
    expect(formatChange(100.5, 336)).toBe("−236 h");
    expect(formatChange(336, 100.5)).toBe("+236 h");
  });

  test("a small change never reads as none", () => {
    expect(formatChange(200.2, 200.9)).toBe("−under 1 h");
    expect(formatChange(200.9, 200.2)).toBe("+under 1 h");
  });

  test("no change within the search's precision", () => {
    expect(formatChange(200.5, 200.5)).toBe("No change");
    expect(formatChange(200.5, 200.495)).toBe("No change");
  });
});
