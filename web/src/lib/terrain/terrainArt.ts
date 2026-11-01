/**
 * Sky View art for a custom site, drawn in the browser the same way pipeline/sky_art.py draws the
 * demo sites. Display only: the page trims the top of this art to the computed horizon.
 */
import art from "@/data/sky-art.json";
import { elevationDeg, forEachRayPoint, rayDistances, type HeightAt } from "./customTerrain";

export const ART_WIDTH = 1440;
export const ART_HEIGHT = 320;

const MOON_RADIUS_M = 1_737_400;
const OBSERVER_HEIGHT_M = 2;
const DEG = Math.PI / 180;
const COLUMNS_PER_SLICE = 40;
const SAMPLE_STRIDE = 3;
const FLAT_LEVEL = 0.32;
const FACING_GAIN = 1.5;
const SIDE_GAIN = 1.5;
const FAR_FADE = 0.3;
const NEAR_LEVEL = 0.12;
const NEAR_FADE_M = 8000;
const BASE = 0.05;

function rowElevations(): Float64Array {
  const top = Math.asinh(art.el_top / art.softness_deg);
  const bottom = Math.asinh(art.el_bottom / art.softness_deg);
  return Float64Array.from({ length: ART_HEIGHT }, (_, row) => Math.sinh(top + ((row + 0.5) / ART_HEIGHT) * (bottom - top)) * art.softness_deg);
}

const nextSlice = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Brightness 0..255 by row and column. Works in slices so the page stays responsive. */
export async function renderArt(heightAt: HeightAt, lat: number, lon: number, isCancelled: () => boolean): Promise<Uint8ClampedArray | null> {
  const allDistances = rayDistances();
  const distances = allDistances.filter((_, i) => i % SAMPLE_STRIDE === 0);
  const count = distances.length;
  const ground = heightAt(lat, lon, 0);
  const heights = new Float32Array(ART_WIDTH * count);
  const stepRad = (360 / ART_WIDTH) * DEG;

  for (let start = 0; start < ART_WIDTH; start += COLUMNS_PER_SLICE) {
    await nextSlice();
    if (isCancelled()) return null;
    const bearings = Array.from({ length: COLUMNS_PER_SLICE }, (_, i) => (start + i + 0.5) * (360 / ART_WIDTH));
    forEachRayPoint(lat, lon, bearings, (ray, sample, pointLat, pointLon, distance) => {
      const height = heightAt(pointLat, pointLon, distance);
      heights[(start + ray) * count + sample / SAMPLE_STRIDE] = Number.isNaN(height) ? ground : height;
    }, SAMPLE_STRIDE);
  }

  const rows = rowElevations();
  const image = new Uint8ClampedArray(ART_WIDTH * ART_HEIGHT);
  const observerRadius = MOON_RADIUS_M + ground + OBSERVER_HEIGHT_M;
  const curved = (column: number, sample: number) =>
    heights[((column + ART_WIDTH) % ART_WIDTH) * count + sample] - distances[sample] ** 2 / (2 * MOON_RADIUS_M);

  for (let column = 0; column < ART_WIDTH; column++) {
    if (column % COLUMNS_PER_SLICE === 0) {
      await nextSlice();
      if (isCancelled()) return null;
    }
    let reached = 0;
    let skyline = -90;
    for (let sample = 0; sample < count && reached < ART_HEIGHT; sample++) {
      const elevation = elevationDeg(heights[column * count + sample], sample * SAMPLE_STRIDE, observerRadius);
      if (elevation <= skyline) continue;
      skyline = elevation;
      const before = Math.max(0, sample - 1);
      const after = Math.min(count - 1, sample + 1);
      const distance = distances[sample];
      const along = (curved(column, after) - curved(column, before)) / (distances[after] - distances[before]);
      const across = (curved(column + 1, sample) - curved(column - 1, sample)) / (2 * distance * stepRad);
      const facing = FLAT_LEVEL + (along * FACING_GAIN + across * SIDE_GAIN) / Math.sqrt(1 + along ** 2 + across ** 2);
      const fade = 1 - FAR_FADE * Math.sqrt(Math.min(1, distance / distances[count - 1]));
      const near = NEAR_LEVEL + (1 - NEAR_LEVEL) * Math.min(1, distance / NEAR_FADE_M);
      const brightness = BASE + (1 - BASE) * Math.min(1, Math.max(0, facing)) * fade * near;
      // rows run from the bottom of the view upwards along the ray
      for (let row = ART_HEIGHT - 1 - reached; row >= 0 && rows[row] <= skyline; row--) {
        image[row * ART_WIDTH + column] = brightness * 255;
        reached += 1;
      }
    }
  }
  return image;
}
