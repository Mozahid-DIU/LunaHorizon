/** Runs the year-long date search away from the page, so the page never waits for it. */
import { asDataError, dataLoader, yearsForRange, type DataFailure } from "./data/loader";
import { loadTerrain } from "./data/siteTerrain";
import { nearbySites, planDates, planEnd, type DatesPlan } from "./datesPlan";
import type { SelectedSite } from "./sites";

export interface DatesRequest {
  site: SelectedSite;
  landingMs: number;
}

export type DatesReply =
  | { ok: true; plan: DatesPlan; hasTerrain: boolean; isFromTiles: boolean }
  | { ok: false; kind: DataFailure; file: string; detail: string };

async function answer({ site, landingMs }: DatesRequest): Promise<DatesReply> {
  const [ephemeris, terrain] = await Promise.all([dataLoader.loadEphemeris(yearsForRange(landingMs, planEnd(landingMs))), loadTerrain(dataLoader, site)]);
  // a flat horizon blocks nothing, so setting it against real terrain would mislead
  const nearby = terrain.hasTerrain ? nearbySites(site) : [];
  const alternatives = await Promise.all(
    nearby.map(async ({ site: other }) => ({ id: other.id, site: other, profile: (await dataLoader.loadHorizon(other.id)).elevation_deg })),
  );
  const plan = planDates(ephemeris, site, terrain.profile, landingMs, alternatives);
  return { ok: true, plan, hasTerrain: terrain.hasTerrain, isFromTiles: terrain.heightAt !== null };
}

self.onmessage = async ({ data }: MessageEvent<DatesRequest>) => {
  try {
    self.postMessage(await answer(data));
  } catch (error: unknown) {
    const { kind, file, message } = asDataError(error);
    self.postMessage({ ok: false, kind, file, detail: message } satisfies DatesReply);
  }
};
