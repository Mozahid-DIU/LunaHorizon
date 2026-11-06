import { expect, test, type Page } from "@playwright/test";

const toggle = (page: Page) => page.getByRole("switch", { name: "Classroom mode" });
// Next keeps a page left behind mounted but hidden, so only the shown lesson counts
const card = (page: Page) => page.getByTestId("lesson-card").filter({ visible: true });

const LESSON_PAGES = [
  ["/", "The Moon's south pole has its best light."],
  ["/sky", "On the Moon, a hill can steal the sunset."],
  ["/dates", "When you land matters as much as where."],
  ["/power", "Sunlight is power, and the night drains the battery."],
  ["/compare", "A few kilometres can make a big difference."],
  ["/ellipse", "Landers miss their target."],
  ["/3d", "On the Moon, shadows are black."],
  ["/proof", "Good science checks its numbers."],
] as const;

test("Classroom mode is off until switched on, then stays on from page to page", async ({ page }) => {
  await page.goto("/sky");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "false");
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "DSN station" })).toHaveCount(0);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveText("On the Moon, a hill can steal the sunset.");
  await expect(card(page)).toContainText("Lesson 2 of 8");

  const answer = card(page).getByRole("button", { name: "Show answer" });
  await expect(answer).toHaveAttribute("aria-expanded", "false");
  await answer.click();
  await expect(card(page).getByTestId("lesson-answer")).toHaveText("336 h of 336 h", { timeout: 30_000 });
  // the lesson's answer and the page's own headline come from the same engine run
  await expect(page.getByText("336 of 336 mission hours have sunlight")).toBeVisible();

  await card(page).getByRole("link", { name: "Next: Dates ›" }).click();
  await expect(page).toHaveURL(/\/dates$/);
  await expect(page.getByRole("heading", { level: 2, name: "When you land matters as much as where." })).toBeVisible();
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toContainText("Lesson 3 of 8");
  await page.reload();
  await expect(card(page)).toContainText("Lesson 3 of 8");

  await toggle(page).click();
  await expect(card(page)).toHaveCount(0);
});

test("lesson links keep the chosen site and date", async ({ page }) => {
  await page.goto("/sky?site=im-1&t=2026-03-01T10:00Z");
  await toggle(page).click();
  await expect(card(page).getByRole("link", { name: "Next: Dates ›" })).toHaveAttribute("href", "/dates?site=im-1&t=2026-03-01T10:00Z");
  await expect(card(page).getByRole("list", { name: "Lessons" }).getByRole("link", { name: "Atlas" })).toHaveAttribute("href", "/?site=im-1&t=2026-03-01T10:00Z");
});

test("a word on the page opens its plain meaning, and Escape closes it", async ({ page }) => {
  await page.goto("/sky");
  await toggle(page).click();
  const word = page.getByRole("button", { name: "DSN station" });
  await word.click();
  const note = page.getByRole("note").filter({ hasText: "Goldstone" });
  await expect(note).toBeVisible();
  await expect(note).toContainText("Madrid (Spain) and Canberra (Australia)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();
  await expect(word).toBeFocused();
});

for (const [href, idea] of LESSON_PAGES) {
  test(`${href} has its lesson, and an answer once the engine is done`, async ({ page }) => {
    await page.goto(href);
    await toggle(page).click();
    await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(idea);
    await card(page).getByRole("button", { name: "Show answer" }).click();
    // every page either answers or says plainly why it cannot, never a guess
    await expect(card(page).getByText("The engine is still calculating…")).toHaveCount(0, { timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("the Mission Brief has no lesson", async ({ page }) => {
  await page.goto("/sky");
  await toggle(page).click();
  await page.goto("/brief");
  await expect(toggle(page)).toHaveAttribute("aria-checked", "true");
  await expect(card(page)).toHaveCount(0);
});

test("Proof's answer is its own largest difference", async ({ page }) => {
  await page.goto("/proof");
  await toggle(page).click();
  await card(page).getByRole("button", { name: "Show answer" }).click();
  const largest = (await page.getByText("The largest angle difference is").locator("strong").innerText()).trim();
  await expect(card(page).getByTestId("lesson-answer")).toHaveText(largest);
});

test("the top bar never overlaps itself at desktop widths", async ({ page, isMobile }) => {
  test.skip(isMobile, "sizes are set here");
  for (const width of [1280, 1366, 1440, 1600, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/sky");
    await toggle(page).click();
    const clashes = await page.evaluate(() => {
      const header = document.querySelector("header")!.getBoundingClientRect();
      const found: string[] = [];
      // the header has two rows; within each row no part may overlap another or leave the bar
      for (const [r, row] of [...document.querySelectorAll("header > div")].entries()) {
        const parts = [...row.children].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
        parts.forEach((a, i) => {
          if (a.right > header.right + 0.5) found.push(`row ${r} part ${i} past the bar`);
          parts.slice(i + 1).forEach((b, j) => {
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5) found.push(`row ${r} parts ${i} and ${i + j + 1}`);
          });
        });
        if (row.scrollWidth > row.clientWidth + 0.5) found.push(`row ${r} squeezed`);
      }
      return found;
    });
    expect(clashes, `${width}px`).toEqual([]);
  }
});
