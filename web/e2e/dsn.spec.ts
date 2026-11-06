import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const HOUR_MS = 3_600_000;
const LANDING = Date.UTC(2027, 11, 29, 21);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DsnFile {
  start: string;
  stations: string[];
  mask: number[];
}

const files = [2027, 2028].map((year) => JSON.parse(readFileSync(join(__dirname, "..", "public", "data", `dsn-${year}.json`), "utf-8")) as DsnFile);
const places = files[0].stations.map((name) => name.split(" (")[0]);

/** The mask the DSN file holds for the hour at `ms`, read straight from the file. */
function maskAt(ms: number): number {
  for (const file of files) {
    const index = Math.floor((ms - Date.parse(file.start)) / HOUR_MS);
    if (index >= 0 && index < file.mask.length) return file.mask[index];
  }
  throw new Error(`no DSN hour for ${new Date(ms).toISOString()}`);
}

const listening = (ms: number) => places.filter((_, bit) => (maskAt(ms) >> bit) & 1);
const wording = (ms: number) => (listening(ms).length === 0 ? "No station listening now" : `${listening(ms).join(" and ")} listening now`);
const utc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`;
};

const hours = Array.from({ length: 720 }, (_, h) => LANDING + h * HOUR_MS);
const card = (page: Page) => page.locator("section[aria-labelledby=relay-title]");
const slider = (page: Page) => page.getByLabel("Time after the chosen date");
/** The relay card is folded under the timeline; opening it shows the card. */
const openRelay = (page: Page) => page.getByText("Which DSN dish can reach the lander, hour by hour").click();

test("the stations, their shares and the hours with no station come from the DSN files", async ({ page }) => {
  await page.goto("/sky");
  await openRelay(page);
  const lanes = card(page).getByTestId("relay-lane");
  await expect(lanes).toHaveCount(3);
  for (const [bit, place] of places.entries()) {
    const share = hours.filter((ms) => (maskAt(ms) >> bit) & 1).length / hours.length;
    await expect(lanes.nth(bit)).toContainText(place);
    await expect(lanes.nth(bit).getByTestId("relay-hours")).toHaveText(`${Math.round(share * 100)}%`);
  }
  const none = hours.filter((ms) => maskAt(ms) === 0).length;
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(`Three stations take turns; the Moon has no station listening for ${none} of 720 hours.`);
  // runs of silent hours, one mark each
  const runs = hours.filter((ms, i) => maskAt(ms) === 0 && (i === 0 || maskAt(hours[i - 1]) !== 0)).length;
  await expect(card(page).getByTestId("relay-gap")).toHaveCount(runs);
});

test("the listening chip follows the slider", async ({ page }) => {
  await page.goto("/sky");
  await openRelay(page);
  const chip = card(page).getByTestId("relay-now");
  await expect(chip).toHaveText(wording(LANDING));
  // the first hour of the mission where a different set of stations listens
  const later = hours.find((ms) => ms < LANDING + 14 * 24 * HOUR_MS && wording(ms) !== wording(LANDING))!;
  await slider(page).fill(String((later - LANDING) / HOUR_MS));
  await expect(chip).toHaveText(wording(later));
});

test("the arrow keys walk the lanes hour by hour and name who listens", async ({ page }) => {
  await page.goto("/sky");
  await openRelay(page);
  const lanes = card(page).getByRole("group", { name: "Stations across the 30 days" });
  await lanes.focus();
  for (const step of [1, 2, 3]) {
    await page.keyboard.press("ArrowRight");
    const ms = LANDING + step * HOUR_MS;
    const who = listening(ms);
    await expect(card(page).getByTestId("relay-pointer")).toHaveText(`${utc(ms)}: ${who.length > 0 ? who.join(" and ") : "no station"}`);
  }
});

test("End and Home jump to the last and first hour, and Page keys move a day", async ({ page }) => {
  await page.goto("/sky");
  await openRelay(page);
  const lanes = card(page).getByRole("group", { name: "Stations across the 30 days" });
  const readout = card(page).getByTestId("relay-pointer");
  const says = (ms: number) => `${utc(ms)}: ${listening(ms).length > 0 ? listening(ms).join(" and ") : "no station"}`;
  await lanes.focus();
  await page.keyboard.press("End");
  await expect(readout).toHaveText(says(LANDING + 719 * HOUR_MS));
  await page.keyboard.press("ArrowRight");
  await expect(readout).toHaveText(says(LANDING + 719 * HOUR_MS));
  await page.keyboard.press("PageUp");
  await expect(readout).toHaveText(says(LANDING + 695 * HOUR_MS));
  await page.keyboard.press("Home");
  await expect(readout).toHaveText(says(LANDING));
});

test("a far-side site gets no relay card, since it never sees Earth", async ({ page }) => {
  await page.goto("/sky?site=change-6");
  await expect(page.getByTestId("far-side-note")).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("near the end of the data the card covers only the hours there are", async ({ page }) => {
  await page.goto("/sky?t=2030-12-25T00:00Z");
  await openRelay(page);
  // 25 Dec 00:00 up to 31 Dec 23:00, the last hour the files hold: 167 hours
  const late = JSON.parse(readFileSync(join(__dirname, "..", "public", "data", "dsn-2030.json"), "utf-8")) as DsnFile;
  const first = (Date.UTC(2030, 11, 25) - Date.parse(late.start)) / HOUR_MS;
  const none = late.mask.slice(first, first + 167).filter((mask) => mask === 0).length;
  await expect(card(page).getByRole("heading", { level: 2 })).toHaveText(
    none === 0 ? "Three stations take turns, and one is always listening." : `Three stations take turns; the Moon has no station listening for ${none} of 167 hours.`,
  );
});
