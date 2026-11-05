import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { alternatives } from "../src/lib/brief";
import { parseEllipse } from "../src/lib/data/validate";
import { ellipseScores, zoneSummary } from "../src/lib/ellipse";
import { bestDates } from "../src/lib/planning";
import { formatUtc } from "../src/lib/selection";
import { siteSummary } from "../src/lib/siteSummary";
import { findSite } from "../src/lib/sites";
import { loadEphemeris, loadProfile } from "../src/lib/testData";
import { formatHours } from "../src/lib/timeline";

const DAY_MS = 86_400_000;
const LANDING = Date.UTC(2027, 11, 29, 21);
const DATA = join(__dirname, "..", "public", "data");
const page1 = (page: Page) => page.getByRole("region", { name: "Mission Brief, page 1" });
const page2 = (page: Page) => page.getByRole("region", { name: "Mission Brief, page 2" });
const printButton = (page: Page) => page.getByTestId("brief-print");

/** For each printed page: nothing runs past the page, and nothing reaches its foot. */
const roomAboveFoot = (page: Page) =>
  page.locator("section[aria-label^='Mission Brief, page']").evaluateAll((sheets) =>
    sheets.map((sheet) => {
      const foot = sheet.querySelector("footer")!.getBoundingClientRect().top;
      const lowest = Math.max(...[...sheet.children].filter((child) => child.tagName !== "FOOTER").map((child) => child.getBoundingClientRect().bottom));
      return sheet.scrollHeight <= sheet.clientHeight && lowest <= foot;
    }),
  );

/** Every part of the brief is in once the print button is ready. */
async function finished(page: Page) {
  await expect(printButton(page)).toBeEnabled({ timeout: 150_000 });
  await expect(printButton(page)).toHaveText("Print or save as PDF");
}

test.describe("the Shackleton rim brief", () => {
  test.setTimeout(240_000);

  test("its numbers are the engine's, for this site and date", async ({ page }) => {
    const eph = loadEphemeris([2027, 2028, 2029]);
    const site = findSite("shackleton-rim")!;
    const profile = loadProfile("shackleton-rim");
    const summary = siteSummary(eph, site, profile, LANDING)!;
    const zone = zoneSummary(ellipseScores(eph, parseEllipse(JSON.parse(readFileSync(join(DATA, "horizon", "shackleton-rim-ellipse.json"), "utf-8")), site), LANDING)!, 500);
    const best = alternatives(bestDates(eph, site, profile, LANDING, 365 * DAY_MS, 14 * DAY_MS, 5, 14 * DAY_MS), LANDING);

    await page.goto("/brief");
    await finished(page);
    await expect(page1(page).getByTestId("brief-golden")).toHaveText(`${Math.floor(summary.hours.golden)} of 336`);
    await expect(page1(page).getByTestId("brief-stamp")).toHaveText("GOLDEN · 14 OF 14 DAYS");
    await expect(page1(page).getByTestId("brief-verdict")).toContainText("14d 3h");
    await expect(page1(page).getByTestId("brief-verdict")).toContainText("3h after the mission ends");
    await expect(page1(page).getByTestId("brief-verdict")).toContainText("22d 22h");
    const ring = page1(page).getByTestId("brief-zone");
    for (const [name, item] of [["on-target", zone.target], ["best", zone.best], ["median", zone.median], ["worst", zone.worst]] as const) {
      await expect(ring.getByTestId(`zone-${name}`).locator("strong")).toHaveText(formatHours(item.score.goldenHours));
    }
    await expect(ring.getByTestId("zone-worst")).toContainText("500 m west");
    await expect(page1(page).getByTestId("brief-where")).toContainText("NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m)");

    const rows = page2(page).getByTestId("brief-dates").locator("tbody tr");
    await expect(rows).toHaveCount(best.length);
    for (const [i, { landingMs, score }] of best.entries()) {
      await expect(rows.nth(i).locator("td").nth(0)).toHaveText(formatUtc(landingMs));
      await expect(rows.nth(i).locator("td").nth(1)).toHaveText(formatHours(score.goldenHours));
    }
    await expect(page2(page).getByTestId("brief-nudge")).toContainText("Move 1 km north and the landing loses all 336 Golden hours; a day's delay costs 21.");
    await expect(page2(page).getByTestId("brief-power")).toContainText("Survives all 14 days.");
    await expect(page2(page).getByTestId("brief-evidence")).toContainText("128 / 128");
    const watch = page2(page).getByTestId("brief-watch").locator("li");
    await expect(watch.nth(0)).toContainText("Landing accuracy matters.");
    await expect(watch.nth(1)).toContainText("A day late costs 21 Golden hours.");
  });

  test("the QR code and the link open this same brief", async ({ page }) => {
    await page.goto("/brief?site=im-2&t=2028-02-01T12:00Z");
    await expect(page1(page)).toBeVisible({ timeout: 60_000 });
    const url = await page.getByTestId("brief-qr").getAttribute("data-url");
    expect(url).toMatch(/\/brief\?site=im-2&t=2028-02-01T12:00Z$/);
  });

  test("printing shows only the two A4 pages, and the PDF has exactly two", async ({ page, browserName }) => {
    await page.goto("/brief");
    await finished(page);
    if (browserName === "chromium") {
      const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
      expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2);
    }
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(printButton(page)).toBeHidden();
    const heights = await page.locator("section[aria-label^='Mission Brief, page']").evaluateAll((sheets) => sheets.map((s) => s.getBoundingClientRect().height));
    // 297 mm at 96 px per inch
    expect(heights.map((h) => Math.round(h))).toEqual([1123, 1123]);
    expect(await roomAboveFoot(page)).toEqual([true, true]);
  });
});

