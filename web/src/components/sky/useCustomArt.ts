"use client";

import { useEffect, useState } from "react";
import type { HeightAt } from "@/lib/terrain/customTerrain";
import { ART_HEIGHT, ART_WIDTH, renderArt } from "@/lib/terrain/terrainArt";

function toObjectUrl(brightness: Uint8ClampedArray): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = ART_WIDTH;
  canvas.height = ART_HEIGHT;
  const pixels = new ImageData(ART_WIDTH, ART_HEIGHT);
  brightness.forEach((value, i) => pixels.data.set([value, value, value, 255], i * 4));
  canvas.getContext("2d")?.putImageData(pixels, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && URL.createObjectURL(blob)), "image/png"));
}

/** Draws a custom site's terrain picture after the page is up; null until it is ready. */
export function useCustomArt(heightAt: HeightAt | null, lat: number, lon: number): string | null {
  const [drawn, setDrawn] = useState<{ source: HeightAt; url: string } | null>(null);

  useEffect(() => {
    if (!heightAt) return;
    let isCancelled = false;
    let url: string | null = null;
    renderArt(heightAt, lat, lon, () => isCancelled)
      .then((brightness) => (brightness ? toObjectUrl(brightness) : null))
      .then((made) => {
        if (!made) return;
        if (isCancelled) {
          URL.revokeObjectURL(made);
          return;
        }
        url = made;
        setDrawn({ source: heightAt, url: made });
      })
      // the picture is display only: the skyline and numbers do not depend on it
      .catch(() => setDrawn(null));
    return () => {
      isCancelled = true;
      if (url) URL.revokeObjectURL(url);
      setDrawn(null);
    };
  }, [heightAt, lat, lon]);

  return drawn?.source === heightAt ? drawn.url : null;
}
