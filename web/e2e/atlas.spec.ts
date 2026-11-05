import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const R_KM = 1737.4;
const MAP_RADIUS_KM = 300;
const MAP_STEP_KM = 5;
const MAP_SIZE = 121;

interface MapFile {
  golden: (number | null)[];
  lit: (number | null)[];
  earth: (number | null)[];
}

const mapFile = (): MapFile => JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "map", "golden-grid.json"), "utf-8")) as MapFile;

/** The map cell's value under a point on the map image, read from the file the way the pipeline wrote it. */
function cellValueAt(leftShare: number, topShare: number, layer: keyof MapFile): number | null {
  const x = (leftShare - 0.5) * 2 * MAP_RADIUS_KM;
  const y = (0.5 - topShare) * 2 * MAP_RADIUS_KM;
  const col = Math.round((x + MAP_RADIUS_KM) / MAP_STEP_KM);
  const row = Math.round((MAP_RADIUS_KM - y) / MAP_STEP_KM);
  return mapFile()[layer][row * MAP_SIZE + col];
}

function latLonAt(leftShare: number, topShare: number): { lat: number; lon: number } {
  const x = (leftShare - 0.5) * 2 * MAP_RADIUS_KM;
  const y = (0.5 - topShare) * 2 * MAP_RADIUS_KM;
  const r = Math.hypot(x, y);
  return { lat: (2 * Math.atan(r / (2 * R_KM)) * 180) / Math.PI - 90, lon: (Math.atan2(x, y) * 180) / Math.PI };
}

const percent = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;
/** The map image shares of a cell's centre node, where a pointer is furthest from any cell edge. */
const cellCentre = (row: number, col: number) => [(col * MAP_STEP_KM) / (2 * MAP_RADIUS_KM), (row * MAP_STEP_KM) / (2 * MAP_RADIUS_KM)] as const;

/** The address holds the pointer's place; a pointer lands on whole pixels, about 0.6 km on this map. */
async function expectChosen(page: Page, lat: number, lon: number) {
  await expect(page).toHaveURL(/lat=/);
  const url = new URL(page.url());
  const chosen = { lat: Number(url.searchParams.get("lat")), lon: Number(url.searchParams.get("lon")) };
  const r = (deg: number) => 2 * R_KM * Math.tan((((90 + deg) / 2) * Math.PI) / 180);
  const toPlane = (p: { lat: number; lon: number }) => ({ x: r(p.lat) * Math.sin((p.lon * Math.PI) / 180), y: r(p.lat) * Math.cos((p.lon * Math.PI) / 180) });
  const a = toPlane(chosen);
  const b = toPlane({ lat, lon });
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1.2);
}
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
  await expect(page).toHaveURL(/site=im-2&t=2028-02-29T12:00Z$/, { timeout: 20_000 });
});

test("sites outside the map are not drawn but still get a card", async ({ page }) => {
  await page.goto("/?site=apollo-11");
  await expect(card(page).getByRole("heading", { name: "Apollo 11" })).toBeVisible();
  await expect(card(page)).toContainText("outside the south polar map");
  await expect(card(page)).toContainText("0.67°N 23.47°E");
  await expect(pin(page, /^Apollo 11/)).toHaveCount(0);
});

test("a custom site beyond the height tiles says it has no terrain", async ({ page }) => {
  await page.goto("/?lat=10&lon=100");
  await expect(card(page)).toContainText("Flat horizon: terrain not included");
});

