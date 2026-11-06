import { describe, expect, test } from "vitest";
import { findLesson, GLOSSARY, LESSONS, lessonFor, lessonNeighbours } from "./classroom";
import { atlasAnswer, compareAnswer, datesAnswer, ellipseAnswer, powerAnswer, proofAnswer, skyAnswer, threeAnswer } from "./classroomAnswers";
import { formatDegrees } from "./proof";
import { DESKTOP_NAV } from "./routes";
import { DEFAULT_TIME_MS } from "./selection";
import { MISSION_DAYS, siteSummary } from "./siteSummary";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";

const degrees = (value: number) => `${value.toFixed(1)}°`;

describe("the lessons", () => {
  test("cover every desktop page once, under its own name", () => {
    expect(LESSONS.map(({ href }) => href).sort()).toEqual(DESKTOP_NAV.map(({ href }) => href).sort());
    expect(LESSONS.map(({ page }) => page)).toEqual(LESSONS.map(({ href }) => DESKTOP_NAV.find((p) => p.href === href)!.label));
  });

  test("only use words the glossary explains, and keep each part short", () => {
    for (const lesson of LESSONS) {
      for (const term of lesson.terms) expect(GLOSSARY[term], `${lesson.id} ${term}`).toBeDefined();
      expect(lesson.idea.length, lesson.id).toBeLessThan(60);
      expect(lesson.body.split(/(?<=\.) /).length, lesson.id).toBeLessThanOrEqual(3);
      expect(lesson.question.endsWith("?"), lesson.id).toBe(true);
    }
  });

  test("ask about the mission length the engine uses", () => {
    expect(findLesson("sky").question).toContain(`${MISSION_DAYS * 24} hours`);
  });

  test("are found by page, and the Brief and unknown pages have none", () => {
    expect(lessonFor("/")?.id).toBe("atlas");
    expect(lessonFor("/sky")?.id).toBe("sky");
    expect(lessonFor("/3d")?.id).toBe("3d");
    expect(lessonFor("/brief")).toBeNull();
    expect(lessonFor("/nowhere")).toBeNull();
  });

  test("link to the lesson before and after", () => {
    expect(lessonNeighbours("atlas")).toMatchObject({ number: 1, previous: null, next: { id: "sky" } });
    expect(lessonNeighbours("proof")).toMatchObject({ number: 8, previous: { id: "3d" }, next: null });
    expect(() => findLesson("nope" as never)).toThrow(RangeError);
  });
});

