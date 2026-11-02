"use client";

import { useEffect, useMemo, useState } from "react";
import type { SelectedSite } from "../sites";
import type { Ephemeris } from "../windows";
import { asDataError, dataLoader, type DataFileError, yearsForRange } from "./loader";
import { loadTerrain, type SiteTerrain } from "./siteTerrain";

export interface SiteDataRequest {
  site: SelectedSite;
  startMs: number;
  endMs: number;
}

export type SiteData =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | ({ status: "ready"; ephemeris: Ephemeris } & SiteTerrain);

type Settled =
  | ({ key: string; ok: true; ephemeris: Ephemeris } & SiteTerrain)
  | { key: string; ok: false; error: DataFileError };

/** Loads what a page needs for one site and time range, and never returns partial data. */
export function useSiteData({ site, startMs, endMs }: SiteDataRequest): SiteData {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const years = useMemo(() => yearsForRange(startMs, endMs), [startMs, endMs]);
  const siteKey = site.id ?? `${site.lat},${site.lon}`;
  const key = `${siteKey}|${years.join(",")}|${attempt}`;

  useEffect(() => {
    let isCurrent = true;
    Promise.all([dataLoader.loadEphemeris(years), loadTerrain(dataLoader, site)]).then(
      ([ephemeris, terrain]) => {
        if (isCurrent) setSettled({ key, ok: true, ephemeris, ...terrain });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ key, ok: false, error: asDataError(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, site, years]);

  // the same object for the same data, so pages can keep heavy results between renders
  return useMemo(() => {
    if (settled?.key !== key) return { status: "loading" };
    if (!settled.ok) return { status: "error", error: settled.error, retry: () => setAttempt((n) => n + 1) };
    const { ephemeris, profile, hasTerrain, heightAt } = settled;
    return { status: "ready", ephemeris, profile, hasTerrain, heightAt };
  }, [key, settled]);
}
