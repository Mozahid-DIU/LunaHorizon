/**
 * Mission Replay: five real landings, with what their teams reported. Every date, time and quote
 * here comes from the linked page (NASA, ISRO or Firefly), checked by hand on 6 Nov 2026; times
 * given there in IST, EDT, EST, CST or CDT are converted to UTC. A time the source does not give
 * is left out, never guessed.
 */

export type PointChoice = "site" | "touchdown";

export interface RecordSource {
  label: string;
  url: string;
}

export interface MissionRecord {
  /** What the team reported at the end, as a short title. */
  endLabel: string;
  /** The end as an instant, when the source gives a time; null when it gives only a date. */
  endMs: number | null;
  /** The end's date (UTC), always given. */
  endDate: string;
  /** What happened, in our words, keeping to what the sources say. */
  story: string;
  /** A short exact quote from the main source. */
  quote: string;
  sources: readonly RecordSource[];
}

export interface Mission {
  id: string;
  siteId: string;
  name: string;
  agency: string;
  landedMs: number;
  /** How the landing time is known. */
  landedNote: string;
  /** Which horizon to replay: the curated site, or Athena's touchdown point from the Ellipse file. */
  point: PointChoice;
  /** DSN's three 70 m antennas did not all exist in 1969, so Comms and Golden are not shown then. */
  hasDsn: boolean;
  record: MissionRecord;
}

const utc = (iso: string) => Date.parse(iso);

const NSSDC_APOLLO_11 = "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059C";
const CDSCC_APOLLO = "https://www.cdscc.nasa.gov/Pages/cdscc_historyapollo.html";
const NASA_MADRID_64 = "https://www.nasa.gov/image-article/64-meter-antenna-spain/";
const ISRO_CH3 = "https://www.isro.gov.in/Chandrayaan3.html";
const ISRO_CH3_DETAILS = "https://www.isro.gov.in/Chandrayaan3_Details.html";
const PIB_CH3 = "https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=1950803&reg=48&lang=2";
const NASA_LRO_IM1 = "https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/";
const NASA_IM1_SCIENCE = "https://www.nasa.gov/missions/artemis/clps/nasa-collects-first-surface-science-in-decades-via-commercial-moon-mission/";
const NASA_IM2_LANDED = "https://www.nasa.gov/blogs/missions/2025/03/06/intuitive-machines-mission-lands-near-south-pole-carrying-nasa-science/";
const NASA_IM2_END = "https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/";
const FIREFLY_BG1 = "https://fireflyspace.com/news/blue-ghost-mission-1-live-updates/";
const NASA_BG1_END = "https://www.nasa.gov/news-release/nasa-science-continues-after-fireflys-first-moon-mission-concludes/";

