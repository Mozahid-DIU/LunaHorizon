import { expect, test, type Page } from "@playwright/test";

const R_KM = 1737.4;
const pin = (page: Page, name: RegExp) => page.getByRole("button", { name });
const card = (page: Page) => page.getByRole("region", { name: "Selected site" });

function expectedCentre(box: { x: number; y: number; width: number }, lat: number, lon: number) {
  const r = 2 * R_KM * Math.tan((((90 + lat) / 2) * Math.PI) / 180);
  const rad = (lon * Math.PI) / 180;
  return {
    x: box.x + box.width * (0.5 + (r * Math.sin(rad)) / 600),
    y: box.y + box.width * (0.5 - (r * Math.cos(rad)) / 600),
  };
}

test("the default view shows the published result for Shackleton rim", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("right time");
  await expect(card(page).getByRole("heading", { name: "Shackleton crater rim" })).toBeVisible();
  await expect(card(page)).toContainText("89.78°S 156.18°W");
  await expect(card(page)).toContainText("14 of 14 days");
  await expect(card(page)).toContainText("14d 3h");
  await expect(card(page)).toContainText("to Earthset");
  await expect(card(page)).toContainText("22d 22h");
  await expect(card(page)).toContainText("to sunset");
});

test("every pin sits at its true coordinates", async ({ page }) => {
  await page.goto("/");
  const map = (await page.getByTestId("map").boundingBox())!;
  const pins: [RegExp, number, number][] = [
    [/^Shackleton crater rim/, -89.7804, -156.18],
    [/^IM-1 Odysseus/, -80.13, 1.44],
    [/^IM-2 Athena/, -84.78, 29.13],
  ];
  for (const [name, lat, lon] of pins) {
    const dot = (await pin(page, name).locator("[data-dot]").boundingBox())!;
    const want = expectedCentre(map, lat, lon);
    expect(Math.abs(dot.x + dot.width / 2 - want.x)).toBeLessThan(1);
    expect(Math.abs(dot.y + dot.height / 2 - want.y)).toBeLessThan(1);
  }
});

test("pins show each site's own share of hours", async ({ page }) => {
  await page.goto("/");
  await expect(pin(page, /^Shackleton crater rim/)).toContainText("45.4% golden");
  await expect(pin(page, /^IM-1 Odysseus/)).toContainText("38.8% golden");
  await expect(pin(page, /^IM-2 Athena/)).toContainText("36.9% golden");
  await page.getByRole("button", { name: "Sunlight" }).click();
  await expect(pin(page, /^Shackleton crater rim/)).toContainText("84.8% sunlit");
  await page.getByRole("button", { name: "Earth view" }).click();
  await expect(pin(page, /^IM-2 Athena/)).toContainText("81.5% Earth view");
});

test("no pin label is cut off at the top of the map", async ({ page }) => {
  await page.goto("/");
  const label = (await pin(page, /^IM-1 Odysseus/).boundingBox())!;
  const text = (await pin(page, /^IM-1 Odysseus/).getByText("IM-1 Odysseus").boundingBox())!;
  const atlas = (await page.locator("main > div").boundingBox())!;
  expect(Math.min(label.y, text.y - 8)).toBeGreaterThanOrEqual(atlas.y);
});

test("the data layer lines up with the relief image", async ({ page }) => {
  await page.goto("/");
  const map = (await page.getByTestId("map").boundingBox())!;
  const layer = (await page.getByTestId("map-layer").boundingBox())!;
  const outset = (map.width * 2.5) / 600;
  expect(Math.abs(layer.x - (map.x - outset))).toBeLessThan(0.5);
  expect(Math.abs(layer.y - (map.y - outset))).toBeLessThan(0.5);
  expect(Math.abs(layer.width - (map.width + 2 * outset))).toBeLessThan(0.5);
});

test("the relief image loads", async ({ page }) => {
  await page.goto("/");
  const image = page.getByRole("img", { name: /relief map/i });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});

