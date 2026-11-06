import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadEphemeris as loadFromDisk } from "../testData";
import { findWindows } from "../windows";
import { createDataLoader, DataFileError, DATA_YEARS, yearsForRange } from "./loader";

const DATA = join(__dirname, "..", "..", "..", "public", "data");
const SITES = ["apollo-11", "chandrayaan-3", "im-1", "im-2", "shackleton-rim"];
const HOUR_MS = 3_600_000;

const diskText = (url: string) => readFileSync(join(DATA, url.replace("/data/", "")), "utf-8");

/** A fetch that serves the real data files, with optional per-file overrides. */
function diskFetch(override?: (url: string, text: string) => Response | Promise<Response> | null) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const text = diskText(url);
    return (await override?.(url, text)) ?? new Response(text, { status: 200 });
  });
}

/** A fetch that changes one file's JSON and serves everything else untouched. */
function corrupt(file: string, change: (data: Record<string, unknown>) => void) {
  return diskFetch((url, text) => {
    if (!url.endsWith(file)) return null;
    const data = JSON.parse(text) as Record<string, unknown>;
    change(data);
    return new Response(JSON.stringify(data), { status: 200 });
  });
}

type Track = { lat: number[]; lon: number[]; dist_km: number[] };

async function failure(promise: Promise<unknown>): Promise<DataFileError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DataFileError);
  return error as DataFileError;
}

describe("loadReplayEphemeris", () => {
  it("loads a replay year from its own folder and refuses any other year", async () => {
    const fetchFn = diskFetch();
    const eph = await createDataLoader(fetchFn).loadReplayEphemeris(2025);
    expect(fetchFn.mock.calls.map(([url]) => String(url)).sort()).toEqual(["/data/replay/dsn-2025.json", "/data/replay/subpoints-2025.json"]);
    expect(eph.dataEnd()).toBe(Date.UTC(2025, 11, 31, 23));
    for (const year of [2026, 1970, 2022]) {
      expect((await failure(createDataLoader(diskFetch()).loadReplayEphemeris(year))).kind).toBe("unavailable");
    }
  });

  it("refuses a replay file that fails its checks", async () => {
    const fetchFn = corrupt("replay/dsn-2024.json", (data) => {
      data.mask = (data.mask as number[]).slice(1);
    });
    expect((await failure(createDataLoader(fetchFn).loadReplayEphemeris(2024))).kind).toBe("invalid");
  });
});

describe("real data files", () => {
  it("accepts every year", async () => {
    const eph = await createDataLoader(diskFetch()).loadEphemeris([...DATA_YEARS]);
    expect(eph.dataEnd()).toBe(Date.parse("2030-12-31T23:00Z"));
  });

  it.each(SITES)("accepts the %s horizon", async (site) => {
    const horizon = await createDataLoader(diskFetch()).loadHorizon(site);
    expect(horizon.site).toBe(site);
    expect(horizon.elevation_deg).toHaveLength(360);
  });

  it("gives the same positions as reading the files directly", async () => {
    const loaded = await createDataLoader(diskFetch()).loadEphemeris([2027, 2028]);
    const direct = loadFromDisk([2027, 2028]);
    for (const iso of ["2027-01-01T00:00Z", "2027-12-31T23:30Z", "2028-02-29T12:00Z"]) {
      const t = Date.parse(iso);
      expect(loaded.subpoint("sun", t)).toEqual(direct.subpoint("sun", t));
      expect(loaded.subpoint("earth", t)).toEqual(direct.subpoint("earth", t));
      expect(loaded.dsnMask(t)).toBe(direct.dsnMask(t));
    }
  });
});

