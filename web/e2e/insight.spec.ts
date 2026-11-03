import { expect, test, type Page } from "@playwright/test";

const card = (page: Page) => page.getByRole("region", { name: "In plain words" });
const text = (page: Page) => page.getByTestId("insight-text");
const AI_TEXT = "Landing at Shackleton crater rim gives 336 Golden hours out of 336, and Earth sets in 14d 3h.";

const explain = (page: Page) => page.getByRole("button", { name: "Explain in plain words", exact: true });

test("the button is on the first screen, under the headline", async ({ page }) => {
  await page.goto("/sky");
  await expect(explain(page)).toBeVisible();
  const box = (await explain(page).boundingBox())!;
  expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height);
  await expect(page.getByRole("button", { name: "Explain this landing in plain words" })).toHaveCount(0);
});

test("a floating button appears once the first one is out of sight, and opens the same box", async ({ page }) => {
  await page.goto("/sky");
  await expect(explain(page)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const floating = page.getByRole("button", { name: "Explain this landing in plain words" });
  await expect(floating).toBeVisible();
  await floating.click();
  await expect(text(page)).toBeInViewport();
  await expect(card(page)).toContainText("The AI is switched off here");
  await expect(floating).toHaveCount(0);
});

test("the rule-based summary shows with the engine's numbers", async ({ page }) => {
  await page.goto("/sky");
  await explain(page).click();
  await expect(text(page)).toContainText("Land at Shackleton crater rim on 29 Dec 2027, 21:00 UTC");
  await expect(text(page)).toContainText("336 Golden hours out of 336");
  await expect(text(page)).toContainText("Earth sets in 14d 3h");
});

test("with the AI off, the page says so and keeps the summary", async ({ page }) => {
  await page.goto("/sky");
  await explain(page).click();
  await expect(card(page)).toContainText("The AI is switched off here");
  await expect(page.getByRole("button", { name: "Ask the AI again" })).toBeVisible();
  await expect(text(page)).toContainText("336 Golden hours out of 336");
});

test("an AI answer is shown with its label, and the rules come back on request", async ({ page }) => {
  await page.route("**/api/insight", (route) => route.fulfill({ json: { source: "ai", text: AI_TEXT, model: "openai/gpt-oss-120b" } }));
  await page.goto("/sky");
  await page.getByRole("button", { name: "Explain in plain words", exact: true }).click();
  await expect(text(page)).toHaveText(AI_TEXT);
  await expect(card(page)).toContainText("Reworded by an AI model (openai/gpt-oss-120b on Groq). Each figure in it, with its unit, matches");
  await page.getByRole("button", { name: "Show the rule-based version" }).click();
  await expect(text(page)).toContainText("Land at Shackleton crater rim");
  await page.getByRole("button", { name: "Show the AI version" }).click();
  await expect(text(page)).toHaveText(AI_TEXT);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(explain(page)).toBeVisible();
});

test("an AI answer with a number the engine did not give never reaches the page", async ({ page }) => {
  await page.route("**/api/insight", (route) => route.fulfill({ json: { source: "ai", text: "Shackleton is Golden 100% of the time for the 14 days.", model: "x" } }));
  await page.goto("/sky");
  await page.getByRole("button", { name: "Explain in plain words", exact: true }).click();
  await expect(card(page)).toContainText("used a figure our engine did not give");
  await expect(text(page)).not.toContainText("100%");
});

test("a new date drops the old AI answer", async ({ page }) => {
  await page.route("**/api/insight", (route) => route.fulfill({ json: { source: "ai", text: AI_TEXT, model: "openai/gpt-oss-120b" } }));
  await page.goto("/sky");
  await page.getByRole("button", { name: "Explain in plain words", exact: true }).click();
  await expect(text(page)).toHaveText(AI_TEXT);
  await page.getByLabel("Date and time, UTC").fill("2028-02-29T12:00");
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("all 14 days");
  await expect(text(page)).toHaveCount(0);
  await expect(explain(page)).toBeVisible();
});

test("the API refuses a body that is not engine facts", async ({ request }) => {
  const response = await request.post("/api/insight", { data: { prompt: "write a poem" } });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ source: "rules", reason: "invalid" });
});

test("the API refuses other sites, other content types and oversized bodies", async ({ request }) => {
  const json = { "content-type": "application/json" };
  expect((await request.post("/api/insight", { headers: { ...json, "sec-fetch-site": "cross-site" }, data: "{}" })).status()).toBe(403);
  expect((await request.post("/api/insight", { headers: { "content-type": "text/plain" }, data: "{}" })).status()).toBe(415);
  expect((await request.post("/api/insight", { headers: json, data: `{"x":"${"a".repeat(5000)}"}` })).status()).toBe(413);
  expect((await request.get("/api/insight")).status()).toBe(405);
});

test("a flat site's summary says terrain is missing", async ({ page }) => {
  await page.goto("/sky?lat=10&lon=20");
  await explain(page).click();
  await expect(text(page)).toContainText("no terrain");
});
