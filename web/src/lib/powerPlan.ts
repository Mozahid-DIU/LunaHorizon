/**
 * The Power page: the visitor's example lander, turned into the engine's units, and the words
 * for the result. The battery run itself is simulatePower's, unchanged.
 */
import type { Site } from "./geometry";
import { simulatePower, type BatteryConfig, type PanelConfig, type PowerRun } from "./power";
import { formatDuration } from "./siteSummary";
import type { Ephemeris } from "./windows";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const VERTICAL_TILT_DEG = 90;
/** Sums of 10-minute steps carry binary rounding; this removes it before a figure is rounded down. */
const ROUNDING = 1e-9;
const SMALL_SCALE_W = 10;

export const MISSION_LENGTHS: readonly number[] = [14, 30];

/** What the form holds, in the units people type. */
export interface PowerSetup {
  areaM2: number;
  efficiencyPct: number;
  mount: "tracking" | "vertical";
  /** Direction a vertical panel faces, degrees from north through east. */
  facingDeg: number;
  capacityWh: number;
  loadW: number;
  startPct: number;
  days: number;
}

/** An example small lander, not any real mission. */
export const DEFAULT_SETUP: PowerSetup = {
  areaM2: 2,
  efficiencyPct: 30,
  mount: "tracking",
  facingDeg: 0,
  capacityWh: 2000,
  loadW: 100,
  startPct: 100,
  days: 14,
};

export type NumberField = "areaM2" | "efficiencyPct" | "facingDeg" | "capacityWh" | "loadW" | "startPct";

export interface Limit {
  key: NumberField;
  /** The field's name on the form, used in its error too. */
  label: string;
  unit: string;
  min: number;
  max: number;
  /** True when the upper end itself is not allowed. */
  isMaxOpen?: boolean;
}

/** Ranges a person can reasonably mean; the best space solar cells are about 33% efficient. */
export const LIMITS: readonly Limit[] = [
  { key: "areaM2", label: "Panel area", unit: "m²", min: 0.1, max: 20 },
  { key: "efficiencyPct", label: "Panel efficiency", unit: "%", min: 1, max: 40 },
  { key: "facingDeg", label: "Facing", unit: "°", min: 0, max: 360, isMaxOpen: true },
  { key: "capacityWh", label: "Battery capacity", unit: "Wh", min: 10, max: 100_000 },
  { key: "startPct", label: "Charge at landing", unit: "%", min: 0, max: 100 },
  { key: "loadW", label: "Load", unit: "W", min: 0, max: 5_000 },
];

export interface SetupProblem {
  key: keyof PowerSetup;
  message: string;
}

const withUnit = (value: number | string, unit: string) => (unit === "%" || unit === "°" ? `${value}${unit}` : `${value} ${unit}`);

/** A message for every field outside its range; empty when the setup can be run. A hidden field is not checked. */
export function setupProblems(setup: PowerSetup): SetupProblem[] {
  const problems: SetupProblem[] = LIMITS.filter(({ key }) => key !== "facingDeg" || setup.mount === "vertical").flatMap(
    ({ key, label, unit, min, max, isMaxOpen }) => {
      const value = setup[key];
      const isInRange = Number.isFinite(value) && value >= min && (isMaxOpen ? value < max : value <= max);
      return isInRange ? [] : [{ key, message: `${label} must be from ${min} to ${isMaxOpen ? "under " : ""}${withUnit(max, unit)}.` }];
    },
  );
  if (!MISSION_LENGTHS.includes(setup.days)) problems.push({ key: "days", message: `Mission length must be ${MISSION_LENGTHS.join(" or ")} days.` });
  return problems;
}

export function toConfig(setup: PowerSetup): { panel: PanelConfig; battery: BatteryConfig; missionMs: number } {
  return {
    panel: {
      areaM2: setup.areaM2,
      efficiency: setup.efficiencyPct / 100,
      mount: setup.mount === "tracking" ? { kind: "tracking" } : { kind: "fixed", tiltDeg: VERTICAL_TILT_DEG, azimuthDeg: setup.facingDeg },
    },
    battery: { capacityWh: setup.capacityWh, initialSoc: setup.startPct / 100, loadW: setup.loadW },
    missionMs: setup.days * DAY_MS,
  };
}

export type PowerResult = { status: "ready"; run: PowerRun } | { status: "past-data" };

export function runPower(eph: Ephemeris, site: Site, profile: readonly number[], landingMs: number, setup: PowerSetup): PowerResult {
  const { panel, battery, missionMs } = toConfig(setup);
  if (landingMs + missionMs > eph.dataEnd()) return { status: "past-data" };
  return { status: "ready", run: simulatePower(eph, site, profile, landingMs, missionMs, panel, battery) };
}

/** A span of hours in words, rounded down: minutes under an hour, hours under a day, then days and hours. */
export function formatSpan(hours: number): string {
  const ms = Math.round(hours * HOUR_MS / SECOND_MS) * SECOND_MS;
  if (ms <= 0) return "None";
  if (ms < HOUR_MS) return ms < MINUTE_MS ? "under 1 min" : `${Math.floor(ms / MINUTE_MS)} min`;
  if (ms < DAY_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  return formatDuration(ms);
}

export interface PowerHeadline {
  lead: string;
  emphasis: string;
  survives: boolean;
}

export function powerHeadline({ emptyAtMs }: Pick<PowerRun, "emptyAtMs">, landingMs: number, days: number): PowerHeadline {
  if (emptyAtMs === null) return { lead: "Survives ", emphasis: `all ${days} days.`, survives: true };
  if (emptyAtMs <= landingMs) return { lead: "Runs out of power ", emphasis: "at landing.", survives: false };
  return { lead: "Runs out of power after ", emphasis: `${formatSpan((emptyAtMs - landingMs) / HOUR_MS)}.`, survives: false };
}

/** The lowest charge in whole percent, rounded down, without losing a percent to the battery sum's rounding. */
export function lowestChargePct(minSocWh: number, capacityWh: number): number {
  return Math.floor((minSocWh / capacityWh) * 100 + ROUNDING);
}

export function formatEnergy(wh: number): string {
  const whole = Math.round(wh);
  return whole < 1000 ? `${whole} Wh` : `${(wh / 1000).toFixed(1)} kWh`;
}

/** A gridline's label; a small scale keeps one decimal so neighbouring lines do not read the same. */
export function wattLabel(watts: number, maxW: number): string {
  if (watts === 0) return "0 W";
  return maxW < SMALL_SCALE_W ? `${watts.toFixed(1)} W` : `${Math.round(watts)} W`;
}
