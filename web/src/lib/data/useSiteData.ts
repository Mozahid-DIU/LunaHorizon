"use client";

import { useEffect, useMemo, useState } from "react";
import type { SelectedSite } from "../sites";
import type { HeightAt } from "../terrain/customTerrain";
import type { Ephemeris } from "../windows";
import { asDataError, dataLoader, type DataFileError, yearsForRange } from "./loader";

/** A flat horizon for custom sites, which have no terrain file. */
const NO_TERRAIN: readonly number[] = Array.from({ length: 360 }, () => 0);

export interface SiteDataRequest {
  site: SelectedSite;
  startMs: number;
  endMs: number;
}

export interface SiteTerrain {
  profile: readonly number[];
  hasTerrain: boolean;
  /** Heights from tiles, for a custom site; null for demo sites and flat horizons. */
  heightAt: HeightAt | null;
}

async function loadTerrain(site: SelectedSite): Promise<SiteTerrain> {
  if (site.id !== null) {
    const file = await dataLoader.loadHorizon(site.id);
    return { profile: file.elevation_deg, hasTerrain: true, heightAt: null };
  }
  if (!site.has_terrain) return { profile: NO_TERRAIN, hasTerrain: false, heightAt: null };
  const { profile, heightAt } = await dataLoader.loadCustomTerrain(site.lat, site.lon);
  return { profile, hasTerrain: true, heightAt };
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
    Promise.all([dataLoader.loadEphemeris(years), loadTerrain(site)]).then(
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
