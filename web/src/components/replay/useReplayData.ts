"use client";

import { useEffect, useMemo, useState } from "react";
import { asDataError, dataLoader, type DataFileError } from "@/lib/data/loader";
import type { Site } from "@/lib/geometry";
import type { Mission } from "@/lib/replay";
import { findSite } from "@/lib/sites";
import type { HeightAt } from "@/lib/terrain/customTerrain";
import type { Ephemeris } from "@/lib/windows";

export interface ReplayPlace extends Site {
  /** What the replay calls this point. */
  label: string;
}

export type ReplayData =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; ephemeris: Ephemeris; place: ReplayPlace; profile: readonly number[]; artSrc: string | null };

type Settled =
  | { key: string; ok: true; ephemeris: Ephemeris; place: ReplayPlace; profile: readonly number[]; artSrc: string | null }
  | { key: string; ok: false; error: DataFileError };

async function loadPlace(mission: Mission): Promise<Omit<Extract<Settled, { ok: true }>, "key" | "ok" | "ephemeris">> {
  const site = findSite(mission.siteId);
  if (!site) throw new Error(`no curated site ${mission.siteId}`);
  if (mission.point === "site") {
    const horizon = await dataLoader.loadHorizon(site.id);
    return { place: { lat: site.lat, lon: site.lon, label: site.name }, profile: horizon.elevation_deg, artSrc: `/data/sky/${site.id}.webp` };
  }
  const ellipse = await dataLoader.loadEllipse(site.id);
  const touchdown = ellipse.touchdown;
  if (!touchdown) throw new Error(`${site.id} has no touchdown point`);
  return {
    place: { lat: touchdown.lat, lon: touchdown.lon, label: `${mission.name} touchdown point, ${touchdown.distance_m} m from its target` },
    profile: touchdown.elevation_deg,
    artSrc: null,
  };
}

/** The year's ephemeris and the horizon of the point a mission really landed on. */
export function useReplayData(mission: Mission): ReplayData {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${mission.id}|${attempt}`;

  useEffect(() => {
    let isCurrent = true;
    const year = new Date(mission.landedMs).getUTCFullYear();
    Promise.all([dataLoader.loadReplayEphemeris(year), loadPlace(mission)]).then(
      ([ephemeris, place]) => {
        if (isCurrent) setSettled({ key, ok: true, ephemeris, ...place });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ key, ok: false, error: asDataError(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, mission]);

  return useMemo(() => {
    if (settled?.key !== key) return { status: "loading" };
    if (!settled.ok) return { status: "error", error: settled.error, retry: () => setAttempt((n) => n + 1) };
    const { ephemeris, place, profile, artSrc } = settled;
    return { status: "ready", ephemeris, place, profile, artSrc };
  }, [key, settled]);
}

/**
 * Height tiles around a point without a ready-made picture, loaded after the replay is up so the
 * terrain picture can be drawn; null until then, or if the tiles cannot be loaded.
 */
export function usePlaceHeights(place: ReplayPlace | null, isNeeded: boolean): HeightAt | null {
  const [loaded, setLoaded] = useState<{ key: string; heightAt: HeightAt } | null>(null);
  const key = place ? `${place.lat},${place.lon}` : "";

  useEffect(() => {
    if (!place || !isNeeded) return;
    let isCurrent = true;
    dataLoader.loadCustomTerrain(place.lat, place.lon).then(
      (terrain) => {
        if (isCurrent) setLoaded({ key, heightAt: terrain.heightAt });
      },
      () => {
        // the stage still shows the exact skyline without the picture, so a failure here is not shown
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [isNeeded, key, place]);

  return loaded?.key === key ? loaded.heightAt : null;
}