test("a custom site on the map gets a pin and real terrain, but no share", async ({ page }) => {
  await page.goto("/?lat=-85.25&lon=120");
  await expect(card(page)).toContainText("computed in your browser");
  await expect(card(page)).toContainText("of 14 days");
  await expect(card(page)).not.toContainText("Flat horizon");
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

test("the card sets the map's cell beside the site's own share, from the files", async ({ page }) => {
  await page.goto("/");
  const versus = page.getByTestId("map-versus");
  // Shackleton rim: the 5 km cell under it, and the share its own horizon gives
  const rimCell = mapFile().golden[61 * MAP_SIZE + 59]!;
  await expect(versus.getByTestId("versus-cell")).toHaveText(percent(rimCell));
  await expect(versus.getByTestId("versus-cell")).toHaveText("16.3%");
  await expect(versus.getByTestId("versus-own")).toHaveText("45.4%");
  await page.getByRole("button", { name: "Sunlight" }).click();
  await expect(versus.getByTestId("versus-cell")).toHaveText(percent(mapFile().lit[61 * MAP_SIZE + 59]!));
  await expect(versus).toContainText("sunlit");
});

test("pointing at the map reads the 5 km cell there, and a click checks that exact point", async ({ page, isMobile }) => {
  test.skip(isMobile, "a mouse points; a phone taps");
  await page.goto("/");
  await expect(page.getByTestId("map-versus")).toBeVisible();
  const map = page.getByTestId("map");
  const box = (await map.boundingBox())!;
  const [left, top] = cellCentre(77, 46);
  await page.mouse.move(box.x + box.width * left, box.y + box.height * top);
  const tip = page.getByTestId("cell-tip");
  await expect(tip).toContainText(`${percent(cellValueAt(left, top, "golden")!)} golden`);
  await expect(tip).toContainText("5 km cell");
  // a right click chooses nothing
  await page.mouse.click(box.x + box.width * left, box.y + box.height * top, { button: "right" });
  await expect(page).not.toHaveURL(/lat=/);
  await page.mouse.click(box.x + box.width * left, box.y + box.height * top);
  const { lat, lon } = latLonAt(left, top);
  await expectChosen(page, lat, lon);
  await expect(card(page)).toContainText("Your point");
  await expect(card(page)).toContainText("computed in your browser");
  const versus = page.getByTestId("map-versus");
  await expect(versus.getByTestId("versus-cell")).toHaveText(percent(cellValueAt(left, top, "golden")!));
  // the point's own five-year share is counted in the browser
  await expect(versus.getByTestId("versus-own")).toHaveText(/^\d+\.\d%$/, { timeout: 60_000 });
});

test("on a phone a tap reads the cell and a button checks the point", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone taps");
  await page.goto("/");
  await expect(page.getByTestId("map-versus")).toBeVisible();
  const box = (await page.getByTestId("map").boundingBox())!;
  const [left, top] = cellCentre(77, 46);
  await page.touchscreen.tap(box.x + box.width * left, box.y + box.height * top);
  const sheet = page.getByTestId("cell-sheet");
  await expect(sheet).toContainText(`${percent(cellValueAt(left, top, "golden")!)} golden`);
  await expect(page).toHaveURL(/^[^?]*\/$/);
  await sheet.getByRole("button", { name: /^Check this point/ }).tap();
  const { lat, lon } = latLonAt(left, top);
  await expectChosen(page, lat, lon);
  await expect(card(page)).toContainText("Your point");
  await expect(sheet).toHaveCount(0);
});

test("a custom point at a curated site counts the same five-year share as the site's file, give or take the browser horizon", async ({ page }) => {
  // IM-2's own coordinates as a custom point: the browser builds its horizon from tiles and counts 2026-30
  await page.goto("/?lat=-84.78&lon=29.13");
  const own = page.getByTestId("versus-own");
  await expect(own).toHaveText(/^\d+\.\d%$/, { timeout: 90_000 });
  const shares = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "site-shares.json"), "utf-8")) as Record<string, { golden: number }>;
  const counted = Number((await own.innerText()).replace("%", ""));
  expect(Math.abs(counted - shares["im-2"].golden / 10)).toBeLessThan(1);
});

test("a click on a pin still chooses that site, not a custom point", async ({ page }) => {
  await page.goto("/");
  await pin(page, /^IM-2 Athena/).click();
  await expect(page).toHaveURL(/site=im-2/);
  await expect(page).not.toHaveURL(/lat=/);
});
