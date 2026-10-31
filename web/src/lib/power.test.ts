import { describe, expect, it } from "vitest";

import { type BatteryConfig, type PanelConfig, integrateBattery, panelPowerW, simulatePower } from "./power";
import { loadEphemeris, loadProfile } from "./testData";
import { findWindows, stateAt } from "./windows";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const AU_KM = 149_597_870.7;
const SOLAR_CONSTANT = 1361;

const eph = loadEphemeris([2027, 2028]);
const rim = { lat: -89.7804, lon: -156.18 };
const rimProfile = loadProfile("shackleton-rim");
const im2 = { lat: -84.78, lon: 29.13 };
const im2Profile = loadProfile("im-2");

const tracking: PanelConfig = { areaM2: 2, efficiency: 0.3, mount: { kind: "tracking" } };
const battery: BatteryConfig = { capacityWh: 2000, initialSoc: 1, loadW: 50 };

/** Hourly times from t = 0, with the same solar power at every step. */
function flat(hours: number, solarW: number) {
  return {
    times: Array.from({ length: hours + 1 }, (_, i) => i * HOUR),
    solar: Array.from({ length: hours + 1 }, () => solarW),
  };
}

describe("integrateBattery: the 62 h night, worked by hand", () => {
  const { times, solar } = flat(62, 0);

  it("620 Wh at 10 W lasts exactly 62 h", () => {
    const r = integrateBattery(times, solar, { capacityWh: 620, initialSoc: 1, loadW: 10 });
    expect(r.socWh.at(-1)).toBeCloseTo(0, 9);
    expect(r.minSocWh).toBeCloseTo(0, 9);
    expect(r.emptyAtMs).toBeNull();
    expect(r.unmetWh).toBeCloseTo(0, 9);
  });

  it("the same battery at 12.4 W runs out at exactly 50 h", () => {
    const r = integrateBattery(times, solar, { capacityWh: 620, initialSoc: 1, loadW: 12.4 });
    expect(r.emptyAtMs).toBeCloseTo(50 * HOUR, 0);
    expect(r.socWh.at(-1)).toBe(0);
    expect(r.unmetWh).toBeCloseTo(12 * 12.4, 9);
  });

  it("half charge lasts half as long", () => {
    const r = integrateBattery(times, solar, { capacityWh: 620, initialSoc: 0.5, loadW: 10 });
    expect(r.emptyAtMs).toBeCloseTo(31 * HOUR, 0);
  });

  it("counts the whole night as the longest deficit", () => {
    const r = integrateBattery(times, solar, { capacityWh: 620, initialSoc: 1, loadW: 10 });
    expect(r.longestDeficitHours).toBeCloseTo(62, 9);
  });
});

