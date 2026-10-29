/**
 * Power, Earth-visibility, communication and Golden windows for a site.
 *
 * Rules (shared with pipeline/windows_fixture.py, which checks this file by brute force):
 *   lit     Sun centre above the terrain horizon
 *   earth   Earth centre above the terrain horizon
 *   comms   earth AND at least one DSN complex sees the Moon (hourly mask)
 *   golden  lit AND comms
 */
import {
  type AltAz,
  type Body,
  type Site,
  type Subpoint,
  type SubpointYear,
  blendSubpoints,
  sampleAt,
  topocentricAltAz,
} from "./geometry";

const HOUR_MS = 3_600_000;
const SCAN_STEP_MS = 10 * 60_000;
const REFINE_TO_MS = 30_000;
const SUN_RADIUS_KM = 695_700;

export type WindowKind = "lit" | "earth" | "comms" | "golden";

export interface DsnYear {
  start: string;
  step_hours: number;
  mask: number[];
}

export interface YearData {
  subpoints: SubpointYear;
  dsn: DsnYear;
}

/** Hourly sub-points and DSN masks for one or more consecutive years. */
export class Ephemeris {
  constructor(private readonly years: ReadonlyMap<number, YearData>) {
    for (const [year, d] of years) {
      const start = `${year}-01-01T00:00Z`;
      if (d.subpoints.start !== start || d.subpoints.step_hours !== 1 || d.dsn.step_hours !== 1) {
        throw new Error(`data for ${year} must start at ${start} with 1-hour steps`);
      }
      if (d.dsn.start !== start || d.subpoints.sun.lat.length !== d.dsn.mask.length) {
        throw new Error(`sub-point and DSN files for ${year} do not line up`);
      }
    }
  }

  private locate(utcMs: number): { data: YearData; index: number } {
    const year = new Date(utcMs).getUTCFullYear();
    const data = this.years.get(year);
    if (!data) throw new RangeError(`no ephemeris data loaded for ${year}`);
    return { data, index: (utcMs - Date.parse(data.subpoints.start)) / HOUR_MS };
  }

  subpoint(body: Body, utcMs: number): Subpoint {
    const { data, index } = this.locate(utcMs);
    const track = data.subpoints[body];
    const i0 = Math.floor(index);
    const f = index - i0;
    const a = sampleAt(track, i0);
    if (f === 0) return a;
    // the last hour of a year blends into the first sample of the next year
    const next = i0 + 1 < track.lat.length ? sampleAt(track, i0 + 1) : this.firstSampleOfNextYear(body, utcMs);
    return blendSubpoints(a, next, f);
  }

  private firstSampleOfNextYear(body: Body, utcMs: number): Subpoint {
    const next = this.years.get(new Date(utcMs).getUTCFullYear() + 1);
    if (!next) throw new RangeError(`no ephemeris data loaded after ${new Date(utcMs).toISOString()}`);
    return sampleAt(next.subpoints[body], 0);
  }

  dsnMask(utcMs: number): number {
    const { data, index } = this.locate(utcMs);
    return data.dsn.mask[Math.floor(index)];
  }
}

/** Terrain horizon elevation at any azimuth from a profile with equal steps over 360°. */
export function horizonAt(profile: readonly number[], azDeg: number): number {
  const n = profile.length;
  const x = ((((azDeg % 360) + 360) % 360) * n) / 360;
  const i0 = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return profile[i0] * (1 - f) + profile[(i0 + 1) % n] * f;
}

/** Visible share of the solar disc whose centre is marginDeg above a straight horizon. */
export function sunDiscFraction(marginDeg: number, radiusDeg: number): number {
  if (marginDeg >= radiusDeg) return 1;
  if (marginDeg <= -radiusDeg) return 0;
  const u = marginDeg / radiusDeg;
  return 1 - (Math.acos(u) - u * Math.sqrt(1 - u * u)) / Math.PI;
}

export interface BodyState extends AltAz {
  horizon: number;
}

export interface SiteState {
  utcMs: number;
  sun: BodyState & { radius: number; discFraction: number; distKm: number };
  earth: BodyState;
  lit: boolean;
  earthVisible: boolean;
  dsnMask: number;
  comms: boolean;
  golden: boolean;
}

export function stateAt(eph: Ephemeris, site: Site, profile: readonly number[], utcMs: number): SiteState {
  const sp = eph.subpoint("sun", utcMs);
  const ep = eph.subpoint("earth", utcMs);
  const sunPos = topocentricAltAz(sp.lat, sp.lon, sp.distKm, site);
  const earthPos = topocentricAltAz(ep.lat, ep.lon, ep.distKm, site);
  const sunHorizon = horizonAt(profile, sunPos.az);
  const earthHorizon = horizonAt(profile, earthPos.az);
  const radius = (Math.asin(SUN_RADIUS_KM / sp.distKm) * 180) / Math.PI;

  const lit = sunPos.el > sunHorizon;
  const earthVisible = earthPos.el > earthHorizon;
  const dsnMask = eph.dsnMask(utcMs);
  const comms = earthVisible && dsnMask > 0;
  return {
    utcMs,
    sun: {
      ...sunPos,
      horizon: sunHorizon,
      radius,
      discFraction: sunDiscFraction(sunPos.el - sunHorizon, radius),
      distKm: sp.distKm,
    },
    earth: { ...earthPos, horizon: earthHorizon },
    lit,
    earthVisible,
    dsnMask,
    comms,
    golden: lit && comms,
  };
}

function flag(state: SiteState, kind: WindowKind): boolean {
  switch (kind) {
    case "lit":
      return state.lit;
    case "earth":
      return state.earthVisible;
    case "comms":
      return state.comms;
    case "golden":
      return state.golden;
  }
}

export interface Window {
  start: number;
  end: number;
  /** true when the window was already open at the range start / still open at the range end */
  startClipped: boolean;
  endClipped: boolean;
}

/**
 * Windows of `kind` within [startMs, endMs), scanned every 10 minutes and refined to 30 s.
 * Windows shorter than the scan step may be missed.
 */
export function findWindows(
  eph: Ephemeris,
  site: Site,
  profile: readonly number[],
  startMs: number,
  endMs: number,
  kind: WindowKind,
): Window[] {
  if (endMs <= startMs) return [];
  const isOn = (t: number) => flag(stateAt(eph, site, profile, t), kind);

  // first instant at which isOn() equals `to`, between a (where it is not) and b (where it is)
  const refine = (a: number, b: number, to: boolean): number => {
    let lo = a;
    let hi = b;
    while (hi - lo > REFINE_TO_MS) {
      const mid = lo + (hi - lo) / 2;
      if (isOn(mid) === to) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  const windows: Window[] = [];
  let prevT = startMs;
  let prevOn = isOn(startMs);
  let openedAt: number | null = prevOn ? startMs : null;

  for (let t = startMs + SCAN_STEP_MS; prevT < endMs; t += SCAN_STEP_MS) {
    const now = Math.min(t, endMs);
    // the range end is exclusive, so look just before it
    const on = now === endMs ? isOn(endMs - 1) : isOn(now);
    if (on !== prevOn) {
      const edge = refine(prevT, now === endMs ? endMs - 1 : now, on);
      if (on) {
        openedAt = edge;
      } else if (openedAt !== null) {
        windows.push({ start: openedAt, end: edge, startClipped: openedAt === startMs, endClipped: false });
        openedAt = null;
      }
    }
    prevT = now;
    prevOn = on;
  }
  if (openedAt !== null) {
    windows.push({ start: openedAt, end: endMs, startClipped: openedAt === startMs, endClipped: true });
  }
  return windows;
}
