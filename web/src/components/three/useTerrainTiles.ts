"use client";

import { useEffect, useState } from "react";
import { asDataError, dataLoader, type DataFileError, type TerrainTiles } from "@/lib/data/loader";

export type TilesResult = { status: "loading" } | { status: "error"; error: DataFileError; retry: () => void } | { status: "ready"; tiles: TerrainTiles };

/** Loads a site's 3D tiles once; the loader keeps them for a return visit. */
export function useTerrainTiles(siteId: string): TilesResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; result: TilesResult } | null>(null);
  const key = `${siteId}|${attempt}`;

  useEffect(() => {
    let isCurrent = true;
    dataLoader.loadTerrainTiles(siteId).then(
      (tiles) => {
        if (isCurrent) setSettled({ key, result: { status: "ready", tiles } });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ key, result: { status: "error", error: asDataError(error), retry: () => setAttempt((n) => n + 1) } });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key, siteId]);

  return settled?.key === key ? settled.result : { status: "loading" };
}