describe("the answers", () => {
  test("Atlas reads the site's own share of sunlit hours, beside the equator", () => {
    expect(atlasAnswer("shackleton-rim", "Shackleton crater rim")).toEqual({
      kind: "ready",
      big: "84.8%",
      why: "Shackleton crater rim has the Sun above its own skyline in 84.8% of the hours (the Sunlight layer on the map). For comparison, the Apollo 11 site near the equator gets 49.4%.",
      source: "From our hour-by-hour count for 2026 to 2030",
    });
    expect(atlasAnswer("apollo-11", "Apollo 11")).toMatchObject({ big: "49.4%", why: "Apollo 11 has the Sun above its own skyline in 49.4% of the hours (the Sunlight layer on the map)." });
    expect(atlasAnswer(null, "Custom site").kind).toBe("unavailable");
  });

  test("Sky gives the sunlit hours of the engine's own 14-day summary", () => {
    const site = findSite("shackleton-rim")!;
    const summary = siteSummary(loadEphemeris([2027, 2028]), site, loadProfile(site.id), DEFAULT_TIME_MS)!;
    expect(skyAnswer(summary.hours.lit)).toMatchObject({ kind: "ready", big: "336 h of 336 h", why: "The Sun stays above this site's skyline for all 14 days." });
    expect(skyAnswer(336)).toMatchObject({ source: "Worked out by the engine for this site and date" });
    // the two hours shown always add up to 336
    expect(skyAnswer(100.5)).toMatchObject({ big: "100 h of 336 h", why: "For the other 236 h the Sun is below this site's skyline: it has set, or the ground hides it." });
    expect(skyAnswer(335.99)).toMatchObject({ big: "335 h of 336 h", why: expect.stringContaining("For the other 1 h") });
    expect(skyAnswer(0.5)).toMatchObject({ big: "under 1 h of 336 h", why: expect.stringContaining("For the rest of the time") });
    expect(skyAnswer(null).kind).toBe("unavailable");
  });

  test("Dates names the best landing day and its Golden hours", () => {
    const landingMs = Date.UTC(2028, 0, 12, 7);
    const chosenMs = Date.UTC(2027, 11, 29, 21);
    expect(datesAnswer({ landingMs, goldenHours: 301.4 }, { landingMs: chosenMs, goldenHours: 200 }, false)).toMatchObject({ kind: "ready", big: "12 Jan 2028", why: "Landing at 12 Jan 2028, 07:00 UTC gives 301 h of Golden hours in a 14-day mission." });
    // level with the top date, as the page's headline counts it
    expect(datesAnswer({ landingMs, goldenHours: 301.4 }, { landingMs: chosenMs, goldenHours: 301.4 }, false)).toMatchObject({ big: "The chosen date", why: "Landing at 29 Dec 2027, 21:00 UTC already gives the most: 301 h of Golden hours in a 14-day mission." });
    expect(datesAnswer({ landingMs, goldenHours: 0.01 }, null, true)).toMatchObject({ big: "None", why: "No landing date before our data ends gives this site any Golden hours." });
    expect(datesAnswer(null, null, false).kind).toBe("unavailable");
  });

  test("Power repeats the page's own headline and lowest charge", () => {
    expect(powerAnswer({ lead: "Survives ", emphasis: "all 14 days.", survives: true }, 41, false)).toMatchObject({ kind: "ready", big: "Yes", why: "Survives all 14 days. The lowest charge is 41%." });
    expect(powerAnswer({ lead: "Runs out of power after ", emphasis: "3d 4h.", survives: false }, 0, false)).toMatchObject({ big: "No" });
    expect(powerAnswer(null, null, true).kind).toBe("unavailable");
    expect(powerAnswer(null, null, false)).toMatchObject({ reason: "Fix the values marked in the form to see this answer." });
  });

  test("Compare names the leading columns, a tie, or none", () => {
    expect(compareAnswer({ best: 300.2, isBest: [false, true] }, ["A", "B"])).toMatchObject({ kind: "ready", big: "B", why: "300 h of Golden hours in a 14-day mission, the most on this page." });
    expect(compareAnswer({ best: 300, isBest: [false, false] }, ["A", "B"])).toMatchObject({ big: "A tie" });
    expect(compareAnswer({ best: 0.01, isBest: [false, false] }, ["A", "B"])).toMatchObject({ big: "None" });
    expect(compareAnswer(null, ["A"]).kind).toBe("unavailable");
  });

  test("Ellipse gives the gap between the best and worst point", () => {
    expect(ellipseAnswer({ best: 250.9, worst: 120.2 }, true)).toMatchObject({
      kind: "ready",
      big: "130 h",
      why: "The best point gets 250 h of Golden hours and the worst 120 h. Landing off target can cost that difference.",
    });
    // the gap between the hours as shown, so a reader's subtraction agrees
    expect(ellipseAnswer({ best: 100.1, worst: 50.9 }, true)).toMatchObject({ big: "50 h", why: expect.stringContaining("gets 100 h of Golden hours and the worst 50 h") });
    expect(ellipseAnswer({ best: 50.9, worst: 50.1 }, true)).toMatchObject({ big: "under 1 h" });
    expect(ellipseAnswer({ best: 50, worst: 50 }, true)).toMatchObject({ big: "0 h" });
    expect(ellipseAnswer(null, false).kind).toBe("unavailable");
    expect(ellipseAnswer(null, true).kind).toBe("unavailable");
  });

  test("3D reads the skyline toward the Sun and whether the Sun clears it", () => {
    expect(threeAnswer({ el: 1.24, horizon: 0.5 }, true, degrees)).toMatchObject({ big: "0.5°", why: "The Sun is at 1.2°, above it, so the lander is in sunlight. The answer changes as the film plays." });
    expect(threeAnswer({ el: 0.2, horizon: 0.9 }, false, degrees)).toMatchObject({ why: expect.stringContaining("below it, so the lander is in shadow") });
    expect(threeAnswer(null, false, degrees).kind).toBe("unavailable");
  });

  test("Proof sets the largest difference against the Sun's width", () => {
    expect(proofAnswer(0.000742, formatDegrees(0.000742))).toEqual({
      kind: "ready",
      big: "0.000742°",
      why: "The Sun looks about 0.53° wide from the Moon. Our largest difference would fit across it more than 714 times.",
      source: "From the checks listed on this page",
    });
    expect(proofAnswer(0, "0.000000°")).toMatchObject({ big: "0.000000°" });
  });
});
