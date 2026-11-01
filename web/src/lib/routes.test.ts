import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PAGES, DESKTOP_NAV, isActivePage, PHONE_MORE, PHONE_TABS } from "./routes";

const appDir = (href: string) => join(__dirname, "..", "app", ...href.split("/").filter(Boolean));

describe("site pages", () => {
  it("has the nine agreed pages, with Atlas as home", () => {
    expect(ALL_PAGES.map((p) => p.label)).toEqual([
      "Atlas", "Sky", "Compare", "Dates", "Power", "Ellipse", "3D", "Proof", "Brief",
    ]);
    expect(ALL_PAGES[0].href).toBe("/");
  });

  it("has a page file for every route", () => {
    for (const page of ALL_PAGES) {
      expect(existsSync(join(appDir(page.href), "page.tsx")), page.href).toBe(true);
    }
  });

  it("uses each href once", () => {
    expect(new Set(ALL_PAGES.map((p) => p.href)).size).toBe(ALL_PAGES.length);
  });

  it("shows eight tabs on desktop", () => {
    expect(DESKTOP_NAV.map((p) => p.label)).toEqual([
      "Atlas", "Sky", "Compare", "Dates", "Power", "Ellipse", "3D", "Proof",
    ]);
  });

  it("reaches every page on a phone, each exactly once", () => {
    expect(PHONE_TABS.map((p) => p.label)).toEqual(["Atlas", "Sky", "Compare"]);
    const reachable = [...PHONE_TABS, ...PHONE_MORE].map((p) => p.href).sort();
    expect(reachable).toEqual(ALL_PAGES.map((p) => p.href).sort());
  });
});

describe("isActivePage", () => {
  it("matches home only at the root", () => {
    expect(isActivePage("/", "/")).toBe(true);
    expect(isActivePage("/sky", "/")).toBe(false);
  });

  it("matches a page and its sub-paths", () => {
    expect(isActivePage("/sky", "/sky")).toBe(true);
    expect(isActivePage("/sky/replay", "/sky")).toBe(true);
  });

  it("does not match a different page that shares a prefix", () => {
    expect(isActivePage("/skyline", "/sky")).toBe(false);
  });
});
