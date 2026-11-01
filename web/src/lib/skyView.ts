/**
 * Sky View's one scale. Azimuth runs evenly across the screen; elevation uses the softened scale
 * asinh(elevation / softness), which stretches the view near the horizon and still fits a Sun
 * overhead. The Sun, Earth, skyline and terrain art all use it, so a body meets the skyline on
 * screen exactly when the engine says it sets.
 */
import art from "@/data/sky-art.json";
import { DATA_END_MS } from "./dataRange";
import { horizonAt } from "./windows";

const SKYLINE_STEP_DEG = 0.25;
const FULL_TURN = 360;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const PLAY_DAYS = 14;
const PLAY_SECONDS = 30;
const PLAY_RATE = (PLAY_DAYS * DAY_MS) / (PLAY_SECONDS * 1000);
const LABEL_GAP_PX = 18;
const LABEL_LINE_PX = 12;
const LABEL_ROOM_PX = 32;

const softened = (elevation: number) => Math.asinh(elevation / art.softness_deg);

export const SKY_VIEW = {
  topElevation: 90,
  bottomElevation: art.el_bottom,
  artTopElevation: art.el_top,
  artWidth: art.width,
  artHeight: art.height,
};

export interface SkylinePoint {
  az: number;
  el: number;
}

/** Screen height of an elevation, in a view `height` tall. */
export function elevationToY(elevation: number, height: number): number {
  const top = softened(SKY_VIEW.topElevation);
  return ((top - softened(elevation)) / (top - softened(SKY_VIEW.bottomElevation))) * height;
}

/** Degrees from the centre of the view to an azimuth, the short way: -180 up to 180. */
export function degreesFromCentre(az: number, centreAz: number): number {
  const turn = ((az - centreAz) % FULL_TURN) + FULL_TURN;
  return ((turn + 180) % FULL_TURN) - 180;
}

export function isBesideView(az: number, centreAz: number, spanDeg: number): boolean {
  return Math.abs(degreesFromCentre(az, centreAz)) > spanDeg / 2;
}

/** Where to look first: midway between the Sun and Earth if both fit, otherwise at the Sun. */
export function centreFor(sunAz: number, earthAz: number, spanDeg: number): number {
  const apart = degreesFromCentre(earthAz, sunAz);
  if (Math.abs(apart) >= spanDeg) return sunAz;
  return (sunAz + apart / 2 + FULL_TURN) % FULL_TURN;
}

/** Sim time to add after `realMs` of playing, from `offsetMs` into the run. */
export function advance(offsetMs: number, realMs: number): number {
  return offsetMs + realMs * PLAY_RATE;
}

/** Where a run from this time stops: 14 days on, or the end of the data. */
export function playbackEnd(startMs: number): number {
  return Math.min(startMs + PLAY_DAYS * DAY_MS, DATA_END_MS);
}

/** The time shown for a point in a run, always a whole minute that a link can reopen. */
export function frameTime(startMs: number, offsetMs: number): number {
  return Math.min(startMs + Math.round(offsetMs / MINUTE_MS) * MINUTE_MS, playbackEnd(startMs));
}

/** The view that keeps the Sun where it stood on screen when `startCentre` was chosen. */
export function followCentre(startCentre: number, startSunAz: number, sunAz: number): number {
  return (startCentre + degreesFromCentre(sunAz, startSunAz) + FULL_TURN) % FULL_TURN;
}

/** Above a body, or under it when it sits at the top of the view. */
export function labelY(bodyY: number): number {
  return bodyY < LABEL_ROOM_PX ? bodyY + LABEL_GAP_PX + LABEL_LINE_PX : bodyY - LABEL_GAP_PX;
}

/** The engine's horizon, finely sampled so the line drawn on the softened scale stays true. */
export function skylinePoints(profile: readonly number[]): SkylinePoint[] {
  const steps = FULL_TURN / SKYLINE_STEP_DEG;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const az = i * SKYLINE_STEP_DEG;
    return { az, el: horizonAt(profile, az) };
  });
}
