import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_MS,
  formatUtc,
  fromDateInput,
  parseCoordinate,
  parseSelection,
  selectionQuery,
  toDateInput,
  withQuery,
  type Selection,
} from "./selection";
import { SITES } from "./sites";

const parse = (query: string) => parseSelection(new URLSearchParams(query));
const im2 = SITES.find((s) => s.id === "im-2")!;
const t = (iso: string) => Date.parse(iso);

describe("parseSelection", () => {
  it("opens on Shackleton rim at the best 2027 date when the link has no choices", () => {
    const { selection, problems } = parse("");
    expect(selection.site.id).toBe("shackleton-rim");
    expect(selection.timeMs).toBe(t("2027-12-29T21:00Z"));
    expect(problems).toEqual([]);
  });

  it("reads a curated site and a time", () => {
    const { selection, problems } = parse("site=im-2&t=2027-03-01T06:30Z");
    expect(selection.site).toEqual(im2);
    expect(selection.timeMs).toBe(t("2027-03-01T06:30Z"));
    expect(problems).toEqual([]);
  });

  it("reads custom coordinates with no terrain", () => {
    const { selection, problems } = parse("lat=-85.25&lon=120");
    expect(selection.site).toMatchObject({ id: null, lat: -85.25, lon: 120, has_terrain: false });
    expect(problems).toEqual([]);
  });

  it("accepts the limits of each range", () => {
    expect(parse("lat=-90&lon=-180").problems).toEqual([]);
    expect(parse("lat=90&lon=180").problems).toEqual([]);
    expect(parse("t=2026-01-01T00:00Z").problems).toEqual([]);
    expect(parse("t=2030-12-31T23:00Z").problems).toEqual([]);
  });

  it.each([
    ["site=mars", "site"],
    ["site=../validation", "site"],
    ["lat=91&lon=0", "coordinates"],
    ["lat=0&lon=181", "coordinates"],
    ["lat=abc&lon=0", "coordinates"],
    ["lat=&lon=", "coordinates"],
    ["lat=1e2&lon=0", "coordinates"],
    ["lat=NaN&lon=0", "coordinates"],
    ["lat=Infinity&lon=0", "coordinates"],
    ["lat=5", "coordinates"],
    ["lon=5", "coordinates"],
    ["t=banana", "date"],
    ["t=2027-02-30T00:00Z", "date"],
    ["t=2027-13-01T00:00Z", "date"],
    ["t=2027-03-01", "date"],
    ["t=2025-12-31T23:59Z", "date"],
    ["t=2030-12-31T23:01Z", "date"],
    ["t=2031-01-01T00:00Z", "date"],
  ])("refuses %s and falls back to the default", (query, word) => {
    const { selection, problems } = parse(query);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(word);
    expect(selection.site.id).toBe("shackleton-rim");
    expect(selection.timeMs).toBe(DEFAULT_TIME_MS);
  });

  it("keeps the good part of a link when another part is bad", () => {
    const { selection, problems } = parse("site=im-2&t=banana");
    expect(selection.site.id).toBe("im-2");
    expect(problems).toHaveLength(1);
  });

  it("shows the named site and reports the conflict when a link also has coordinates", () => {
    const { selection, problems } = parse("site=im-2&lat=1&lon=2");
    expect(selection.site.id).toBe("im-2");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("both");
  });

  it.each(["site=im-2&site=im-1", "t=2027-01-01T00:00Z&t=2027-02-01T00:00Z", "lat=1&lat=2&lon=3"])(
    "refuses repeated values in %s",
    (query) => {
      const { selection, problems } = parse(query);
      expect(problems).toHaveLength(1);
      expect(selection.site.id).toBe("shackleton-rim");
      expect(selection.timeMs).toBe(DEFAULT_TIME_MS);
    },
  );
});

describe("selectionQuery", () => {
  const round = (query: string): Selection => parse(selectionQuery(parse(query).selection)).selection;

  it("is empty for the defaults, so the plain address stays clean", () => {
    expect(selectionQuery(parse("").selection)).toBe("");
  });

  it("gives back exactly what was chosen", () => {
    for (const query of ["site=im-2", "t=2028-02-29T12:00Z", "site=apollo-11&t=2026-01-01T00:00Z", "lat=-85.25&lon=120", "lat=0&lon=-179.5&t=2030-12-31T23:00Z"]) {
      expect(round(query)).toEqual(parse(query).selection);
      expect(selectionQuery(parse(query).selection)).toBe(query);
    }
  });

  it("cannot make an address outside this site from a doubled slash", () => {
    expect(withQuery("//evil.example", "site=im-2")).toBe("/evil.example?site=im-2");
    expect(withQuery("//evil.example", "")).toBe("/evil.example");
  });

  it("never writes a negative zero", () => {
    const { selection } = parse("lat=-0&lon=-0");
    expect(selectionQuery(selection)).toBe("lat=0&lon=0");
  });
});

describe("parseCoordinate", () => {
  it("reads plain decimals and trims spaces", () => {
    expect(parseCoordinate(" -85.25 ", 90)).toBe(-85.25);
    expect(parseCoordinate("120", 180)).toBe(120);
  });

  it("rounds to four decimals, about 3 metres on the Moon", () => {
    expect(parseCoordinate("10.123456", 90)).toBe(10.1235);
  });

  it("refuses what is not a coordinate in range", () => {
    for (const text of ["", " ", "abc", "1e2", "90.01", "-90.01", "1,5", "--1", "."]) {
      expect(parseCoordinate(text, 90), text).toBeNull();
    }
  });
});

describe("date input", () => {
  it("shows and reads UTC without the time zone shifting it", () => {
    expect(toDateInput(t("2027-12-29T21:00Z"))).toBe("2027-12-29T21:00");
    expect(fromDateInput("2027-12-29T21:00")).toBe(t("2027-12-29T21:00Z"));
  });

  it("refuses an empty, invalid or out-of-range value", () => {
    for (const text of ["", "2027-02-30T00:00", "2025-12-31T23:59", "2030-12-31T23:01", "abc"]) {
      expect(fromDateInput(text), text).toBeNull();
    }
  });
});

describe("formatUtc", () => {
  it("writes a clear UTC time", () => {
    expect(formatUtc(t("2027-12-29T21:00Z"))).toBe("29 Dec 2027, 21:00 UTC");
    expect(formatUtc(t("2026-03-01T06:05Z"))).toBe("1 Mar 2026, 06:05 UTC");
  });
});

describe("sites", () => {
  it("lists the five demo sites, all with terrain", () => {
    expect(SITES.map((s) => s.id).sort()).toEqual(["apollo-11", "chandrayaan-3", "im-1", "im-2", "shackleton-rim"]);
    expect(SITES.every((s) => s.has_terrain)).toBe(true);
  });
});
