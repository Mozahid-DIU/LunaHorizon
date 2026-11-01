"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { centreFor, degreesFromCentre, elevationToY, skylinePoints, SKY_VIEW } from "@/lib/skyView";
import type { SiteState } from "@/lib/windows";
import styles from "./sky.module.css";

const WIDE_PX_PER_DEG = 7;
const NARROW_PX_PER_DEG = 5;
const WIDE_FROM_PX = 1280;
const TURN_STEP_DEG = 30;
const KEY_STEP_DEG = 10;
const FULL_TURN = 360;
const TILES = [-1, 0, 1] as const;
const COMPASS: readonly (readonly [number, string])[] = [[0, "N"], [90, "E"], [180, "S"], [270, "W"]];

const normalised = (az: number) => ((az % FULL_TURN) + FULL_TURN) % FULL_TURN;

interface SkyStageProps {
  state: SiteState;
  profile: readonly number[];
  artSrc: string | null;
  /** Changes when the site or time changes, which returns the view to the Sun and Earth. */
  viewKey: string;
  /** Reports what is on screen; null once the stage is gone, so nothing stale is used. */
  onViewChange: (view: SkySpan | null) => void;
}

export interface SkySpan {
  centre: number;
  span: number;
}

function useSize() {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  return { box, ...size };
}

export function SkyStage({ state, profile, artSrc, viewKey, onViewChange }: SkyStageProps) {
  const { box, width, height } = useSize();
  const [turned, setTurned] = useState<{ key: string; az: number } | null>(null);
  const [failedArt, setFailedArt] = useState<string | null>(null);
  const drag = useRef<{ x: number; az: number } | null>(null);
  const pxPerDeg = width >= WIDE_FROM_PX ? WIDE_PX_PER_DEG : NARROW_PX_PER_DEG;
  const spanDeg = width / pxPerDeg;
  const { sun, earth } = state;
  const centre = turned?.key === viewKey ? turned.az : centreFor(sun.az, earth.az, spanDeg);
  const turnTo = (az: number) => setTurned({ key: viewKey, az: normalised(az) });

  useEffect(() => {
    if (width > 0) onViewChange({ centre, span: spanDeg });
    return () => onViewChange(null);
  }, [centre, onViewChange, spanDeg, width]);

  const skyline = useMemo(() => {
    const line = skylinePoints(profile).map(({ az, el }) => `${az * pxPerDeg},${elevationToY(el, height)}`);
    return { line: line.join(" "), fill: `${line.join(" ")} ${FULL_TURN * pxPerDeg},${height} 0,${height}` };
  }, [height, profile, pxPerDeg]);

  // Whole pixels, so the art's edges at north meet without a seam; everything shares this origin.
  const originX = Math.round(width / 2 - centre * pxPerDeg);
  const screenX = (az: number) => originX + (centre + degreesFromCentre(az, centre)) * pxPerDeg;
  const artTop = elevationToY(SKY_VIEW.artTopElevation, height);
  const tileWidth = FULL_TURN * pxPerDeg;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    turnTo(centre + (event.key === "ArrowRight" ? KEY_STEP_DEG : -KEY_STEP_DEG));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, az: centre };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag.current) turnTo(drag.current.az - (event.clientX - drag.current.x) / pxPerDeg);
  };

  return (
    <div className={styles.stageWrap}>
      <div
        ref={box}
        className={styles.stage}
        data-testid="sky-view"
        role="group"
        tabIndex={0}
        aria-label="View from the lander. Use the left and right arrow keys to turn."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true">
            <defs>
              <radialGradient id="sun-glow">
                <stop offset="0" stopColor="#ffd27a" stopOpacity="0.7" />
                <stop offset="0.2" stopColor="#f5b841" stopOpacity="0.25" />
                <stop offset="1" stopColor="#f5b841" stopOpacity="0" />
              </radialGradient>
              <clipPath id="sky-ground">
                <polygon points={skyline.fill} />
              </clipPath>
              <g id="sky-tile">
                <polygon points={skyline.fill} fill="#0b0e18" />
                {artSrc && (
                  <image
                    className={styles.art}
                    data-testid="sky-art"
                    href={artSrc}
                    x={0}
                    y={artTop}
                    width={tileWidth}
                    height={height - artTop}
                    preserveAspectRatio="none"
                    onError={() => setFailedArt(artSrc)}
                    clipPath="url(#sky-ground)"
                  />
                )}
                <polyline points={skyline.line} fill="none" stroke="#46e6b4" strokeOpacity="0.55" strokeWidth="1" />
                {COMPASS.map(([az, label]) => (
                  <text key={label} x={az * pxPerDeg} y={height - 12} textAnchor="middle" className={styles.compass}>
                    {label}
                  </text>
                ))}
              </g>
            </defs>
            {/* no air on the Moon, so nothing glows once the Sun has gone */}
            {state.lit && (
              <circle className={styles.glow} data-testid="sky-glow" cx={screenX(sun.az)} cy={elevationToY(sun.el, height)} r={150} fill="url(#sun-glow)" />
            )}
            <circle data-testid="sky-sun" cx={screenX(sun.az)} cy={elevationToY(sun.el, height)} r={10} fill="#fff4d6" />
            <circle data-testid="sky-earth" cx={screenX(earth.az)} cy={elevationToY(earth.el, height)} r={12} fill="#6fb0ff" />
            <g data-testid="sky-terrain">
              {TILES.map((tile) => (
                <use key={tile} href="#sky-tile" x={originX + tile * tileWidth} />
              ))}
            </g>
          </svg>
        )}
      </div>
      <div className={styles.turn}>
        <button type="button" aria-label="Turn left" onClick={() => turnTo(centre - TURN_STEP_DEG)}>
          ←
        </button>
        <button type="button" onClick={() => turnTo(sun.az)}>
          Find the Sun
        </button>
        <button type="button" onClick={() => turnTo(earth.az)}>
          Find Earth
        </button>
        <button type="button" aria-label="Turn right" onClick={() => turnTo(centre + TURN_STEP_DEG)}>
          →
        </button>
        <span className={styles.heading}>Facing {Math.round(centre) % FULL_TURN}°</span>
      </div>
      {failedArt === artSrc && artSrc !== null && (
        <p className={styles.warning}>Terrain picture unavailable. The skyline and positions are still exact.</p>
      )}
    </div>
  );
}
