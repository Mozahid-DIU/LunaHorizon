import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { findSite } from "../src/lib/sites";
import { loadEphemeris, loadProfile } from "../src/lib/testData";
import { timelineRows } from "../src/lib/timeline";
import { stateAt } from "../src/lib/windows";

const HOUR_MS = 3_600_000;
const LANDING = Date.UTC(2027, 11, 29, 21);

async function download(page: Page, what: "hourly" | "windows") {
  await page.getByTestId("csv-menu").click();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`csv-${what}`).click()]);
  return { name: file.suggestedFilename(), lines: readFileSync((await file.path())!, "utf-8").trimEnd().split("\r\n") };
}

test.describe("share", () => {
  test("Share copies a link that opens the same page, site and date", async ({ page, context, isMobile }) => {
    test.skip(isMobile, "a phone uses its own share sheet");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/sky?site=im-2&t=2028-02-01T12:00Z");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Golden/);
    const headline = await page.getByRole("heading", { level: 1 }).innerText();
    await page.getByTestId("share").click();
    await expect(page.getByTestId("share-pop")).toContainText("Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/sky\?site=im-2&t=2028-02-01T12:00Z$/);
    await expect(page.getByTestId("share-url")).toHaveValue(copied);

    await page.getByRole("button", { name: "Copy Mission Brief link" }).click();
    await expect(page.getByTestId("share-pop")).toContainText("Mission Brief link copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/brief\?site=im-2&t=2028-02-01T12:00Z$/);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("share-pop")).toHaveCount(0);
    await page.goto(copied);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
  });

  test("on a phone, Share opens the phone's own share sheet with the page link", async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone share sheet");
    await page.addInitScript(() => {
      Object.assign(window, { shared: [] as unknown[] });
      Object.defineProperty(navigator, "share", { value: async (data: unknown) => (window as unknown as { shared: unknown[] }).shared.push(data) });
    });
    await page.goto("/dates?site=im-1");
    await page.getByTestId("share").tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shared: { url: string }[] }).shared.length)).toBe(1);
    const shared = await page.evaluate(() => (window as unknown as { shared: { url: string }[] }).shared[0].url);
    expect(shared).toMatch(/\/dates\?site=im-1$/);
  });
});

/** The cells of one CSV line, honouring quotes. */
function cells(text: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) {
      out.push(cell);
      cell = "";
    } else cell += c;
  }
  out.push(cell);
  return out;
}

const angle = (value: number) => {
  const text = value.toFixed(3);
  return /^-0\.0+$/.test(text) ? "0.000" : text;
};

test.describe("CSV", () => {
  const eph = loadEphemeris([2027, 2028]);
  const site = findSite("im-2")!;
  const profile = loadProfile("im-2");

  test("the hourly file is the engine's state, hour by hour, for the 30 days", async ({ page }) => {
    await page.goto("/sky?site=im-2");
    await expect(page.getByTestId("csv-hourly")).toContainText("720 rows", { useInnerText: false });
    const { name, lines } = await download(page, "hourly");
    expect(name).toBe("lunahorizon-im-2-2027-12-29T2100Z-hourly.csv");
    expect(lines[0]).toBe(
      "utc,sun_az_deg,sun_el_deg,skyline_at_sun_deg,sun_above_skyline,earth_az_deg,earth_el_deg,skyline_at_earth_deg,earth_above_skyline,dsn_stations,comms,golden,site,site_lat_deg,site_lon_deg,horizon_source",
    );
    expect(lines).toHaveLength(1 + 720);
    for (const i of [0, 333, 719]) {
      const s = stateAt(eph, site, profile, LANDING + i * HOUR_MS);
      const row = cells(lines[1 + i]);
      expect(row[0]).toBe(new Date(LANDING + i * HOUR_MS).toISOString().replace(".000", ""));
      expect(row[2]).toBe(angle(s.sun.el));
      expect(row[6]).toBe(angle(s.earth.el));
      expect(row[11]).toBe(s.golden ? "1" : "0");
      expect(row.slice(12)).toEqual(["IM-2 Athena", "-84.78", "29.13", "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)"]);
    }
  });

  test("the windows file lists every window of the timeline", async ({ page }) => {
    await page.goto("/sky?site=im-2");
    const { name, lines } = await download(page, "windows");
    expect(name).toBe("lunahorizon-im-2-2027-12-29T2100Z-windows.csv");
    const windows = timelineRows(eph, site, profile, LANDING).flatMap(({ kind, windows }) => windows.map((w) => ({ kind, ...w })));
    expect(lines).toHaveLength(1 + windows.length);
    windows.forEach((w, i) => {
      const row = cells(lines[1 + i]);
      expect(row[0]).toBe(w.kind);
      expect(Math.abs(Date.parse(row[1]) - w.start)).toBeLessThanOrEqual(500);
      expect(Math.abs(Date.parse(row[2]) - w.end)).toBeLessThanOrEqual(500);
    });
  });

  test("near the end of the data the menu and the file hold the same hours", async ({ page }) => {
    await page.goto("/sky?site=im-2&t=2030-12-25T00:00Z");
    await expect(page.getByTestId("csv-hourly")).toContainText("168 rows", { useInnerText: false });
    const { lines } = await download(page, "hourly");
    expect(lines).toHaveLength(1 + 168);
    expect(cells(lines[lines.length - 1])[0]).toBe("2030-12-31T23:00:00Z");
  });

  test("a custom point names its tiles, and a flat horizon says it is flat", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/sky?lat=-85.25&lon=120");
    expect(cells((await download(page, "windows")).lines[1]).slice(-1)[0]).toBe("NASA LOLA height tiles, horizon computed in the browser");
    await page.goto("/sky?lat=10&lon=100");
    const flat = await download(page, "hourly");
    expect(flat.name).toBe("lunahorizon-lat10.000_lon100.000-2027-12-29T2100Z-hourly.csv");
    expect(cells(flat.lines[1]).slice(-1)[0]).toBe("none, flat horizon (terrain not included)");
  });
});
