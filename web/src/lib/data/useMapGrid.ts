"use client";

import { useEffect, useState } from "react";
import { asDataError, dataLoader, type DataFileError } from "./loader";
import type { MapGrid } from "./validate";

export type MapData =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; grid: MapGrid };

type Settled = { attempt: number; ok: true; grid: MapGrid } | { attempt: number; ok: false; error: DataFileError };

/** Loads the Golden Window Map grid, with the same guarantees as useSiteData. */
export function useMapGrid(): MapData {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    let isCurrent = true;
    dataLoader.loadMapGrid().then(
      (grid) => {
        if (isCurrent) setSettled({ attempt, ok: true, grid });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ attempt, ok: false, error: asDataError(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [attempt]);

  if (settled?.attempt !== attempt) return { status: "loading" };
  if (!settled.ok) return { status: "error", error: settled.error, retry: () => setAttempt((n) => n + 1) };
  return { status: "ready", grid: settled.grid };
}