describe("integrateBattery: limits and energy accounting", () => {
  it("does not charge above capacity and counts the surplus as wasted", () => {
    const { times, solar } = flat(10, 30);
    const r = integrateBattery(times, solar, { capacityWh: 100, initialSoc: 0.5, loadW: 10 });
    expect(r.socWh.at(-1)).toBe(100);
    expect(r.wastedWh).toBeCloseTo(200 - 50, 9);
  });

  it("charges through the day after running out, without clearing the failure time", () => {
    const times = [0, 1, 2, 3, 4].map((h) => h * HOUR);
    const r = integrateBattery(times, [0, 0, 0, 40, 40], { capacityWh: 10, initialSoc: 1, loadW: 20 });
    expect(r.emptyAtMs).toBeCloseTo(0.5 * HOUR, 0);
    expect(r.socWh[2]).toBe(0);
    expect(r.socWh[4]).toBeGreaterThan(0);
  });

  it("a load the panels always cover needs no battery", () => {
    const { times, solar } = flat(5, 20);
    const r = integrateBattery(times, solar, { capacityWh: 1, initialSoc: 0, loadW: 10 });
    expect(r.emptyAtMs).toBeNull();
    expect(r.longestDeficitHours).toBe(0);
  });

  it("an empty battery with no sun fails at the first instant", () => {
    const { times, solar } = flat(5, 0);
    const r = integrateBattery(times, solar, { capacityWh: 100, initialSoc: 0, loadW: 10 });
    expect(r.emptyAtMs).toBe(0);
  });

  it("averages solar power across a step (trapezoid)", () => {
    const r = integrateBattery([0, HOUR], [0, 100], { capacityWh: 1000, initialSoc: 0, loadW: 0 });
    expect(r.generatedWh).toBeCloseTo(50, 9);
  });

  it("stops the longest deficit when the panels catch up", () => {
    const times = [0, 1, 2, 3, 4, 5, 6].map((h) => h * HOUR);
    const r = integrateBattery(times, [0, 0, 100, 100, 0, 0, 0], { capacityWh: 1e4, initialSoc: 1, loadW: 10 });
    expect(r.longestDeficitHours).toBeCloseTo(2, 9);
  });

  it.each([
    ["capacity", { capacityWh: 0, initialSoc: 1, loadW: 1 }],
    ["charge above 1", { capacityWh: 10, initialSoc: 1.1, loadW: 1 }],
    ["negative charge", { capacityWh: 10, initialSoc: -0.1, loadW: 1 }],
    ["negative load", { capacityWh: 10, initialSoc: 1, loadW: -1 }],
    ["NaN load", { capacityWh: 10, initialSoc: 1, loadW: Number.NaN }],
    ["infinite load", { capacityWh: 10, initialSoc: 1, loadW: Infinity }],
    ["infinite capacity", { capacityWh: Infinity, initialSoc: 0, loadW: 1 }],
  ])("rejects a bad %s", (_, config) => {
    expect(() => integrateBattery([0, HOUR], [0, 0], config)).toThrow(RangeError);
  });

  it("rejects times and solar power of different lengths", () => {
    expect(() => integrateBattery([0, HOUR, 2 * HOUR], [0, 0], battery)).toThrow(RangeError);
    expect(() => integrateBattery([0, HOUR], [0, 0, 0], battery)).toThrow(RangeError);
    expect(() => integrateBattery([], [], battery)).toThrow(RangeError);
  });

  it("rejects times that do not increase", () => {
    expect(() => integrateBattery([HOUR, 0], [0, 0], battery)).toThrow(RangeError);
    expect(() => integrateBattery([0, 0], [0, 0], battery)).toThrow(RangeError);
  });

  it("a huge battery that exactly covers the load still survives, over thousands of steps", () => {
    const steps = 8000;
    const times = Array.from({ length: steps + 1 }, (_, i) => (i * HOUR) / 6);
    const solar = times.map(() => 0);
    const loadW = 1234.567;
    const r = integrateBattery(times, solar, { capacityWh: (loadW * steps) / 6, initialSoc: 1, loadW });
    expect(r.emptyAtMs).toBeNull();
    expect(r.unmetWh).toBe(0);
  });

  it("reports unmet energy and a failure time together, never one without the other", () => {
    const r = integrateBattery([0, HOUR], [0, 0], { capacityWh: 10, initialSoc: 1, loadW: 10.0000001 });
    expect(r.emptyAtMs).not.toBeNull();
    expect(r.unmetWh).toBeGreaterThan(0);
  });
});

