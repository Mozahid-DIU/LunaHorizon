import { describe, expect, test } from "vitest";
import { angle, csvCell, csvFileName, HOURLY_COLUMNS, hourlyCsv, hourlyRowCount, WINDOW_COLUMNS, windowsCsv } from "./exportCsv";
import { DEFAULT_TIME_MS } from "./selection";
import { findSite } from "./sites";
import { loadEphemeris, loadProfile } from "./testData";
import { timelineRows } from "./timeline";
import { stateAt } from "./windows";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const eph = loadEphemeris([2027, 2028]);
const site = findSite("im-2")!;
const profile = loadProfile("im-2");
const source = { site: "IM-2 Athena", lat: -84.78, lon: 29.13, horizon: "NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m, ldem_75s_120m)" };

/** Splits a CSV line, honouring quoted cells. */
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

describe("csvCell and angle", () => {
  test("quotes only what needs it", () => {
    expect(csvCell("Goldstone")).toBe("Goldstone");
    expect(csvCell("NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m)")).toBe('"NASA LRO LOLA polar DEMs (ldem_875s_20m, ldem_80s_80m)"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  test("never writes -0.000, nor 360.000 for an azimuth", () => {
    expect(angle(-0.0004)).toBe("0.000");
    expect(angle(-0.0006)).toBe("-0.001");
    expect(angle(359.9996, true)).toBe("0.000");
    expect(angle(359.9996)).toBe("360.000");
  });
});

describe("hourlyCsv", () => {
  const text = hourlyCsv(eph, site, profile, DEFAULT_TIME_MS, source);
  const lines = text.trimEnd().split("\r\n");

  test("one header, then 720 rows that all have the header's columns, in plain ASCII", () => {
    expect(cells(lines[0])).toEqual([...HOURLY_COLUMNS]);
    expect(lines.length).toBe(1 + 720);
    expect(lines.every((l) => cells(l).length === HOURLY_COLUMNS.length)).toBe(true);
    expect(/^[\x20-\x7e\r\n]*$/.test(text)).toBe(true);
  });

  test("every row is the engine's state at that moment, and names where it comes from", () => {
    for (const i of [0, 1, 200, 719]) {
      const t = DEFAULT_TIME_MS + i * HOUR_MS;
      const s = stateAt(eph, site, profile, t);
      const row = cells(lines[1 + i]);
      expect(row[0]).toBe(new Date(t).toISOString().replace(".000", ""));
      expect(row[1]).toBe(angle(s.sun.az, true));
      expect(row[2]).toBe(angle(s.sun.el));
      expect(row[3]).toBe(angle(s.sun.horizon));
      expect(row[4]).toBe(s.lit ? "1" : "0");
      expect(row[6]).toBe(angle(s.earth.el));
      expect(row[8]).toBe(s.earthVisible ? "1" : "0");
      expect(row[10]).toBe(s.comms ? "1" : "0");
      expect(row[11]).toBe(s.golden ? "1" : "0");
      expect(row.slice(12)).toEqual(["IM-2 Athena", "-84.78", "29.13", source.horizon]);
    }
    expect(cells(lines[1])[9]).toBe("Goldstone");
  });

  test("a start between hours steps an hour at a time from that moment", () => {
    const start = DEFAULT_TIME_MS + 30 * 60_000;
    const rows = hourlyCsv(eph, site, profile, start, source).trimEnd().split("\r\n");
    expect(cells(rows[1])[0]).toBe("2027-12-29T21:30:00Z");
    expect(cells(rows[2])[0]).toBe("2027-12-29T22:30:00Z");
  });

  test("at the end of the data the last hour we have is the last row", () => {
    const late = loadEphemeris([2030]);
    const start = Date.UTC(2030, 11, 25);
    const rows = hourlyCsv(late, site, profile, start, source).trimEnd().split("\r\n");
    expect(rows.length - 1).toBe(hourlyRowCount(start, late.dataEnd()));
    expect(rows.length - 1).toBe(168);
    expect(cells(rows[rows.length - 1])[0]).toBe("2030-12-31T23:00:00Z");
  });
});

describe("hourlyRowCount", () => {
  test("30 days, or as far as the data goes", () => {
    expect(hourlyRowCount(0, 100 * DAY_MS)).toBe(720);
    expect(hourlyRowCount(0, 7 * DAY_MS)).toBe(169);
    expect(hourlyRowCount(30 * 60_000, 7 * DAY_MS)).toBe(168);
  });
});

describe("windowsCsv", () => {
  const rows = timelineRows(eph, site, profile, DEFAULT_TIME_MS);
  const lines = windowsCsv(rows, source).trimEnd().split("\r\n");
  const expected = rows.flatMap(({ kind, windows }) => windows.map((w) => ({ kind, ...w })));

  test("every window of the timeline, in order, with hours that agree with its written times", () => {
    expect(cells(lines[0])).toEqual([...WINDOW_COLUMNS]);
    expect(lines.length).toBe(1 + expected.length);
    expected.forEach((w, i) => {
      const row = cells(lines[1 + i]);
      expect(row[0]).toBe(w.kind);
      // written to the nearest second
      expect(Math.abs(Date.parse(row[1]) - w.start)).toBeLessThanOrEqual(500);
      expect(Math.abs(Date.parse(row[2]) - w.end)).toBeLessThanOrEqual(500);
      expect(Number(row[3])).toBeCloseTo((Date.parse(row[2]) - Date.parse(row[1])) / HOUR_MS, 3);
      expect(row[4]).toBe(w.startClipped ? "1" : "0");
      expect(row[5]).toBe(w.endClipped ? "1" : "0");
      expect(row[6]).toBe(w.kind === "dsn" ? "1 h" : "30 s");
    });
  });

  test("the Golden windows add up to the timeline's Golden hours", () => {
    const golden = lines.slice(1).map(cells).filter((row) => row[0] === "golden").reduce((sum, row) => sum + Number(row[3]), 0);
    const rowHours = rows.find(({ kind }) => kind === "golden")!.hours;
    expect(Math.abs(golden - rowHours)).toBeLessThan(0.01);
  });
});

describe("csvFileName", () => {
  test("names the site or the point, the time and the kind", () => {
    expect(csvFileName("im-2", -84.78, 29.13, DEFAULT_TIME_MS, "hourly")).toBe("lunahorizon-im-2-2027-12-29T2100Z-hourly.csv");
    expect(csvFileName(null, -85.25, 120, DEFAULT_TIME_MS, "windows")).toBe("lunahorizon-lat-85.250_lon120.000-2027-12-29T2100Z-windows.csv");
  });
});
