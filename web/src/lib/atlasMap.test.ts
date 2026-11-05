import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseMapGrid } from "./data/validate";
import { cellBox, latLonAt, layerPixels, LAYERS, mapCell, mapPosition, overlayOutsetPercent, polarPlaneKm } from "./atlasMap";
import { findSite } from "./sites";

const grid = parseMapGrid(JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "map", "golden-grid.json"), "utf-8")));

describe("polarPlaneKm", () => {
  test("puts the pole at the centre", () => {
    expect(polarPlaneKm(-90, 77)).toEqual({ x: 0, y: 0 });
  });

  test("longitude 0 is up and 90 E is right", () => {
    const up = polarPlaneKm(-85, 0);
    const right = polarPlaneKm(-85, 90);
    expect(up.y).toBeGreaterThan(0);
    expect(up.x).toBeCloseTo(0, 9);
    expect(right.x).toBeCloseTo(up.y, 9);
    expect(right.y).toBeCloseTo(0, 9);
  });

  test("matches the stereographic formula used to build the map", () => {
    // the pipeline's inverse: lat = 2 atan(r / 2R) - 90°, lon = atan2(x, y)
    const { x, y } = polarPlaneKm(-84.78, 29.13);
    const r = Math.hypot(x, y);
    expect((2 * Math.atan(r / (2 * 1737.4)) * 180) / Math.PI - 90).toBeCloseTo(-84.78, 9);
    expect((Math.atan2(x, y) * 180) / Math.PI).toBeCloseTo(29.13, 9);
  });
});

describe("mapPosition", () => {
  test("the pole is the middle of the image", () => {
    expect(mapPosition(-90, 0)).toEqual({ leftPercent: 50, topPercent: 50 });
  });

  test("IM-1 is drawn on the map's edge", () => {
    const im1 = findSite("im-1")!;
    const { leftPercent, topPercent } = mapPosition(im1.lat, im1.lon)!;
    expect(Math.hypot(leftPercent - 50, topPercent - 50)).toBeCloseTo(50, 0);
    expect(topPercent).toBeLessThan(1);
  });

  test("Apollo 11, Chandrayaan-3 and points past the edge are not drawn", () => {
    for (const id of ["apollo-11", "chandrayaan-3"]) {
      const site = findSite(id)!;
      expect(mapPosition(site.lat, site.lon)).toBeNull();
    }
    expect(mapPosition(-80, 90)).toBeNull();
  });
});

test("the data layer extends half a cell past the image, because its values sit on cell centres", () => {
  expect(overlayOutsetPercent(grid)).toBeCloseTo((2.5 / 600) * 100, 9);
});

describe("layerPixels", () => {
  const alphaAt = (pixels: Uint8ClampedArray, row: number, col: number) => pixels[(row * grid.size + col) * 4 + 3];

  test("gives four bytes for every node", () => {
    expect(layerPixels(grid, "golden")).toHaveLength(grid.size ** 2 * 4);
  });

  test("leaves nodes outside the circle and at or under the low end clear", () => {
    const pixels = layerPixels(grid, "golden");
    expect(alphaAt(pixels, 0, 0)).toBe(0);
    for (let i = 0; i < grid.golden.length; i++) {
      const value = grid.golden[i];
      if (value === null || value / 10 <= LAYERS.golden.lowPercent) expect(pixels[i * 4 + 3]).toBe(0);
    }
  });

  test("draws row 0 at the top, so the near side (longitude 0) is the upper half", () => {
    const pixels = layerPixels(grid, "earth");
    const alphaSum = (part: Uint8ClampedArray) => part.filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);
    const top = alphaSum(pixels.slice(0, 60 * grid.size * 4));
    const bottom = alphaSum(pixels.slice(61 * grid.size * 4));
    expect(top).toBeGreaterThan(bottom * 5);
  });

  test("a stronger value is never fainter", () => {
    const pixels = layerPixels(grid, "lit");
    let previous = -1;
    const order = grid.lit.map((value, i) => ({ value, i })).filter((n) => n.value !== null).sort((a, b) => a.value! - b.value!);
    for (const { i } of order) {
      expect(pixels[i * 4 + 3]).toBeGreaterThanOrEqual(previous);
      previous = pixels[i * 4 + 3];
    }
  });

  test("each layer uses its fixed colour meaning", () => {
    expect(LAYERS.golden.rgb).toEqual([70, 230, 180]);
    expect(LAYERS.lit.rgb).toEqual([245, 184, 65]);
    expect(LAYERS.earth.rgb).toEqual([111, 176, 255]);
  });
});

describe("mapCell", () => {
  test("finds the 5 km cell under a site, with the file's values", () => {
    const rim = findSite("shackleton-rim")!;
    const cell = mapCell(grid, rim.lat, rim.lon)!;
    expect([cell.row, cell.col]).toEqual([61, 59]);
    expect(cell.values).toEqual({ golden: grid.golden[61 * 121 + 59], lit: grid.lit[61 * 121 + 59], earth: grid.earth[61 * 121 + 59] });
    expect(cell.values.golden).toBe(163);
  });

  test("is null off the map, and null where the map has no value", () => {
    const apollo = findSite("apollo-11")!;
    expect(mapCell(grid, apollo.lat, apollo.lon)).toBeNull();
    // the map's corner cells lie beyond the 300 km disc and hold null
    expect(grid.golden[0]).toBeNull();
    expect(mapCell(grid, latLonAt(0.2, 0.2).lat, latLonAt(0.2, 0.2).lon)).toBeNull();
  });
});

describe("latLonAt", () => {
  test("is the inverse of mapPosition", () => {
    const im2 = findSite("im-2")!;
    const { leftPercent, topPercent } = mapPosition(im2.lat, im2.lon)!;
    const back = latLonAt(leftPercent, topPercent);
    expect(back.lat).toBeCloseTo(im2.lat, 9);
    expect(back.lon).toBeCloseTo(im2.lon, 9);
    expect(latLonAt(50, 50).lat).toBe(-90);
  });
});

describe("cellBox", () => {
  test("is centred on its node and one step wide", () => {
    const box = cellBox(grid, 61, 59);
    const node = { x: 59 * grid.step_km - grid.radius_km, y: grid.radius_km - 61 * grid.step_km };
    expect(box.leftPercent + box.sizePercent / 2).toBeCloseTo(50 + (node.x / grid.radius_km) * 50, 9);
    expect(box.topPercent + box.sizePercent / 2).toBeCloseTo(50 - (node.y / grid.radius_km) * 50, 9);
    expect(box.sizePercent).toBeCloseTo((grid.step_km / (2 * grid.radius_km)) * 100, 9);
  });
});
