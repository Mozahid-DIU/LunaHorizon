"use client";

import { useEffect, useState } from "react";
import { asDataError, type DataFileError } from "./loader";

export type DataFile<T> =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; value: T };

type Settled<T> = { attempt: number; ok: true; value: T } | { attempt: number; ok: false; error: DataFileError };

/** Loads one data file, with the same guarantees as useSiteData. Pass a stable `load`. */
export function useDataFile<T>(load: () => Promise<T>): DataFile<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    let isCurrent = true;
    load().then(
      (value) => {
        if (isCurrent) setSettled({ attempt, ok: true, value });
      },
      (error: unknown) => {
        if (isCurrent) setSettled({ attempt, ok: false, error: asDataError(error) });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [attempt, load]);

  if (settled?.attempt !== attempt) return { status: "loading" };
  if (!settled.ok) return { status: "error", error: settled.error, retry: () => setAttempt((n) => n + 1) };
  return { status: "ready", value: settled.value };
}
