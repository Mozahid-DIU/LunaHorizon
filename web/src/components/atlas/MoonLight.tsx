"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "@/components/sky/useSkyPlayback";
import { dataLoader, yearsForRange } from "@/lib/data/loader";
import { DATA_END_MS } from "@/lib/dataRange";
import { formatUtc } from "@/lib/selection";
import type { Ephemeris } from "@/lib/windows";
import styles from "./atlas.module.css";
import { createMoonProgram, sunVector, type HeightsMeta, type MoonProgram } from "./moonShader";

const DAY_MS = 86_400_000;
/** One lunar day, sunrise to sunrise, plays in this many seconds. */
const LUNAR_DAY_MS = 29.53 * DAY_MS;
const LOOP_SECONDS = 24;
const FRAME_MS = 1000 / 30;
const SIZE_PX = 1024;

interface MoonLightProps {
  timeMs: number;
  isPlaying: boolean;
  /** Where the shown time is written, without re-rendering every frame. */
  timeLabel: RefObject<HTMLSpanElement | null>;
  onReady: () => void;
}

/**
 * Lights the map from the real Sun, from the chosen time across one lunar day, over the
 * relief image. If WebGL or the data fails, the relief image simply stays.
 */
export function MoonLight({ timeMs, isPlaying, timeLabel, onReady }: MoonLightProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const isMotionReduced = useReducedMotion();
  const [isReady, setReady] = useState(false);
  const playing = useRef(false);
  const ready = useRef(onReady);
  const offset = useRef(0);

  useEffect(() => {
    playing.current = isPlaying && !isMotionReduced;
    ready.current = onReady;
  }, [isPlaying, isMotionReduced, onReady]);

  const endMs = Math.min(timeMs + LUNAR_DAY_MS, DATA_END_MS);

  useEffect(() => {
    let program: MoonProgram | null = null;
    let frame = 0;
    let isCurrent = true;
    offset.current = 0;

    const start = async () => {
      const image = new Image();
      image.src = "/data/map/heights.png";
      const [meta, eph] = await Promise.all([
        fetch("/data/map/heights.json").then((r) => {
          if (!r.ok) throw new Error("heights.json failed");
          return r.json() as Promise<HeightsMeta>;
        }),
        dataLoader.loadEphemeris(yearsForRange(timeMs, endMs)) as Promise<Ephemeris>,
        image.decode(),
      ]);
      if (!isCurrent || !canvas.current) return;
      canvas.current.width = SIZE_PX;
      canvas.current.height = SIZE_PX;
      program = createMoonProgram(canvas.current, image, meta);

      const span = endMs - timeMs;
      let last = performance.now();
      let lastDraw = 0;
      let hasShown = false;
      const tick = (now: number) => {
        if (!isCurrent || !program) return;
        if (playing.current && !document.hidden) offset.current = (offset.current + ((now - last) / 1000 / LOOP_SECONDS) * LUNAR_DAY_MS) % span;
        last = now;
        if (now - lastDraw >= FRAME_MS || lastDraw === 0) {
          lastDraw = now;
          const at = timeMs + offset.current;
          const sun = eph.subpoint("sun", at);
          program.draw(sunVector(sun.lat, sun.lon));
          if (timeLabel.current) timeLabel.current.textContent = formatUtc(Math.floor(at / 3_600_000) * 3_600_000);
          if (lastDraw === now && !hasShown) {
            hasShown = true;
            setReady(true);
            ready.current();
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    start().catch(() => {
      // the relief image stays; the light is decoration over it
    });
    return () => {
      isCurrent = false;
      cancelAnimationFrame(frame);
      program?.dispose();
    };
  }, [timeMs, endMs, timeLabel]);

  return <canvas ref={canvas} className={styles.moonLight} data-ready={isReady} aria-hidden="true" />;
}
