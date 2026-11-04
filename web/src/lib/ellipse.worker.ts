/** Scores the 26 landing-zone points away from the page, so the page never waits for them. */
import { asDataError, dataLoader, yearsForRange, type DataFailure } from "./data/loader";
import { DATA_END_MS } from "./dataRange";
import { ellipseScores, type EllipseScores } from "./ellipse";
import { MISSION_DAYS } from "./siteSummary";

const MISSION_MS = MISSION_DAYS * 86_400_000;

export interface EllipseRequest {
  siteId: string;
  landingMs: number;
}

export type EllipseReply =
  | { ok: true; scores: EllipseScores | null }
  | { ok: false; kind: DataFailure; file: string; detail: string };

async function answer({ siteId, landingMs }: EllipseRequest): Promise<EllipseReply> {
  // a mission running past the data still loads what exists, so ellipseScores can say so
  const years = yearsForRange(landingMs, Math.min(landingMs + MISSION_MS, DATA_END_MS));
  const [ephemeris, file] = await Promise.all([dataLoader.loadEphemeris(years), dataLoader.loadEllipse(siteId)]);
  return { ok: true, scores: ellipseScores(ephemeris, file, landingMs) };
}

self.onmessage = async ({ data }: MessageEvent<EllipseRequest>) => {
  try {
    self.postMessage(await answer(data));
  } catch (error: unknown) {
    const { kind, file, message } = asDataError(error);
    self.postMessage({ ok: false, kind, file, detail: message } satisfies EllipseReply);
  }
};
