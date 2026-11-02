import { describe, expect, test } from "vitest";
import {
  columnLabels,
  columnsOf,
  compareLead,
  compareQuery,
  compareValue,
  extraFor,
  hasRepeat,
  joinQueries,
  nextExtra,
  parseCompare,
  shortfall,
  type CompareExtra,
} from "./compare";
import { customSite, DEFAULT_TIME_MS, type Selection } from "./selection";
import { findSite } from "./sites";

const shackleton = findSite("shackleton-rim")!;
const im2 = findSite("im-2")!;
const main: Selection = { site: shackleton, timeMs: DEFAULT_TIME_MS };
const OTHER_TIME = Date.UTC(2028, 1, 29, 12);

const parse = (...values: string[]) => parseCompare(new URLSearchParams(values.map((v) => ["with", v])), main);

describe("parseCompare", () => {
  test("no extra columns by default", () => {
    expect(parse()).toEqual({ extras: [], problems: [] });
  });

  test("reads a curated site that follows the main date", () => {
    expect(parse("im-2")).toEqual({ extras: [{ site: im2, ownTimeMs: null }], problems: [] });
  });

  test("reads a site with its own date", () => {
    expect(parse("im-2@2028-02-29T12:00Z").extras).toEqual([{ site: im2, ownTimeMs: OTHER_TIME }]);
  });

  test("reads custom coordinates, with terrain only inside the tiles", () => {
    expect(parse("-85.25,120").extras[0].site).toEqual(customSite(-85.25, 120));
    expect(parse("-85.25,120").extras[0].site.has_terrain).toBe(true);
    expect(parse("10,20").extras[0].site.has_terrain).toBe(false);
  });

  test("the same site on another date is a valid column", () => {
    expect(parse("shackleton-rim@2028-02-29T12:00Z").extras).toHaveLength(1);
  });

  test.each(["nowhere", "", "91,0", "0,181", "1,2,3", "im-2@2028-02-30T12:00Z", "im-2@2031-01-01T00:00Z", "im-2@yesterday", "im-2@", "a@b@c"])(
    "refuses %j and says so",
    (value) => {
      const { extras, problems } = parse(value);
      expect(extras).toEqual([]);
      expect(problems).toHaveLength(1);
    },
  );

  test("a repeat of the main column or another column is left out", () => {
    const { extras, problems } = parse("shackleton-rim", "im-2", "im-2");
    expect(extras).toEqual([{ site: im2, ownTimeMs: null }]);
    expect(problems).toHaveLength(2);
  });

  test("a repeat is judged on the date the column really uses", () => {
    expect(parse("shackleton-rim@2027-12-29T21:00Z").extras).toEqual([]);
  });

  test("more than three columns are left out and reported", () => {
    const { extras, problems } = parse("im-2", "im-1", "chandrayaan-3");
    expect(extras).toHaveLength(2);
    expect(problems).toEqual(["Compare shows three columns, so the rest of the link is left out."]);
  });
});

describe("links", () => {
  const extras: CompareExtra[] = [
    { site: im2, ownTimeMs: null },
    { site: customSite(-85.25, 120), ownTimeMs: OTHER_TIME },
  ];

  test("a column round-trips through its link value", () => {
    const query = compareQuery(extras.map(compareValue));
    expect(query).toBe("with=im-2&with=-85.25,120@2028-02-29T12:00Z");
    expect(parseCompare(new URLSearchParams(query), main)).toEqual({ extras, problems: [] });
  });

  test("a bad value cannot add a parameter to the address", () => {
    expect(compareQuery(["a&site=im-2"])).toBe("with=a%26site%3Dim-2");
  });

  test("joinQueries skips empty parts", () => {
    expect(joinQueries("", "")).toBe("");
    expect(joinQueries("site=im-2", "")).toBe("site=im-2");
    expect(joinQueries("", "with=im-2")).toBe("with=im-2");
    expect(joinQueries("site=im-2", "with=im-2")).toBe("site=im-2&with=im-2");
  });
});

describe("columns", () => {
  test("the selection comes first, and a column without a date uses the main one", () => {
    expect(columnsOf(main, [{ site: im2, ownTimeMs: null }, { site: im2, ownTimeMs: OTHER_TIME }])).toEqual([
      main,
      { site: im2, timeMs: DEFAULT_TIME_MS },
      { site: im2, timeMs: OTHER_TIME },
    ]);
  });

  test("a date equal to the main one goes back to following it", () => {
    expect(extraFor(im2, DEFAULT_TIME_MS, DEFAULT_TIME_MS)).toEqual({ site: im2, ownTimeMs: null });
    expect(extraFor(im2, OTHER_TIME, DEFAULT_TIME_MS)).toEqual({ site: im2, ownTimeMs: OTHER_TIME });
  });

  test("a new column takes a site not yet on the page", () => {
    const first = nextExtra([main]);
    expect(first.site.id).not.toBe("shackleton-rim");
    expect(first.ownTimeMs).toBeNull();
    const second = nextExtra([main, { site: first.site, timeMs: main.timeMs }]);
    expect([first.site.id, "shackleton-rim"]).not.toContain(second.site.id);
  });

  test("names the sites when they differ, the dates when they do not, and both when needed", () => {
    const later = { site: shackleton, timeMs: OTHER_TIME };
    const other = { site: im2, timeMs: DEFAULT_TIME_MS };
    expect(columnLabels([main, other])).toEqual(["Shackleton crater rim", "IM-2 Athena"]);
    expect(columnLabels([main, later])).toEqual(["29 Dec 2027", "29 Feb 2028"]);
    expect(columnLabels([main, later, other])[0]).toBe("Shackleton crater rim on 29 Dec 2027");
    expect(columnLabels([main, later, other])[1]).toBe("Shackleton crater rim on 29 Feb 2028");
  });

  test("custom sites are told apart by their coordinates", () => {
    const custom = { site: customSite(-85.25, 120), timeMs: DEFAULT_TIME_MS };
    expect(columnLabels([main, custom])[1]).toBe("85.25°S 120.00°E");
  });
});

