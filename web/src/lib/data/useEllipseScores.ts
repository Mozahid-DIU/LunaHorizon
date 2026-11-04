"use client";

import { useEffect, useMemo, useState } from "react";
import type { EllipseScores } from "../ellipse";
import type { EllipseReply, EllipseRequest } from "../ellipse.worker";
import { DataFileError } from "./loader";

export type EllipseState =
  | { status: "loading" }
  | { status: "error"; error: DataFileError; retry: () => void }
  | { status: "ready"; scores: EllipseScores | null };

type Settled = { key: string; reply: EllipseReply };

/** Scores a site's landing zone in a worker; a newer request stops the old one. */
export function useEllipseScores(siteId: string, landingMs: number): EllipseState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${siteId}|${landingMs}|${attempt}`;

  useEffect(() => {
    const worker = new Worker(new URL("../ellipse.worker.ts", import.meta.url));
    const onStopped = () => setSettled({ key, reply: { ok: false, kind: "stopped", file: "landing zone", detail: "the calculation stopped" } });
    worker.onmessage = ({ data }: MessageEvent<EllipseReply>) => setSettled({ key, reply: data });
    worker.onerror = onStopped;
    worker.onmessageerror = onStopped;
    worker.postMessage({ siteId, landingMs } satisfies EllipseRequest);
    return () => worker.terminate();
  }, [key, siteId, landingMs]);

  return useMemo(() => {
    if (settled?.key !== key) return { status: "loading" };
    const { reply } = settled;
    if (reply.ok) return { status: "ready", scores: reply.scores };
    return { status: "error", error: new DataFileError(reply.kind, reply.file, reply.detail), retry: () => setAttempt((n) => n + 1) };
  }, [key, settled]);
}