describe("panelPowerW", () => {
  const panel = (mount: PanelConfig["mount"]): PanelConfig => ({ areaM2: 2, efficiency: 0.25, mount });
  const sun = (over: Partial<{ az: number; el: number; distKm: number; discFraction: number }>) => ({
    az: 90,
    el: 0,
    distKm: AU_KM,
    discFraction: 1,
    ...over,
  });

  it("gives S·A·η for a tracking panel at 1 AU", () => {
    expect(panelPowerW(panel({ kind: "tracking" }), sun({}))).toBeCloseTo(1361 * 2 * 0.25, 9);
  });

  it("follows the inverse square of the distance", () => {
    expect(panelPowerW(panel({ kind: "tracking" }), sun({ distKm: 2 * AU_KM }))).toBeCloseTo((1361 * 2 * 0.25) / 4, 9);
  });

  it("scales with the visible part of the Sun", () => {
    expect(panelPowerW(panel({ kind: "tracking" }), sun({ discFraction: 0.25 }))).toBeCloseTo((1361 * 2 * 0.25) / 4, 9);
    expect(panelPowerW(panel({ kind: "tracking" }), sun({ discFraction: 0 }))).toBe(0);
  });

  it("gives full power to a vertical panel facing a horizon Sun", () => {
    const vertical = panel({ kind: "fixed", tiltDeg: 90, azimuthDeg: 90 });
    expect(panelPowerW(vertical, sun({}))).toBeCloseTo(1361 * 2 * 0.25, 9);
  });

  it("uses the cosine of the angle off the panel normal", () => {
    const vertical = panel({ kind: "fixed", tiltDeg: 90, azimuthDeg: 30 });
    expect(panelPowerW(vertical, sun({ az: 90 }))).toBeCloseTo(1361 * 2 * 0.25 * Math.cos(Math.PI / 3), 9);
  });

  it("gives sin(elevation) to a flat panel, whatever its azimuth", () => {
    const flatPanel = panel({ kind: "fixed", tiltDeg: 0, azimuthDeg: 200 });
    expect(panelPowerW(flatPanel, sun({ el: 30 }))).toBeCloseTo(1361 * 2 * 0.25 * 0.5, 9);
  });

  it("gives nothing when the Sun is behind the panel", () => {
    const vertical = panel({ kind: "fixed", tiltDeg: 90, azimuthDeg: 270 });
    expect(panelPowerW(vertical, sun({ az: 90 }))).toBe(0);
  });
});