describe("failed requests", () => {
  it("reports a missing file by name", async () => {
    const fetchFn = diskFetch((url) => (url.endsWith("im-2.json") ? new Response("<html>", { status: 404 }) : null));
    const error = await failure(createDataLoader(fetchFn).loadHorizon("im-2"));
    expect(error.kind).toBe("missing");
    expect(error.file).toBe("horizon/im-2.json");
  });

  it("reports a server error as a network problem", async () => {
    const fetchFn = diskFetch(() => new Response("oops", { status: 500 }));
    expect((await failure(createDataLoader(fetchFn).loadHorizon("im-2"))).kind).toBe("network");
  });

  it("reports a dropped connection as a network problem", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await failure(createDataLoader(fetchFn).loadHorizon("im-2"))).kind).toBe("network");
  });

  it("reports an HTML page served in place of data as invalid", async () => {
    const fetchFn = diskFetch(() => new Response("<!doctype html>", { status: 200 }));
    expect((await failure(createDataLoader(fetchFn).loadHorizon("im-2"))).kind).toBe("invalid");
  });

  it("gives up on a request that never answers", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(
        (_: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      );
      const pending = failure(createDataLoader(fetchFn).loadHorizon("im-2"));
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).kind).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("slow downloads", () => {
  it("gives up on a download that stops halfway", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"site":'));
            init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        });
        return new Response(body, { status: 200 });
      });
      const pending = failure(createDataLoader(fetchFn).loadHorizon("im-2"));
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).kind).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("corrupted sub-point files", () => {
  const load = (fetchFn: ReturnType<typeof corrupt>) => failure(createDataLoader(fetchFn).loadEphemeris([2027]));
  const track = (data: Record<string, unknown>, body: string) => data[body] as Track;

  it("refuses a missing value", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      (track(d, "sun").lat as (number | null)[])[100] = null;
    }));
    expect(error.kind).toBe("invalid");
    expect(error.file).toBe("subpoints-2027.json");
  });

  it("refuses a file cut short", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      track(d, "earth").dist_km.pop();
    }));
    expect(error.message).toMatch(/earth.dist_km must have/);
  });

  it("refuses the wrong year", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      d.start = "2028-01-01T00:00Z";
    }));
    expect(error.message).toMatch(/start is 2028/);
  });

  it("refuses a different time step", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      d.step_hours = 2;
    }));
    expect(error.message).toMatch(/step_hours is 2/);
  });

  it("refuses a latitude outside the sphere", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      track(d, "sun").lat[5] = 91;
    }));
    expect(error.message).toMatch(/sun.lat\[5\]/);
  });

  it("refuses a longitude outside the range", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      track(d, "earth").lon[5] = 181;
    }));
    expect(error.message).toMatch(/earth.lon\[5\]/);
  });

  it("refuses Sun and Earth swapped", async () => {
    const error = await load(corrupt("subpoints-2027.json", (d) => {
      const sun = d.sun;
      d.sun = d.earth;
      d.earth = sun;
    }));
    expect(error.message).toMatch(/sun.dist_km\[0\]/);
  });
});

describe("corrupted DSN files", () => {
  const load = (fetchFn: ReturnType<typeof corrupt>) => failure(createDataLoader(fetchFn).loadEphemeris([2027]));

  it("refuses a mask value that no station set can produce", async () => {
    const error = await load(corrupt("dsn-2027.json", (d) => {
      (d.mask as number[])[10] = 8;
    }));
    expect(error.kind).toBe("invalid");
    expect(error.file).toBe("dsn-2027.json");
  });

  it("refuses a fractional mask", async () => {
    const error = await load(corrupt("dsn-2027.json", (d) => {
      (d.mask as number[])[10] = 1.5;
    }));
    expect(error.message).toMatch(/mask\[10\] is 1.5/);
  });

  it("refuses a station name that is not 'Place (Country), DSS-nn'", async () => {
    const error = await load(corrupt("dsn-2027.json", (d) => {
      (d.stations as string[])[1] = "Madrid";
    }));
    expect(error.message).toMatch(/stations\[1\] is not a station name/);
  });

  it("refuses a file made with a different elevation limit, since the page says 10 degrees", async () => {
    const error = await load(corrupt("dsn-2027.json", (d) => {
      d.elevation_mask_deg = 6;
    }));
    expect(error.message).toMatch(/elevation_mask_deg/);
  });

  it("refuses a mask that does not line up with the sub-points", async () => {
    const error = await load(corrupt("dsn-2027.json", (d) => {
      (d.mask as number[]).pop();
    }));
    expect(error.message).toMatch(/mask must have/);
  });
});

describe("3D terrain tiles", () => {
  const binFetch = (change?: (bytes: Buffer) => Buffer) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(".bin")) {
        const bytes = readFileSync(join(DATA, url.replace("/data/", "")));
        const body = change ? change(bytes) : bytes;
        return new Response(new Uint8Array(body), { status: 200 });
      }
      return new Response(diskText(url), { status: 200 });
    });

  it("loads the three levels of a polar site", async () => {
    const tiles = await createDataLoader(binFetch()).loadTerrainTiles("shackleton-rim");
    expect(tiles.meta.site).toBe("shackleton-rim");
    expect(tiles.levels.map(({ size }) => size)).toEqual([301, 301, 301]);
  });

  it("refuses a site without tiles before fetching anything", async () => {
    const fetchFn = binFetch();
    const error = await failure(createDataLoader(fetchFn).loadTerrainTiles("apollo-11"));
    expect(error.kind).toBe("unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a binary file of the wrong length", async () => {
    const error = await failure(createDataLoader(binFetch((bytes) => bytes.subarray(0, bytes.length - 2))).loadTerrainTiles("im-2"));
    expect(error.kind).toBe("invalid");
    expect(error.file).toBe("terrain/im-2.bin");
  });
});

