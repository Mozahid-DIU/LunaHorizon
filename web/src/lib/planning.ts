/**
 * Mission planning: how many lit, comms and Golden hours a landing gets, the best landing
 * dates in a range, and what changes when the launch slips or the site moves.
 */
import type { Site } from "./geometry";
import { type Ephemeris, type Window, type WindowKind, findWindows } from "./windows";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface MissionScore {
  goldenHours: number;
  litHours: number;
  commsHours: number;
}

export interface SiteInput {
  site: Site;
  profile: readonly number[];
}

function totalHours(windows: Window[]): number {
  return windows.reduce((sum, w) => sum + (w.end - w.start), 0) / HOUR_MS;
}

/** Lit, comms and Golden hours in [landingMs, landingMs + missionMs). */
export function missionScore(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  landingMs: number,
  missionMs: number,
): MissionScore {
  const hoursOf = (kind: WindowKind) => totalHours(findWindows(eph, site, profile, landingMs, landingMs + missionMs, kind));
  return { goldenHours: hoursOf("golden"), litHours: hoursOf("lit"), commsHours: hoursOf("comms") };
}

/** Hours of each 1-hour bin [from + i h, from + (i+1) h) covered by the windows. */
function hourlyCoverage(windows: Window[], fromMs: number, nHours: number): Float64Array {
  const cover = new Float64Array(nHours);
  for (const w of windows) {
    for (let i = Math.max(0, Math.floor((w.start - fromMs) / HOUR_MS)); i < nHours; i++) {
      const binStart = fromMs + i * HOUR_MS;
      if (binStart >= w.end) break;
      cover[i] += (Math.min(w.end, binStart + HOUR_MS) - Math.max(w.start, binStart)) / HOUR_MS;
    }
  }
  return cover;
}

export interface BestDate {
  landingMs: number;
  score: MissionScore;
}

/**
 * The `count` landing times (on the hour grid from `fromMs`) within [fromMs, fromMs + searchMs]
 * with the most Golden hours over the mission, at least `minSeparationMs` apart.
 * Ties are broken by lit hours. Candidates whose mission would run past the data are skipped.
 */
export function bestDates(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  fromMs: number,
  searchMs: number,
  missionMs: number,
  count = 5,
  minSeparationMs = DAY_MS,
): BestDate[] {
  const missionHours = Math.round(missionMs / HOUR_MS);
  const lastLanding = Math.min(fromMs + searchMs, eph.dataEnd() - missionHours * HOUR_MS);
  if (lastLanding < fromMs) return [];
  const nCandidates = Math.floor((lastLanding - fromMs) / HOUR_MS) + 1;
  const nHours = nCandidates - 1 + missionHours;
  const spanEnd = fromMs + nHours * HOUR_MS;

  const sums = (kind: WindowKind) => {
    const cover = hourlyCoverage(findWindows(eph, site, profile, fromMs, spanEnd, kind), fromMs, nHours);
    const prefix = new Float64Array(nHours + 1);
    for (let i = 0; i < nHours; i++) prefix[i + 1] = prefix[i] + cover[i];
    return Array.from({ length: nCandidates }, (_, i) => prefix[i + missionHours] - prefix[i]);
  };
  const golden = sums("golden");
  const lit = sums("lit");

  const order = golden.map((_, i) => i).sort((a, b) => golden[b] - golden[a] || lit[b] - lit[a] || a - b);
  const picked: number[] = [];
  for (const i of order) {
    const t = fromMs + i * HOUR_MS;
    if (picked.every((p) => Math.abs(p - t) >= minSeparationMs)) picked.push(t);
    if (picked.length === count) break;
  }
  // report exact scores from a direct calculation for each chosen landing time
  return picked.map((landingMs) => ({ landingMs, score: missionScore(eph, site, profile, landingMs, missionMs) }));
}

export interface SlipRow {
  kind: "slip" | "site";
  days?: number;
  siteId?: string;
  landingMs: number;
  /** null when the mission would run past the loaded data */
  score: MissionScore | null;
  deltaGoldenHours: number | null;
  deltaPercent: number | null;
}

export interface SlipPlan {
  baseline: MissionScore;
  rows: SlipRow[];
}

/** Baseline mission vs the same mission slipped by `slipDays`, and vs alternative sites. */
export function slipPlanner(
  eph: Ephemeris,
  base: SiteInput,
  landingMs: number,
  missionMs: number,
  slipDays: readonly number[] = [1, 7, 30],
  alternatives: readonly (SiteInput & { id: string })[] = [],
): SlipPlan {
  const baseline = missionScore(eph, base.site, base.profile, landingMs, missionMs);
  const row = (input: SiteInput, t: number, extra: Pick<SlipRow, "kind" | "days" | "siteId">): SlipRow => {
    if (t + missionMs > eph.dataEnd()) {
      return { ...extra, landingMs: t, score: null, deltaGoldenHours: null, deltaPercent: null };
    }
    const score = missionScore(eph, input.site, input.profile, t, missionMs);
    const delta = score.goldenHours - baseline.goldenHours;
    return {
      ...extra,
      landingMs: t,
      score,
      deltaGoldenHours: delta,
      deltaPercent: baseline.goldenHours > 0 ? (100 * delta) / baseline.goldenHours : null,
    };
  };
  return {
    baseline,
    rows: [
      ...slipDays.map((days) => row(base, landingMs + days * DAY_MS, { kind: "slip", days })),
      ...alternatives.map((alt) => row(alt, landingMs, { kind: "site", siteId: alt.id })),
    ],
  };
}
