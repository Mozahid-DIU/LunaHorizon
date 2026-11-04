import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { missionScore } from "../src/lib/planning";
import { loadEphemeris, loadProfile } from "../src/lib/testData";

const DAY_MS = 86_400_000;
const MISSION_MS = 14 * DAY_MS;
const DEFAULT_TIME = Date.UTC(2027, 11, 29, 21);
const LATER_TIME = Date.UTC(2028, 1, 29, 12);
const SITES = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "sites.json"), "utf-8")) as { id: string; name: string; lat: number; lon: number }[];

const card = (page: Page, name: string) => page.getByRole("region", { name });
const golden = (page: Page, name: string) => card(page, name).getByTestId("golden-hours");
const add = (page: Page) => page.getByRole("button", { name: "Add a site or date" });

/** Hours from the engine with nothing from the page, for one curated site. */
function directHours(id: string, landingMs: number) {
  const { lat, lon } = SITES.find((site) => site.id === id)!;
  const eph = loadEphemeris([2027, 2028]);
  const score = missionScore(eph, { lat, lon }, loadProfile(id), landingMs, MISSION_MS);
  return [score.goldenHours, score.litHours, score.commsHours].map((hours) => `${Math.floor(hours)} h`);
}

test("starts with the chosen site and room to add", async ({ page }) => {
  await page.goto("/compare");
  await expect(golden(page, "Shackleton crater rim")).toHaveText("336 h");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sites and dates");
  await expect(add(page)).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("each column equals a direct calculation for that site", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=im-1");
  for (const id of ["shackleton-rim", "im-2", "im-1"]) {
    const [goldenHours, sun, comms] = directHours(id, DEFAULT_TIME);
    const column = card(page, SITES.find((site) => site.id === id)!.name.split(" (")[0]);
    await expect(column.getByTestId("golden-hours")).toHaveText(goldenHours);
    await expect(column.getByTestId("hours-Golden")).toHaveText(goldenHours);
    await expect(column.getByTestId("hours-Sun")).toHaveText(sun);
    await expect(column.getByTestId("hours-Comms")).toHaveText(comms);
  }
});

test("a column's own date is used for that column only", async ({ page }) => {
  await page.goto("/compare?with=shackleton-rim@2028-02-29T12:00Z");
  const [expected] = directHours("shackleton-rim", LATER_TIME);
  const cards = page.locator("section[aria-labelledby^=compare-column]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByTestId("golden-hours")).toHaveText("336 h");
  await expect(cards.nth(1).getByTestId("golden-hours")).toHaveText(expected);
  await expect(cards.nth(1)).toContainText("29 Feb 2028, 12:00 UTC");
});

test("the headline names the leader and the numbers agree with it", async ({ page }) => {
  await page.goto("/compare?with=im-2");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Shackleton crater rim leads by");
  await expect(card(page, "Shackleton crater rim").getByText("Most Golden hours")).toBeVisible();
  const best = parseInt((await golden(page, "Shackleton crater rim").innerText()), 10);
  const other = parseInt((await golden(page, "IM-2 Athena").innerText()), 10);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`${best - other} Golden hours.`);
  await expect(card(page, "IM-2 Athena").getByText(`${best - other} h behind`)).toBeVisible();
});

test("adding, changing and removing columns updates the address", async ({ page }) => {
  await page.goto("/compare");
  await expect(golden(page, "Shackleton crater rim")).toHaveText("336 h");
  await add(page).click();
  await expect(page).toHaveURL(/\?with=apollo-11$/);
  await add(page).click();
  await expect(page).toHaveURL(/\?with=apollo-11&with=apollo-12$/);
  await expect(add(page)).toHaveCount(0);

  await page.getByLabel("Site in column 2").selectOption("im-2");
  await expect(page).toHaveURL(/\?with=im-2&with=apollo-12$/);
  await page.getByLabel("Date in column 3, UTC").fill("2028-02-29T12:00");
  await expect(page).toHaveURL(/\?with=im-2&with=apollo-12@2028-02-29T12:00Z$/);

  await page.getByRole("button", { name: "Remove column 2" }).click();
  await expect(page).toHaveURL(/\?with=apollo-12@2028-02-29T12:00Z$/);
  await expect(card(page, "Apollo 12")).toContainText("29 Feb 2028");
});

test.describe("on a slow connection", () => {
  let delayed = 0;

  test.beforeEach(async ({ page }) => {
    delayed = 0;
    await page.route(/_rsc=/, async (route) => {
      delayed += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto("/compare");
    await expect(golden(page, "Shackleton crater rim")).toHaveText("336 h");
  });

  test("a quick second change keeps the first one", async ({ page }) => {
    await add(page).click();
    await add(page).click();
    await expect(page).toHaveURL(/\?with=apollo-11&with=apollo-12$/);
    expect(delayed).toBeGreaterThan(0);
  });

  test("clicking add again and again stops at three columns", async ({ page }) => {
    await add(page).click();
    await add(page).click();
    await add(page).click({ timeout: 500 }).catch(() => {});
    await expect(page).toHaveURL(/\?with=apollo-11&with=apollo-12$/);
    await expect(page.getByText("Compare shows three columns")).toHaveCount(0);
  });

  test("a change in the top bar and a new column both survive", async ({ page }) => {
    await page.getByLabel("Landing site").selectOption("im-2");
    await add(page).click();
    await expect(page).toHaveURL(/\?site=im-2&with=/);
  });

  test("a new column and a change in the top bar both survive", async ({ page }) => {
    // in one tick, so the top bar acts before the address has the new column
    await page.evaluate(() => {
      [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Add a site or date"))?.click();
      const siteBox = document.querySelector<HTMLSelectElement>('select[aria-label="Landing site"]')!;
      siteBox.value = "im-2";
      siteBox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page).toHaveURL(/\?site=im-2&with=apollo-11$/);
  });
});

test("removing a column leaves another column's open form alone", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=im-1");
  await page.getByLabel("Site in column 2").selectOption("custom");
  await page.getByLabel("Latitude").fill("-85.25");
  await page.getByRole("button", { name: "Remove column 2" }).click();
  await expect(page).toHaveURL(/\?with=im-1$/);
  await expect(page.getByLabel("Latitude")).toHaveCount(0);
  await expect(page.getByLabel("Site in column 2")).toHaveValue("im-1");
});

test("an open form moves with its column", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=im-1");
  await page.getByLabel("Site in column 3").selectOption("custom");
  await page.getByLabel("Latitude").fill("-85.25");
  await page.getByRole("button", { name: "Remove column 2" }).click();
  await expect(page).toHaveURL(/\?with=im-1$/);
  await expect(page.getByLabel("Latitude")).toHaveValue("-85.25");
});

test("focus lands on the add button after removing a column", async ({ page }) => {
  await page.goto("/compare?with=im-2");
  await page.getByRole("button", { name: "Remove column 2" }).click();
  await expect(add(page)).toBeFocused();
});

test("focus moves into the form and back", async ({ page }) => {
  await page.goto("/compare?with=im-2");
  await page.getByLabel("Site in column 2").selectOption("custom");
  await expect(page.getByLabel("Latitude")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Site in column 2")).toBeFocused();
});

test("choosing a column already on the page is refused and keeps the column", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=im-1");
  await page.getByLabel("Site in column 3").selectOption("im-2");
  await expect(page.getByText("That site and date are already on the page.")).toBeVisible();
  await expect(page).toHaveURL(/\?with=im-2&with=im-1$/);
  await expect(page.getByLabel("Site in column 3")).toHaveValue("im-1");
});

test("a custom site with terrain gets a real horizon in its column", async ({ page }) => {
  await page.goto("/compare?with=im-2");
  await page.getByLabel("Site in column 2").selectOption("custom");
  await page.getByLabel("Latitude").fill("-85.25");
  await page.getByLabel("Longitude").fill("120");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\?with=-85.25,120$/);
  const column = card(page, "Custom site");
  await expect(column.getByText("Horizon computed in your browser")).toBeVisible();
  await expect(column.getByTestId("golden-hours")).toBeVisible();
});

test("a flat site is labelled, on the column and in the comparison", async ({ page }) => {
  await page.goto("/compare?with=10,20");
  await expect(card(page, "Custom site").getByText("Flat horizon: terrain not included")).toBeVisible();
  await expect(page.getByText("A flat horizon has no terrain")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sites and dates");
  await expect(page.getByText("Most Golden hours")).toHaveCount(0);
});

test("the same site on two dates can be told apart by a screen reader", async ({ page }) => {
  await page.goto("/compare?with=shackleton-rim@2028-02-29T12:00Z");
  await expect(page.getByRole("region", { name: "Shackleton crater rim 89.78°S 156.18°W 29 Feb 2028, 12:00 UTC" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("29 Dec 2027 leads by");
});

test("a column past the data is named as left out of the headline", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=im-1@2030-12-25T00:00Z");
  await expect(page.getByText("left out of this headline")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("leads by");
});

test("wrong custom coordinates are refused in place", async ({ page }) => {
  await page.goto("/compare?with=im-2");
  await page.getByLabel("Site in column 2").selectOption("custom");
  await page.getByLabel("Latitude").fill("-95");
  await page.getByLabel("Longitude").fill("120");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Latitude must be between -90 and 90.")).toBeVisible();
  await expect(page).toHaveURL(/\?with=im-2$/);
});

test("bad and repeated link values are reported, not guessed at", async ({ page }) => {
  await page.goto("/compare?with=nowhere&with=shackleton-rim");
  await expect(page.getByText("was not valid, so it is left out")).toBeVisible();
  await expect(page.getByText("The link repeats a column")).toBeVisible();
  await expect(page.locator("section[aria-labelledby^=compare-column]")).toHaveCount(1);
});

test("a date past the data does not stop the other column", async ({ page }) => {
  await page.goto("/compare?with=im-2@2030-12-25T00:00Z");
  await expect(card(page, "IM-2 Athena")).toContainText("runs past our data");
  await expect(golden(page, "Shackleton crater rim")).toHaveText("336 h");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compare sites and dates");
});

test("the top bar and other pages keep the comparison", async ({ page }) => {
  await page.goto("/compare?with=im-1");
  await expect(golden(page, "IM-1 Odysseus")).toBeVisible();
  await page.getByLabel("Landing site").selectOption("im-2");
  await expect(page).toHaveURL(/\?site=im-2&with=im-1$/);
  await expect(golden(page, "IM-2 Athena")).toBeVisible();
  const nav = page.getByRole("link", { name: "Sky", exact: true }).first();
  await expect(nav).toHaveAttribute("href", "/sky?site=im-2&with=im-1");
});

test("a column links to its own sky", async ({ page }) => {
  await page.goto("/compare?with=im-2@2028-02-29T12:00Z");
  const column = card(page, "IM-2 Athena");
  await expect(column.getByRole("link", { name: "See the sky from here →" })).toHaveAttribute("href", "/sky?site=im-2&t=2028-02-29T12:00Z");
});

test("the page fits without sideways scrolling", async ({ page }) => {
  await page.goto("/compare?with=im-2&with=-85.25,120");
  await expect(golden(page, "IM-2 Athena")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
