/**
 * The Atlas map's geometry and colours. The relief image fills a 600 km square centred on the
 * pole in the LOLA polar plane: longitude 0 is up and 90 E is right. Layer values sit on cell
 * centres, so the layer extends half a cell past the image on every side.
 */
import { MOON_RADIUS_KM } from "./geometry";
import type { MapGrid } from "./data/validate";

export const MAP_RADIUS_KM = 300;
/** IM-1 lies 300.04 km from the pole; it belongs on the edge, not off the map. */
const EDGE_TOLERANCE_KM = 0.5;
const MAX_ALPHA = 0.8;
const ALPHA_CURVE = 1.2;
const DEG = Math.PI / 180;

export type MapLayer = "golden" | "lit" | "earth";

export interface LayerStyle {
  label: string;
  title: string;
  /** Follows a site's share on its map pin, as in "45.4% golden". */
  pinWord: string;
  /** Finishes the sentence "The glow marks ground that ...". */
  glow: string;
  rgb: readonly [number, number, number];
  /** Share of hours, in percent, where the colour starts and where it reaches full strength. */
  lowPercent: number;
  highPercent: number;
}

/** Colour meaning is fixed across the app: mint = Golden, gold = Sun, blue = Earth. */
export const LAYERS: Record<MapLayer, LayerStyle> = {
  golden: { label: "Golden", title: "Golden hours", pinWord: "golden", glow: "sees the Sun and Earth together", rgb: [70, 230, 180], lowPercent: 8, highPercent: 48 },
  lit: { label: "Sunlight", title: "Sunlit hours", pinWord: "sunlit", glow: "sees the Sun most often", rgb: [245, 184, 65], lowPercent: 10, highPercent: 50 },
  earth: { label: "Earth view", title: "Hours with Earth in view", pinWord: "Earth view", glow: "sees Earth most often", rgb: [111, 176, 255], lowPercent: 0, highPercent: 100 },
};

export interface MapPosition {
  leftPercent: number;
  topPercent: number;
}

export function polarPlaneKm(lat: number, lon: number): { x: number; y: number } {
  const r = 2 * MOON_RADIUS_KM * Math.tan(((90 + lat) / 2) * DEG);
  return { x: r === 0 ? 0 : r * Math.sin(lon * DEG), y: r === 0 ? 0 : r * Math.cos(lon * DEG) };
}

/** Where a place sits on the map image, or null if it lies outside the map. */
export function mapPosition(lat: number, lon: number): MapPosition | null {
  const { x, y } = polarPlaneKm(lat, lon);
  if (Math.hypot(x, y) > MAP_RADIUS_KM + EDGE_TOLERANCE_KM) return null;
  return { leftPercent: 50 + (x / MAP_RADIUS_KM) * 50, topPercent: 50 - (y / MAP_RADIUS_KM) * 50 };
}

export function overlayOutsetPercent(grid: MapGrid): number {
  return (grid.step_km / 2 / (2 * grid.radius_km)) * 100;
}

/** RGBA bytes for one layer, one pixel per grid node, top row first. */
export function layerPixels(grid: MapGrid, layer: MapLayer): Uint8ClampedArray<ArrayBuffer> {
  const { rgb, lowPercent, highPercent } = LAYERS[layer];
  const values = grid[layer];
  const pixels = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, i) => {
    if (value === null) return;
    const strength = Math.min(1, Math.max(0, (value / 10 - lowPercent) / (highPercent - lowPercent)));
    pixels.set([...rgb, Math.round(255 * MAX_ALPHA * strength ** ALPHA_CURVE)], i * 4);
  });
  return pixels;
}
