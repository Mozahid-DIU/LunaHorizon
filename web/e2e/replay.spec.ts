import { expect, test, type Page } from "@playwright/test";

const time = (page: Page) => page.getByTestId("sky-time");
const verdict = (page: Page) => page.getByTestId("replay-verdict");
const picker = (page: Page) => page.getByRole("navigation", { name: "Mission Replay" });

test("Sky offers the real landings, and IM-2 replays Athena's touchdown beside NASA's report", async ({ page }) => {
  await page.goto("/sky?site=im-1");
  await picker(page).getByRole("link", { name: "IM-2 Athena" }).click();
  await expect(page).toHaveURL(/replay=im-2/);
  await expect(page).toHaveURL(/site=im-1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("IM-2 Athena, 6 Mar 2025");
  await expect(picker(page).getByRole("link", { name: "IM-2 Athena" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("IM-2 Athena touchdown point, 369 m from its target")).toBeVisible({ timeout: 30_000 });
  await expect(verdict(page)).toHaveText("The mission ended 12d 14h before the Sun set behind this site's skyline.");
  await expect(page.getByTestId("replay-end")).toHaveText("7 Mar 2025, 06:15 UTC");
  await expect(page.getByRole("link", { name: "NASA: data received before the mission ended" })).toHaveAttribute("href", /nasa\.gov\/news-release/);
  await expect(time(page)).toHaveText("6 Mar 2025, 17:30 UTC");
  await page.getByRole("group", { name: "Go to a moment" }).getByRole("button", { name: "Reported end" }).click();
  await expect(time(page)).toHaveText("7 Mar 2025, 06:15 UTC");
  await expect(page.getByRole("region", { name: "Sun" })).toContainText("Above the horizon");
});

test("Chandrayaan-3's sunset falls on the day ISRO reported, and the Sun returns on 19 Sep", async ({ page }) => {
  await page.goto("/sky?replay=chandrayaan-3");
  await expect(verdict(page)).toHaveText("The Sun set behind this site's skyline on 4 Sep 2023, the same day the team reported.", { timeout: 30_000 });
  await expect(page.getByTestId("replay-end")).toHaveText("4 Sep 2023 (no time given)");
  await expect(page.getByTestId("replay-sunset")).toHaveText("4 Sep 2023, 06:06 UTC, 11d 17h after touchdown");
  await expect(page.getByTestId("replay-sunrise")).toHaveText("19 Sep 2023, 23:59 UTC");
  await page.getByRole("group", { name: "Go to a moment" }).getByRole("button", { name: "Engine's sunset" }).click();
  await expect(time(page)).toHaveText("4 Sep 2023, 06:06 UTC");
});

test("Apollo 11 shows no DSN contact for 1969, and Back to planning returns to the planner", async ({ page }) => {
  await page.goto("/sky?site=im-1&replay=apollo-11");
  await expect(verdict(page)).toHaveText("The mission ended 12d 19h before the Sun set behind this site's skyline.", { timeout: 30_000 });
  const timeline = page.getByRole("figure", { name: "The replay, hour by hour" });
  await expect(timeline).toContainText("Sun up");
  await expect(timeline).not.toContainText("Contact possible");
  await expect(page.getByText("Madrid's and Canberra's were not built until the 1970s")).toBeVisible();
  await page.getByRole("link", { name: "Back to planning" }).click();
  await expect(page).not.toHaveURL(/replay=/);
  await expect(page).toHaveURL(/site=im-1/);
  await expect(page.getByRole("navigation", { name: "Mission Replay" })).toBeVisible();
  await expect(page.getByTestId("replay-verdict")).toHaveCount(0);
});

test("an unknown replay shows the planner's Sky", async ({ page }) => {
  await page.goto("/sky?replay=luna-9");
  await expect(picker(page)).toBeVisible();
  await expect(verdict(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Luna");
});
