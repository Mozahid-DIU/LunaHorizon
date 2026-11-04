import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseValidation, type ValidationFile } from "./data/validate";
import { evidenceScale, formatDegrees, proofHeadline, proofSections, siteLabel } from "./proof";

const raw = () => JSON.parse(readFileSync(join(__dirname, "..", "..", "public", "data", "validation.json"), "utf-8"));
type Raw = { summary: Record<string, number>; generated: string; sections: { id: string; rows: Record<string, unknown>[] }[] };
const edited = (change: (file: Raw) => void) => {
  const file = raw() as Raw;
  change(file);
  return file;
};

describe("parseValidation", () => {
  test("accepts the published file", () => {
    const file = parseValidation(raw());
    expect(file.sections.map(({ id }) => id)).toEqual(["horizons-sun-earth", "browser-engine", "dsn-moon", "terrain"]);
    expect(file.summary.passed).toBe(file.summary.checks);
  });

  test.each<[string, (file: Raw) => void]>([
    ["a summary that claims more checks than there are", (f) => { f.summary.checks += 1; }],
    ["a summary that claims more passes", (f) => { f.sections[0].rows[0].pass = false; }],
    ["a largest difference that is not the largest", (f) => { f.summary.max_angle_diff_deg = 0.0001; }],
    ["a row marked passed beyond its limit", (f) => { f.sections[0].rows[0].diff_deg = 0.5; f.summary.max_angle_diff_deg = 0.5; }],
    ["a row marked failed within its limit", (f) => { f.sections[2].rows[0].pass = false; f.summary.passed -= 1; }],
    ["a difference that does not match its own figures", (f) => { f.sections[2].rows[0].ours_el = 10; }],
    ["a terrain difference that does not match", (f) => { f.sections[3].rows[0].ours = 3000; }],
    ["a missing section", (f) => { f.sections.pop(); }],
    ["a section out of order", (f) => { f.sections.reverse(); }],
    ["an empty section", (f) => { f.sections[3].rows = []; f.summary.checks -= 2; f.summary.passed -= 2; }],
    ["a text number", (f) => { f.sections[1].rows[0].diff_deg = "0.1"; }],
    ["a bad date", (f) => { f.generated = "soon"; }],
    ["a date that does not exist", (f) => { f.generated = "2026-13-45"; }],
    ["a day past the end of its month", (f) => { f.generated = "2026-02-30"; }],
    ["azimuths that disagree behind a small difference", (f) => { f.sections[0].rows[0].ours = { az: 10, el: -30.36417 }; }],
    ["a difference larger than its figures", (f) => { f.sections[0].rows[0].diff_deg = 0.09; f.summary.max_angle_diff_deg = 0.09; }],
    ["a limit loosened to pass anything", (f) => { f.sections[1].rows[0].diff_deg = 5; f.sections[1].rows[0].tolerance_deg = 360; f.summary.max_angle_diff_deg = 5; }],
    ["a terrain limit loosened", (f) => { f.sections[3].rows[0].tolerance = 5000; }],
    ["a percent difference off by most of a point", (f) => { f.sections[3].rows.find((row) => row.unit === "%")!.diff = 1.0; }],
    ["an unknown unit", (f) => { f.sections[3].rows[0].unit = "ft"; }],
    ["a site we do not know", (f) => { f.sections[1].rows[0].site = "mars-base"; }],
    ["a bad time on a row", (f) => { f.sections[1].rows[0].utc = "yesterday"; }],
  ])("refuses %s", (_, change) => {
    expect(() => parseValidation(edited(change))).toThrow();
  });

  test("azimuths either side of north are close, not 360 degrees apart", () => {
    const file = parseValidation(edited((f) => {
      const row = f.sections[0].rows[0];
      row.ours = { az: 359.99999, el: 0 };
      row.reference = { az: 0.00001, el: 0 };
      row.diff_deg = 0.00002;
    }));
    expect(file.sections[0].rows).toHaveLength(raw().sections[0].rows.length);
  });

  test.each([
    ["metres", "m", 150],
    ["percent", "%", 5],
  ])("a %s figure rounded onto its limit can still be a pass, as the pipeline judged it", (_, unit, limit) => {
    const file = parseValidation(edited((f) => {
      const target = f.sections[3].rows.find((row) => row.unit === unit)!;
      target.ours = (target.reference as number) + limit;
      target.diff = limit;
      target.pass = true;
    }));
    expect(file.summary.passed).toBe(file.summary.checks);
  });

  test("an honest failure is accepted, so it can be shown", () => {
    const file = parseValidation(edited((f) => {
      f.sections[1].rows[0].diff_deg = 0.05;
      f.sections[1].rows[0].pass = false;
      f.summary.passed -= 1;
      f.summary.max_angle_diff_deg = 0.05;
    }));
    expect(file.summary.passed).toBe(file.summary.checks - 1);
  });
});