test("a site without a landing zone or height tiles says why, and still fits its two pages", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/brief?site=apollo-11");
  await finished(page);
  await expect(page1(page).getByTestId("brief-where")).toContainText("SLDEM2015 (NASA LRO LOLA + JAXA SELENE/Kaguya");
  await page.emulateMedia({ media: "print" });
  expect(await roomAboveFoot(page)).toEqual([true, true]);
  await page.emulateMedia({ media: "screen" });
  await expect(page1(page)).toContainText("this site is not one of them");
  await expect(page2(page)).toContainText("they cover only the south polar region, south of 65° S");
  await expect(page2(page).getByTestId("brief-power")).toContainText("Runs out of power after 20h.");
  await expect(page2(page).getByTestId("brief-watch")).toContainText("The Sun is down at landing.");
});

test("a site on the coarse global map says so, and still fits its pages", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/brief?site=apollo-12");
  await finished(page);
  await expect(page1(page)).toContainText("The ground near this site comes from NASA's global LOLA map");
  await expect(page1(page).getByTestId("brief-where")).toContainText("NASA LRO LOLA global map (ldem_128");
  await page.emulateMedia({ media: "print" });
  expect(await roomAboveFoot(page)).toEqual([true, true]);
});

test("a far-side site explains why it has no Golden hours", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/brief?site=change-4");
  await expect(page1(page).getByTestId("brief-stamp")).toHaveText("NO GOLDEN HOURS", { timeout: 60_000 });
  await expect(page1(page)).toContainText("Earth never rises at this site");
});

test("printing while parts are still running is marked incomplete", async ({ page }) => {
  await page.goto("/brief");
  await expect(page1(page)).toBeVisible({ timeout: 60_000 });
  await expect(printButton(page)).toBeDisabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("brief-incomplete")).toBeVisible();
});

test("a mission past our data gets no brief", async ({ page }) => {
  await page.goto("/brief?t=2030-12-25T00:00Z");
  await expect(page.getByText("runs past our data, which ends on 31 Dec 2030")).toBeVisible({ timeout: 60_000 });
  await expect(page1(page)).toHaveCount(0);
});

test("nothing overflows, at any supported width", async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  await page.goto("/brief?site=apollo-11");
  await expect(page1(page)).toBeVisible({ timeout: 60_000 });
  for (const width of isMobile ? [320, 390] : [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `at ${width}px`).toBe(0);
  }
});
