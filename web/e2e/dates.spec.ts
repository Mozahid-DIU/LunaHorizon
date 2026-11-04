import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bestDates, slipPlanner } from "../src/lib/planning";
import { loadEphemeris, loadProfile } from "../src/lib/testData";

const DAY_MS = 86_400_000;
const MISSION_MS = 14 * DAY_MS;
const DEFAULT_TIME = Date.UTC(2027, 11, 29, 21);
const SITES = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "sites.json"), "utf-8")) as { id: string; name: string; lat: number; lon: number }[];

const shown = (hours: number) => `${Math.floor(hours)} h`;
const ready = (page: Page) => expect(page.getByTestId("best-date").first()).toBeVisible({ timeout: 30000 });

function direct(id: string, landingMs: number) {
  const { lat, lon } = SITES.find((site) => site.id === id)!;
  const site = { lat, lon };
  const profile = loadProfile(id);
  const eph = loadEphemeris([2027, 2028, 2029]);
  const near = (other: string) => {
    const found = SITES.find((s) => s.id === other)!;
    return { id: other, site: { lat: found.lat, lon: found.lon }, profile: loadProfile(other) };
  };
  return {
    best: bestDates(eph, site, profile, landingMs, 365 * DAY_MS, MISSION_MS, 5, MISSION_MS),
    slip: slipPlanner(eph, { site, profile }, landingMs, MISSION_MS, [1, 7, 30], [near("im-2"), near("im-1")]),
  };
}

test("the best dates equal a direct call to bestDates", async ({ page }) => {
  const { best } = direct("shackleton-rim", DEFAULT_TIME);
  await page.goto("/dates");
  await ready(page);
  const dates = await page.getByTestId("best-date").allInnerTexts();
  expect(dates.map((text) => Date.parse(text.replace(" UTC", "Z").replace(",", "")))).toEqual(best.map(({ landingMs }) => landingMs));
  expect(await page.getByTestId("best-golden").allInnerTexts()).toEqual(best.map(({ score }) => shown(score.goldenHours)));
});

test("the slip rows equal a direct call to slipPlanner", async ({ page }) => {
  const { slip } = direct("shackleton-rim", DEFAULT_TIME);
  await page.goto("/dates");
  await ready(page);
  const golden = await page.getByTestId("slip-golden").allInnerTexts();
  expect(golden).toEqual([slip.baseline.goldenHours, ...slip.rows.map((row) => row.score!.goldenHours)].map(shown));
  await expect(page.getByRole("rowheader", { name: "1 day later" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "7 days later" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "30 days later" })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /IM-2 Athena, \d+ km away/ })).toBeVisible();
});

test("the headline says when the chosen date is the best", async ({ page }) => {
  await page.goto("/dates");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This date is the best in 12 months: 336 Golden hours.");
});

