import { describe, expect, it } from "vitest";

import reference from "./__fixtures__/windows.json";
import { loadEphemeris, loadProfile } from "./testData";
import { Ephemeris, type WindowKind, findWindows, horizonAt, stateAt, sunDiscFraction } from "./windows";

const MINUTE = 60_000;
const TOL_MS = 2 * MINUTE;
const KINDS: WindowKind[] = ["lit", "earth", "comms", "golden"];

const eph = loadEphemeris([2027, 2028]);

describe("windows match the 1-minute SPICE brute force", () => {
  for (const c of reference.cases) {
    const site = { lat: c.lat, lon: c.lon };
    const profile = loadProfile(c.site);
    for (const kind of KINDS) {
      it(`${c.site} ${c.start.slice(0, 10)} ${kind}`, () => {
        const ours = findWindows(eph, site, profile, Date.parse(c.start), Date.parse(c.end), kind);
        const ref = c.windows[kind as keyof typeof c.windows];
        expect(ours.length).toBe(ref.length);
        ours.forEach((w, i) => {
          expect(Math.abs(w.start - Date.parse(ref[i].start))).toBeLessThanOrEqual(TOL_MS);
          expect(Math.abs(w.end - Date.parse(ref[i].end))).toBeLessThanOrEqual(TOL_MS);
          expect(w.startClipped).toBe(ref[i].startClipped);
          expect(w.endClipped).toBe(ref[i].endClipped);
        });
      });
    }
  }
});

describe("findWindows edge cases", () => {
  it("returns nothing for an empty or reversed range", () => {
    const t = Date.parse("2027-01-15T00:00Z");
    const site = { lat: 0.67416, lon: 23.47314 };
    expect(findWindows(eph, site, loadProfile("apollo-11"), t, t, "lit")).toEqual([]);
    expect(findWindows(eph, site, loadProfile("apollo-11"), t, t - 1, "lit")).toEqual([]);
  });

  it("uses real terrain for terrain sites", () => {
    const profile = loadProfile("shackleton-rim");
    expect(Math.max(...profile) - Math.min(...profile)).toBeGreaterThan(1);
  });
});

describe("Ephemeris", () => {
  it("rejects files that do not start on 1 January with hourly steps", () => {
    const bad = { start: "2027-01-02T00:00Z", step_hours: 1, sun: { lat: [], lon: [], dist_km: [] }, earth: { lat: [], lon: [], dist_km: [] } };
    expect(() => new Ephemeris(new Map([[2027, { subpoints: bad, dsn: { start: bad.start, step_hours: 1, mask: [] } }]]))).toThrow();
  });
});

describe("horizonAt", () => {
  const profile = Array.from({ length: 360 }, () => 0);
  profile[359] = 2;
  profile[0] = 4;

  it("interpolates between degrees", () => {
    expect(horizonAt(profile, 359.5)).toBeCloseTo(3, 12);
  });

  it("wraps at 360 and handles negative azimuths", () => {
    expect(horizonAt(profile, 360)).toBeCloseTo(4, 12);
    expect(horizonAt(profile, -0.5)).toBeCloseTo(3, 12);
  });
});

describe("sunDiscFraction", () => {
  it("is 0, 0.5 and 1 below, on and above the horizon", () => {
    expect(sunDiscFraction(-0.3, 0.27)).toBe(0);
    expect(sunDiscFraction(0, 0.27)).toBeCloseTo(0.5, 12);
    expect(sunDiscFraction(0.3, 0.27)).toBe(1);
  });

  it("grows monotonically through sunrise", () => {
    const values = [-0.2, -0.1, 0, 0.1, 0.2].map((m) => sunDiscFraction(m, 0.27));
    values.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(values[i]));
  });
});

describe("stateAt", () => {
  it("golden means lit and comms together", () => {
    const site = { lat: -89.7804, lon: -156.18 };
    const profile = loadProfile("shackleton-rim");
    for (let t = Date.parse("2027-01-01T00:00Z"); t < Date.parse("2027-01-31T00:00Z"); t += 7 * 3_600_000) {
      const s = stateAt(eph, site, profile, t);
      expect(s.golden).toBe(s.lit && s.comms);
      expect(s.comms).toBe(s.earthVisible && s.dsnMask > 0);
      expect(s.lit).toBe(s.sun.el > s.sun.horizon);
    }
  });

  it("works across the new year", () => {
    const s = stateAt(eph, { lat: 0, lon: 0 }, loadProfile("apollo-11"), Date.parse("2027-12-31T23:30Z"));
    expect(Number.isFinite(s.sun.el)).toBe(true);
  });

  it("rejects times without data", () => {
    expect(() => stateAt(eph, { lat: 0, lon: 0 }, loadProfile("apollo-11"), Date.parse("2030-06-01T00:00Z"))).toThrow(
      RangeError,
    );
  });
});
