"use client";

import { useEffect, useRef, useState } from "react";
import type { TerrainTiles } from "@/lib/data/loader";
import { createLunarScene, type LunarScene, type ViewMode } from "./lunarScene";
import styles from "./three.module.css";

export interface SceneProps {
  tiles: TerrainTiles;
  profile: readonly number[];
  sun: { az: number; el: number; isLit: boolean };
  earth: { az: number; el: number };
  mode: ViewMode;
  isSkylineShown: boolean;
  isPhone: boolean;
}

declare global {
  interface Window {
    /** Lets tests read the shadow pass at the lander. */
    __lunaHorizon3d?: { litAtLander(): number };
  }
}

/** Owns the canvas and the three.js scene; every prop change is passed straight to the scene. */
export default function TerrainScene({ tiles, profile, sun, earth, mode, isSkylineShown, isPhone }: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LunarScene | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "failed" | "lost">("starting");
  const [scene, setScene] = useState<LunarScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: LunarScene;
    try {
      scene = createLunarScene(canvas, tiles, profile, { isPhone: false, onReady: () => setStatus("ready"), onLost: () => setStatus("lost") });
    } catch {
      // WebGL refused; the notice replaces the scene once React is free
      const failed = setTimeout(() => setStatus("failed"), 0);
      return () => clearTimeout(failed);
    }
    sceneRef.current = scene;
    // the setters below run once the scene is in state, so a rebuilt scene gets every value again
    const announce = setTimeout(() => setScene(scene), 0);
    window.__lunaHorizon3d = { litAtLander: () => scene.litAtLander() };
    const box = canvas.parentElement!;
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(box);
    scene.resize(box.clientWidth, box.clientHeight);
    return () => {
      clearTimeout(announce);
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
      delete window.__lunaHorizon3d;
    };
  }, [profile, tiles]);

  useEffect(() => scene?.setPhone(isPhone), [isPhone, scene]);
  useEffect(() => scene?.setSun(sun.az, sun.el, sun.isLit), [scene, sun.az, sun.el, sun.isLit]);
  useEffect(() => scene?.setEarth(earth.az, earth.el), [earth.az, earth.el, scene]);
  useEffect(() => scene?.setMode(mode), [mode, scene]);
  useEffect(() => scene?.setSkyline(isSkylineShown), [isSkylineShown, scene]);

  return (
    <div className={styles.canvasBox}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label={mode === "eye" ? "The view from the lander. Drag or use the arrow keys to look around." : "The site from above. Drag to orbit, scroll to zoom."}
        data-status={status}
      />
      {status === "failed" && (
        <p className={styles.failed} role="alert">
          This browser could not start the 3D view. The numbers beside it still come from the engine.
        </p>
      )}
      {status === "lost" && (
        <p className={styles.failed} role="alert">
          The browser stopped the 3D view to free graphics memory. Reload the page to start it again; the numbers beside it still come
          from the engine.
        </p>
      )}
    </div>
  );
}