test("switching layers changes the map and its key", async ({ page }) => {
  await page.goto("/");
  const layer = page.getByTestId("map-layer");
  const before = await layer.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await expect(page.getByText("Golden hours, 2026–30")).toBeVisible();
  const earthButton = page.getByRole("group", { name: "Map layer" }).getByRole("button", { name: "Earth view" });
  await earthButton.click();
  await expect(earthButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Hours with Earth in view, 2026–30")).toBeVisible();
  await expect.poll(() => layer.evaluate((el: HTMLCanvasElement) => el.toDataURL())).not.toBe(before);
});

test("clicking a pin selects that site and updates the address and card", async ({ page }) => {
  await page.goto("/");
  await pin(page, /^IM-2 Athena/).click();
  await expect(page).toHaveURL(/\?site=im-2$/);
  await expect(page.getByLabel("Landing site")).toHaveValue("im-2");
  await expect(pin(page, /^IM-2 Athena/)).toHaveAttribute("aria-pressed", "true");
  await expect(card(page).getByRole("heading", { name: "IM-2 Athena" })).toBeVisible();
});

test("a pin and a quick date change both survive a slow connection", async ({ page }) => {
  await page.route(/_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto("/");
  await pin(page, /^IM-2 Athena/).click();
  await page.getByLabel("Date and time, UTC").fill("2028-02-29T12:00");
  await expect(page).toHaveURL(/site=im-2&t=2028-02-29T12:00Z$/, { timeout: 8000 });
});

test("sites outside the map are not drawn but still get a card", async ({ page }) => {
  await page.goto("/?site=apollo-11");
  await expect(card(page).getByRole("heading", { name: "Apollo 11" })).toBeVisible();
  await expect(card(page)).toContainText("outside the south polar map");
  await expect(card(page)).toContainText("0.67°N 23.47°E");
  await expect(pin(page, /^Apollo 11/)).toHaveCount(0);
});

test("a custom site on the map gets a pin and a terrain warning, but no share", async ({ page }) => {
  await page.goto("/?lat=-85.25&lon=120");
  await expect(card(page)).toContainText("Flat horizon: terrain not included");
  const customPin = page.getByRole("img", { name: "Custom site, 85.25°S 120.00°E" });
  await expect(customPin).toBeVisible();
  await expect(customPin).not.toContainText("%");
});

test("a landing too near the end of the data shows no result", async ({ page }) => {
  await page.goto("/?t=2030-12-25T00:00Z");
  await expect(card(page)).toContainText("runs past our data");
  await expect(card(page)).not.toContainText("of 14 days");
});

test("a countdown near the end of the data never claims a full search", async ({ page }) => {
  await page.goto("/?t=2030-12-10T00:00Z");
  await expect(card(page)).toContainText("of 14 days");
  await expect(card(page)).not.toContainText("Not in 60 days");
});

test("the wording follows the chosen layer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("sees the Sun and Earth together")).toBeVisible();
  await page.getByRole("button", { name: "Sunlight" }).click();
  await expect(page.getByText("sees the Sun most often")).toBeVisible();
});

test("a broken site file shows a notice and no number, and retry recovers", async ({ page }) => {
  let isBroken = true;
  await page.route("**/data/horizon/shackleton-rim.json", async (route) => {
    if (isBroken) await route.fulfill({ status: 200, contentType: "application/json", body: '{"site":"wrong"}' });
    else await route.continue();
  });
  await page.goto("/");
  await expect(card(page).getByRole("alert")).toContainText("failed its accuracy checks");
  await expect(card(page)).not.toContainText("of 14 days");
  isBroken = false;
  await card(page).getByRole("button", { name: "Try again" }).click();
  await expect(card(page)).toContainText("14 of 14 days");
});

test("a missing map file keeps the relief and pins and says the layer is unavailable", async ({ page }) => {
  await page.route("**/data/map/golden-grid.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "A data file is missing." })).toBeVisible();
  await expect(page.getByRole("img", { name: /relief map/i })).toBeVisible();
  await expect(page.getByTestId("map-layer")).toHaveCount(0);
  await expect(pin(page, /^IM-2 Athena/)).toBeVisible();
});

test("the card shows the ellipse warning and carries the choice to the next page", async ({ page }) => {
  await page.goto("/?site=im-2");
  await expect(card(page)).toContainText("For this exact point; ground nearby can differ.");
  await expect(card(page).getByRole("link", { name: /Landing Ellipse/ })).toHaveAttribute("href", "/ellipse?site=im-2");
  await card(page).getByRole("link", { name: /See the sky from here/ }).click();
  await expect(page).toHaveURL(/\/sky\?site=im-2$/);
});

test("nothing overflows, at any supported width", async ({ page, isMobile }) => {
  test.skip(isMobile, "sizes are set here");
  for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(card(page)).toContainText("14 of 14 days");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
