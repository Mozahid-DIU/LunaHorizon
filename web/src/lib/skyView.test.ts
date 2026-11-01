import { describe, expect, test } from "vitest";
import { countdown } from "./countdown";
import { DEFAULT_TIME_MS } from "./selection";
import { DATA_END_MS } from "./dataRange";
import { advance, centreFor, degreesFromCentre, elevationToY, followCentre, frameTime, isBesideView, labelY, playbackEnd, skylinePoints, SKY_VIEW } from "./skyView";
import { findSite, SITES } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { horizonAt, stateAt } from "./windows";

const HEIGHT = 560;
const DAY_MS = 86_400_000;
const eph = loadEphemeris([2027, 2028]);

describe("playback", () => {
  test("plays 14 days in 30 seconds", () => {
    expect(advance(0, 30_000)).toBe(14 * DAY_MS);
    expect(advance(DAY_MS, 0)).toBe(DAY_MS);
  });

  test("runs 14 days, or to the end of the data", () => {
    expect(playbackEnd(DEFAULT_TIME_MS)).toBe(DEFAULT_TIME_MS + 14 * DAY_MS);
    expect(playbackEnd(DATA_END_MS - DAY_MS)).toBe(DATA_END_MS);
    expect(playbackEnd(DATA_END_MS)).toBe(DATA_END_MS);
  });

  test("every frame is a whole minute that a link can reopen", () => {
    expect(frameTime(DEFAULT_TIME_MS, 89_999)).toBe(DEFAULT_TIME_MS + 60_000);
    expect(frameTime(DEFAULT_TIME_MS, 90_000)).toBe(DEFAULT_TIME_MS + 120_000);
    expect(frameTime(DEFAULT_TIME_MS, 0)).toBe(DEFAULT_TIME_MS);
  });

  test("a frame never passes the end", () => {
    expect(frameTime(DATA_END_MS - 60_000, 10 * DAY_MS)).toBe(DATA_END_MS);
  });
});

describe("followCentre", () => {
  test("keeps the Sun where it started on screen", () => {
    expect(followCentre(100, 80, 95)).toBe(115);
  });

  test("follows across north", () => {
    expect(followCentre(350, 340, 20)).toBe(30);
    expect(followCentre(10, 20, 350)).toBe(340);
  });
});

test("labelY puts a name over a body, or under it at the top of the view", () => {
  expect(labelY(100)).toBe(82);
  expect(labelY(32)).toBe(14);
  expect(labelY(31)).toBe(61);
});

describe("elevationToY", () => {
  test("higher in the sky is always higher on screen", () => {
    let previous = Infinity;
    for (let el = -8; el <= 90; el += 0.25) {
      const y = elevationToY(el, HEIGHT);
      expect(y).toBeLessThan(previous);
      previous = y;
    }
  });

  test("the top of the sky and the bottom of the art fill the view exactly", () => {
    expect(elevationToY(SKY_VIEW.topElevation, HEIGHT)).toBeCloseTo(0, 9);
    expect(elevationToY(SKY_VIEW.bottomElevation, HEIGHT)).toBeCloseTo(HEIGHT, 9);
  });

  test("a Sun overhead at the equator stays in view", () => {
    expect(elevationToY(90, HEIGHT)).toBeGreaterThanOrEqual(0);
  });
});

describe("degreesFromCentre", () => {
  test("takes the short way around the compass", () => {
    expect(degreesFromCentre(10, 350)).toBe(20);
    expect(degreesFromCentre(350, 10)).toBe(-20);
    expect(degreesFromCentre(180, 0)).toBe(-180);
  });
});

test("isBesideView says which bodies lie outside the visible span", () => {
  expect(isBesideView(100, 100, 200)).toBe(false);
  expect(isBesideView(199, 100, 200)).toBe(false);
  expect(isBesideView(201, 100, 200)).toBe(true);
  expect(isBesideView(359, 1, 20)).toBe(false);
  expect(isBesideView(350, 10, 20)).toBe(true);
});

describe("centreFor", () => {
  test("shows both bodies when they fit, midway between them", () => {
    expect(centreFor(350, 30, 120)).toBe(10);
    expect(centreFor(10, 350, 120)).toBe(0);
  });

  test("follows the Sun when they do not fit", () => {
    expect(centreFor(10, 200, 120)).toBe(10);
    expect(centreFor(10, 190, 120)).toBe(10);
    expect(centreFor(10, 130, 120)).toBe(10);
  });
});

describe("skylinePoints", () => {
  const profile = loadProfile("im-2");

  test("follows the engine's horizon at every azimuth", () => {
    const points = skylinePoints(profile);
    expect(points[4 * 90].el).toBe(profile[90]);
    expect(points[4 * 90 + 2].el).toBeCloseTo((profile[90] + profile[91]) / 2, 12);
    for (const { az, el } of points) expect(el).toBe(horizonAt(profile, az));
  });

  test("closes the whole compass", () => {
    const points = skylinePoints(profile);
    expect(points[0].az).toBe(0);
    expect(points.at(-1)!.az).toBe(360);
    expect(points.at(-1)!.el).toBe(points[0].el);
  });
});

test.each(SITES.map((site) => site.id))("on screen, %s's Sun and Earth clear the skyline exactly when the engine says", (id) => {
  const site = findSite(id)!;
  const profile = loadProfile(id);
  for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 37 * 3_600_000) {
    const state = stateAt(eph, site, profile, t);
    const sunAboveLine = elevationToY(state.sun.el, HEIGHT) < elevationToY(horizonAt(profile, state.sun.az), HEIGHT);
    const earthAboveLine = elevationToY(state.earth.el, HEIGHT) < elevationToY(horizonAt(profile, state.earth.az), HEIGHT);
    expect(sunAboveLine).toBe(state.lit);
    expect(earthAboveLine).toBe(state.earthVisible);
  }
});

test("at the exact sunset the Sun's centre meets the skyline", () => {
  const site = findSite("shackleton-rim")!;
  const profile = loadProfile("shackleton-rim");
  const sunset = countdown(eph, site, profile, DEFAULT_TIME_MS).nextSunset!;
  const state = stateAt(eph, site, profile, sunset);
  const gap = elevationToY(state.sun.el, HEIGHT) - elevationToY(state.sun.horizon, HEIGHT);
  expect(Math.abs(gap)).toBeLessThan(0.05);
});
