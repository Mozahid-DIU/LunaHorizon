import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../src/lib/ask";
import { factsFrom } from "../src/lib/insight";
import { siteSummary } from "../src/lib/siteSummary";
import { findSite } from "../src/lib/sites";
import { loadEphemeris, loadProfile } from "../src/lib/testData";

const LANDING = Date.UTC(2027, 11, 29, 21);
const rim = findSite("shackleton-rim")!;
const facts = factsFrom(rim, LANDING, siteSummary(loadEphemeris([2027, 2028]), rim, loadProfile("shackleton-rim"), LANDING)!, true);
const answers = (page: Page) => page.getByTestId("ask-answer");
const panel = (page: Page) => page.getByRole("dialog", { name: "Ask LunaHorizon" });

/** The AI answers as given, or the route is left alone (the test server has no key, so the AI is off). */
async function aiSays(page: Page, text: string) {
  await page.route("**/api/ask", (route) => route.fulfill({ json: { source: "ai", text, model: "openai/gpt-oss-120b" } }));
}

async function open(page: Page, path = "/sky") {
  await page.goto(path);
  await page.getByTestId("ask-open").click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("group", { name: "Suggested questions" })).toBeVisible({ timeout: 30_000 });
}

test("with the AI off, every suggested question is answered by rules from the engine", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("ask-context")).toHaveText("About Shackleton crater rim · landing 29 Dec 2027, 21:00 UTC · 14-day mission");
  for (const [i, topic] of TOPICS.slice(0, 5).entries()) {
    await panel(page).getByRole("button", { name: topic.question }).click();
    await expect(answers(page).nth(i).locator("p")).toHaveText(topic.answer(facts));
    await expect(answers(page).nth(i)).toHaveAttribute("data-source", "rules");
    await expect(answers(page).nth(i)).toContainText("The AI is switched off here");
  }
});

test("a typed question finds its topic, and one off the subject says what can be answered", async ({ page }) => {
  await open(page);
  await page.getByLabel("Your question").fill("when does the sun set here?");
  await page.keyboard.press("Enter");
  await expect(answers(page).first().locator("p")).toHaveText("The Sun sets in 22d 22h.");
  await page.getByLabel("Your question").fill("What is the capital of France?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(answers(page).nth(1)).toContainText("we can only answer the questions below");
  await expect(answers(page).nth(1).locator("p")).toHaveCount(0);
});

test("an AI answer is shown when its figures are the engine's", async ({ page }) => {
  await aiSays(page, "Earth sets in 14d 3h, so a call home ends then; the Sun stays up until 22d 22h.");
  await open(page);
  await page.getByLabel("Your question").fill("Can I call home all mission?");
  await page.keyboard.press("Enter");
  await expect(answers(page).first()).toHaveAttribute("data-source", "ai");
  await expect(answers(page).first()).toContainText("Answered by an AI model (openai/gpt-oss-120b on Groq)");
});

test("an AI answer with a figure the engine did not give is not shown", async ({ page }) => {
  await aiSays(page, "Earth sets in 15d 3h.");
  await open(page);
  await panel(page).getByRole("button", { name: "When does Earth set or rise?" }).click();
  await expect(answers(page).first().locator("p")).toHaveText("Earth sets in 14d 3h.");
  await expect(answers(page).first()).toContainText("used a figure our engine did not give");
  await expect(panel(page)).not.toContainText("15d 3h");
});

test("a new site starts a new conversation, and Escape closes the panel", async ({ page }) => {
  await open(page);
  await panel(page).getByRole("button", { name: "What is the DSN?" }).click();
  await expect(answers(page)).toHaveCount(1);
  await page.goto("/sky?site=im-2");
  await page.getByTestId("ask-open").click();
  await expect(page.getByTestId("ask-context")).toContainText("About IM-2 Athena");
  await expect(answers(page)).toHaveCount(0);
  await page.getByLabel("Your question").press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByTestId("ask-open")).toBeFocused();
});

test("the ask route refuses other sites, bad bodies and, here, says the AI is off", async ({ page }) => {
  await page.goto("/");
  const post = (data: unknown, headers: Record<string, string> = {}) =>
    page.request.post("/api/ask", { data: typeof data === "string" ? data : JSON.stringify(data), headers: { "content-type": "application/json", ...headers } });
  expect((await post({ facts, question: "hi" }, { "sec-fetch-site": "cross-site" })).status()).toBe(403);
  expect((await post("not json")).status()).toBe(400);
  expect((await post({ facts, question: "" })).status()).toBe(400);
  const off = await post({ facts, question: "When does Earth set?" });
  expect(off.status()).toBe(503);
  expect(await off.json()).toEqual({ source: "rules", reason: "off" });
});