describe("hasRepeat", () => {
  test("finds the same site at the same time, and nothing else", () => {
    expect(hasRepeat([main, { site: im2, timeMs: main.timeMs }])).toBe(false);
    expect(hasRepeat([main, { site: shackleton, timeMs: OTHER_TIME }])).toBe(false);
    expect(hasRepeat([main, { ...main }])).toBe(true);
  });
});

describe("compareLead", () => {
  const entries = (...hours: (number | null)[]) => hours.map((goldenHours, i) => ({ label: `Site ${i + 1}`, goldenHours, hasTerrain: true }));

  test("needs two results", () => {
    expect(compareLead(entries(336))).toBeNull();
    expect(compareLead(entries(336, null))).toBeNull();
  });

  test("names the leader and the gap to the next", () => {
    const lead = compareLead(entries(100.5, 336, 200.2))!;
    expect(lead).toMatchObject({ lead: "Site 2 leads by ", emphasis: "136 Golden hours.", best: 336 });
    expect(lead.isBest).toEqual([false, true, false]);
  });

  test("the gap is the difference of the hours on the page", () => {
    expect(compareLead(entries(200.1, 199.9))!.emphasis).toBe("1 Golden hour.");
  });

  test("a small lead never reads as a tie", () => {
    expect(compareLead(entries(200.9, 200.2))!.emphasis).toBe("under 1 Golden hour.");
  });

  test("a difference within the search's precision is a tie", () => {
    const lead = compareLead(entries(200.5, 200.5 - 0.01))!;
    expect(lead).toMatchObject({ lead: "Level at ", emphasis: "200 Golden hours." });
    expect(lead.isBest).toEqual([false, false]);
  });

  test("hours that read differently on the page are never called level", () => {
    expect(compareLead(entries(336, 335.99))).toMatchObject({ lead: "Site 1 leads by ", emphasis: "1 Golden hour." });
  });

  test("a level result under an hour matches the cards", () => {
    expect(compareLead(entries(0.5, 0.5))!.emphasis).toBe("under 1 Golden hour.");
    expect(compareLead(entries(1.5, 1.5))!.emphasis).toBe("1 Golden hour.");
  });

  test("a flat horizon cannot outrank real terrain", () => {
    const flat = { label: "Flat", goldenHours: 336, hasTerrain: false };
    const lead = compareLead([flat, ...entries(100, 50)])!;
    expect(lead).toMatchObject({ lead: "Site 1 leads by ", best: 100 });
    expect(lead.isBest).toEqual([false, true, false]);
    expect(compareLead([flat, ...entries(100)])).toBeNull();
  });

  test("flat horizons can still be ranked against each other", () => {
    const flat = (goldenHours: number, label: string) => ({ label, goldenHours, hasTerrain: false });
    expect(compareLead([flat(300, "A"), flat(100, "B")])).toMatchObject({ lead: "A leads by " });
  });

  test("two leaders share the lead", () => {
    const lead = compareLead(entries(300, 300, 100))!;
    expect(lead).toMatchObject({ lead: "Site 1 and Site 2 lead by ", emphasis: "200 Golden hours." });
    expect(lead.isBest).toEqual([true, true, false]);
  });

  test("no Golden hours anywhere is said plainly", () => {
    const lead = compareLead(entries(0, 0))!;
    expect(`${lead.lead}${lead.emphasis}`).toBe("No Golden hours in any of these.");
    expect(lead.isBest).toEqual([false, false]);
  });

  test("a column past the data is ignored", () => {
    expect(compareLead(entries(10, null, 20))).toMatchObject({ lead: "Site 3 leads by ", emphasis: "10 Golden hours." });
  });
});

describe("shortfall", () => {
  test("uses the hours shown, and never says behind for the best", () => {
    expect(shortfall(336, 336)).toBeNull();
    expect(shortfall(200.5, 200.505)).toBeNull();
    expect(shortfall(336, 100)).toBeNull();
    expect(shortfall(335.995, 336)).toBe("1 h behind");
    expect(shortfall(100.5, 336)).toBe("236 h behind");
    expect(shortfall(200.2, 200.9)).toBe("under 1 h behind");
  });
});
