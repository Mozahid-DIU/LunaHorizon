/** Counts a custom point's hours over 2026-2030 away from the page. */
import { asDataError, DATA_YEARS, dataLoader, type DataFailure } from "./data/loader";
import { yearShares, type YearShares } from "./siteShares";

export interface SharesRequest {
  lat: number;
  lon: number;
  profile: readonly number[];
}

export type SharesReply = { ok: true; shares: YearShares } | { ok: false; kind: DataFailure; file: string; detail: string };

self.onmessage = async ({ data }: MessageEvent<SharesRequest>) => {
  try {
    const eph = await dataLoader.loadEphemeris([...DATA_YEARS]);
    self.postMessage({ ok: true, shares: yearShares(eph, { lat: data.lat, lon: data.lon }, data.profile) } satisfies SharesReply);
  } catch (error: unknown) {
    const { kind, file, message } = asDataError(error);
    self.postMessage({ ok: false, kind, file, detail: message } satisfies SharesReply);
  }
};