describe("the map grid", () => {
  const load = (fetchFn: ReturnType<typeof corrupt>) => failure(createDataLoader(fetchFn).loadMapGrid());
  const FILE = "golden-grid.json";
  const CENTRE = 60 * 121 + 60;
  const set = (name: string, index: number, value: unknown) => (d: Record<string, unknown>) => {
    (d[name] as unknown[])[index] = value;
  };

  it("accepts the real file", async () => {
    const grid = await createDataLoader(diskFetch()).loadMapGrid();
    expect(grid.size).toBe(121);
    expect(grid.golden[CENTRE]).toBeTypeOf("number");
  });

  it("refuses a value above 100%", async () => {
    expect((await load(corrupt(FILE, set("lit", CENTRE, 1001)))).message).toMatch(/lit\[7320\] is 1001/);
  });

  it("refuses a fraction", async () => {
    expect((await load(corrupt(FILE, set("earth", CENTRE, 500.5)))).message).toMatch(/not a whole number/);
  });

  it("refuses a gap inside the circle", async () => {
    expect((await load(corrupt(FILE, set("golden", CENTRE, null)))).message).toMatch(/golden\[7320\]/);
  });

  it("refuses a value outside the circle", async () => {
    expect((await load(corrupt(FILE, set("golden", 0, 10)))).message).toMatch(/golden\[0\] is 10, expected null/);
  });

  it("refuses Golden above sunlight, which is physically impossible", async () => {
    const error = await load(corrupt(FILE, (d) => {
      (d.lit as number[])[CENTRE] = 0;
      (d.golden as number[])[CENTRE] = 1;
    }));
    expect(error.message).toMatch(/golden\[7320\] is above/);
  });

  it("refuses a grid of another shape", async () => {
    expect((await load(corrupt(FILE, (d) => {
      d.step_km = 10;
    }))).message).toMatch(/step_km is 10/);
    expect((await load(corrupt(FILE, (d) => {
      (d.lit as number[]).pop();
    }))).message).toMatch(/lit must have 14641 values/);
  });
});

describe("corrupted horizon files", () => {
  const load = (fetchFn: ReturnType<typeof corrupt>) => failure(createDataLoader(fetchFn).loadHorizon("im-2"));

  it("refuses another site's terrain under this site's name", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      d.lat = -80.13;
    }));
    expect(error.message).toMatch(/lat is -80.13, expected -84.78/);
  });

  it("refuses the wrong site", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      d.site = "im-1";
    }));
    expect(error.message).toMatch(/site is im-1/);
  });

  it("refuses a short profile", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      (d.elevation_deg as number[]).pop();
    }));
    expect(error.message).toMatch(/elevation_deg must have/);
  });

  it("refuses a missing angle", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      (d.elevation_deg as (number | null)[])[7] = null;
    }));
    expect(error.message).toMatch(/elevation_deg\[7\]/);
  });

  it("refuses an impossible angle", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      (d.elevation_deg as number[])[7] = 95;
    }));
    expect(error.message).toMatch(/elevation_deg\[7\]/);
  });

  it("refuses a different azimuth step", async () => {
    const error = await load(corrupt("im-2.json", (d) => {
      d.az_step_deg = 2;
    }));
    expect(error.message).toMatch(/az_step_deg is 2/);
  });
});

