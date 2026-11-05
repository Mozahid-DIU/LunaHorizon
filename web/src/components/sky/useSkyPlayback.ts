"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { advance } from "@/lib/skyView";

/** A hidden tab pauses frames; a long gap must not jump the run forward. */
const MAX_FRAME_MS = 100;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeToMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
}

interface Run {
  key: string;
  offsetMs: number;
  isPlaying: boolean;
}

export interface SkyPlayback {
  offsetMs: number;
  isPlaying: boolean;
  toggle: () => void;
  seek: (offsetMs: number) => void;
}

/**
 * A run of `lengthMs` that lasts until `key` changes, when it returns to the start.
 * `speed` multiplies the usual pace of the run.
 */
export function useSkyPlayback(key: string, lengthMs: number, isMotionReduced: boolean, speed = 1): SkyPlayback {
  const [stored, setStored] = useState<Run | null>(null);
  if (stored !== null && stored.key !== key) setStored(null);
  const run = stored?.key === key ? stored : { key, offsetMs: 0, isPlaying: false };
  const { offsetMs } = run;
  const isPlaying = run.isPlaying && !isMotionReduced;

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const realMs = Math.min(now - last, MAX_FRAME_MS);
      last = now;
      setStored((current) => {
        if (current?.key !== key) return current;
        const next = advance(current.offsetMs, realMs * speed);
        return next >= lengthMs ? { key, offsetMs: lengthMs, isPlaying: false } : { key, offsetMs: next, isPlaying: true };
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, key, lengthMs, speed]);

  return {
    offsetMs,
    isPlaying,
    toggle: () => setStored({ key, offsetMs: !isPlaying && offsetMs >= lengthMs ? 0 : offsetMs, isPlaying: !isPlaying }),
    seek: (target) => setStored({ key, offsetMs: target, isPlaying: false }),
  };
}
