/**
 * Power & Battery Simulator: solar panel output and battery charge across a mission.
 *
 *   P = S · (1 AU / r)² · A · η · max(0, cos θ) · f
 *
 * S solar constant, r Sun distance, A panel area, η efficiency, θ angle between the panel
 * normal and the Sun, f visible share of the solar disc. The Moon has no air, so nothing
 * else dims the Sun. Battery charge is kept within 0..capacity; charging losses, heating
 * and panel dust are not modelled.
 */
import type { Site } from "./geometry";
import { type Ephemeris, type SiteState, stateAt } from "./windows";

const HOUR_MS = 3_600_000;
const STEP_MS = 10 * 60_000;
const DEG = Math.PI / 180;
const AU_KM = 149_597_870.7;
const SOLAR_CONSTANT_W_M2 = 1361;
/** Rounding allowance as a share of capacity, so a battery that exactly covers the load is not empty. */
const ROUNDING_SHARE = 1e-9;

/** Tracking panels always face the Sun; fixed panels have a tilt from horizontal (90° = vertical). */
export type PanelMount = { kind: "tracking" } | { kind: "fixed"; tiltDeg: number; azimuthDeg: number };

export interface PanelConfig {
  areaM2: number;
  efficiency: number;
  mount: PanelMount;
}

export interface BatteryConfig {
  capacityWh: number;
  /** Charge at the start, 0..1 */
  initialSoc: number;
  loadW: number;
}

export interface BatteryRun {
  socWh: number[];
  minSocWh: number;
  /** First moment the battery could not cover the load, or null if it never happened. */
  emptyAtMs: number | null;
  generatedWh: number;
  /** Solar energy lost because the battery was already full. */
  wastedWh: number;
  /** Load energy that could not be supplied. */
  unmetWh: number;
  /** Longest unbroken stretch with the panels below the load. */
  longestDeficitHours: number;
}

/** Also rejects NaN and infinity. */
function requireRange(name: string, value: number, min: number, max = Number.MAX_VALUE): void {
  if (!(value >= min && value <= max)) throw new RangeError(`${name} is out of range: ${value}`);
}

function cosIncidence(mount: PanelMount, sun: Pick<SiteState["sun"], "az" | "el">): number {
  if (mount.kind === "tracking") return 1;
  const tilt = mount.tiltDeg * DEG;
  const el = sun.el * DEG;
  return Math.sin(el) * Math.cos(tilt) + Math.cos(el) * Math.sin(tilt) * Math.cos((sun.az - mount.azimuthDeg) * DEG);
}

export function panelPowerW(panel: PanelConfig, sun: Pick<SiteState["sun"], "az" | "el" | "distKm" | "discFraction">): number {
  const irradiance = SOLAR_CONSTANT_W_M2 * (AU_KM / sun.distKm) ** 2;
  return irradiance * panel.areaM2 * panel.efficiency * Math.max(0, cosIncidence(panel.mount, sun)) * sun.discFraction;
}

/**
 * Battery charge at each time, for solar power given at the same times.
 * Solar power is averaged across each step (trapezoid rule). After running out, the battery
 * can recharge, but emptyAtMs keeps the first failure.
 */
export function integrateBattery(timesMs: readonly number[], solarW: readonly number[], battery: BatteryConfig): BatteryRun {
  requireRange("battery capacity", battery.capacityWh, Number.MIN_VALUE);
  requireRange("starting charge", battery.initialSoc, 0, 1);
  requireRange("load", battery.loadW, 0);
  if (timesMs.length === 0 || timesMs.length !== solarW.length) {
    throw new RangeError("times and solar power must be the same non-zero length");
  }
  if (timesMs.some((t, i) => i > 0 && t <= timesMs[i - 1])) throw new RangeError("times must increase");

  const roundingWh = battery.capacityWh * ROUNDING_SHARE;
  let soc = battery.capacityWh * battery.initialSoc;
  const socWh = [soc];
  let minSocWh = soc;
  let emptyAtMs: number | null = null;
  let generatedWh = 0;
  let wastedWh = 0;
  let unmetWh = 0;
  let deficitHours = 0;
  let longestDeficitHours = 0;

  for (let i = 1; i < timesMs.length; i++) {
    const hours = (timesMs[i] - timesMs[i - 1]) / HOUR_MS;
    const meanSolarW = (solarW[i - 1] + solarW[i]) / 2;
    const netW = meanSolarW - battery.loadW;
    const next = soc + netW * hours;
    generatedWh += meanSolarW * hours;

    deficitHours = netW < 0 ? deficitHours + hours : 0;
    longestDeficitHours = Math.max(longestDeficitHours, deficitHours);

    if (next > battery.capacityWh) wastedWh += next - battery.capacityWh;
    if (next < -roundingWh) {
      unmetWh += -next;
      emptyAtMs ??= timesMs[i - 1] + (soc / -netW) * HOUR_MS;
    }

    soc = Math.min(battery.capacityWh, Math.max(0, next));
    socWh.push(soc);
    minSocWh = Math.min(minSocWh, soc);
  }
  return { socWh, minSocWh, emptyAtMs, generatedWh, wastedWh, unmetWh, longestDeficitHours };
}

export interface PowerSample {
  utcMs: number;
  solarW: number;
  socWh: number;
}

export interface PowerRun extends Omit<BatteryRun, "socWh"> {
  samples: PowerSample[];
  survives: boolean;
}

/** Simulates [landingMs, landingMs + missionMs] in 10-minute steps. */
export function simulatePower(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  landingMs: number,
  missionMs: number,
  panel: PanelConfig,
  battery: BatteryConfig,
): PowerRun {
  requireRange("panel area", panel.areaM2, 0);
  requireRange("panel efficiency", panel.efficiency, 0, 1);
  requireRange("mission length", missionMs, Number.MIN_VALUE);
  requireRange("landing time", landingMs, -Number.MAX_VALUE);
  const endMs = landingMs + missionMs;
  if (endMs > eph.dataEnd()) throw new RangeError("mission runs past the loaded data");

  const timesMs: number[] = [];
  for (let t = landingMs; t < endMs; t += STEP_MS) timesMs.push(t);
  timesMs.push(endMs);

  const solarW = timesMs.map((t) => panelPowerW(panel, stateAt(eph, site, profile, t).sun));
  const { socWh, ...totals } = integrateBattery(timesMs, solarW, battery);
  return {
    ...totals,
    samples: timesMs.map((utcMs, i) => ({ utcMs, solarW: solarW[i], socWh: socWh[i] })),
    survives: totals.emptyAtMs === null,
  };
}
