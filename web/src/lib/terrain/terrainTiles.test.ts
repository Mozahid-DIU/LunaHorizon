import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { findSite, hasTiles, SITES } from "../sites";
import { loadProfile } from "../testData";
import {
  decodeLevels,
  levelIndices,
  levelPositions,
  MOON_RADIUS_M,
  parseTerrainMeta,
  skylineFromTiles,
  sunVector,
  tileHeightAt,
  type TerrainLevels,
  type TerrainMeta,
} from "./terrainTiles";

const DATA = join(__dirname, "..", "..", "..", "public", "data", "terrain");
const TILE_SITES = SITES.filter(hasTiles);

function loadTiles(siteId: string): { meta: TerrainMeta; levels: TerrainLevels } {
  const site = findSite(siteId)!;
  const meta = parseTerrainMeta(JSON.parse(readFileSync(join(DATA, `${siteId}.json`), "utf-8")), site);
  const bytes = readFileSync(join(DATA, `${siteId}.bin`));
  return { meta, levels: decodeLevels(meta, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) };
}

describe("which sites have 3D tiles", () => {
  test("the three polar sites, and each has its files", () => {
    expect(TILE_SITES.map(({ id }) => id).sort()).toEqual(["im-1", "im-2", "shackleton-rim"]);
    for (const { id } of TILE_SITES) {
      expect(existsSync(join(DATA, `${id}.json`))).toBe(true);
      expect(existsSync(join(DATA, `${id}.bin`))).toBe(true);
    }
    const without = SITES.filter((site) => !hasTiles(site)).map(({ id }) => id);
    expect(without.length).toBe(SITES.length - 3);
    expect(without.some((id) => existsSync(join(DATA, `${id}.json`)))).toBe(false);
  });
});

describe("parseTerrainMeta", () => {
  const raw = () => JSON.parse(readFileSync(join(DATA, "shackleton-rim.json"), "utf-8")) as Record<string, unknown>;
  const site = findSite("shackleton-rim")!;

  test("reads the three nested levels", () => {
    const meta = parseTerrainMeta(raw(), site);
    expect(meta.levels.map(({ half_size_m, step_m, size }) => [half_size_m, step_m, size])).toEqual([
      [3000, 20, 301],
      [30000, 200, 301],
      [150000, 1000, 301],
    ]);
    expect(meta.observer_height_m).toBe(2);
    expect(meta.height_scale_m).toBe(0.5);
  });

  test("refuses another site's file", () => {
    expect(() => parseTerrainMeta(raw(), findSite("im-1")!)).toThrow(/site/);
  });

  test("refuses a level whose size does not fit its extent", () => {
    const bad = raw();
    (bad.levels as { size: number }[])[1].size = 300;
    expect(() => parseTerrainMeta(bad, site)).toThrow(/size/);
  });

  test("refuses levels that do not sit end to end in the file", () => {
    const bad = raw();
    (bad.levels as { offset_bytes: number }[])[2].offset_bytes += 2;
    expect(() => parseTerrainMeta(bad, site)).toThrow(/offset/);
  });
});

describe("decodeLevels", () => {
  test("turns int16 steps into metres above the site, and nodata into NaN", () => {
    const { meta, levels } = loadTiles("im-1");
    expect(levels).toHaveLength(3);
    const far = levels[2];
    expect(far.heights.length).toBe(301 * 301);
    // the centre node is the site itself: height 0 by construction
    expect(levels[0].heights[150 * 301 + 150]).toBe(0);
    // a node is unknown exactly when the file holds the nodata value
    const bytes = readFileSync(join(DATA, "im-1.bin"));
    const raw = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const unknown = raw.filter((v) => v === meta.nodata).length;
    const nan = levels.reduce((n, level) => n + level.heights.filter((h) => Number.isNaN(h)).length, 0);
    expect(nan).toBe(unknown);
    expect(levels[0].heights.some((h) => Number.isNaN(h))).toBe(false);
    expect(far.heights[10]).toBe(raw[2 * 301 * 301 + 10] * meta.height_scale_m);
  });

  test("refuses a file of the wrong length", () => {
    const { meta } = loadTiles("im-2");
    expect(() => decodeLevels(meta, new ArrayBuffer(10))).toThrow(/bytes/);
  });
});

