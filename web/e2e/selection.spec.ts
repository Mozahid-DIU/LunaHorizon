import { expect, test, type Page } from "@playwright/test";

const siteBox = (page: Page) => page.getByLabel("Landing site");
const dateBox = (page: Page) => page.getByLabel("Date and time, UTC");

test("starts on the default site and date with a clean address", async ({ page }) => {
  await page.goto("/sky");
  await expect(siteBox(page)).toHaveValue("shackleton-rim");
  await expect(dateBox(page)).toHaveValue("2027-12-29T21:00");
  expect(new URL(page.url()).search).toBe("");
});

test("choosing a site changes the address", async ({ page }) => {
  await page.goto("/sky");
  await siteBox(page).selectOption("im-2");
  await expect(page).toHaveURL(/\/sky\?site=im-2$/);
  await expect(siteBox(page)).toHaveValue("im-2");
});

test("choosing a date changes the address", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await dateBox(page).fill("2028-02-29T12:00");
  await expect(page).toHaveURL(/\/sky\?site=im-2&t=2028-02-29T12:00Z$/);
});

test("a quick second change keeps the first one, even on a slow connection", async ({ page }) => {
  await page.route(/_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto("/sky");
  await siteBox(page).selectOption("im-2");
  await dateBox(page).fill("2028-02-29T12:00");
  await expect(page).toHaveURL(/site=im-2&t=2028-02-29T12:00Z$/, { timeout: 8000 });
  await expect(siteBox(page)).toHaveValue("im-2");
});

test("a bad date goes back to the real one when leaving the field", async ({ page }) => {
  await page.goto("/sky?site=im-2&t=2027-03-01T06:30Z");
  await dateBox(page).fill("2031-01-01T00:00");
  await expect(page.getByText("Choose a date from 2026 to 2030.")).toBeVisible();
  await siteBox(page).focus();
  await expect(dateBox(page)).toHaveValue("2027-03-01T06:30");
  await expect(page.getByText("Choose a date from 2026 to 2030.")).toHaveCount(0);
});

test("the date box follows the address after going back", async ({ page }) => {
  await page.goto("/sky?t=2027-03-01T06:30Z");
  await page.goto("/sky?t=2028-03-01T06:30Z");
  await dateBox(page).focus();
  await page.goBack();
  await expect(dateBox(page)).toHaveValue("2027-03-01T06:30");
});

test("custom coordinates can be changed again", async ({ page }) => {
  await page.goto("/sky?lat=-85.25&lon=120");
  await page.getByRole("button", { name: "Edit coordinates" }).click();
  await expect(page.getByLabel("Latitude")).toHaveValue("-85.25");
  await page.getByLabel("Longitude").fill("121");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/lat=-85\.25&lon=121$/);
});

test("the custom form manages focus and links its errors", async ({ page }) => {
  await page.goto("/sky");
  await siteBox(page).selectOption("custom");
  await expect(page.getByLabel("Latitude")).toBeFocused();
  await page.getByLabel("Latitude").fill("95");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByLabel("Latitude")).toHaveAccessibleDescription("Latitude must be between -90 and 90.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(siteBox(page)).toBeFocused();
});

test("the form does not cover a bad link message", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone layout stacks them");
  await page.goto("/sky?site=mars");
  await siteBox(page).selectOption("custom");
  const note = (await page.getByRole("status").boundingBox())!;
  const form = (await page.getByRole("button", { name: "Apply" }).locator("xpath=ancestor::form").boundingBox())!;
  expect(note.x >= form.x + form.width || note.y >= form.y + form.height).toBe(true);
});

test("a copied link reopens the same site and date", async ({ page, context }) => {
  await page.goto("/sky");
  await siteBox(page).selectOption("apollo-11");
  await dateBox(page).fill("2026-06-01T08:15");
  await expect(page).toHaveURL(/t=/);
  const copy = await context.newPage();
  await copy.goto(page.url());
  await expect(siteBox(copy)).toHaveValue("apollo-11");
  await expect(dateBox(copy)).toHaveValue("2026-06-01T08:15");
});

