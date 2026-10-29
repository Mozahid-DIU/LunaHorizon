import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import parity from "./__fixtures__/parity.json";
import {
  type SubpointYear,
  bodyAltAzAt,
  hourIndex,
  interpolateSubpoint,
  topocentricAltAz,
} from "./geometry";

const TOL_DEG = 0.02;

const years = new Map<number, SubpointYear>();
function loadYear(year: number): SubpointYear {
  if (!years.has(year)) {
    const path = join(__dirname, "..", "..", "public", "data", `subpoints-${year}.json`);
    years.set(year, JSON.parse(readFileSync(path, "utf-8")));
  }
  return years.get(year)!;
}

function angleDiff(a: number, b: number): number {
  return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180);
}

describe("parity with the Python SPICE engine", () => {
  it.each(parity.cases)("$site at $utc", (c) => {
    const t = Date.parse(c.utc);
    const year = loadYear(new Date(t).getUTCFullYear());
    const site = { lat: c.lat, lon: c.lon };
    for (const body of ["sun", "earth"] as const) {
      const ours = bodyAltAzAt(year, body, t, site);
      const refEl = c[`${body}_el`];
      expect(Math.abs(ours.el - refEl)).toBeLessThan(TOL_DEG);
      // azimuth is ill-defined near the zenith, so weight it by cos(elevation)
      const azErr = angleDiff(ours.az, c[`${body}_az`]) * Math.cos((refEl * Math.PI) / 180);
      expect(azErr).toBeLessThan(TOL_DEG);
    }
  });
});

describe("topocentricAltAz", () => {
  it("puts a sub-point directly under the target overhead", () => {
    expect(topocentricAltAz(10, 20, 1e9, { lat: 10, lon: 20 }).el).toBeCloseTo(90, 6);
  });

  it("puts a target 90 degrees east on the east horizon", () => {
    const { az, el } = topocentricAltAz(0, 90, 1e12, { lat: 0, lon: 0 });
    expect(el).toBeCloseTo(0, 6);
    expect(az).toBeCloseTo(90, 6);
  });

  it("returns azimuth in [0, 360)", () => {
    const { az } = topocentricAltAz(0, -90, 1e12, { lat: 0, lon: 0 });
    expect(az).toBeCloseTo(270, 6);
  });
});

describe("hourIndex", () => {
  const year = loadYear(2027);

  it("is 0 at the start of the year and counts hours", () => {
    expect(hourIndex(year, Date.parse("2027-01-01T00:00Z"))).toBe(0);
    expect(hourIndex(year, Date.parse("2027-01-02T03:30Z"))).toBeCloseTo(27.5, 9);
  });

  it("rejects times outside the file", () => {
    expect(() => hourIndex(year, Date.parse("2026-12-31T23:00Z"))).toThrow(RangeError);
    expect(() => hourIndex(year, Date.parse("2028-01-01T00:00Z"))).toThrow(RangeError);
  });
});

describe("interpolateSubpoint", () => {
  const track = { lat: [1, 3], lon: [179.5, -179.5], dist_km: [100, 200] };

  it("interpolates linearly between hours", () => {
    const p = interpolateSubpoint(track, 0.5);
    expect(p.lat).toBeCloseTo(2, 9);
    expect(p.distKm).toBeCloseTo(150, 9);
  });

  it("wraps longitude across 180 degrees", () => {
    expect(Math.abs(interpolateSubpoint(track, 0.5).lon)).toBeCloseTo(180, 9);
  });

  it("returns the exact sample on the hour", () => {
    expect(interpolateSubpoint(track, 1)).toEqual({ lat: 3, lon: -179.5, distKm: 200 });
  });
});
