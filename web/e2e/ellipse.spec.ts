import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ellipseHeadline, ellipseScores, pointName, zoneSummary } from "../src/lib/ellipse";
import { loadEphemeris } from "../src/lib/testData";

const DEFAULT_TIME = Date.UTC(2027, 11, 29, 21);
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const shown = (hours: number) => `${Math.floor(hours)} h`;

/** The ellipse file read straight from disk, and scored with the engine, nothing from the page. */
function direct(id: string, landingMs: number) {
  const file = JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "horizon", `${id}-ellipse.json`), "utf-8"));
  return ellipseScores(loadEphemeris([2027, 2028]), { site: id, points: file.points, touchdown: file.touchdown ?? null }, landingMs)!;
}

test("best, median and worst equal the ellipse file scored by the engine", async ({ page }) => {
  const scores = direct("im-2", DEFAULT_TIME);
  await page.goto("/ellipse?site=im-2");
  for (const ring of [100, 500, 1000]) {
    const zone = zoneSummary(scores, ring);
    const label = ring === 1000 ? "Within 1 km" : `Within ${ring} m`;
    await page.getByRole("button", { name: label }).click();
    const { lead, emphasis } = ellipseHeadline(zone, ring);
    await expect(heading(page)).toHaveText(`${lead}${emphasis}`);
    for (const [id, item] of [["zone-best", zone.best], ["zone-median", zone.median], ["zone-worst", zone.worst], ["zone-target", zone.target]] as const) {
      await expect(page.getByTestId(id)).toContainText(shown(item.score.goldenHours));
      await expect(page.getByTestId(id)).toContainText(pointName(item.point));
    }
  }
});

test("the plot shows every point and marks the zone", async ({ page }) => {
  await page.goto("/ellipse?site=shackleton-rim");
  await expect(page.getByTestId("zone-point")).toHaveCount(25);
  await page.getByRole("button", { name: "Within 100 m" }).click();
  await expect(page.getByRole("button", { name: "Within 100 m" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("List all 9 points in this zone")).toBeVisible();
});

test("IM-2 tells Athena's story with its sources and its own spot's hours", async ({ page }) => {
  const scores = direct("im-2", DEFAULT_TIME);
  await page.goto("/ellipse?site=im-2");
  const story = page.getByRole("region", { name: "Where Athena came down" });
  await expect(story).toContainText("369 m from the target, bearing 151°");
  await expect(story.getByRole("link", { name: "LROC images" })).toHaveAttribute("href", "https://lroc.im-ldi.com/images/1408");
  await expect(page.getByTestId("athena-hours")).toContainText(shown(scores.touchdown!.score.goldenHours));
  await expect(page.getByTestId("athena-marker")).toHaveCount(1);
});

test("a site without zone data says where it exists", async ({ page }) => {
  await page.goto("/ellipse?site=apollo-11&t=2028-01-05T00:00Z");
  await expect(heading(page)).toHaveText("Landing zone");
  await expect(page.getByRole("link", { name: "IM-2 Athena" })).toHaveAttribute("href", "/ellipse?site=im-2&t=2028-01-05T00:00Z");
  await expect(page.getByTestId("zone-point")).toHaveCount(0);
});

test("only IM-2 has an Athena story", async ({ page }) => {
  await page.goto("/ellipse?site=im-1");
  await expect(page.getByTestId("zone-best")).toBeVisible();
  await expect(page.getByRole("region", { name: "Where Athena came down" })).toHaveCount(0);
});

test("a mission past the data says so", async ({ page }) => {
  await page.goto("/ellipse?site=im-2&t=2030-12-25T00:00Z");
  await expect(page.getByText("runs past our data")).toBeVisible({ timeout: 30000 });
});

test("the page fits without sideways scrolling", async ({ page }) => {
  await page.goto("/ellipse?site=im-2");
  await expect(page.getByTestId("zone-best")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