test("the choice stays while moving between pages on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop navigation");
  await page.goto("/?site=im-1");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Power" }).click();
  await expect(page).toHaveURL(/\/power\?site=im-1$/);
  await page.getByRole("link", { name: "Mission Brief" }).click();
  await expect(page).toHaveURL(/\/brief\?site=im-1$/);
});

test("the choice stays while moving between pages on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/?site=im-1");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Sky" }).click();
  await expect(page).toHaveURL(/\/sky\?site=im-1$/);
  await nav.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Power" }).click();
  await expect(page).toHaveURL(/\/power\?site=im-1$/);
});

test("custom coordinates are applied and marked as having no terrain", async ({ page }) => {
  await page.goto("/sky");
  await siteBox(page).selectOption("custom");
  await page.getByLabel("Latitude").fill("-85.25");
  await page.getByLabel("Longitude").fill("120");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/lat=-85\.25&lon=120$/);
  await expect(siteBox(page)).toHaveValue("custom");
  await expect(page.getByText("Terrain not included", { exact: true })).toBeVisible();
});

test("a curated site shows no terrain warning", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await expect(siteBox(page)).toHaveValue("im-2");
  await expect(page.getByText("Terrain not included", { exact: true })).toHaveCount(0);
});

test("bad custom coordinates are refused and nothing changes", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await siteBox(page).selectOption("custom");
  await page.getByLabel("Latitude").fill("95");
  await page.getByLabel("Longitude").fill("abc");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Latitude must be between -90 and 90.")).toBeVisible();
  await expect(page.getByText("Longitude must be between -180 and 180.")).toBeVisible();
  await expect(page).toHaveURL(/\/sky\?site=im-2$/);
});

test("cancelling custom coordinates returns to the site", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await siteBox(page).selectOption("custom");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(siteBox(page)).toHaveValue("im-2");
  await expect(page.getByLabel("Latitude")).toHaveCount(0);
});

test("a date outside the data is refused and the address stays", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await dateBox(page).fill("2031-01-01T00:00");
  await expect(page.getByText("Choose a date from 2026 to 2030.")).toBeVisible();
  await expect(page).toHaveURL(/\/sky\?site=im-2$/);
});

test("a bad link says so and falls back", async ({ page }) => {
  await page.goto("/sky?site=mars&t=banana");
  await expect(page.getByRole("status")).toContainText("site");
  await expect(page.getByRole("status")).toContainText("date");
  await expect(siteBox(page)).toHaveValue("shackleton-rim");
});

test("every width stays inside the screen with the pickers", async ({ page, isMobile }) => {
  test.skip(isMobile, "viewport test");
  await page.goto("/sky?lat=-85.25&lon=120");
  for (const width of [320, 375, 768, 1279, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(siteBox(page)).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(fits, `${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("button", { name: "Edit coordinates" }).click();
  await page.getByLabel("Latitude").fill("95");
  await page.getByRole("button", { name: "Apply" }).click();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits, "320px with the form open").toBe(true);
});

test("the header keeps everything inside it at the narrowest desktop width", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop layout");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sky?lat=-85.25&lon=120");
  await expect(page.getByText("Terrain not included", { exact: true })).toBeVisible();
  const header = (await page.locator("header").boundingBox())!;
  const brief = (await page.getByRole("link", { name: "Mission Brief" }).boundingBox())!;
  expect(brief.x + brief.width).toBeLessThanOrEqual(header.x + header.width);
  const proof = (await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Proof" }).boundingBox())!;
  expect(proof.x + proof.width).toBeLessThanOrEqual(brief.x);
  const date = (await page.getByLabel("Date and time, UTC").boundingBox())!;
  const atlas = (await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Atlas" }).boundingBox())!;
  expect(date.x + date.width).toBeLessThanOrEqual(atlas.x);
});
