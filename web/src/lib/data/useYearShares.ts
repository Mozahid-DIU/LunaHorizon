"use client";

import { useEffect, useMemo, useState } from "react";
import type { YearShares } from "../siteShares";
import type { SharesReply, SharesRequest } from "../siteShares.worker";
import { DataFileError } from "./loader";

export type YearSharesState = { status: "loading" } | { status: "error"; error: DataFileError; retry: () => void } | { status: "ready"; shares: YearShares };

type Settled = { key: string; reply: SharesReply };

/** Counts already made this visit; a place's shares do not depend on the date. */
const counted = new Map<string, YearShares>();

/** A custom point's 2026-2030 shares, counted in a worker from the horizon the page computed. */
export function useYearShares(lat: number, lon: number, profile: readonly number[] | null): YearSharesState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${lat},${lon}|${attempt}`;

  useEffect(() => {
    if (!profile || counted.has(`${lat},${lon}`)) return;
    const worker = new Worker(new URL("../siteShares.worker.ts", import.meta.url));
    const onStopped = () => setSettled({ key, reply: { ok: false, kind: "stopped", file: "shares", detail: "the count stopped" } });
    worker.onmessage = ({ data }: MessageEvent<SharesReply>) => {
      if (data.ok) counted.set(`${lat},${lon}`, data.shares);
      setSettled({ key, reply: data });
    };
    worker.onerror = onStopped;
    worker.onmessageerror = onStopped;
    worker.postMessage({ lat, lon, profile } satisfies SharesRequest);
    return () => worker.terminate();
  }, [key, lat, lon, profile]);

  return useMemo(() => {
    const known = counted.get(`${lat},${lon}`);
    if (known) return { status: "ready", shares: known };
    if (settled?.key !== key) return { status: "loading" };
    const { reply } = settled;
    if (reply.ok) return { status: "ready", shares: reply.shares };
    return { status: "error", error: new DataFileError(reply.kind, reply.file, reply.detail), retry: () => setAttempt((n) => n + 1) };
  }, [key, lat, lon, settled]);
}
