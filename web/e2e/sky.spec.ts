import { expect, test, type Page } from "@playwright/test";

const sun = (page: Page) => page.getByTestId("sky-sun");
const earth = (page: Page) => page.getByTestId("sky-earth");
const readout = (page: Page, name: string) => page.getByRole("region", { name });

/** What the browser finds at the centre of a body: the body itself, or the terrain over it. */
const topmostAtCentre = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const body = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const found = document.elementFromPoint(body.x + body.width / 2, body.y + body.height / 2);
    return found?.closest("[data-testid]")?.getAttribute("data-testid");
  }, testId);

/** Reopens a moment from its own link, a fresh calculation, and returns both readouts. */
async function readoutsAt(page: Page, query: string) {
  await page.goto(`/sky?${query}`);
  await expect(sun(page)).toBeAttached();
  return [await readout(page, "Sun").locator("dl").innerText(), await readout(page, "Earth").locator("dl").innerText()];
}

const shownTime = (page: Page) => page.getByTestId("sky-time");
const slider = (page: Page) => page.getByLabel("Time after the chosen date");

function linkTime(text: string): string {
  const match = /^(\d+) (\w{3}) (\d{4}), (\d\d:\d\d) UTC$/.exec(text)!;
  const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(match[2]) / 3 + 1;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}T${match[4]}Z`;
}

const countdownBox = (page: Page) => page.getByRole("region", { name: "Countdown" });

test("the headline and countdown show the engine's result for the default date", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Golden for all 14 days.");
  await expect(page.getByText("336 of 336 mission hours")).toBeVisible();
  await expect(page.getByText("Golden window open")).toBeVisible();
  await expect(countdownBox(page)).toContainText("14d 3h");
  await expect(countdownBox(page)).toContainText("to Earthset");
  await expect(countdownBox(page)).toContainText("22d 22h");
  await expect(countdownBox(page)).toContainText("to sunset");
});

test("after sunset the countdown looks to sunrise and the status says why", async ({ page }) => {
  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(countdownBox(page)).toContainText("to sunrise");
  // on this date Earth has set too
  await expect(page.getByText("Sun and Earth below the horizon")).toBeVisible();
  await expect(countdownBox(page)).toContainText("to Earthrise");
});

test("with no event ahead the countdown says so", async ({ page }) => {
  await page.goto("/sky?lat=0&lon=180");
  await expect(countdownBox(page)).toContainText("Not in 60 days");
  await expect(countdownBox(page)).toContainText("to Earthrise");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No Golden hours in 14 days.");
});

test("near the end of the data the countdown never claims a full search", async ({ page }) => {
  await page.goto("/sky?t=2030-12-10T00:00Z");
  await expect(countdownBox(page)).toBeVisible();
  await expect(countdownBox(page)).not.toContainText("Not in 60 days");
});

test("a date too late for a full mission gets no headline number", async ({ page }) => {
  await page.goto("/sky?t=2030-12-25T00:00Z");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sky from Shackleton crater rim");
  await expect(page.getByText("runs past our data")).toBeVisible();
});

test("the countdown runs down during playback, and a paused frame equals that moment's link", async ({ page }) => {
  await page.goto("/sky");
  await expect(countdownBox(page)).toContainText("14d 3h");
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await expect(countdownBox(page)).not.toContainText("14d 3h");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(150);
  const frozenTime = (await shownTime(page).textContent())!;
  const frozen = await countdownBox(page).innerText();
  await page.goto(`/sky?t=${linkTime(frozenTime)}`);
  await expect(sun(page)).toBeAttached();
  await expect.poll(() => countdownBox(page).innerText()).toBe(frozen);
});

test("playing stays smooth, so heavy results are not worked out again on each frame", async ({ page, isMobile }) => {
  test.skip(isMobile, "measured once, at desktop size");
  await page.addInitScript(() => {
    const frames = { count: 0 };
    Object.assign(window, { frames });
    const tick = () => {
      frames.count += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const frameCount = () => page.evaluate(() => (window as unknown as { frames: { count: number } }).frames.count);
  await page.goto("/sky");
  await expect(countdownBox(page)).toContainText("14d 3h");
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await page.waitForTimeout(300);
  const before = await frameCount();
  await page.waitForTimeout(3000);
  // about 58 per second on a free machine; 5 was the rate when results were redone on each frame
  expect(((await frameCount()) - before) / 3).toBeGreaterThan(15);
});

test("the headline stays on the chosen date while the slider moves", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  await slider(page).fill("200");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Golden for all 14 days.");
});

test("the headline number sits beside the Landing Ellipse warning", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await expect(page.getByText("For this exact point; ground nearby can differ.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Landing Ellipse/ })).toHaveAttribute("href", "/ellipse?site=im-2");
});

const timeline = (page: Page) => page.getByRole("region", { name: "Next 30 days" });

test("the timeline shows the five rows and its axis", async ({ page }) => {
  await page.goto("/sky");
  for (const name of ["Sun", "Earth", "DSN", "Comms", "Golden"]) await expect(timeline(page).getByText(name, { exact: true }).first()).toBeVisible();
  for (const tick of ["+0d", "+7d", "+14d", "+21d", "+28d"]) await expect(timeline(page).getByText(tick, { exact: true })).toBeVisible();
  await expect(timeline(page).getByText("14-day mission")).toBeVisible();
});

test("every bar sits where its window's times say", async ({ page }) => {
  await page.goto("/sky");
  await expect(timeline(page)).toBeVisible();
  const bars = await timeline(page).locator("[data-start]").evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      const track = item.parentElement!.getBoundingClientRect();
      return { start: Number(item.getAttribute("data-start")), end: Number(item.getAttribute("data-end")), left: box.left - track.left, right: box.right - track.left, width: track.width };
    }),
  );
  expect(bars.length).toBeGreaterThan(10);
  const origin = Date.UTC(2027, 11, 29, 21);
  const span = 30 * 86_400_000;
  for (const bar of bars) {
    expect(Math.abs(bar.left - ((bar.start - origin) / span) * bar.width)).toBeLessThan(1);
    expect(Math.abs(bar.right - ((bar.end - origin) / span) * bar.width)).toBeLessThan(2);
  }
});

test("the list of windows shows the published Earthset time", async ({ page }) => {
  await page.goto("/sky");
  await timeline(page).getByText("List every window").click();
  const earth = timeline(page).getByRole("row", { name: /^Earth/ }).first();
  await expect(earth).toContainText("13 Jan 00:34");
});

test("near the end of the data the timeline says where it stops", async ({ page }) => {
  await page.goto("/sky?t=2030-12-20T00:00Z");
  await expect(timeline(page)).toContainText("Our data ends on 31 Dec 2030.");
  await expect(page.getByTestId("timeline-cut")).toBeAttached();
});

test("a window cut by the range says so instead of showing a false time", async ({ page }) => {
  await page.goto("/sky");
  await timeline(page).getByText("List every window").click();
  await expect(timeline(page).getByRole("row", { name: /^Sun/ }).first()).toContainText("already open");
});

test("the time marker follows the slider", async ({ page }) => {
  await page.goto("/sky");
  await expect(timeline(page)).toBeVisible();
  const marker = page.getByTestId("timeline-now");
  const left = () => marker.evaluate((el) => el.style.left);
  expect(await left()).toBe("0%");
  await slider(page).fill("180");
  await expect.poll(left).toBe("25%");
});

test("the Sun and Earth are named on the view", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByTestId("sky-sun-label")).toHaveText("Sun");
  await expect(page.getByTestId("sky-earth-label")).toHaveText("Earth");
});

test("moving the slider shows exactly what that moment's own link shows", async ({ page }) => {
  for (const [hours, time] of [[6, "2027-12-30T03:00Z"], [100, "2028-01-03T01:00Z"], [336, "2028-01-12T21:00Z"]] as const) {
    const direct = await readoutsAt(page, `t=${time}`);
    await page.goto("/sky");
    await expect(sun(page)).toBeAttached();
    await slider(page).fill(String(hours));
    await expect(shownTime(page)).toHaveText(new RegExp(`^${Number(time.slice(8, 10))} `));
    expect([await readout(page, "Sun").locator("dl").innerText(), await readout(page, "Earth").locator("dl").innerText()]).toEqual(direct);
  }
});

test("playing moves the Sun, and a paused frame equals the engine at that time", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  const start = await readout(page, "Sun").locator("dl").innerText();
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect.poll(() => readout(page, "Sun").locator("dl").innerText()).not.toBe(start);
  await page.getByRole("button", { name: "Pause" }).click();

  const frozenTime = (await shownTime(page).textContent())!;
  const frozen = [await readout(page, "Sun").locator("dl").innerText(), await readout(page, "Earth").locator("dl").innerText()];
  await page.waitForTimeout(300);
  await expect(shownTime(page)).toHaveText(frozenTime);
  expect(await readoutsAt(page, `t=${linkTime(frozenTime)}`)).toEqual(frozen);
});

test("playing does not change the address or the date picker", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await expect(sun(page)).toBeAttached();
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Pause" }).click();
  expect(new URL(page.url()).search).toBe("?site=im-2");
  await expect(page.getByLabel("Date and time, UTC")).toHaveValue("2027-12-29T21:00");
});

test("the view follows the Sun while playing, until it is turned by hand", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  const sunX = async () => (await sun(page).boundingBox())!.x;
  const before = await sunX();
  const startTime = await shownTime(page).textContent();
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await expect(shownTime(page)).not.toHaveText(startTime!);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Pause" }).click();
  expect(Math.abs((await sunX()) - before)).toBeLessThan(2);

  await page.getByRole("button", { name: "Turn right" }).click();
  const turned = await sunX();
  await slider(page).fill("150");
  await expect.poll(async () => Math.abs((await sunX()) - turned)).toBeGreaterThan(20);
});

test("the slider crosses the sunset found by the 1-minute SPICE reference", async ({ page }) => {
  // Shackleton rim: the Sun sets at 2028-01-21 19:44:41 UTC
  await page.goto("/sky?t=2028-01-15T19:00Z");
  await expect(sun(page)).toBeAttached();
  await slider(page).fill("144");
  await expect(shownTime(page)).toHaveText("21 Jan 2028, 19:00 UTC");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  await slider(page).fill("145");
  await expect(shownTime(page)).toHaveText("21 Jan 2028, 20:00 UTC");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
});

test("the slider sits where the shown time is, even part-way through an hour", async ({ page }) => {
  await page.goto("/sky?t=2030-12-30T23:30Z");
  await expect(sun(page)).toBeAttached();
  await expect(slider(page)).toHaveAttribute("max", "23.5");
  await slider(page).fill("23.5");
  await expect(shownTime(page)).toHaveText("31 Dec 2030, 23:00 UTC");
  await expect(slider(page)).toHaveValue("23.5");
});

test("reduced motion switched on during a run stops it", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByText(/reduced motion/i)).toBeVisible();
  const frozen = await shownTime(page).textContent();
  await page.waitForTimeout(400);
  await expect(shownTime(page)).toHaveText(frozen!);
});

test("going back to a site starts at the beginning and does not resume playing", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  await page.getByRole("button", { name: "Play the next 14 days" }).click();
  await page.getByLabel("Landing site").selectOption("im-2");
  await expect(page).toHaveURL(/site=im-2/);
  await expect(sun(page)).toBeAttached();
  await page.getByLabel("Landing site").selectOption("shackleton-rim");
  await expect(page).toHaveURL(/\/sky$/);
  await expect(sun(page)).toBeAttached();
  await expect(page.getByRole("button", { name: "Play the next 14 days" })).toBeVisible();
  await expect(slider(page)).toHaveValue("0");
});

test("changing the site returns playback to the start", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  await slider(page).fill("100");
  await page.getByLabel("Landing site").selectOption("im-2");
  await expect(page).toHaveURL(/site=im-2/);
  await expect(slider(page)).toHaveValue("0");
});

test("a chosen date near the end of the data plays only as far as the data goes", async ({ page }) => {
  await page.goto("/sky?t=2030-12-31T00:00Z");
  await expect(sun(page)).toBeAttached();
  await expect(slider(page)).toHaveAttribute("max", "23");
  await page.goto("/sky?t=2030-12-31T22:30Z");
  await expect(sun(page)).toBeAttached();
  await expect(slider(page)).toHaveAttribute("max", "0.5");
  await page.goto("/sky?t=2030-12-31T23:00Z");
  await expect(sun(page)).toBeAttached();
  await expect(slider(page)).toHaveCount(0);
});

test("reduced motion replaces Play with the slider", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sky");
  await expect(sun(page)).toBeAttached();
  await expect(page.getByRole("button", { name: "Play the next 14 days" })).toHaveCount(0);
  await expect(page.getByText(/reduced motion/i)).toBeVisible();
  await slider(page).fill("24");
  await expect(shownTime(page)).toHaveText("30 Dec 2027, 21:00 UTC");
});

test("the default view shows the engine's positions for Shackleton rim", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByText(/^Shackleton crater rim ·/)).toBeVisible();
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  await expect(readout(page, "Earth")).toContainText("Above the horizon");
  await expect(sun(page)).toBeVisible();
  await expect(earth(page)).toBeVisible();
});

test("the Sun is hidden by terrain exactly when the engine says it has set", async ({ page }) => {
  // Shackleton rim, sunset 2028-01-21 19:44:41 UTC
  await page.goto("/sky?t=2028-01-21T12:00Z");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  await page.getByRole("button", { name: "Find the Sun" }).click();
  await expect.poll(() => topmostAtCentre(page, "sky-sun")).toBe("sky-sun");

  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  await page.getByRole("button", { name: "Find the Sun" }).click();
  await expect.poll(() => topmostAtCentre(page, "sky-sun")).toBe("sky-terrain");
});

test("the find buttons bring a body to the middle of the view", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  const view = (await page.getByTestId("sky-view").boundingBox())!;
  for (const [button, body] of [["Find Earth", earth], ["Find the Sun", sun]] as const) {
    await page.getByRole("button", { name: button }).click();
    await expect.poll(async () => {
      const box = (await body(page).boundingBox())!;
      return Math.abs(box.x + box.width / 2 - (view.x + view.width / 2));
    }).toBeLessThan(1);
  }
});

test("a full turn past north brings the view back to the same place", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  await page.getByRole("button", { name: "Find the Sun" }).click();
  const facing = page.getByText(/^Facing \d+°$/);
  await expect(facing).toHaveText("Facing 315°");
  const before = (await sun(page).boundingBox())!;
  await page.getByRole("button", { name: "Turn right" }).click();
  await expect(facing).toHaveText("Facing 345°");
  for (let i = 0; i < 11; i++) await page.getByRole("button", { name: "Turn right" }).click();
  await expect(facing).toHaveText("Facing 315°");
  expect(Math.abs((await sun(page).boundingBox())!.x - before.x)).toBeLessThan(1);
});

test("the 360 degree art joins at north on whole pixels, so no seam shows", async ({ page }) => {
  await page.goto("/sky?site=im-2&t=2028-02-29T12:00Z");
  await expect(sun(page)).toBeVisible();
  for (let press = 0; press < 3; press++) {
    const tiles = await page.locator("[data-testid='sky-terrain'] use").evaluateAll((uses) => uses.map((use) => Number(use.getAttribute("x"))));
    expect(tiles).toHaveLength(3);
    tiles.forEach((x) => expect(Number.isInteger(x)).toBe(true));
    await page.getByTestId("sky-view").focus();
    await page.keyboard.press("ArrowRight");
  }
});

test("on the page, the Sun crosses the drawn skyline at the engine's sunset", async ({ page, isMobile }) => {
  test.skip(isMobile, "the scale is the same at both sizes");
  /** How far the Sun's centre sits above the line drawn at its own azimuth, in pixels. */
  const gapAboveSkyline = async () => {
    await expect(sun(page)).toBeVisible();
    const azimuth = Number((await readout(page, "Sun").getByText(/^\d+\.\d+°$/).nth(1).textContent())!.replace("°", ""));
    return page.evaluate((az) => {
      const cy = Number(document.querySelector("[data-testid='sky-sun']")!.getAttribute("cy"));
      const points = document.querySelector("polyline")!.getAttribute("points")!.split(" ").map((p) => p.split(",").map(Number));
      const pxPerDeg = points.at(-1)![0] / 360;
      const after = points.findIndex(([x]) => x >= az * pxPerDeg);
      const [x0, y0] = points[after - 1];
      const [x1, y1] = points[after];
      return y0 + ((y1 - y0) * (az * pxPerDeg - x0)) / (x1 - x0) - cy;
    }, azimuth);
  };

  // Shackleton rim, sunset 2028-01-21 19:44:41 UTC
  await page.goto("/sky?t=2028-01-21T19:25Z");
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
  expect(await gapAboveSkyline()).toBeGreaterThan(0);

  await page.goto("/sky?t=2028-01-21T20:05Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  expect(await gapAboveSkyline()).toBeLessThan(0);
});

test("no glow is left in the sky after sunset", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByTestId("sky-glow")).toHaveCount(1);
  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(sun(page)).toBeAttached();
  await expect(page.getByTestId("sky-glow")).toHaveCount(0);
});

test("the turn hint appears only for a body that can be seen by turning", async ({ page }) => {
  await page.goto("/sky?site=apollo-11&t=2027-06-10T12:00Z");
  await page.getByRole("button", { name: "Find Earth" }).click();
  await expect(readout(page, "Earth")).not.toContainText("Outside this view");
  await expect(readout(page, "Sun")).toContainText("Outside this view");

  await page.goto("/sky?t=2028-01-22T04:00Z");
  await expect(readout(page, "Sun")).toContainText("Below the horizon");
  await page.getByRole("button", { name: "Find Earth" }).click();
  await expect(readout(page, "Sun")).not.toContainText("Outside this view");
});

test("a failed terrain picture says so and keeps the skyline", async ({ page }) => {
  await page.route("**/data/sky/*.webp", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/sky");
  await expect(page.getByText("Terrain picture unavailable.")).toBeVisible();
  await expect(page.locator("polyline")).toBeAttached();
  await expect(readout(page, "Sun")).toContainText("Above the horizon");
});

test("the view can be turned with the arrow keys", async ({ page }) => {
  await page.goto("/sky");
  await expect(sun(page)).toBeVisible();
  const before = (await sun(page).boundingBox())!.x;
  await page.getByTestId("sky-view").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await sun(page).boundingBox())!.x).toBeLessThan(before);
});

test("a custom site south of 65 S gets real terrain and says how it was made", async ({ page }) => {
  await page.goto("/sky?lat=-85.25&lon=120");
  await expect(page.getByText(/computed in your browser/)).toBeVisible();
  await expect(page.getByText(/not included/i)).toHaveCount(0);
  await expect(page.getByTestId("sky-art")).toHaveAttribute("href", /^blob:/, { timeout: 30_000 });
  await expect(readout(page, "Sun")).toContainText("Skyline there");
});

test("a custom site with broken tiles shows a notice and no sky", async ({ page }) => {
  await page.route("**/*.i2z", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/sky?lat=-85.25&lon=120");
  await expect(page.getByRole("alert").filter({ hasText: "A data file is missing." })).toBeVisible();
  await expect(sun(page)).toHaveCount(0);
});

test("a custom site beyond the height tiles shows a flat horizon and says so", async ({ page }) => {
  await page.goto("/sky?lat=10&lon=120");
  await expect(page.getByText("Flat horizon: terrain not included", { exact: false })).toBeVisible();
  await expect(page.getByTestId("sky-art")).toHaveCount(0);
  await expect(page.getByTestId("sky-terrain")).toBeVisible();
});

test("each terrain site loads its own art", async ({ page }) => {
  await page.goto("/sky?site=im-2");
  await expect(page.getByTestId("sky-art")).toHaveAttribute("href", "/data/sky/im-2.webp");
});

test("the page says what is real and what is for display", async ({ page }) => {
  await page.goto("/sky");
  await expect(page.getByText(/shading is for display/i)).toBeVisible();
  await expect(page.getByText(/not to scale/i)).toBeVisible();
});

test("broken data shows a notice and no sky", async ({ page }) => {
  await page.route("**/data/horizon/shackleton-rim.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/sky");
  await expect(page.getByRole("alert").filter({ hasText: "A data file is missing." })).toBeVisible();
  await expect(sun(page)).toHaveCount(0);
  await expect(readout(page, "Sun")).toHaveCount(0);
});

test("nothing overflows, at any supported width", async ({ page, isMobile }) => {
  test.skip(isMobile, "sizes are set here");
  for (const width of [320, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sky");
    await expect(sun(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("a site on the coarse global map says so, and a fine-map site does not", async ({ page }) => {
  await page.goto("/sky?site=change-4");
  await expect(page.getByTestId("coarse-note")).toContainText("237 m wide");
  await page.goto("/sky?site=apollo-16");
  await expect(page.getByRole("region", { name: "Countdown" })).toBeVisible();
  await expect(page.getByTestId("coarse-note")).toHaveCount(0);
});

test("a far-side site explains why it has no Golden hours", async ({ page }) => {
  await page.goto("/sky?site=change-6");
  await expect(page.getByTestId("far-side-note")).toContainText("relay satellite");
  await page.goto("/sky?site=apollo-12");
  await expect(page.getByRole("region", { name: "Countdown" })).toBeVisible();
  await expect(page.getByTestId("far-side-note")).toHaveCount(0);
});
