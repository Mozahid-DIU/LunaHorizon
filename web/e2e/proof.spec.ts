import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

type Row = Record<string, unknown> & { diff_deg?: number; diff?: number; pass: boolean };
interface File {
  generated: string;
  summary: { checks: number; passed: number; max_angle_diff_deg: number };
  sections: { id: string; title: string; rows: Row[] }[];
}

const read = () => JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "validation.json"), "utf-8")) as File;
const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const openAll = async (page: Page) => {
  await expect(heading(page)).toContainText("passed");
  const closed = page.locator("details:not([open]) summary");
  for (let i = await closed.count(); i > 0; i -= 1) await closed.first().click();
};
const serve = (page: Page, change: (file: File) => void) =>
  page.route(/validation\.json/, (route) => {
    const file = read();
    change(file);
    return route.fulfill({ json: file });
  });

test("the headline and every row come from validation.json", async ({ page }) => {
  const file = read();
  await page.goto("/proof");
  await expect(heading(page)).toHaveText(`${file.summary.checks} of ${file.summary.checks} checks passed.`);
  await expect(page.getByText(`The largest angle difference is ${file.summary.max_angle_diff_deg.toFixed(6)}°`)).toBeVisible();
  await openAll(page);
  const rows = page.getByTestId("proof-row");
  await expect(rows).toHaveCount(file.summary.checks);
  const texts = await rows.allInnerTexts();
  const fileRows = file.sections.flatMap(({ rows: r }) => r);
  fileRows.forEach((row, i) => {
    const difference = row.diff_deg === undefined ? String(row.diff) : row.diff_deg.toFixed(6);
    expect(texts[i]).toContain(difference);
    expect(texts[i]).toContain("Pass");
  });
});

test("each section shows its own count", async ({ page }) => {
  const file = read();
  await page.goto("/proof");
  await expect(heading(page)).toContainText("passed");
  for (const { title, rows } of file.sections) {
    await expect(page.getByRole("region", { name: title })).toContainText(`${rows.length} of ${rows.length}`);
  }
});

test("a change to the file changes the page: nothing is written in", async ({ page }) => {
  await serve(page, (file) => {
    file.sections[3].rows.pop();
    file.summary.checks -= 1;
    file.summary.passed -= 1;
  });
  const { checks } = read().summary;
  await page.goto("/proof");
  await expect(heading(page)).toHaveText(`${checks - 1} of ${checks - 1} checks passed.`);
});

test("a failed check is shown plainly and opened", async ({ page }) => {
  await serve(page, (file) => {
    const row = file.sections[1].rows[0];
    row.diff_deg = 0.05;
    row.pass = false;
    file.summary.passed -= 1;
    file.summary.max_angle_diff_deg = 0.05;
  });
  await page.goto("/proof");
  const { summary, sections } = read();
  await expect(heading(page)).toHaveText(`${summary.checks - 1} of ${summary.checks} checks passed. 1 failed.`);
  const section = page.getByRole("region", { name: "Browser engine vs full SPICE calculation" });
  await expect(section).toContainText(`${sections[1].rows.length - 1} of ${sections[1].rows.length} · 1 failed`);
  await expect(section.getByRole("cell", { name: "Fail" })).toBeVisible();
});

test("a file whose summary does not match its rows shows no numbers", async ({ page }) => {
  await serve(page, (file) => {
    file.summary.checks += 1;
  });
  await page.goto("/proof");
  await expect(page.getByText("No results to show")).toBeVisible();
  await expect(page.getByText("checks passed")).toHaveCount(0);
  await expect(page.getByTestId("proof-row")).toHaveCount(0);
});

test("a missing file can be retried", async ({ page }) => {
  let fails = true;
  await page.route(/validation\.json/, (route) => (fails ? route.abort() : route.continue()));
  await page.goto("/proof");
  await expect(page.getByText("No results to show")).toBeVisible();
  fails = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(heading(page)).toContainText("checks passed.");
});

test("terrain checks name their published source", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByText("Glaser et al. 2014, Icarus")).toBeVisible();
  await expect(page.getByText("lroc.im-ldi.com/images/1360")).toBeVisible();
});

test("the polar test point is named in words", async ({ page }) => {
  await page.goto("/proof");
  await openAll(page);
  await expect(page.getByText("South polar test point, 89.45° S, Sun").first()).toBeVisible();
  await expect(page.getByText("south-pole-89s")).toHaveCount(0);
});

test("open tables never widen the page", async ({ page }) => {
  await page.goto("/proof");
  await expect(heading(page)).toContainText("passed");
  await openAll(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
