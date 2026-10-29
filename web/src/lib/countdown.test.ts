import { describe, expect, it } from "vitest";

import reference from "./__fixtures__/windows.json";
import { countdown } from "./countdown";
import { loadEphemeris, loadProfile } from "./testData";

const TOL_MS = 2 * 60_000;
const DAY = 86_400_000;
const eph = loadEphemeris([2027, 2028]);

function refCase(site: string, start: string) {
  const c = reference.cases.find((x) => x.site === site && x.start.startsWith(start));
  if (!c) throw new Error(`no reference case ${site} ${start}`);
  return { c, site: { lat: c.lat, lon: c.lon }, profile: loadProfile(site) };
}

const ms = (iso: string) => Date.parse(iso);

describe("countdown matches the brute-force windows", () => {
  it("Apollo 11 at night: next sunrise and the sunset after it", () => {
    const { c, site, profile } = refCase("apollo-11", "2027-01-01");
    const lit = c.windows.lit[0];
    const cd = countdown(eph, site, profile, ms("2027-01-05T00:00Z"));
    expect(cd.now.lit).toBe(false);
    expect(Math.abs(cd.nextSunrise! - ms(lit.start))).toBeLessThanOrEqual(TOL_MS);
    expect(Math.abs(cd.nextSunset! - ms(lit.end))).toBeLessThanOrEqual(TOL_MS);
  });

  it("Apollo 11 in daylight: next sunset", () => {
    const { c, site, profile } = refCase("apollo-11", "2027-01-01");
    const cd = countdown(eph, site, profile, ms("2027-01-20T00:00Z"));
    expect(cd.now.lit).toBe(true);
    expect(Math.abs(cd.nextSunset! - ms(c.windows.lit[0].end))).toBeLessThanOrEqual(TOL_MS);
    expect(cd.nextSunrise!).toBeGreaterThan(cd.nextSunset!);
  });

  it("Shackleton rim: Earthrise and Earthset", () => {
    const { c, site, profile } = refCase("shackleton-rim", "2027-01-01");
    const earth = c.windows.earth[0];
    const before = countdown(eph, site, profile, ms("2027-01-05T00:00Z"));
    expect(before.now.earthVisible).toBe(false);
    expect(Math.abs(before.nextEarthrise! - ms(earth.start))).toBeLessThanOrEqual(TOL_MS);
    const during = countdown(eph, site, profile, ms("2027-01-15T00:00Z"));
    expect(Math.abs(during.nextEarthset! - ms(earth.end))).toBeLessThanOrEqual(TOL_MS);
  });

  it("works across the new year", () => {
    const { c, site, profile } = refCase("im-1", "2027-12-20");
    const firstOff = c.windows.lit.find((w) => !w.endClipped)!;
    const cd = countdown(eph, site, profile, ms(c.start));
    expect(Math.abs(cd.nextSunset! - ms(firstOff.end))).toBeLessThanOrEqual(TOL_MS);
  });
});

describe("countdown edge cases", () => {
  it("far side: Earth never rises", () => {
    const cd = countdown(eph, { lat: -20, lon: 179.9 }, loadProfile("custom-180"), ms("2027-03-01T00:00Z"));
    expect(cd.now.earthVisible).toBe(false);
    expect(cd.nextEarthrise).toBeNull();
    expect(cd.nextEarthset).toBeNull();
  });

  it("returns null instead of failing near the end of the loaded data", () => {
    const cd = countdown(eph, { lat: 0.67416, lon: 23.47314 }, loadProfile("apollo-11"), ms("2028-12-31T12:00Z"));
    expect(cd.searchedUntil).toBeLessThanOrEqual(ms("2029-01-01T00:00Z"));
    for (const v of [cd.nextSunrise, cd.nextSunset]) {
      if (v !== null) expect(v).toBeLessThan(ms("2029-01-01T00:00Z"));
    }
  });

  it("never searches further than the requested horizon", () => {
    const t = ms("2027-02-01T00:00Z");
    const cd = countdown(eph, { lat: 0.67416, lon: 23.47314 }, loadProfile("apollo-11"), t, 3 * DAY);
    expect(cd.searchedUntil).toBe(t + 3 * DAY);
    for (const v of [cd.nextSunrise, cd.nextSunset, cd.nextEarthrise, cd.nextEarthset]) {
      if (v !== null) expect(v).toBeLessThanOrEqual(t + 3 * DAY);
    }
  });

  it("all events are in the future", () => {
    const t = ms("2027-06-10T05:00Z");
    const cd = countdown(eph, { lat: -84.78, lon: 29.13 }, loadProfile("im-2"), t);
    for (const v of [cd.nextSunrise, cd.nextSunset, cd.nextEarthrise, cd.nextEarthset]) {
      if (v !== null) expect(v).toBeGreaterThan(t);
    }
  });
});