export const MISSIONS: readonly Mission[] = [
  {
    id: "apollo-11",
    siteId: "apollo-11",
    name: "Apollo 11",
    agency: "NASA",
    landedMs: utc("1969-07-20T20:17:40Z"),
    landedNote: "20:17:40 UTC, from NASA's NSSDCA catalog.",
    point: "site",
    hasDsn: false,
    record: {
      endLabel: "Lifted off from the Moon",
      endMs: utc("1969-07-21T17:54:01Z"),
      endDate: "1969-07-21",
      story: "The crew spent 21 hours and 36 minutes on the surface. Apollo was tracked by NASA's Manned Space Flight Network; of today's three DSN antennas, Madrid's and Canberra's were not built until the 1970s, so Comms and Golden hours are not shown for 1969.",
      quote: "lifted off from the Moon at 17:54:01 UT on 21 July after 21 hours, 36 minutes on the lunar surface",
      sources: [
        { label: "NASA NSSDCA: Apollo 11 Lunar Module", url: NSSDC_APOLLO_11 },
        { label: "NASA Canberra DSCC: Apollo history", url: CDSCC_APOLLO },
        { label: "NASA: Madrid 64 m antenna", url: NASA_MADRID_64 },
      ],
    },
  },
  {
    id: "chandrayaan-3",
    siteId: "chandrayaan-3",
    name: "Chandrayaan-3 Vikram",
    agency: "ISRO",
    landedMs: utc("2023-08-23T12:34:00Z"),
    landedNote: "About 12:34 UTC: ISRO's planned time, around 18:04 IST. ISRO's pages do not give the exact touchdown time.",
    point: "site",
    hasDsn: true,
    record: {
      endLabel: "Lander and rover put into sleep mode",
      endMs: null,
      endDate: "2023-09-04",
      story: "Vikram and Pragyan were built to work for one lunar day, about 14 Earth days. On 4 Sep 2023 ISRO said both were in sleep mode, and that it hoped they would wake around 22 Sep.",
      quote: "The lander and rover are in sleep mode. Awaiting their awakening around September 22, 2023.",
      sources: [
        { label: "ISRO: Chandrayaan-3 updates", url: ISRO_CH3 },
        { label: "ISRO: mission life", url: ISRO_CH3_DETAILS },
        { label: "PIB: planned landing time", url: PIB_CH3 },
      ],
    },
  },
  {
    id: "im-1",
    siteId: "im-1",
    name: "IM-1 Odysseus",
    agency: "NASA CLPS / Intuitive Machines",
    landedMs: utc("2024-02-22T23:24:00Z"),
    landedNote: "23:24 UTC, from NASA (6:24 p.m. EST).",
    point: "site",
    hasDsn: true,
    record: {
      endLabel: "Science operations ended",
      endMs: null,
      endDate: "2024-02-29",
      story: "NASA says Odysseus came to rest gently leaning on the ground and still sent back data, and that its instruments stopped seven days after landing, meeting the operations planned before launch. NASA does not give the hour.",
      quote: "ceased science and technology operations seven days after landing",
      sources: [
        { label: "NASA: LRO images Odysseus", url: NASA_LRO_IM1 },
        { label: "NASA: first surface science in decades", url: NASA_IM1_SCIENCE },
      ],
    },
  },
  {
    id: "im-2",
    siteId: "im-2",
    name: "IM-2 Athena",
    agency: "NASA CLPS / Intuitive Machines",
    landedMs: utc("2025-03-06T17:30:00Z"),
    landedNote: "About 17:30 UTC, from NASA (approximately 11:30 a.m. CST).",
    point: "touchdown",
    hasDsn: true,
    record: {
      endLabel: "Mission ended early",
      endMs: utc("2025-03-07T06:15:00Z"),
      endDate: "2025-03-07",
      story: "NASA says Athena came to rest on its side, which kept it from fully running its drill and other instruments before its batteries ran out. The end came about 12 h 45 min after landing. The replay uses the point where LROC found it, in a small crater, not the target.",
      quote: "calling an early end of mission at 12:15 a.m. CST Friday",
      sources: [
        { label: "NASA: Athena lands", url: NASA_IM2_LANDED },
        { label: "NASA: data received before the mission ended", url: NASA_IM2_END },
      ],
    },
  },
  {
    id: "blue-ghost-1",
    siteId: "blue-ghost-1",
    name: "Blue Ghost Mission 1",
    agency: "NASA CLPS / Firefly Aerospace",
    landedMs: utc("2025-03-02T08:34:00Z"),
    landedNote: "08:34 UTC, from Firefly (2:34 a.m. CST).",
    point: "site",
    hasDsn: true,
    record: {
      endLabel: "Final data received",
      endMs: utc("2025-03-16T23:15:00Z"),
      endDate: "2025-03-16",
      story: "Blue Ghost worked through its lunar day, ran its planned sunset operations on 16 Mar, and kept sending data into the night.",
      quote: "operating just over 5 hours into the lunar night with the final data received around 6:15 pm CDT on March 16",
      sources: [
        { label: "Firefly: Blue Ghost Mission 1 live updates", url: FIREFLY_BG1 },
        { label: "NASA: mission concludes", url: NASA_BG1_END },
      ],
    },
  },
];

export function findMission(id: string | null): Mission | null {
  return MISSIONS.find((mission) => mission.id === id) ?? null;
}
