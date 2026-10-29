/**
 * Sun and Earth azimuth/elevation for any lunar site, from the hourly sub-point files.
 *
 * Mirrors pipeline/subpoints.py `topocentric_altaz` exactly; parity with the full SPICE
 * engine is tested in geometry.test.ts. Azimuth is measured from north through east.
 * Elevation is relative to the spherical horizon; terrain is applied separately.
 */

export const MOON_RADIUS_KM = 1737.4;
const HOUR_MS = 3_600_000;
const DEG = Math.PI / 180;

export type Body = "sun" | "earth";

export interface Site {
  lat: number;
  lon: number;
}

export interface AltAz {
  az: number;
  el: number;
}

export interface Track {
  lat: number[];
  lon: number[];
  dist_km: number[];
}

export interface SubpointYear {
  start: string;
  step_hours: number;
  sun: Track;
  earth: Track;
}

export interface Subpoint {
  lat: number;
  lon: number;
  distKm: number;
}

export function topocentricAltAz(subLat: number, subLon: number, distKm: number, site: Site): AltAz {
  const phi = site.lat * DEG;
  const lam = site.lon * DEG;
  const sLat = subLat * DEG;
  const sLon = subLon * DEG;

  const up = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
  const east = [-Math.sin(lam), Math.cos(lam), 0];
  const north = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)];

  const target = [
    distKm * Math.cos(sLat) * Math.cos(sLon),
    distKm * Math.cos(sLat) * Math.sin(sLon),
    distKm * Math.sin(sLat),
  ];
  const v = target.map((x, i) => x - MOON_RADIUS_KM * up[i]);
  const dot = (a: number[]) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const vUp = dot(up);
  const vEast = dot(east);
  const vNorth = dot(north);

  const el = Math.atan2(vUp, Math.hypot(vEast, vNorth)) / DEG;
  const az = ((Math.atan2(vEast, vNorth) / DEG) % 360 + 360) % 360;
  return { az, el };
}

/** Fractional hour index of a UTC time (ms) within a sub-point file. */
export function hourIndex(year: SubpointYear, utcMs: number): number {
  const index = (utcMs - Date.parse(year.start)) / (year.step_hours * HOUR_MS);
  if (index < 0 || index > year.sun.lat.length - 1) {
    throw new RangeError(`time ${new Date(utcMs).toISOString()} is outside ${year.start} data`);
  }
  return index;
}

/** Linear interpolation between hourly samples; longitude wraps across ±180°. */
export function interpolateSubpoint(track: Track, index: number): Subpoint {
  const i0 = Math.floor(index);
  const f = index - i0;
  if (f === 0) {
    return { lat: track.lat[i0], lon: track.lon[i0], distKm: track.dist_km[i0] };
  }
  const i1 = i0 + 1;
  const dLon = ((((track.lon[i1] - track.lon[i0] + 180) % 360) + 360) % 360) - 180;
  const lon = track.lon[i0] + f * dLon;
  return {
    lat: track.lat[i0] + f * (track.lat[i1] - track.lat[i0]),
    lon: lon > 180 ? lon - 360 : lon <= -180 ? lon + 360 : lon,
    distKm: track.dist_km[i0] + f * (track.dist_km[i1] - track.dist_km[i0]),
  };
}

export function bodyAltAzAt(year: SubpointYear, body: Body, utcMs: number, site: Site): AltAz {
  const p = interpolateSubpoint(year[body], hourIndex(year, utcMs));
  return topocentricAltAz(p.lat, p.lon, p.distKm, site);
}
