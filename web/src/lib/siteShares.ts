/**
 * A place's share of the hours 2026-2030 with Sun, Earth and both, from its own horizon: the
 * same hourly rules as pipeline/site_shares.py, which fills the map pins. Values are per mille.
 */
import { DATA_START_MS } from "./dataRange";
import type { Site } from "./geometry";
import { stateAt, type Ephemeris } from "./windows";

const HOUR_MS = 3_600_000;
const SHARE_END_MS = Date.UTC(2031, 0, 1);
export const SHARE_HOURS = (SHARE_END_MS - DATA_START_MS) / HOUR_MS;

export interface YearShares {
  lit: number;
  earth: number;
  golden: number;
}

export function yearShares(eph: Ephemeris, site: Site, profile: readonly number[]): YearShares {
  let lit = 0;
  let earth = 0;
  let golden = 0;
  for (let t = DATA_START_MS; t < SHARE_END_MS; t += HOUR_MS) {
    const state = stateAt(eph, site, profile, t);
    if (state.lit) lit += 1;
    if (state.earthVisible) earth += 1;
    if (state.golden) golden += 1;
  }
  const perMille = (hours: number) => Math.round((hours / SHARE_HOURS) * 1000);
  return { lit: perMille(lit), earth: perMille(earth), golden: perMille(golden) };
}