test("using a date moves the selection and searches again", async ({ page }) => {
  await page.goto("/dates?site=im-2&t=2028-02-29T00:00Z");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("gives");
  const chosen = await page.getByTestId("best-date").first().innerText();
  await page.getByRole("button", { name: "Use this date" }).first().click();
  await expect(page).not.toHaveURL(/t=2028-02-29/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByLabel("Date and time, UTC")).not.toHaveValue("2028-02-29T00:00");
  await expect(page.getByText("Chosen date", { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("best-date").first()).toHaveText(chosen);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("This date is the best");
});

test("a row links to its sky and to a comparison", async ({ page }) => {
  await page.goto("/dates?site=im-2&t=2028-02-29T00:00Z");
  await ready(page);
  const row = page.getByRole("listitem").filter({ hasText: "Use this date" }).first();
  await expect(row.getByRole("link", { name: "Compare" })).toHaveAttribute("href", /^\/compare\?site=im-2&t=2028-02-29T00:00Z&with=im-2@2028-/);
  await expect(row.getByRole("link", { name: "Sky" })).toHaveAttribute("href", /^\/sky\?site=im-2&t=2028-/);
});

test("the search leaves the page running", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { last: 0, longest: 0 };
    Object.assign(window, { gaps: state });
    const tick = (now: number) => {
      if (state.last) state.longest = Math.max(state.longest, now - state.last);
      state.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // held back, so the whole search happens after the page has settled and the measuring began
  await page.route(/subpoints-2028/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  const workerUrls: string[] = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  await page.goto("/dates");
  await expect(page.getByRole("status").filter({ hasText: "Searching" })).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => Object.assign((window as unknown as { gaps: { longest: number } }).gaps, { longest: 0 }));
  await ready(page);
  const longest = await page.evaluate(() => (window as unknown as { gaps: { longest: number } }).gaps.longest);
  expect(longest).toBeLessThan(250);
  expect(workerUrls).toHaveLength(1);
});

test("changing the site stops the old search", async ({ page }) => {
  await page.goto("/dates");
  await page.getByLabel("Landing site").selectOption("im-2");
  await page.getByLabel("Landing site").selectOption("im-1");
  await ready(page);
  await expect(page.getByText("Best 14-day landings from IM-1 Odysseus")).toBeVisible();
  const { best } = direct("im-1", DEFAULT_TIME);
  await expect(page.getByTestId("best-golden").first()).toHaveText(shown(best[0].score.goldenHours));
});

test("a far site has no nearby rows, and says what nearby means", async ({ page }) => {
  // Chang'e 4 sits alone on the far side; no other listed site is within 500 km
  await page.goto("/dates?site=change-4");
  await ready(page);
  await expect(page.getByRole("rowheader", { name: /km away/ })).toHaveCount(0);
  await expect(page.getByText("within 500 km")).toBeVisible();
});

test("a custom site with terrain is searched on its real horizon", async ({ page }) => {
  await page.goto("/dates?lat=-85.25&lon=120");
  await ready(page);
  await expect(page.getByText("Horizon computed in your browser")).toBeVisible();
});

test("a flat site is labelled and not set against real terrain", async ({ page }) => {
  await page.goto("/dates?lat=10&lon=20");
  await ready(page);
  await expect(page.getByText("Flat horizon: terrain not included")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /km away/ })).toHaveCount(0);
});

test("a date too late for a mission says so", async ({ page }) => {
  await page.goto("/dates?t=2030-12-25T00:00Z");
  await expect(page.getByText("runs past our data")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Best landing dates");
});

test("a search near the end of the data says where it stopped", async ({ page }) => {
  await page.goto("/dates?t=2030-06-01T00:00Z");
  await ready(page);
  await expect(page.getByText("The search stops where our data ends")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("12 months");
  await expect(page.getByRole("cell", { name: "Past our data" })).toHaveCount(0);
});

test("a late slip reads past our data", async ({ page }) => {
  await page.goto("/dates?t=2030-12-10T00:00Z");
  await ready(page);
  await expect(page.getByRole("cell", { name: "Past our data" })).toBeVisible();
});

test("a failed data file shows no numbers and can be retried", async ({ page }) => {
  let fails = true;
  await page.route(/subpoints-2028/, (route) => (fails ? route.abort() : route.continue()));
  await page.goto("/dates");
  await expect(page.getByText("No results to show")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("best-date")).toHaveCount(0);
  fails = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await ready(page);
});

test("a search that crashes says so and can be retried", async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    let crashes = 1;
    window.Worker = class extends RealWorker {
      postMessage(message: unknown) {
        if (crashes > 0) {
          crashes -= 1;
          setTimeout(() => this.onerror?.(new ErrorEvent("error")), 0);
          return;
        }
        super.postMessage(message);
      }
    };
  });
  await page.goto("/dates");
  await expect(page.getByText("The calculation stopped before it finished.")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Try again" }).click();
  await ready(page);
});

test("the page fits without sideways scrolling", async ({ page }) => {
  await page.goto("/dates");
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
