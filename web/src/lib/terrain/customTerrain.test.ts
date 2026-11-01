import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import fixture from "../__fixtures__/custom-horizon.json";
import { createDataLoader, DataFileError } from "../data/loader";
import { findSite, SITES } from "../sites";
import { loadEphemeris } from "../testData";
import { hasHeightTiles } from "../sites";
import { stateAt } from "../windows";
import { computeHorizon, decodeTile, rayDistances, tilesForSite } from "./customTerrain";

const DATA = join(__dirname, "..", "..", "..", "public", "data");
const HOUR_MS = 3_600_000;

function diskFetch(override?: (url: string) => Response | null) {
  const calls: string[] = [];
  const fetchFn = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const replaced = override?.(url);
    if (replaced) return replaced;
    return new Response(readFileSync(join(DATA, url.replace("/data/", ""))));
  };
  return { fetchFn, calls };
}

type Manifest = { products: Record<string, unknown>[] } & Record<string, unknown>;

const worstDifference = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));

describe("decodeTile", () => {
  test("rebuilds the map's values from row differences", async () => {
    const deltas = new Int16Array([10, 2, 20, -1]);
    const stream = new Blob([deltas.buffer]).stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = await new Response(stream).arrayBuffer();
    expect(Array.from(await decodeTile(bytes, 2, 2))).toEqual([10, 12, 20, 19]);
  });

  test("refuses a tile of the wrong size", async () => {
    const stream = new Blob([new Int16Array(3).buffer]).stream().pipeThrough(new CompressionStream("gzip"));
    await expect(decodeTile(await new Response(stream).arrayBuffer(), 2, 2)).rejects.toThrow(/expected 4 values/);
  });
});

test("rays use the same sample distances as the pipeline", () => {
  const distances = rayDistances();
  expect(distances[0]).toBe(10);
  expect(distances[1]).toBeCloseTo(10.02, 9);
  expect(distances.at(-1)).toBe(150_000);
});

describe("horizon from tiles", () => {
  test.each(fixture.map((row) => [row.lat, row.lon, row] as const))("%f, %f matches the full maps", async (lat, lon, row) => {
    const terrain = await createDataLoader(diskFetch().fetchFn).loadCustomTerrain(lat, lon);
    expect(terrain.groundM).toBeCloseTo(row.ground_m, 1);
    expect(worstDifference(terrain.profile, row.elevation_deg)).toBeLessThan(0.1);
  }, 30_000);

  test("the median direction is within 0.02 degrees of the full maps at every point", async () => {
    const loader = createDataLoader(diskFetch().fetchFn);
    for (const row of fixture) {
      const { profile } = await loader.loadCustomTerrain(row.lat, row.lon);
      const errors = profile.map((value, i) => Math.abs(value - row.elevation_deg[i])).sort((a, b) => a - b);
      expect(errors[180]).toBeLessThan(0.02);
    }
  }, 60_000);

  test.each(SITES.filter((site) => hasHeightTiles(site.lat)).map((site) => site.id))(
    "%s agrees with its published horizon and its sunlight",
    async (id) => {
      const site = findSite(id)!;
      const published = JSON.parse(readFileSync(join(DATA, "horizon", `${id}.json`), "utf-8")) as { elevation_deg: number[] };
      const { profile } = await createDataLoader(diskFetch().fetchFn).loadCustomTerrain(site.lat, site.lon);
      expect(worstDifference(profile, published.elevation_deg)).toBeLessThan(0.1);

      const eph = loadEphemeris([2027, 2028]);
      let litFull = 0;
      let litTiles = 0;
      let hours = 0;
      for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += HOUR_MS) {
        litFull += Number(stateAt(eph, site, published.elevation_deg, t).lit);
        litTiles += Number(stateAt(eph, site, profile, t).lit);
        hours += 1;
      }
      expect(Math.abs(litFull - litTiles) / hours).toBeLessThan(0.005);
    },
    30_000,
  );
});

