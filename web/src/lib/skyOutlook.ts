/**
 * Sky View's headline, status and countdown. A direct countdown takes too long to run on every
 * animation frame, so a run finds its Sun and Earth windows once and reads each frame from them.
 */
import { DEFAULT_SEARCH_MS } from "./countdown";
import { DATA_END_MS } from "./dataRange";
import type { Site } from "./geometry";
import { formatDays, MISSION_DAYS, type BodyOutlook, type SiteOutlook } from "./siteSummary";
import { playbackEnd } from "./skyView";
import { findWindows, type Ephemeris, type SiteState, type Window } from "./windows";

export interface EventWindows {
  lit: readonly Window[];
  earth: readonly Window[];
  dataEndMs: number;
}

export interface SkyHeadline {
  lead: string;
  emphasis: string;
  hours: string;
}

export interface GoldenStatus {
  text: string;
  isOpen: boolean;
}

/** The data a run needs: its last frame, plus that frame's whole event search. */
export function skyDataEnd(startMs: number, runEndMs: number = playbackEnd(startMs)): number {
  return Math.min(runEndMs + DEFAULT_SEARCH_MS, DATA_END_MS);
}

/** The Sun and Earth windows every frame of a run to `runEndMs` can be read from. */
export function eventWindows(eph: Ephemeris, site: Site, profile: readonly number[], startMs: number, runEndMs: number = playbackEnd(startMs)): EventWindows {
  const dataEndMs = eph.dataEnd();
  const endMs = Math.min(runEndMs + DEFAULT_SEARCH_MS, dataEndMs);
  return {
    lit: findWindows(eph, site, profile, startMs, endMs, "lit"),
    earth: findWindows(eph, site, profile, startMs, endMs, "earth"),
    dataEndMs,
  };
}

function bodyAt(windows: readonly Window[], isUp: boolean, nowMs: number, limitMs: number): BodyOutlook {
  if (isUp) {
    const open = windows.find((w) => nowMs < w.end);
    return { isUp, eventMs: open && !open.endClipped && open.end < limitMs ? open.end : null };
  }
  const next = windows.find((w) => w.start > nowMs);
  return { isUp, eventMs: next && !next.startClipped && next.start < limitMs ? next.start : null };
}

/** What comes next at `nowMs`. Up or down comes from the engine's state for that moment. */
export function outlookAt(events: EventWindows, nowMs: number, now: Pick<SiteState, "lit" | "earthVisible">): SiteOutlook {
  const fullLimit = nowMs + DEFAULT_SEARCH_MS;
  const limitMs = Math.min(fullLimit, events.dataEndMs);
  return {
    sun: bodyAt(events.lit, now.lit, nowMs, limitMs),
    earth: bodyAt(events.earth, now.earthVisible, nowMs, limitMs),
    isSearchCut: limitMs < fullLimit,
  };
}

/** The headline for a mission's Golden hours. Hours are rounded down, like the days. */
export function skyHeadline(goldenHours: number): SkyHeadline {
  const hours = String(Math.floor(goldenHours));
  if (goldenHours === 0) return { lead: "No Golden hours ", emphasis: `in ${MISSION_DAYS} days.`, hours };
  if (goldenHours === MISSION_DAYS * 24) return { lead: "Golden for ", emphasis: `all ${MISSION_DAYS} days.`, hours };
  return { lead: "Golden for ", emphasis: `${formatDays(goldenHours)} of ${MISSION_DAYS} days.`, hours };
}

export function goldenStatus(state: SiteState): GoldenStatus {
  if (state.golden) return { text: "Golden window open", isOpen: true };
  if (!state.lit && !state.earthVisible) return { text: "Sun and Earth below the horizon", isOpen: false };
  if (!state.lit) return { text: "Sun below the horizon", isOpen: false };
  if (!state.earthVisible) return { text: "Earth below the horizon", isOpen: false };
  return { text: "No DSN station listening", isOpen: false };
}
