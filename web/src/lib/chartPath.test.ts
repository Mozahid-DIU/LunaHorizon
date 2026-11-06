import { describe, expect, test } from "vitest";
import { smoothArea, smoothPath, type Point } from "./chartPath";

/** Every y the cubic segments reach, sampled finely. */
function sampledYs(points: readonly Point[]): number[] {
  const nums = smoothPath(points).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const ys: number[] = [];
  let x0 = nums[0];
  let y0 = nums[1];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const [c1y, c2y, y1] = [nums[i + 1], nums[i + 3], nums[i + 5]];
    for (let t = 0; t <= 1; t += 0.05) {
      const u = 1 - t;
      ys.push(u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1);
    }
    x0 = nums[i + 4];
    y0 = y1;
  }
  expect(x0).toBe(points[points.length - 1].x);
  return ys;
}

describe("smooth chart paths", () => {
  test("pass through every point", () => {
    const points = [
      { x: 0, y: 50 },
      { x: 10, y: 20 },
      { x: 20, y: 80 },
      { x: 30, y: 40 },
    ];
    const d = smoothPath(points);
    for (const { x, y } of points) expect(d).toContain(`${x.toFixed(1)},${y.toFixed(1)}`);
  });

  test("never bend past the data, so a full battery never draws above full", () => {
    // y = 10 is 100% on a chart; the charge rises, holds at full, then falls
    const points = [0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ x: x * 10, y: [90, 40, 10, 10, 10, 10, 60, 95][x] }));
    const ys = sampledYs(points);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(Math.max(...ys)).toBeLessThanOrEqual(95 + 1e-9);
  });

  test("keep a flat stretch flat", () => {
    const ys = sampledYs([{ x: 0, y: 30 }, { x: 10, y: 30 }, { x: 20, y: 30 }]);
    expect(ys.every((y) => Math.abs(y - 30) < 1e-9)).toBe(true);
  });

  test("handle short and empty inputs, and close an area down to its base", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 0, y: 1 }, { x: 5, y: 2 }])).toBe("M0.0,1.0 L5.0,2.0");
    expect(smoothArea([{ x: 0, y: 1 }, { x: 5, y: 2 }, { x: 9, y: 4 }], 100)).toMatch(/L9\.0,100\.0 L0\.0,100\.0 Z$/);
  });
});
