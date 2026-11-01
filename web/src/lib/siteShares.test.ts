import { expect, test } from "vitest";
import shares from "@/data/site-shares.json";
import { SITES } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { stateAt } from "./windows";

const HOUR_MS = 3_600_000;
const eph = loadEphemeris([2026, 2027, 2028, 2029, 2030]);
const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2031, 0, 1);

test.each(SITES.map((site) => site.id))("%s share on the map equals the browser engine hour by hour", (id) => {
  const site = SITES.find((s) => s.id === id)!;
  const profile = loadProfile(id);
  let lit = 0;
  let earth = 0;
  let golden = 0;
  let hours = 0;
  for (let t = START; t < END; t += HOUR_MS) {
    const state = stateAt(eph, site, profile, t);
    lit += Number(state.lit);
    earth += Number(state.earthVisible);
    golden += Number(state.golden);
    hours += 1;
  }
  expect(shares[id as keyof typeof shares]).toEqual({
    lit: Math.round((lit / hours) * 1000),
    earth: Math.round((earth / hours) * 1000),
    golden: Math.round((golden / hours) * 1000),
  });
}, 30_000);
