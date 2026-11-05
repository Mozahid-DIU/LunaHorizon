/** Builds nine horizons from the height tiles and scores them, away from the page. */
import { asDataError, dataLoader, yearsForRange, type DataFailure } from "./data/loader";
import { loadTerrain } from "./data/siteTerrain";
import { nudgePlan, nudgeRange, type NudgePlan } from "./nudgePlan";
import type { SelectedSite } from "./sites";

export interface NudgeRequest {
  site: SelectedSite;
  landingMs: number;
}

export type NudgeReply = { ok: true; plan: NudgePlan } | { ok: false; kind: DataFailure; file: string; detail: string };

self.onmessage = async ({ data }: MessageEvent<NudgeRequest>) => {
  try {
    const [from, to] = nudgeRange(data.landingMs);
    const [eph, terrain] = await Promise.all([dataLoader.loadEphemeris(yearsForRange(from, to)), loadTerrain(dataLoader, data.site)]);
    self.postMessage({ ok: true, plan: await nudgePlan(dataLoader, eph, data.site, terrain.profile, data.landingMs) } satisfies NudgeReply);
  } catch (error: unknown) {
    const { kind, file, message } = asDataError(error);
    self.postMessage({ ok: false, kind, file, detail: message } satisfies NudgeReply);
  }
};
