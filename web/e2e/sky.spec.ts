import { expect, test, type Page } from "@playwright/test";

const sun = (page: Page) => page.getByTestId("sky-sun");
const earth = (page: Page) => page.getByTestId("sky-earth");
const readout = (page: Page, name: string) => page.getByRole("region", { name });

/** What the browser finds at the centre of a body: the body itself, or the terrain over it. */
const topmostAtCentre = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const body = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const found = document.elementFromPoint(body.x + body.width / 2, body.y + body.height / 2);
    return found?.closest("[data-testid]")?.getAttribute("data-testid");
  }, testId);

test("the default view shows the engine's positions for Shackleton rim", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Shackleton crater rim");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  await expect(readout(page, "Earth")).toContainText("Above the horizon");
  await expect(sun(page)).toBeVisible();
  await expect(earth(page)).toBeVisible();
});

test("the Sun is hidden by terrain exactly when the engine says it has set", async ({ page }) => {
  // Shackleton rim, sunset 2028-01-21 19:44:41 UTC
  await page.goto("/sky?t=2028-01-21T12:00Z");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  await page.getByRole("button", { name: "Find the Sun" }).click();
  await expect.poll(() => topmostAtCentre(page, "sky-sun")).toBe("sky-sun");

  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  await page.getByRole("button", { name: "Find the Sun" }).click();
  await expect.poll(() => topmostAtCentre(page, "sky-sun")).toBe("sky-terrain");
});

test("the find buttons bring a body to the middle of the view", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  const view = (await page.getByTestId("sky-view").boundingBox())!;
  for (const [button, body] of [["Find Earth", earth], ["Find the Sun", sun]] as const) {
    await page.getByRole("button", { name: button }).click();
    await expect.poll(async () => {
      const box = (await body(page).boundingBox())!;
      return Math.abs(box.x + box.width / 2 - (view.x + view.width / 2));
    }).toBeLessThan(1);
  }
});

test("a full turn past north brings the view back to the same place", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  await page.getByRole("button", { name: "Find the Sun" }).click();
  const facing = page.getByText(/^Facing \d+°$/);
  await expect(facing).toHaveText("Facing 315°");
  const before = (await sun(page).boundingBox())!;
  await page.getByRole("button", { name: "Turn right" }).click();
  await expect(facing).toHaveText("Facing 345°");
  for (let i = 0; i < 11; i++) await page.getByRole("button", { name: "Turn right" }).click();
  await expect(facing).toHaveText("Facing 315°");
  expect(Math.abs((await sun(page).boundingBox())!.x - before.x)).toBeLessThan(1);
});

test("the 360 degree art joins at north on whole pixels, so no seam shows", async ({ page }) => {
  await page.goto("/sky?site=im-2&t=2028-02-29T12:00Z");
  await expect(sun(page)).toBeVisible();
  for (let press = 0; press < 3; press++) {
    const tiles = await page.locator("[data-testid='sky-terrain'] use").evaluateAll((uses) => uses.map((use) => Number(use.getAttribute("x"))));
    expect(tiles).toHaveLength(3);
    tiles.forEach((x) => expect(Number.isInteger(x)).toBe(true));
    await page.getByTestId("sky-view").focus();
    await page.keyboard.press("ArrowRight");
  }
});

test("on the page, the Sun crosses the drawn skyline at the engine's sunset", async ({ page, isMobile }) => {
  test.skip(isMobile, "the scale is the same at both sizes");
  /** How far the Sun's centre sits above the line drawn at its own azimuth, in pixels. */
  const gapAboveSkyline = async () => {
    await expect(sun(page)).toBeVisible();
    const azimuth = Number((await readout(page, "Sun").getByText(/^\d+\.\d+°$/).nth(1).textContent())!.replace("°", ""));
    return page.evaluate((az) => {
      const cy = Number(document.querySelector("[data-testid='sky-sun']")!.getAttribute("cy"));
      const points = document.querySelector("polyline")!.getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number));
      const pxPerDeg = points.at(-1)![0] / 360;
      const after = points.findIndex(([x]) => x >= az * pxPerDeg);
      const [x0, y0] = points[after - 1];
      const [x1, y1] = points[after];
      return y0 + ((y1 - y0) * (az * pxPerDeg - x0)) / (x1 - x0) - cy;
    }, azimuth);
  };

  // Shackleton rim, sunset 2028-01-21 19:44:41 UTC
  await page.goto("/sky?t=2028-01-21T19:25Z");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  expect(await gapAboveSkyline()).toBeGreaterThan(0);

  await page.goto("/sky?t=2028-01-21T20:05Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  expect(await gapAboveSkyline()).toBeLessThan(0);
});

test("no glow is left in the sky after sunset", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByTestId("sky-glow")).toHaveCount(1);
  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(sun(page)).toBeAttached();
  await expect(page.getByTestId("sky-glow")).toHaveCount(0);
});

test("the turn hint appears only for a body that can be seen by turning", async ({ page }) => {
  await page.goto("/sky?site=apollo-11&t=2027-06-10T12:00Z");
  await page.getByRole("button", { name: "Find Earth" }).click();
  await expect(readout(page, "Earth")).not.toContainText("Outside this view");
  await expect(readout(page, "Sun")).toContainText("Outside this view");

  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  await page.getByRole("button", { name: "Find Earth" }).click();
  await expect(readout(page, "Sun")).not.toContainText("Outside this view");
});

test("a failed terrain picture says so and keeps the skyline", async ({ page }) => {
  await page.route("**/data/sky/*.webp", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/sky");
  await expect(page.getByText("Terrain picture unavailable.")).toBeVisible();
  await expect(page.locator("polyline")).toBeAttached();
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
});

test("the view can be turned with the arrow keys", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  const before = (await sun(page).boundingBox())!.x;
  await page.getByTestId("sky-view").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sun(page).boundingBox())!.x).toBeLessThan(before);
});

test("a custom site shows a flat horizon and says so", async ({ page }) => {
  await page.goto("/sky?lat=-85.25&lon=120");
  await expect(page.getByText("Flat horizon: terrain not included", { exact: false })).toBeVisible();
  await expect(page.getByTestId("sky-art")).toHaveCount(0);
  await expect(page.getByTestId("sky-terrain")).toBeVisible();
});

test("each terrain site loads its own art", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await expect(page.getByTestId("sky-art")).toHaveAttribute("href", "/data/sky/im-2.webp");
});

test("the page says what is real and what is for display", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByText(/shading is for display/i)).toBeVisible();
  await expect(page.getByText(/not to scale/i)).toBeVisible();
});

test("broken data shows a notice and no sky", async ({ page }) => {
  await page.route("**/data/horizon/shackleton-rim.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/sky");
  await expect(page.getByRole("alert").filter({ hasText: "A data file is missing." })).toBeVisible();
  await expect(sun(page)).toHaveCount(0);
  await expect(readout(page, "Sun")).toHaveCount(0);
});

test("nothing overflows, at any supported width", async ({ page, isMobile }) => {
  test.skip(isMobile, "sizes are set here");
  for (const width of [320, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sky");
    await expect(sun(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
