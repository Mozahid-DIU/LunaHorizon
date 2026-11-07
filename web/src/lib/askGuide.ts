/**
 * The guide Ask LunaHorizon answers from: what each page does, the ideas behind it, and every
 * curated site. Every figure here is one the app itself uses, or one taken from our data files;
 * nothing is written from memory. Number words are avoided on purpose, because the answer check
 * refuses any number written in words.
 */
import shares from "@/data/site-shares.json";
import { BEST_COUNT, SEARCH_DAYS, SLIP_DAYS } from "./datesPlan";
import { ELEVATION_MASK_DEG } from "./dsnRelay";
import { RINGS_M } from "./ellipse";
import { MOON_RADIUS_KM } from "./geometry";
import { DIRECTIONS, NUDGE_KM } from "./nudgePlan";
import { DEFAULT_SETUP } from "./powerPlan";
import { MAP_RADIUS_KM } from "./atlasMap";
import { formatCoordinates, MISSION_DAYS } from "./siteSummary";
import { SITES, type CuratedSite } from "./sites";
import { TIMELINE_DAYS } from "./timeline";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateText = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const ring = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
const percent = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;

/** How the app is used, page by page. */
export const PAGES: readonly string[] = [
  `Atlas (the home page) is a map of the lunar south pole reaching ${MAP_RADIUS_KM} km from the pole. It glows where ground sees the Sun, Earth or both; point at it to read a 5 km cell, and click to check that exact point with its own horizon.`,
  `Sky shows the view from the lander with the real skyline, the Sun and Earth, a countdown to the next sunset, sunrise, Earthset or Earthrise, playback of the next ${MISSION_DAYS} days, a ${TIMELINE_DAYS}-day timeline that can be downloaded as CSV, and which DSN station can hear the Moon.`,
  "Compare puts sites or dates side by side, each worked out directly.",
  `Dates searches the next ${SEARCH_DAYS} days for the ${BEST_COUNT} best landings, shows what a delay of ${SLIP_DAYS.map((d) => `${d} ${d === 1 ? "day" : "days"}`).join(", ")} would change, and what moving the landing ${NUDGE_KM.map((km) => `${km} km`).join(" or ")} in ${DIRECTIONS.length} directions would change.`,
  `Power simulates an example lander: by default a ${DEFAULT_SETUP.areaM2} square metre panel at ${DEFAULT_SETUP.efficiencyPct}% efficiency that tracks the Sun, a ${DEFAULT_SETUP.capacityWh} Wh battery and a ${DEFAULT_SETUP.loadW} W load. It shows whether the lander survives; heating, charging losses and dust are not modelled.`,
  `Ellipse looks at points ${RINGS_M.map(ring).join(", ")} from the target, because landers rarely touch down exactly on target. It covers IM-1, IM-2 and the Shackleton rim, and tells where IM-2 Athena really came down.`,
  "3D shows real terrain at 1:1 around IM-1, IM-2 and the Shackleton rim, lit from the engine's Sun direction, from above or from the lander's eye.",
  "Mission Replay, on the Sky page, plays back 5 real landings (Apollo 11, Chandrayaan-3 Vikram, IM-1 Odysseus, IM-2 Athena and Blue Ghost Mission 1) from touchdown, with the engine's sunset at each site set beside what each team reported, with links to NASA, ISRO and Firefly.",
  "Proof lists every check of our positions against NASA JPL Horizons and full SPICE, with each difference and its limit.",
  "Mission Brief is a report of 2 A4 pages for any site and date, ready to print or save as PDF, with a QR code back to the live page.",
  "The address of any page holds its site and date, so a copied link reopens the same view. Ask LunaHorizon is this chat.",
  "A site and a date are chosen at the top of every page; a custom point can be typed as latitude and longitude.",
];

