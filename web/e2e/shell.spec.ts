import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  ["/", "Atlas"], ["/sky", "Sky"], ["/compare", "Compare"], ["/dates", "Dates"], ["/power", "Power"],
  ["/ellipse", "Ellipse"], ["/3d", "3D"], ["/proof", "Proof"], ["/brief", "Mission Brief"],
] as const;

/** Each page's headline once it has its answer; pages still to be built show their name. */
const HEADLINES: Record<string, RegExp | string> = {
  "/": /right time/,
  "/sky": /Golden/,
  "/compare": "Compare sites and dates",
  "/dates": /best in 12 months/,
  "/power": /^Survives|^Runs out of power/,
  "/proof": /checks passed/,
  "/ellipse": /^Within 500 m of the target/,
};

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const [href, title] of PAGES) {
  test(`${href} opens cleanly`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1, name: HEADLINES[href] ?? title })).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveTitle(href === "/" ? "LunaHorizon" : `${title} · LunaHorizon`);
    expect(await noSidewaysScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("desktop tabs move between pages and mark the current one", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop navigation");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveCount(8);
  await expect(nav.getByRole("link", { name: "Atlas" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Power" }).click();
  await expect(page).toHaveURL(/\/power$/);
  await expect(nav.getByRole("link", { name: "Power" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Atlas" })).not.toHaveAttribute("aria-current", "page");
});

test("desktop reaches the Mission Brief", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop navigation");
  await page.goto("/");
  await page.getByRole("link", { name: "Mission Brief" }).click();
  await expect(page).toHaveURL(/\/brief$/);
});

test("phone tabs and More reach every page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await tabs.getByRole("link", { name: "Compare" }).click();
  await expect(page).toHaveURL(/\/compare$/);

  const more: [string, RegExp][] = [
    ["Dates", /\/dates$/], ["Power", /\/power$/], ["Ellipse", /\/ellipse$/],
    ["3D", /\/3d$/], ["Proof", /\/proof$/], ["Brief", /\/brief$/],
  ];
  for (const [label, url] of more) {
    await tabs.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More pages" }).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("More closes with Escape and returns focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  const more = page.getByRole("button", { name: "More" });
  await more.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("More reports whether it is open", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  const more = page.getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
});

test("choosing a page in More moves focus to the content", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Proof" }).click();
  await expect(page).toHaveURL(/\/proof$/);
  await expect(page.locator("main")).toBeFocused();
});

test("choosing the current page in More also moves focus to the content", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/proof");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Proof" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
});

test("More closes when the browser goes back", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sky" }).click();
  await expect(page).toHaveURL(/\/sky$/);
  await page.getByRole("button", { name: "More" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Escape still closes More after tapping its empty padding", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  const box = await page.getByRole("dialog").boundingBox();
  await page.mouse.click(box!.x + 3, box!.y + 3);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Tab stays inside More in both directions", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  const links = page.getByRole("dialog").getByRole("link");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.first()).toBeFocused();
});

test("tapping outside closes More and returns focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/");
  const more = page.getByRole("button", { name: "More" });
  await more.click();
  await page.getByRole("button", { name: "Close menu" }).click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
});

test("the layout switches cleanly at 1279 and 1280 pixels", async ({ page, isMobile }) => {
  test.skip(isMobile, "viewport test");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sky");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "More" })).toBeHidden();
  expect(await noSidewaysScroll(page)).toBe(true);

  await page.setViewportSize({ width: 1279, height: 800 });
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "More" })).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);
});

test("the tab bar never covers the end of a page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.setViewportSize({ width: 390, height: 300 });
  await page.goto("/sky");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const clearance = await page.evaluate(() => {
    const bar = document.querySelector('nav[aria-label="Main"]:not([hidden])')?.getBoundingClientRect();
    const main = document.querySelector("main");
    const after = main ? Number.parseFloat(getComputedStyle(main).paddingBottom) : 0;
    return { after, barHeight: (bar?.height ?? 0) + 14 };
  });
  expect(clearance.after).toBeGreaterThanOrEqual(clearance.barHeight);
});

test("More shows as current on a page inside it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone navigation");
  await page.goto("/power");
  await expect(page.getByRole("button", { name: "More" })).toHaveAttribute("data-current", "true");
});

test("keyboard users can skip to the content", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.goto("/sky");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("an unknown address shows a helpful page", async ({ page }) => {
  const response = await page.goto("/mars");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the Atlas" }).click();
  await expect(page).toHaveURL(/\/$/);
});