describe("levelPositions", () => {
  test("follows terrain.py: east, up with the Moon's curve, and south as +z", () => {
    const { meta, levels } = loadTiles("shackleton-rim");
    const level = levels[1];
    const pos = levelPositions(level, meta.ground_m);
    const n = level.size;
    // node (row 0, col 150): 30 km north of the site; the sphere's radius includes the site's ground height
    const i = (0 * n + 150) * 3;
    const d = 30000;
    const theta = d / MOON_RADIUS_M;
    const r = MOON_RADIUS_M + meta.ground_m + level.heights[150];
    expect(pos[i]).toBeCloseTo(0, 6);
    expect(pos[i + 2]).toBeCloseTo(-r * Math.sin(theta), 2);
    expect(pos[i + 1]).toBeCloseTo(r * Math.cos(theta) - MOON_RADIUS_M - meta.ground_m, 2);
    // the far corner, 212 km out, drops about 13 km below the site through curvature alone
    const far = levelPositions(levels[2], meta.ground_m);
    const cornerD = Math.hypot(150000, 150000);
    const expected = (MOON_RADIUS_M + meta.ground_m + levels[2].heights[0]) * Math.cos(cornerD / MOON_RADIUS_M) - MOON_RADIUS_M - meta.ground_m;
    expect(far[1]).toBeCloseTo(expected, 2);
    expect(expected).toBeLessThan(-12000);
  });
});

describe("levelIndices", () => {
  test("skips cells with no height and cells the finer level covers", () => {
    const { levels } = loadTiles("im-1");
    const all = levelIndices(levels[1], null);
    const clipped = levelIndices(levels[1], levels[0]);
    expect(all.length % 3).toBe(0);
    // the inner 3 km of the 30 km level is drawn by the 20 m level instead: exactly 30 x 30 cells, 2 triangles each
    expect(all.length - clipped.length).toBe(30 * 30 * 2 * 3);
    const far = levelIndices(levels[2], levels[1]);
    const full = 300 * 300 * 2 * 3;
    expect(far.length).toBeLessThan(full);
    expect(Array.from(far).some((i) => Number.isNaN(levels[2].heights[i]))).toBe(false);
  });
});

describe("tileHeightAt", () => {
  test("is the node height on a node and between nodes in between", () => {
    const { levels } = loadTiles("shackleton-rim");
    const n = levels[0].size;
    const at = (r: number, c: number) => levels[0].heights[r * n + c];
    expect(tileHeightAt(levels, 20, 0)).toBeCloseTo(at(150, 151), 9);
    expect(tileHeightAt(levels, 10, 0)).toBeCloseTo((at(150, 150) + at(150, 151)) / 2, 9);
    expect(tileHeightAt(levels, 0, -20)).toBeCloseTo(at(151, 150), 9);
    // beyond the fine level the next one answers; beyond everything there is no height
    expect(Number.isNaN(tileHeightAt(levels, 10000, 0))).toBe(false);
    expect(Number.isNaN(tileHeightAt(levels, 200000, 0))).toBe(true);
  });
});

describe("skylineFromTiles", () => {
  test.each(TILE_SITES.map(({ id }) => id))("%s: the skyline built from the tiles is the horizon file's, give or take the tile", (id) => {
    const { meta, levels } = loadTiles(id);
    const tiles = skylineFromTiles(levels, meta.observer_height_m, meta.ground_m);
    const file = loadProfile(id);
    expect(tiles).toHaveLength(360);
    const diffs = file.map((deg, az) => Math.abs(tiles[az] - deg));
    const within = (limit: number) => diffs.filter((d) => d <= limit).length / 360;
    // the far level keeps the highest point around each node, so the tile skyline may sit a little high
    expect(within(0.1)).toBeGreaterThan(0.7);
    expect(within(0.5)).toBeGreaterThan(0.97);
    expect(Math.max(...diffs)).toBeLessThan(1.5);
  });
});

describe("sunVector", () => {
  test("points east for azimuth 90 and up for elevation 90, in the scene's x-east y-up z-south frame", () => {
    const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
    expect(sunVector(90, 0).map(round)).toEqual([1, 0, 0]);
    expect(sunVector(0, 0).map(round)).toEqual([0, 0, -1]);
    expect(sunVector(180, 90).map(round)).toEqual([0, 1, 0]);
  });
});