describe("proofSections", () => {
  const file: ValidationFile = parseValidation(raw());
  const sections = proofSections(file);

  test("every row of the file appears once", () => {
    expect(sections.map(({ rows }) => rows.length)).toEqual(file.sections.map(({ rows }) => rows.length));
    expect(sections.flatMap(({ rows }) => rows)).toHaveLength(file.summary.checks);
    expect(new Set(sections.flatMap(({ rows }) => rows.map(({ key }) => key))).size).toBe(file.summary.checks);
  });

  test("reads a Horizons row as written in the file", () => {
    expect(sections[0].rows[0]).toMatchObject({
      check: "Apollo 11, Sun",
      when: "2027-01-01 00:00 UTC",
      ours: "az 269.21894°, el -30.36417°",
      reference: "az 269.218953°, el -30.364162°",
      difference: file.sections[0].rows[0].kind === "horizons" ? file.sections[0].rows[0].diff_deg.toFixed(6) + "°" : "",
      limit: "0.1°",
      isPass: true,
    });
  });

  test("the browser rows have no figures to show beside the difference", () => {
    expect(sections[1]).toMatchObject({ hasFigures: false });
    expect(sections[1].rows[0]).toMatchObject({ ours: null, reference: null, limit: "0.02°" });
  });

  test("reads a DSN row", () => {
    expect(sections[2].rows[0]).toMatchObject({ check: "Goldstone (USA), DSS-14", ours: "el -50.59402°", reference: "el -50.593405°", difference: "0.000619°" });
  });

  test("reads a terrain row with its unit and source", () => {
    expect(sections[3].rows[0]).toMatchObject({ ours: "2593 m", reference: "2579 m", difference: "14 m", limit: "150 m" });
    expect(sections[3].rows[0].source).toContain("LROC");
    expect(sections[3].rows.find(({ limit }) => limit === "5 %")).toMatchObject({ ours: "90.4 %", reference: "92.3 %", difference: "1.9 %", limit: "5 %" });
  });

  test("counts its own passes, and plots angles only", () => {
    const counts = file.sections.map(({ rows }) => rows.length);
    expect(sections.map(({ passed }) => passed)).toEqual(counts);
    expect(sections.map(({ plotted }) => plotted.length)).toEqual([...counts.slice(0, 3), 0]);
    expect(sections[1].limitDeg).toBe(0.02);
    expect(sections[3].limitDeg).toBeNull();
  });
});

describe("siteLabel", () => {
  test("names a listed site, and the polar test point in words", () => {
    expect(siteLabel("chandrayaan-3")).toBe("Chandrayaan-3");
    expect(siteLabel("south-pole-89s")).toBe("South polar test point, 89.45° S");
    expect(siteLabel("somewhere-new")).toBe("somewhere-new");
  });
});

describe("proofHeadline", () => {
  test("takes its figures from the summary", () => {
    expect(proofHeadline({ checks: 58, passed: 58, max_angle_diff_deg: 0.000742 })).toEqual({ lead: "58 of 58 checks ", emphasis: "passed.", isClean: true });
  });

  test("never hides a failure", () => {
    expect(proofHeadline({ checks: 58, passed: 57, max_angle_diff_deg: 0.2 })).toEqual({ lead: "57 of 58 checks ", emphasis: "passed. 1 failed.", isClean: false });
  });
});

describe("formatDegrees", () => {
  test("keeps the file's six decimals for small figures", () => {
    expect(formatDegrees(0.000742)).toBe("0.000742°");
    expect(formatDegrees(0.000008)).toBe("0.000008°");
    expect(formatDegrees(0)).toBe("0.000000°");
  });
});

describe("evidenceScale", () => {
  test("is logarithmic, from a millionth of a degree to one degree", () => {
    expect(evidenceScale(0.000001)).toBe(0);
    expect(evidenceScale(0.001)).toBeCloseTo(50, 10);
    expect(evidenceScale(1)).toBe(100);
  });

  test("keeps figures on the scale", () => {
    expect(evidenceScale(0)).toBe(0);
    expect(evidenceScale(5)).toBe(100);
  });
});
