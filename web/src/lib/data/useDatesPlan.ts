"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DatesPlan } from "../datesPlan";
import type { DatesReply, DatesRequest } from "../datesPlan.worker";
import type { SelectedSite } from "../sites";
import { DataFileError } from "./loader";

export type DatesPlanState =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; plan: DatesPlan; hasTerrain: boolean; isFromTiles: boolean };

type Settled = { key: string; reply: DatesReply };

/** Searches in a worker; a newer request stops the old search instead of waiting for it. */
export function useDatesPlan(site: SelectedSite, landingMs: number): DatesPlanState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const siteKey = site.id ?? `${site.lat},${site.lon}`;
  const key = `${siteKey}|${landingMs}|${attempt}`;

  // a custom site is a new object after any change to the address, which is no reason to search again
  const latestSite = useRef(site);
  useEffect(() => {
    latestSite.current = site;
  }, [site]);

  useEffect(() => {
    const worker = new Worker(new URL("../datesPlan.worker.ts", import.meta.url));
    const onStopped = () => setSettled({ key, reply: { ok: false, kind: "stopped", file: "date search", detail: "the search stopped" } });
    worker.onmessage = ({ data }: MessageEvent<DatesReply>) => setSettled({ key, reply: data });
    worker.onerror = onStopped;
    worker.onmessageerror = onStopped;
    worker.postMessage({ site: latestSite.current, landingMs } satisfies DatesRequest);
    return () => worker.terminate();
  }, [key, landingMs]);

  return useMemo(() => {
    if (settled?.key !== key) return { status: "loading" };
    const { reply } = settled;
    if (reply.ok) return { status: "ready", plan: reply.plan, hasTerrain: reply.hasTerrain, isFromTiles: reply.isFromTiles };
    return { status: "error", error: new DataFileError(reply.kind, reply.file, reply.detail), retry: () => setAttempt((n) => n + 1) };
  }, [key, settled]);
}
