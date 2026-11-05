import { expect, test } from "vitest";
import shares from "@/data/site-shares.json";
import { SHARE_HOURS, yearShares } from "./siteShares";
import { SITES } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { stateAt } from "./windows";

const HOUR_MS = 3_600_000;
const eph = loadEphemeris([2026, 2027, 2028, 2029, 2030]);
const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2031, 0, 1);

test("the shares cover every hour of 2026 to 2030", () => {
  expect(SHARE_HOURS).toBe((END - START) / HOUR_MS);
});

test.each(SITES.map((site) => site.id))("%s share on the map equals the browser engine hour by hour", (id) => {
  const site = SITES.find((s) => s.id === id)!;
  const profile = loadProfile(id);
  let lit = 0;
  let earth = 0;
  let golden = 0;
  for (let t = START; t < END; t += HOUR_MS) {
    const state = stateAt(eph, site, profile, t);
    lit += Number(state.lit);
    earth += Number(state.earthVisible);
    golden += Number(state.golden);
  }
  const direct = {
    lit: Math.round((lit / SHARE_HOURS) * 1000),
    earth: Math.round((earth / SHARE_HOURS) * 1000),
    golden: Math.round((golden / SHARE_HOURS) * 1000),
  };
  expect(shares[id as keyof typeof shares]).toEqual(direct);
  expect(yearShares(eph, site, profile)).toEqual(direct);
}, 60_000);