/** The ideas behind the numbers. */
export const IDEAS: readonly string[] = [
  "From sunrise to sunrise, a day on the Moon lasts about 29.5 Earth days, so most places get about 14.8 days of light and then about 14.8 days of night.",
  "The Moon's axis is tilted only about 1.5° to the Sun's path, so near the poles the Sun stays close to the horizon and circles around the sky instead of rising high. A small hill can then hide it for days.",
  "The Moon keeps the same face towards Earth, so from the near side Earth stays in roughly the same part of the sky. Seen from the south pole Earth sits near the horizon, and the Moon's slow wobble, called libration, carries it above and below the skyline.",
  "On the far side Earth never rises, so a lander there cannot talk to Earth directly and needs a relay satellite. LunaHorizon's Comms rule counts direct contact only.",
  "Some crater floors near the poles never see the Sun. They are very cold and may hold water ice, which is part of why the south pole is a target, while high rims nearby can be lit for long stretches.",
  "Power needs the Sun above the skyline; a link home needs Earth above the skyline and a DSN station that can hear the Moon. Golden hours have both at once.",
  `The Deep Space Network's large antennas used here are DSS-14 at Goldstone, DSS-63 at Madrid and DSS-43 at Canberra, each 70 m across. A station counts while the Moon is at least ${ELEVATION_MASK_DEG}° above its horizon.`,
  `The Moon's radius used by the engine is ${MOON_RADIUS_KM} km.`,
  "NASA's Commercial Lunar Payload Services (CLPS) pays companies to deliver experiments to the Moon; IM-1, IM-2 and Blue Ghost Mission 1 were CLPS missions.",
  "NASA's Artemis program plans to land astronauts near the lunar south pole; the Shackleton rim point here is in a candidate area.",
  "IM-2 Athena landed on 6 Mar 2025 about 369 m from its target, on its side in a crater about 20 m across; NASA reported that its batteries ran out before it could fully run its instruments.",
  `A landing ellipse is the area a lander may come down in around its target; ground just ${RINGS_M[1]} m apart can see very different hours of Sun and Earth near the pole.`,
  "LunaHorizon's horizons come from NASA's LOLA elevation maps: the polar maps near the south pole (20 m pixels around Shackleton), SLDEM2015 at some sites near the equator, and elsewhere LOLA's global map, whose 237 m pixels smooth slopes close to the site.",
];

type Share = "golden" | "lit" | "earth";
const shareOf = (site: CuratedSite, key: Share) => (shares as Record<string, Record<Share, number>>)[site.id][key];
function siteLine(site: CuratedSite): string {
  const who = site.agency === "-" ? "" : `${site.agency}, `;
  const when = site.landed ? `landed ${dateText(site.landed)}` : site.category === "artemis" ? site.mission : "an impact site, not a landing";
  return `${site.name}: ${who}${when}; at ${formatCoordinates(site.lat, site.lon)}. Over 2026 to 2030 from its own horizon: Golden ${percent(shareOf(site, "golden"))} of hours, Sun up ${percent(shareOf(site, "lit"))}, Earth in view ${percent(shareOf(site, "earth"))}.`;
}

/** Every curated site, with its shares of 2026 to 2030 from the engine. */
export const SITE_LINES: readonly string[] = SITES.map(siteLine);

export const RANK_COUNT = 5;

/** The curated sites with the highest share, best first, so the AI never has to sort them itself. */
export function topSites(key: Share, count = RANK_COUNT): CuratedSite[] {
  return [...SITES].sort((a, b) => shareOf(b, key) - shareOf(a, key)).slice(0, count);
}

const LABELS: Record<Share, string> = { golden: "Golden hours", lit: "hours with the Sun up", earth: "hours with Earth in view" };
const rankLine = (key: Share) =>
  `Most ${LABELS[key]} over 2026 to 2030 among these sites, highest share at the start: ${topSites(key)
    .map((site) => `${site.name} ${percent(shareOf(site, key))}`)
    .join(", ")}.`;

/** Ready-made rankings of the curated sites. */
export const RANKINGS: readonly string[] = [rankLine("golden"), rankLine("lit")];

export const GUIDE: readonly string[] = [...PAGES, ...IDEAS, ...SITE_LINES, ...RANKINGS];