describe("simulatePower on real sites", () => {
  const landing = Date.parse("2027-05-10T12:00Z");
  const mission = 14 * DAY;
  const run = simulatePower(eph, rim, rimProfile, landing, mission, tracking, battery);

  it("covers the whole mission at the same times as the state of the site", () => {
    expect(run.samples[0].utcMs).toBe(landing);
    expect(run.samples.at(-1)!.utcMs).toBe(landing + mission);
  });

  it("keeps the battery within 0..capacity at every sample", () => {
    for (const s of run.samples) {
      expect(s.socWh).toBeGreaterThanOrEqual(0);
      expect(s.socWh).toBeLessThanOrEqual(battery.capacityWh);
    }
  });

  it("every solar sample equals the formula worked from the site state", () => {
    for (const s of run.samples.filter((_, i) => i % 97 === 0)) {
      const st = stateAt(eph, rim, rimProfile, s.utcMs);
      const expected = (SOLAR_CONSTANT * (AU_KM / st.sun.distKm) ** 2 * 2 * 0.3) * st.sun.discFraction;
      expect(s.solarW).toBeCloseTo(expected, 9);
    }
  });

  it("a vertical panel aimed at the real Sun azimuth gets cos(elevation), and nothing when aimed away", () => {
    const st = stateAt(eph, rim, rimProfile, run.samples.find((s) => s.solarW > 0)!.utcMs);
    const full = SOLAR_CONSTANT * (AU_KM / st.sun.distKm) ** 2 * 2 * 0.3 * st.sun.discFraction;
    const aimed = (azimuthDeg: number): PanelConfig => ({ ...tracking, mount: { kind: "fixed", tiltDeg: 90, azimuthDeg } });
    expect(panelPowerW(aimed(st.sun.az), st.sun)).toBeCloseTo(full * Math.cos((st.sun.el * Math.PI) / 180), 9);
    expect(panelPowerW(aimed(st.sun.az + 180), st.sun)).toBe(0);
  });

  it("every solar sample of a fixed panel equals the formula worked from the site state", () => {
    const tilt = 60;
    const azimuthDeg = 135;
    const fixed: PanelConfig = { ...tracking, mount: { kind: "fixed", tiltDeg: tilt, azimuthDeg } };
    const r = simulatePower(eph, rim, rimProfile, landing, mission, fixed, battery);
    const rad = Math.PI / 180;
    for (const s of r.samples.filter((_, i) => i % 97 === 0)) {
      const { az, el, distKm, discFraction } = stateAt(eph, rim, rimProfile, s.utcMs).sun;
      const cos = Math.sin(el * rad) * Math.cos(tilt * rad) + Math.cos(el * rad) * Math.sin(tilt * rad) * Math.cos((az - azimuthDeg) * rad);
      const expected = SOLAR_CONSTANT * (AU_KM / distKm) ** 2 * 2 * 0.3 * Math.max(0, cos) * discFraction;
      expect(s.solarW).toBeCloseTo(expected, 9);
    }
  });

  it("total generated energy equals a separate trapezoid sum of the samples", () => {
    const sum = run.samples.slice(1).reduce((total, s, i) => {
      const prev = run.samples[i];
      return total + (((prev.solarW + s.solarW) / 2) * (s.utcMs - prev.utcMs)) / HOUR;
    }, 0);
    expect(run.generatedWh).toBeCloseTo(sum, 6);
    expect(run.generatedWh).toBeGreaterThan(0);
  });

  it("balances energy: start + generated + unmet = end + used + wasted", () => {
    const small = simulatePower(eph, rim, rimProfile, landing, mission, tracking, { capacityWh: 100, initialSoc: 0.5, loadW: 300 });
    const usedWh = 300 * (mission / HOUR);
    const balance = 50 + small.generatedWh + small.unmetWh - small.samples.at(-1)!.socWh - usedWh - small.wastedWh;
    expect(Math.abs(balance)).toBeLessThan(1e-6);
  });

  it("generates nothing during a long dark spell and drains at the load rate", () => {
    const lit = findWindows(eph, im2, im2Profile, landing, landing + 60 * DAY, "lit");
    const gaps = lit.slice(1).map((w, i) => ({ start: lit[i].end, end: w.start }));
    const night = gaps.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    expect(night.end - night.start).toBeGreaterThan(24 * HOUR);

    // near the pole the Sun sets slowly and part of the disc stays visible for about 3 hours
    // after its centre sets, so skip 6 hours at each end to keep the whole disc hidden
    const start = night.start + 6 * HOUR;
    const length = night.end - night.start - 12 * HOUR;
    const dark = simulatePower(eph, im2, im2Profile, start, length, tracking, { capacityWh: 1e6, initialSoc: 1, loadW: 10 });
    expect(dark.generatedWh).toBe(0);
    expect(dark.samples.at(-1)!.socWh).toBeCloseTo(1e6 - 10 * (length / HOUR), 6);
  });

  it("a bigger battery never fails sooner", () => {
    const failAt = (capacityWh: number) =>
      simulatePower(eph, im2, im2Profile, landing, 30 * DAY, tracking, { capacityWh, initialSoc: 1, loadW: 50 }).emptyAtMs ?? Infinity;
    expect(failAt(5000)).toBeGreaterThanOrEqual(failAt(1000));
    expect(failAt(1000)).toBeGreaterThan(failAt(200));
    expect(failAt(200)).toBeLessThan(Infinity);
  });

  it("a fixed panel never beats a tracking panel of the same size", () => {
    const fixed: PanelConfig = { ...tracking, mount: { kind: "fixed", tiltDeg: 90, azimuthDeg: 0 } };
    const f = simulatePower(eph, rim, rimProfile, landing, mission, fixed, battery);
    expect(f.generatedWh).toBeLessThan(run.generatedWh);
    expect(f.generatedWh).toBeGreaterThan(0);
  });

  it("refuses a mission that runs past the loaded data", () => {
    const late = Date.parse("2028-12-25T00:00Z");
    expect(() => simulatePower(eph, rim, rimProfile, late, mission, tracking, battery)).toThrow(RangeError);
  });

  it("can end exactly where the data ends", () => {
    const end = eph.dataEnd();
    expect(simulatePower(eph, rim, rimProfile, end - DAY, DAY, tracking, battery).samples.at(-1)!.utcMs).toBe(end);
  });

  it("refuses a landing time that is not a real time or is before the loaded data", () => {
    expect(() => simulatePower(eph, rim, rimProfile, Number.NaN, mission, tracking, battery)).toThrow(RangeError);
    const early = Date.parse("2026-06-01T00:00Z");
    expect(() => simulatePower(eph, rim, rimProfile, early, mission, tracking, battery)).toThrow(RangeError);
  });

  it("rejects bad panel values", () => {
    const bad: PanelConfig = { ...tracking, efficiency: 1.5 };
    expect(() => simulatePower(eph, rim, rimProfile, landing, DAY, bad, battery)).toThrow(RangeError);
    expect(() => simulatePower(eph, rim, rimProfile, landing, 0, tracking, battery)).toThrow(RangeError);
  });
});