describe("what may be requested", () => {
  it("refuses a site id that is not a plain name, without any request", async () => {
    const fetchFn = diskFetch();
    for (const id of ["../validation", "a/b", "IM-2", "", "x.json", "im-1-ellipse", "mars"]) {
      expect((await failure(createDataLoader(fetchFn).loadHorizon(id))).kind).toBe("unavailable");
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a year with no data, without any request", async () => {
    const fetchFn = diskFetch();
    expect((await failure(createDataLoader(fetchFn).loadEphemeris([2031]))).kind).toBe("unavailable");
    expect((await failure(createDataLoader(fetchFn).loadEphemeris([]))).kind).toBe("unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("caching", () => {
  it("fetches a file once for repeated and simultaneous requests", async () => {
    const fetchFn = diskFetch();
    const loader = createDataLoader(fetchFn);
    await Promise.all([loader.loadHorizon("im-2"), loader.loadHorizon("im-2")]);
    await loader.loadHorizon("im-2");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("reuses a year already loaded when another range needs it", async () => {
    const fetchFn = diskFetch();
    const loader = createDataLoader(fetchFn);
    await loader.loadEphemeris([2027]);
    await loader.loadEphemeris([2027, 2028]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("tries again after a failure", async () => {
    let isBroken = true;
    const fetchFn = diskFetch(() => (isBroken ? new Response("", { status: 503 }) : null));
    const loader = createDataLoader(fetchFn);
    await failure(loader.loadHorizon("im-2"));
    isBroken = false;
    expect((await loader.loadHorizon("im-2")).site).toBe("im-2");
  });

  it("never keeps a bad file", async () => {
    let isBroken = true;
    const fetchFn = diskFetch((url, text) => {
      if (!isBroken) return null;
      const data = JSON.parse(text) as { elevation_deg: number[] };
      data.elevation_deg.pop();
      return new Response(JSON.stringify(data));
    });
    const loader = createDataLoader(fetchFn);
    await failure(loader.loadHorizon("im-2"));
    isBroken = false;
    expect((await loader.loadHorizon("im-2")).elevation_deg).toHaveLength(360);
  });
});

describe("yearsForRange", () => {
  const ms = Date.parse;

  it("covers a range inside one year", () => {
    expect(yearsForRange(ms("2027-03-01T00:00Z"), ms("2027-04-01T00:00Z"))).toEqual([2027]);
  });

  it("reaches the end of a year without the next one, until its last hour", () => {
    expect(yearsForRange(ms("2027-12-20T00:00Z"), ms("2027-12-31T23:00Z"))).toEqual([2027]);
    expect(yearsForRange(ms("2027-12-20T00:00Z"), ms("2027-12-31T23:01Z"))).toEqual([2027, 2028]);
  });

  it("adds the following year, needed to blend the last hour of a year", () => {
    expect(yearsForRange(ms("2027-12-31T23:30Z"), ms("2027-12-31T23:40Z"))).toEqual([2027, 2028]);
  });

  it("covers a range across a new year", () => {
    expect(yearsForRange(ms("2026-12-20T00:00Z"), ms("2028-01-10T00:00Z"))).toEqual([2026, 2027, 2028]);
  });

  it("stops at the last year of data", () => {
    expect(yearsForRange(ms("2030-06-01T00:00Z"), ms("2030-07-01T00:00Z"))).toEqual([2030]);
  });

  it("returns nothing for a range outside the data or reversed", () => {
    expect(yearsForRange(ms("2031-01-01T00:00Z"), ms("2031-02-01T00:00Z"))).toEqual([]);
    expect(yearsForRange(ms("2025-01-01T00:00Z"), ms("2025-02-01T00:00Z"))).toEqual([]);
    expect(yearsForRange(ms("2027-02-01T00:00Z"), ms("2027-01-01T00:00Z"))).toEqual([]);
    expect(yearsForRange(Number.NaN, 0)).toEqual([]);
  });

  it("does not fetch a following year that an exclusive end never reaches", () => {
    expect(yearsForRange(ms("2026-12-01T00:00Z"), ms("2027-01-01T00:00Z"))).toEqual([2026, 2027]);
  });

  it("refuses the last hour of 2030, which has no following sample", () => {
    expect(yearsForRange(ms("2030-12-01T00:00Z"), ms("2030-12-31T23:30Z"))).toEqual([]);
    expect(yearsForRange(ms("2030-12-31T23:30Z"), ms("2030-12-31T23:40Z"))).toEqual([]);
    expect(yearsForRange(ms("2030-12-01T00:00Z"), ms("2031-01-01T00:00Z"))).toEqual([]);
  });

  it("allows every range the engine can finish, up to the end of the data", async () => {
    const end = ms("2030-12-31T23:00Z") + 1;
    const start = ms("2030-12-20T00:00Z");
    const years = yearsForRange(start, end);
    expect(years).toEqual([2030]);
    const eph = await createDataLoader(diskFetch()).loadEphemeris(years);
    const site = { lat: -84.78, lon: 29.13 };
    expect(() => findWindows(eph, site, new Array<number>(360).fill(0), start, end, "lit")).not.toThrow();
  });

  it("leaves no gap with a real ephemeris across the last hour of a year", async () => {
    const start = ms("2027-12-31T23:30Z");
    const eph = await createDataLoader(diskFetch()).loadEphemeris(yearsForRange(start, start + HOUR_MS / 4));
    expect(() => eph.subpoint("sun", start)).not.toThrow();
  });
});
