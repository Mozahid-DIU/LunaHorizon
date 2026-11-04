import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_SETUP, formatEnergy, lowestChargePct, powerHeadline, runPower, type PowerSetup } from "../src/lib/powerPlan";
import { loadEphemeris, loadProfile } from "../src/lib/testData";

const DEFAULT_TIME = Date.UTC(2027, 11, 29, 21);
const SITES = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "sites.json"), "utf-8")) as { id: string; lat: number; lon: number }[];
const heading = (page: Page) => page.getByRole("heading", { level: 1 });

/** The engine's own run, with nothing from the page. */
function direct(id: string, landingMs: number, setup: PowerSetup) {
  const { lat, lon } = SITES.find((site) => site.id === id)!;
  const result = runPower(loadEphemeris([2027, 2028]), { lat, lon }, loadProfile(id), landingMs, setup);
  if (result.status !== "ready") throw new Error("no run");
  return result.run;
}

async function expectStats(page: Page, run: ReturnType<typeof direct>, setup: PowerSetup) {
  await expect(page.getByTestId("generated")).toHaveText(formatEnergy(run.generatedWh));
  await expect(page.getByTestId("wasted")).toHaveText(formatEnergy(run.wastedWh));
  await expect(page.getByTestId("unmet")).toHaveText(formatEnergy(run.unmetWh));
  await expect(page.getByTestId("min-charge")).toHaveText(`${lowestChargePct(run.minSocWh, setup.capacityWh)}%`);
}

test("the default example equals a direct call to simulatePower", async ({ page }) => {
  const run = direct("shackleton-rim", DEFAULT_TIME, DEFAULT_SETUP);
  const { lead, emphasis } = powerHeadline(run, DEFAULT_TIME, DEFAULT_SETUP.days);
  await page.goto("/power");
  await expect(heading(page)).toHaveText(`${lead}${emphasis}`);
  await expectStats(page, run, DEFAULT_SETUP);
});

test("a long night empties the battery, and the page says when", async ({ page }) => {
  const setup = { ...DEFAULT_SETUP, days: 30 };
  const run = direct("apollo-12", DEFAULT_TIME, setup);
  expect(run.survives).toBe(false);
  const { lead, emphasis } = powerHeadline(run, DEFAULT_TIME, setup.days);
  await page.goto("/power?site=apollo-12");
  await page.getByLabel("Mission length").selectOption("30");
  await expect(heading(page)).toHaveText(`${lead}${emphasis}`);
  // a vertical line has no width, so it is checked as present; the legend says when in words
  await expect(page.getByTestId("empty-marker")).toHaveCount(1);
  await expect(page.getByText(/^Battery empty, /)).toBeVisible();
  await expectStats(page, run, setup);
});

test("changing the lander changes the result to the engine's", async ({ page }) => {
  const setup = { ...DEFAULT_SETUP, mount: "vertical" as const, facingDeg: 90, loadW: 300, capacityWh: 500 };
  const run = direct("shackleton-rim", DEFAULT_TIME, setup);
  await page.goto("/power");
  await expect(heading(page)).toContainText("Survives");
  await page.getByLabel("Mounting").selectOption("vertical");
  await page.getByLabel("Facing (°)").fill("90");
  await page.getByLabel("Load (W)").fill("300");
  await page.getByLabel("Battery capacity (Wh)").fill("500");
  const { lead, emphasis } = powerHeadline(run, DEFAULT_TIME, setup.days);
  await expect(heading(page)).toHaveText(`${lead}${emphasis}`);
  await expectStats(page, run, setup);
});

test("a value out of range is refused plainly and shows no result", async ({ page }) => {
  await page.goto("/power");
  await expect(page.getByTestId("generated")).toBeVisible();
  const efficiency = page.getByLabel("Panel efficiency (%)");
  await efficiency.fill("75");
  await expect(page.getByRole("alert").filter({ hasText: "out of range" })).toContainText("Panel efficiency must be from 1 to 40%.");
  await expect(efficiency).toHaveAttribute("aria-invalid", "true");
  // the reason is tied to the field, so a screen reader reads it there
  await expect(efficiency).toHaveAccessibleDescription("Panel efficiency must be from 1 to 40%.");
  await expect(page.getByTestId("generated")).toHaveCount(0);
  await expect(heading(page)).toHaveText("Does the battery last?");
  await page.getByRole("button", { name: "Back to the example" }).click();
  await expect(page.getByTestId("generated")).toBeVisible();
});

test("a bad facing does not block a panel that tracks the Sun", async ({ page }) => {
  await page.goto("/power");
  await page.getByLabel("Mounting").selectOption("vertical");
  await page.getByLabel("Facing (°)").fill("999");
  await expect(page.getByTestId("generated")).toHaveCount(0);
  await page.getByLabel("Mounting").selectOption("tracking");
  await expect(page.getByTestId("generated")).toBeVisible();
});

test("the chart describes its result in words", async ({ page }) => {
  await page.goto("/power");
  await expect(page.getByRole("img", { name: /^Survives all 14 days\. Lowest charge \d+%\.$/ })).toBeVisible();
});

test("the model's limits are on the page", async ({ page }) => {
  await page.goto("/power");
  await expect(page.getByText("Illustrative only.")).toBeVisible();
  await expect(page.getByText("Not modelled: panel and battery temperature")).toBeVisible();
});

test("a mission past the data says so", async ({ page }) => {
  await page.goto("/power?t=2030-12-25T00:00Z");
  await expect(page.getByText("runs past our data")).toBeVisible({ timeout: 30000 });
});

test("the page fits without sideways scrolling", async ({ page }) => {
  await page.goto("/power");
  await expect(page.getByTestId("generated")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
