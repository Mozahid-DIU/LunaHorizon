"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NudgePlan } from "../nudgePlan";
import type { NudgeReply, NudgeRequest } from "../nudgePlan.worker";
import type { SelectedSite } from "../sites";
import { DataFileError } from "./loader";

export type NudgeState = { status: "idle" } | { status: "loading" } | { status: "error"; error: DataFileError; retry: () => void } | { status: "ready"; plan: NudgePlan };

type Settled = { key: string; reply: NudgeReply };

/** Runs the nearby-points plan in a worker; a newer request stops the old one. Idle when `isOn` is false. */
export function useNudgePlan(site: SelectedSite, landingMs: number, isOn: boolean): NudgeState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const siteKey = site.id ?? `${site.lat},${site.lon}`;
  const key = `${siteKey}|${landingMs}|${attempt}`;

  // a custom site is a new object after any change to the address, which is no reason to start again
  const latestSite = useRef(site);
  useEffect(() => {
    latestSite.current = site;
  }, [site]);

  useEffect(() => {
    if (!isOn) return;
    const worker = new Worker(new URL("../nudgePlan.worker.ts", import.meta.url));
    const onStopped = () => setSettled({ key, reply: { ok: false, kind: "stopped", file: "nearby points", detail: "the calculation stopped" } });
    // the worker holds its own copy of the data; it goes as soon as it has answered
    worker.onmessage = ({ data }: MessageEvent<NudgeReply>) => {
      worker.terminate();
      setSettled({ key, reply: data });
    };
    const onFailed = () => {
      worker.terminate();
      onStopped();
    };
    worker.onerror = onFailed;
    worker.onmessageerror = onFailed;
    worker.postMessage({ site: latestSite.current, landingMs } satisfies NudgeRequest);
    return () => worker.terminate();
  }, [isOn, key, landingMs]);

  return useMemo(() => {
    if (!isOn) return { status: "idle" };
    if (settled?.key !== key) return { status: "loading" };
    const { reply } = settled;
    if (reply.ok) return { status: "ready", plan: reply.plan };
    return { status: "error", error: new DataFileError(reply.kind, reply.file, reply.detail), retry: () => setAttempt((n) => n + 1) };
  }, [isOn, key, settled]);
}
