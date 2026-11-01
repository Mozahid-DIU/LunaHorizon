"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ephemeris } from "../windows";
import { dataLoader, DataFileError, yearsForRange } from "./loader";

/** A flat horizon for custom sites, which have no terrain file. */
const NO_TERRAIN: readonly number[] = Array.from({ length: 360 }, () => 0);

export interface SiteDataRequest {
  /** A curated site with a terrain file, or null for custom coordinates. */
  siteId: string | null;
  startMs: number;
  endMs: number;
}

export type SiteData =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; ephemeris: Ephemeris; profile: readonly number[]; hasTerrain: boolean };

type Settled =
  | { key: string; ok: true; ephemeris: Ephemeris; profile: readonly number[]; hasTerrain: boolean }
  | { key: string; ok: false; error: DataFileError };

const asDataError = (error: unknown): DataFileError =>
  error instanceof DataFileError
    ? error
    : new DataFileError("invalid", "data", error instanceof Error ? error.message : "could not be read");

/** Loads what a page needs for one site and time range, and never returns partial data. */
export function useSiteData({ siteId, startMs, endMs }: SiteDataRequest): SiteData {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const years = useMemo(() => yearsForRange(startMs, endMs), [startMs, endMs]);
  const key = `${siteId}|${years.join(",")}|${attempt}`;

  useEffect(() => {
    let isCurrent = true;
    const horizon = siteId === null ? Promise.resolve(null) : dataLoader.loadHorizon(siteId);
    Promise.all([dataLoader.loadEphemeris(years), horizon]).then(
      ([ephemeris, file]) => {
        if (!isCurrent) return;
        setSettled({ key, ok: true, ephemeris, profile: file?.elevation_deg ?? NO_TERRAIN, hasTerrain: file !== null });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ key, ok: false, error: asDataError(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, siteId, years]);

  if (settled?.key !== key) return { status: "loading" };
  if (!settled.ok) return { status: "error", error: settled.error, retry: () => setAttempt((n) => n + 1) };
  return { status: "ready", ephemeris: settled.ephemeris, profile: settled.profile, hasTerrain: settled.hasTerrain };
}