describe("loading", () => {
  test("downloads only the tiles near the site", async () => {
    const { fetchFn, calls } = diskFetch();
    await createDataLoader(fetchFn).loadCustomTerrain(-85.25, 120);
    const tiles = calls.filter((url) => url.endsWith(".i2z"));
    expect(tiles.length).toBeGreaterThan(3);
    expect(tiles.length).toBeLessThan(60);
  });

  test("even beside the pole the download stays small", async () => {
    const { fetchFn, calls } = diskFetch();
    await createDataLoader(fetchFn).loadCustomTerrain(-89.9, 40);
    const bytes = calls
      .filter((url) => url.endsWith(".i2z"))
      .reduce((sum, url) => sum + readFileSync(join(DATA, url.replace("/data/", ""))).length, 0);
    expect(bytes).toBeLessThan(15e6);
  });

  test("lists each tile once, finest maps close to the site", async () => {
    const manifest = await createDataLoader(diskFetch().fetchFn).loadHeightManifest();
    const keys = (await tilesForSite(manifest, -89, 10)).map(({ product, row, column }) => `${product.name}/${row}_${column}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((key) => key.startsWith("ldem_875s_20m/"))).toBe(true);
    expect(keys.some((key) => key.startsWith("far/"))).toBe(true);
  });

  test("a missing tile is reported, never replaced by a guess", async () => {
    const { fetchFn } = diskFetch((url) => (url.endsWith(".i2z") ? new Response("", { status: 404 }) : null));
    const error = await createDataLoader(fetchFn).loadCustomTerrain(-85.25, 120).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataFileError);
    expect((error as DataFileError).kind).toBe("missing");
  });

  test("a damaged tile is refused", async () => {
    const { fetchFn } = diskFetch((url) => (url.endsWith(".i2z") ? new Response("not a tile") : null));
    const error = await createDataLoader(fetchFn).loadCustomTerrain(-85.25, 120).catch((e: unknown) => e);
    expect((error as DataFileError).kind).toBe("invalid");
  });

  test("a gap in the terrain is refused, because it would quietly lower the horizon", async () => {
    const { fetchFn } = diskFetch((url) => {
      if (!url.endsWith("manifest.json")) return null;
      const manifest = JSON.parse(readFileSync(join(DATA, "heights", "manifest.json"), "utf-8")) as { products: { name: string; tiles: number[][] }[] };
      const far = manifest.products.at(-1)!;
      return new Response(JSON.stringify({ ...manifest, products: [...manifest.products.slice(0, -1), { ...far, tiles: far.tiles.slice(0, 1) }] }));
    });
    const error = await createDataLoader(fetchFn).loadCustomTerrain(-85.25, 120).catch((e: unknown) => e);
    expect((error as DataFileError).kind).toBe("invalid");
    expect((error as DataFileError).message).toMatch(/have no height/);
  });

  test.each([
    ["maps in the wrong order", (m: Manifest) => ({ ...m, products: [...m.products].reverse() })],
    ["a map with no northern limit", (m: Manifest) => ({ ...m, products: m.products.map((p) => ({ ...p, max_lat: undefined })) })],
    ["a tile outside its map", (m: Manifest) => ({ ...m, products: m.products.map((p) => ({ ...p, tiles: [[9999, 0]] })) })],
    ["changed distance bands", (m: Manifest) => ({ ...m, near_radius_m: 1 })],
  ])("a manifest with %s is refused", async (_name, change) => {
    const { fetchFn } = diskFetch((url) => (url.endsWith("manifest.json") ? new Response(JSON.stringify(change(JSON.parse(readFileSync(join(DATA, "heights", "manifest.json"), "utf-8")) as Manifest))) : null));
    const error = await createDataLoader(fetchFn).loadHeightManifest().catch((e: unknown) => e);
    expect((error as DataFileError).kind).toBe("invalid");
  });

  test("memory stays bounded when many sites are tried", async () => {
    const { fetchFn, calls } = diskFetch();
    const loader = createDataLoader(fetchFn);
    const first = await loader.loadCustomTerrain(-85, 10);
    expect(await loader.loadCustomTerrain(-85, 10)).toBe(first);
    for (const lon of [40, 70, 100, 130]) await loader.loadCustomTerrain(-85, lon);
    calls.length = 0;
    expect(await loader.loadCustomTerrain(-85, 10)).not.toBe(first);
  }, 30_000);

  test("a place outside the tiles is refused", async () => {
    const error = await createDataLoader(diskFetch().fetchFn).loadCustomTerrain(-40, 0).catch((e: unknown) => e);
    expect((error as DataFileError).kind).toBe("unavailable");
  });

  test("a failed site can be tried again", async () => {
    let isBroken = true;
    const { fetchFn } = diskFetch((url) => (isBroken && url.endsWith(".i2z") ? new Response("", { status: 500 }) : null));
    const loader = createDataLoader(fetchFn);
    await expect(loader.loadCustomTerrain(-85.25, 120)).rejects.toBeInstanceOf(DataFileError);
    isBroken = false;
    await expect(loader.loadCustomTerrain(-85.25, 120)).resolves.toHaveProperty("profile");
  });
});

test("computeHorizon ignores directions with no terrain, as the pipeline does", async () => {
  const flat = await computeHorizon(() => 0, 0, 0);
  expect(flat).toHaveLength(360);
  flat.forEach((el) => expect(el).toBeCloseTo(-0.0876, 2));
  const nothing = await computeHorizon((_lat, _lon, distance) => (distance === 0 ? 0 : Number.NaN), 0, 0);
  expect(nothing[0]).toBe(-90);
});
