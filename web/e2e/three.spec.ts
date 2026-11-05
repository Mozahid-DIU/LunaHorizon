import { expect, test, type Page } from "@playwright/test";

const canvas = (page: Page) => page.locator("canvas[data-status]");
const readouts = (page: Page) => page.getByRole("complementary", { name: "From the engine" });

/** Waits for the scene's first frame; the headless browser draws with a software GPU. */
async function sceneReady(page: Page) {
  await expect(canvas(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

/** The ground's lit fraction at the lander, read back from the shadow pass. */
const litAtLander = (page: Page) => page.evaluate(() => window.__lunaHorizon3d?.litAtLander() ?? null);

test("the readouts show the engine's result for the default date", async ({ page }) => {
  await page.goto("/3d");
  await sceneReady(page);
  // the same figures the Sky page shows for Shackleton rim, 29 Dec 2027 21:00
  await expect(readouts(page)).toContainText("0.8°");
  await expect(readouts(page)).toContainText("Sun above the skyline, which is −2.5° there, NW (315°)");
  await expect(readouts(page)).toContainText("22d 22h");
  await expect(readouts(page)).toContainText("to sunset");
  await expect(readouts(page)).toContainText("14d 3h");
  await expect(readouts(page)).toContainText("to Earthset");
  await expect(readouts(page)).toContainText("Golden");
  await expect(page.getByTestId("three-time")).toContainText("29 Dec 2027, 21:00 UTC");
});

test("the ground at the lander is lit before the engine's sunset and dark after it", async ({ page }) => {
  // the countdown above says sunset comes 22d 22h after 29 Dec 21:00, so between 19:00 and 20:00 on 21 Jan
  await page.goto("/3d?t=2028-01-21T18:00Z");
  await sceneReady(page);
  await expect(readouts(page)).toContainText("Sun above the skyline");
  expect(await litAtLander(page)).toBeGreaterThan(0.5);

  await page.goto("/3d?t=2028-01-21T21:00Z");
  await sceneReady(page);
  await expect(readouts(page)).toContainText("Sun below the skyline");
  expect(await litAtLander(page)).toBeLessThan(0.5);
});

test("the slider moves the time, and the readouts follow", async ({ page }) => {
  await page.goto("/3d");
  await sceneReady(page);
  await page.getByLabel("Time after the chosen date").fill("560");
  await expect(page.getByTestId("three-time")).toContainText("22 Jan 2028, 05:00 UTC");
  // the night after the sunset at 22d 22h: the Sun is down and the countdown looks to sunrise
  await expect(readouts(page)).toContainText("Sun below the skyline");
  await expect(readouts(page)).toContainText("to sunrise");
});

test("the view switches between above and the lander's eye, and the skyline check needs the eye", async ({ page }) => {
  await page.goto("/3d");
  await sceneReady(page);
  const above = page.getByRole("button", { name: "From above" });
  const eye = page.getByRole("button", { name: "Lander's eye" });
  const check = page.getByRole("button", { name: "Skyline check" });
  await expect(above).toHaveAttribute("aria-pressed", "true");
  await expect(check).toBeDisabled();
  await eye.click();
  await expect(eye).toHaveAttribute("aria-pressed", "true");
  await expect(above).toHaveAttribute("aria-pressed", "false");
  await expect(check).toBeEnabled();
  await check.click();
  await expect(check).toHaveAttribute("aria-pressed", "true");
  await expect(canvas(page)).toHaveAttribute("aria-label", /from the lander/);
});

test("a site without tiles says so and links the three that have them", async ({ page }) => {
  await page.goto("/3d?site=apollo-11");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("No 3D tiles for Apollo 11");
  const links = page.locator("main a[href^='/3d']");
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAttribute("href", /site=im-1/);
  await expect(canvas(page)).toHaveCount(0);
});

test("nothing overflows, at any supported width", async ({ page, isMobile }) => {
  await page.goto("/3d");
  await sceneReady(page);
  const widths = isMobile ? [320, 390] : [1024, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `at ${width}px`).toBe(0);
  }
});
