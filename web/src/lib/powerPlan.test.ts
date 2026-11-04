import { describe, expect, test } from "vitest";
import { simulatePower } from "./power";
import {
  DEFAULT_SETUP,
  formatEnergy,
  formatSpan,
  lowestChargePct,
  powerHeadline,
  runPower,
  setupProblems,
  toConfig,
  wattLabel,
  type PowerSetup,
} from "./powerPlan";
import { DEFAULT_TIME_MS } from "./selection";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";

const DAY_MS = 86_400_000;
const eph = loadEphemeris([2027, 2028]);
const rim = findSite("shackleton-rim")!;
const rimProfile = loadProfile("shackleton-rim");
const apollo = findSite("apollo-12")!;
const apolloProfile = loadProfile("apollo-12");
const setup = (change: Partial<PowerSetup>): PowerSetup => ({ ...DEFAULT_SETUP, ...change });

describe("toConfig", () => {
  test("turns the form into the engine's units", () => {
    expect(toConfig(setup({ areaM2: 2, efficiencyPct: 30, mount: "tracking", capacityWh: 2000, loadW: 100, startPct: 80, days: 14 }))).toEqual({
      panel: { areaM2: 2, efficiency: 0.3, mount: { kind: "tracking" } },
      battery: { capacityWh: 2000, initialSoc: 0.8, loadW: 100 },
      missionMs: 14 * DAY_MS,
    });
  });

  test("a fixed panel stands vertical, facing the chosen direction", () => {
    expect(toConfig(setup({ mount: "vertical", facingDeg: 90 })).panel.mount).toEqual({ kind: "fixed", tiltDeg: 90, azimuthDeg: 90 });
  });
});

describe("runPower", () => {
  test("is the engine's own run, nothing added", () => {
    const { panel, battery, missionMs } = toConfig(DEFAULT_SETUP);
    const run = runPower(eph, rim, rimProfile, DEFAULT_TIME_MS, DEFAULT_SETUP);
    expect(run).toEqual({ status: "ready", run: simulatePower(eph, rim, rimProfile, DEFAULT_TIME_MS, missionMs, panel, battery) });
  });

  test("a mission past the data says so instead of failing", () => {
    const late = loadEphemeris([2030]);
    expect(runPower(late, rim, rimProfile, Date.UTC(2030, 11, 25), DEFAULT_SETUP)).toEqual({ status: "past-data" });
  });

  test("an equatorial site cannot survive a lunar night on the default battery", () => {
    // landing just before an Apollo 12 sunset, so the 30 days include a full night
    const result = runPower(eph, apollo, apolloProfile, Date.UTC(2027, 11, 29, 21), setup({ days: 30 }));
    expect(result.status === "ready" && result.run.survives).toBe(false);
  });
});

describe("setupProblems", () => {
  test("the default is valid", () => {
    expect(setupProblems(DEFAULT_SETUP)).toEqual([]);
  });

  test("a hidden facing does not block a tracking panel", () => {
    expect(setupProblems(setup({ mount: "tracking", facingDeg: 999 }))).toEqual([]);
    expect(setupProblems(setup({ mount: "vertical", facingDeg: 999 }))).toHaveLength(1);
  });

  test("each problem names its field as the form shows it", () => {
    expect(setupProblems(setup({ capacityWh: 0 }))).toEqual([{ key: "capacityWh", message: "Battery capacity must be from 10 to 100000 Wh." }]);
  });

  test("a mission length the form does not offer is refused", () => {
    expect(setupProblems(setup({ days: 20 })).map(({ key }) => key)).toEqual(["days"]);
  });

  test.each<[Partial<PowerSetup>, string]>([
    [{ areaM2: 0 }, "Panel area"],
    [{ areaM2: 50 }, "Panel area"],
    [{ efficiencyPct: 0 }, "Panel efficiency"],
    [{ efficiencyPct: 60 }, "Panel efficiency"],
    [{ capacityWh: 0 }, "Battery capacity"],
    [{ loadW: -1 }, "Load"],
    [{ startPct: 101 }, "Charge at landing"],
    [{ facingDeg: 360 }, "Facing"],
    [{ areaM2: Number.NaN }, "Panel area"],
  ])("refuses %o", (change, field) => {
    expect(setupProblems(setup({ mount: "vertical", ...change })).map(({ message }) => message).join(" ")).toContain(field);
  });
});

describe("powerHeadline", () => {
  const landing = DEFAULT_TIME_MS;

  test("a battery that never runs out survives the mission", () => {
    expect(powerHeadline({ emptyAtMs: null }, landing, 14)).toEqual({ lead: "Survives ", emphasis: "all 14 days.", survives: true });
  });

  test("a battery empty from the start says so", () => {
    expect(powerHeadline({ emptyAtMs: landing }, landing, 14).emphasis).toBe("at landing.");
    expect(powerHeadline({ emptyAtMs: landing }, landing, 14).lead).toBe("Runs out of power ");
  });

  test("under a day reads in hours only", () => {
    expect(powerHeadline({ emptyAtMs: landing + 20.7 * 3_600_000 }, landing, 30).emphasis).toBe("20h.");
    expect(powerHeadline({ emptyAtMs: landing + 25 * 60_000 }, landing, 30).emphasis).toBe("25 min.");
  });

  test("a battery that runs out says when, rounded down", () => {
    const empty = landing + 3 * DAY_MS + 4.9 * 3_600_000;
    expect(powerHeadline({ emptyAtMs: empty }, landing, 14)).toEqual({ lead: "Runs out of power after ", emphasis: "3d 4h.", survives: false });
  });
});

describe("formatEnergy", () => {
  test("uses Wh below 1 kWh and kWh above, one decimal", () => {
    expect(formatEnergy(850.4)).toBe("850 Wh");
    expect(formatEnergy(1234)).toBe("1.2 kWh");
    expect(formatEnergy(0)).toBe("0 Wh");
  });

  test("never shows 1000 Wh", () => {
    expect(formatEnergy(999.5)).toBe("1.0 kWh");
    expect(formatEnergy(999.4)).toBe("999 Wh");
  });
});

describe("lowestChargePct", () => {
  test("is not lowered by rounding in the battery sum", () => {
    // 0.29 * 100 is 28.999999999999996 in binary floating point
    expect(lowestChargePct(0.29 * 100, 100)).toBe(29);
    expect(lowestChargePct(0.57 * 100, 100)).toBe(57);
  });

  test("still rounds a real fraction down", () => {
    expect(lowestChargePct(28.6, 100)).toBe(28);
  });
});

describe("formatSpan", () => {
  test("six 10-minute steps are one hour, not 59 minutes", () => {
    expect(formatSpan(Array.from({ length: 6 }, () => 1 / 6).reduce((a, b) => a + b, 0))).toBe("1h");
  });

  test("hours below a day, days and hours above", () => {
    expect(formatSpan(0)).toBe("None");
    expect(formatSpan(0.5)).toBe("30 min");
    expect(formatSpan(5.9)).toBe("5h");
    expect(formatSpan(182.5)).toBe("7d 14h");
  });
});

describe("wattLabel", () => {
  test("small scales keep a decimal so the gridlines are told apart", () => {
    expect([0, 0.55, 1.1].map((w) => wattLabel(w, 1.1))).toEqual(["0 W", "0.6 W", "1.1 W"]);
  });

  test("large scales are whole watts", () => {
    expect(wattLabel(465.3, 930.6)).toBe("465 W");
  });
});
