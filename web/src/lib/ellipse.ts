/**
 * The Ellipse page: what a landing a little off target would get. Each point's hours are the
 * engine's, from that point's own horizon in the pipeline's ellipse file.
 */
import type { EllipseFile, EllipsePoint, Touchdown } from "./data/validate";
import { missionScore, type MissionScore } from "./planning";
import { MISSION_DAYS } from "./siteSummary";
import type { Ephemeris } from "./windows";

const MISSION_MS = MISSION_DAYS * 86_400_000;
const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export const RINGS_M: readonly number[] = [100, 500, 1000];

export interface ScoredPoint {
  point: EllipsePoint;
  score: MissionScore;
}

export interface EllipseScores {
  points: ScoredPoint[];
  touchdown: { point: Touchdown; score: MissionScore } | null;
}

/** Every point's mission from the landing time, or null if the mission runs past the data. */
export function ellipseScores(eph: Ephemeris, file: EllipseFile, landingMs: number): EllipseScores | null {
  if (landingMs + MISSION_MS > eph.dataEnd()) return null;
  const score = ({ lat, lon, elevation_deg }: { lat: number; lon: number; elevation_deg: readonly number[] }) =>
    missionScore(eph, { lat, lon }, elevation_deg, landingMs, MISSION_MS);
  return {
    points: file.points.map((point) => ({ point, score: score(point) })),
    touchdown: file.touchdown && { point: file.touchdown, score: score(file.touchdown) },
  };
}

export interface ZoneSummary {
  ringM: number;
  count: number;
  target: ScoredPoint;
  best: ScoredPoint;
  median: ScoredPoint;
  worst: ScoredPoint;
  points: ScoredPoint[];
}

/** The points within a ring, ranked by Golden hours; ties keep the order of the file, target first. */
export function zoneSummary(scores: EllipseScores, ringM: number): ZoneSummary {
  const points = scores.points.filter(({ point }) => point.ring_m <= ringM);
  const ranked = [...points].sort((a, b) => b.score.goldenHours - a.score.goldenHours);
  return {
    ringM,
    count: points.length,
    target: points[0],
    best: ranked[0],
    median: ranked[Math.floor(ranked.length / 2)],
    worst: ranked[ranked.length - 1],
    points,
  };
}

export const formatRing = (ringM: number) => (ringM >= 1000 ? `${ringM / 1000} km` : `${ringM} m`);

/**
 * Where a distance sits in the picture: rings evenly apart so the 100 m points stay readable,
 * distances between rings shared out in a straight line, and anything farther on the outer ring.
 */
export function plotRadius(distanceM: number, outer: number): number {
  const stops = [0, ...RINGS_M];
  const i = stops.findIndex((ring) => ring >= distanceM);
  if (i === -1) return outer;
  if (i === 0) return 0;
  const share = (distanceM - stops[i - 1]) / (stops[i] - stops[i - 1]);
  return ((i - 1 + share) / RINGS_M.length) * outer;
}

export function pointName({ ring_m, bearing_deg }: Pick<EllipsePoint, "ring_m" | "bearing_deg">): string {
  return ring_m === 0 ? "the target" : `${formatRing(ring_m)} ${DIRECTIONS[Math.round(bearing_deg / 45) % 8]}`;
}

export interface EllipseHeadline {
  lead: string;
  emphasis: string;
}

/** Hours as the cards show them: rounded down, with "under 1" for a part of an hour. */
const shownHours = (hours: number) => (hours > 0 && hours < 1 ? "under 1" : String(Math.floor(hours)));

/** The range of Golden hours in the zone, worded exactly as the cards show the figures. */
export function ellipseHeadline(
  zone: { worst: { score: Pick<MissionScore, "goldenHours"> }; best: { score: Pick<MissionScore, "goldenHours"> } },
  ringM: number,
): EllipseHeadline {
  const low = shownHours(zone.worst.score.goldenHours);
  const high = shownHours(zone.best.score.goldenHours);
  const within = `Within ${formatRing(ringM)} of the target, `;
  const unit = high === "1" || high === "under 1" ? "hour" : "hours";
  if (low === high) return { lead: `${within}every point gets `, emphasis: `${high} Golden ${unit}.` };
  return { lead: `${within}Golden ranges from `, emphasis: `${low} to ${high} ${unit}.` };
}
