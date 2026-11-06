"use client";

import Link from "next/link";
import shares from "@/data/site-shares.json";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { MissionPicker, MissionReplay } from "@/components/replay/MissionReplay";
import { findMission } from "@/lib/replay";
import { LessonCard } from "@/components/classroom/LessonCard";
import { Term } from "@/components/classroom/Term";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { countdown, DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { dataLoader } from "@/lib/data/loader";
import { useSiteData } from "@/lib/data/useSiteData";
import { csvFileName, hourlyCsv, hourlyRowCount, saveFile, windowsCsv } from "@/lib/exportCsv";
import { CALCULATING, skyAnswer } from "@/lib/classroomAnswers";
import { factsFrom } from "@/lib/insight";
import { formatUtc, withQuery } from "@/lib/selection";
import { eventWindows, goldenStatus, outlookAt, skyDataEnd, skyHeadline, type GoldenStatus } from "@/lib/skyOutlook";
import { formatCoordinates, formatDuration, MISSION_DAYS, outlookFrom, siteSummary, type BodyOutlook, type SiteSummary } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import { frameTime, isBesideView, playbackEnd } from "@/lib/skyView";
import { relay } from "@/lib/dsnRelay";
import { TIMELINE_DAYS, timelineCut, timelineRows } from "@/lib/timeline";
import { stateAt } from "@/lib/windows";
import styles from "./sky.module.css";
import { DsnRelay } from "./DsnRelay";
import { BodyReadout, PlaybackBar } from "./SkyControls";
import { SkyInsight } from "./SkyInsight";
import { SkyStage, type SkySpan } from "./SkyStage";
import { SkyTimeline } from "./SkyTimeline";
import { useCustomArt } from "./useCustomArt";
import { useReducedMotion, useSkyPlayback } from "./useSkyPlayback";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Earth is never above this site's skyline in any hour of 2026-2030, from the pipeline's site shares. */
function neverSeesEarth(id: string): boolean {
  return (shares as Record<string, { earth: number }>)[id]?.earth === 0;
}

interface CountdownItemProps {
  name: string;
  outlook: BodyOutlook;
  isSearchCut: boolean;
  shownMs: number;
  rises: string;
  sets: string;
  tone: string;
}

interface SkyIntroProps {
  site: SelectedSite;
  timeMs: number;
  query: string;
  summary: SiteSummary | null;
  status: GoldenStatus | null;
}

function SkyIntro({ site, timeMs, query, summary, status }: SkyIntroProps) {
  const headline = summary && skyHeadline(summary.hours.golden);
  return (
    <div className={styles.intro}>
      <p className={styles.section}>
        <span>01</span>Sky from the landing site
      </p>
      {status && (
        <p className={`${styles.status} ${status.isOpen ? styles.statusOpen : ""}`}>
          <i aria-hidden="true" />
          {status.text}
        </p>
      )}
      <h1>
        {headline ? (
          <>
            {headline.lead}
            <em>{headline.emphasis}</em>
          </>
        ) : (
          `Sky from ${shortName(site)}`
        )}
      </h1>
      <p className={styles.place}>
        {shortName(site)} · {formatCoordinates(site.lat, site.lon)} · {formatUtc(timeMs)}
      </p>
      {headline && (
        <p className={styles.lead}>
          Land at this time and {headline.hours} of {MISSION_DAYS * 24} mission hours have sunlight, Earth in view and a{" "}
          <Term id="dsn">DSN station</Term> listening.
        </p>
      )}
      {headline && (
        <p className={styles.ellipse}>
          For this exact point; ground nearby can differ. <Link href={withQuery("/ellipse", query)}>See the Landing Ellipse</Link>
        </p>
      )}
      {status && !summary && <p className={styles.lead}>A {MISSION_DAYS}-day mission from this date runs past our data, which ends in 2030.</p>}
    </div>
  );
}

function CountdownItem({ name, outlook, isSearchCut, shownMs, rises, sets, tone }: CountdownItemProps) {
  const { isUp, eventMs } = outlook;
  const noEvent = isSearchCut ? "Beyond our data" : `Not in ${DEFAULT_SEARCH_MS / DAY_MS} days`;
  return (
    <div className={styles.countdownItem}>
      <span className={styles.countdownName}>{name}</span>
      <strong className={tone}>{eventMs === null ? noEvent : formatDuration(eventMs - shownMs)}</strong>
      <span className={styles.countdownTo}>to {isUp ? sets : rises}</span>
    </div>
  );
}

function Sky({ site, timeMs, query }: { site: SelectedSite; timeMs: number; query: string }) {
  const endMs = playbackEnd(timeMs);
  const lengthMs = endMs - timeMs;
  const siteKey = site.id ?? `${site.lat},${site.lon}`;
  const data = useSiteData({ site, startMs: timeMs, endMs: skyDataEnd(timeMs) });
  const heightAt = data.status === "ready" ? data.heightAt : null;
  const customArt = useCustomArt(heightAt, site.lat, site.lon);
  const isMotionReduced = useReducedMotion();
  const playback = useSkyPlayback(`${siteKey}|${timeMs}`, lengthMs, isMotionReduced);
  const shownMs = frameTime(timeMs, playback.offsetMs);
  const [view, setView] = useState<SkySpan | null>(null);
  const isOutOfView = (az: number) => view !== null && isBesideView(az, view.centre, view.span);
  const start = useMemo(
    () => (data.status === "ready" ? stateAt(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );
  const state = useMemo(
    () => (data.status === "ready" ? stateAt(data.ephemeris, site, data.profile, shownMs) : null),
    [data, site, shownMs],
  );

  const summary = useMemo(
    () => (data.status === "ready" ? siteSummary(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );
  const facts = useMemo(() => (summary && data.status === "ready" ? factsFrom(site, timeMs, summary, data.hasTerrain) : null), [data, site, summary, timeMs]);
  const events = useMemo(
    () => (data.status === "ready" ? eventWindows(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );
  const timeline = useMemo(
    () => (data.status === "ready" ? timelineRows(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );
  const relayEndMs = data.status === "ready" ? Math.min(timeMs + TIMELINE_DAYS * DAY_MS, data.ephemeris.dataEnd()) : timeMs;
  const relayPlan = useMemo(() => (data.status === "ready" ? relay(data.ephemeris, timeMs, relayEndMs) : null), [data, timeMs, relayEndMs]);
  // moving frames read from the run's windows; a frame that has settled asks the engine directly
  const { isPlaying } = playback;
  const settledMs = useDeferredValue(shownMs);
  const stillOutlook = useMemo(
    () => (data.status === "ready" && !isPlaying ? outlookFrom(countdown(data.ephemeris, site, data.profile, settledMs)) : null),
    [data, isPlaying, site, settledMs],
  );
  const outlook = stillOutlook && settledMs === shownMs ? stillOutlook : events && state && outlookAt(events, shownMs, state);

  if (data.status === "loading" || data.status === "error" || !state || !start || !outlook || !timeline) {
    return (
      <>
        <SkyIntro site={site} timeMs={timeMs} query={query} summary={null} status={null} />
        <LessonCard id="sky" answer={CALCULATING} />
        {data.status === "error" ? <DataNotice error={data.error} retry={data.retry} /> : <p className={styles.calculating}>Calculating…</p>}
      </>
    );
  }

  const eph = data.ephemeris;
  const csvTerrain = data.hasTerrain ? (data.heightAt ? "NASA LOLA height tiles, horizon computed in the browser" : null) : "none, flat horizon (terrain not included)";
  // a curated site's horizon file names its map; the loader keeps the file, so this costs no download
  const downloadCsv = async (what: "hourly" | "windows") => {
    const horizon = csvTerrain ?? (site.id !== null ? (await dataLoader.loadHorizon(site.id)).source : "NASA LOLA height tiles, horizon computed in the browser");
    const source = { site: site.id === null ? "Custom point" : shortName(site), lat: site.lat, lon: site.lon, horizon };
    const text = what === "hourly" ? hourlyCsv(eph, site, data.profile, timeMs, source) : windowsCsv(timeline, source);
    saveFile(text, csvFileName(site.id, site.lat, site.lon, timeMs, what));
  };

  return (
    <>
      <SkyIntro site={site} timeMs={timeMs} query={query} summary={summary} status={goldenStatus(state)} />
      <LessonCard id="sky" answer={skyAnswer(summary ? summary.hours.lit : null)} />
      {!data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      <div className={styles.console}>
        <div className={styles.consoleMain}>
          <SkyStage
            state={state}
            start={start}
            profile={data.profile}
            artSrc={site.id !== null ? `/data/sky/${site.id}.webp` : customArt}
            viewKey={`${siteKey}|${timeMs}`}
            onViewChange={setView}
          />
          {lengthMs > 0 && <PlaybackBar playback={playback} lengthMs={lengthMs} shownMs={shownMs} isMotionReduced={isMotionReduced} />}
        </div>
        <aside className={styles.telemetry} aria-label="From the engine">
          <p className={styles.section}>
            <span>02</span>Telemetry
          </p>
          <section className={styles.countdown} aria-label="Countdown">
            <CountdownItem name="Earth" outlook={outlook.earth} isSearchCut={outlook.isSearchCut} shownMs={shownMs} rises="Earthrise" sets="Earthset" tone={styles.earth} />
            <CountdownItem name="Sun" outlook={outlook.sun} isSearchCut={outlook.isSearchCut} shownMs={shownMs} rises="sunrise" sets="sunset" tone={styles.sun} />
          </section>
          <div className={styles.readouts}>
            <BodyReadout name="Sun" body={state.sun} isUp={state.lit} isOutOfView={isOutOfView(state.sun.az)} tone={styles.sun} />
            <BodyReadout name="Earth" body={state.earth} isUp={state.earthVisible} isOutOfView={isOutOfView(state.earth.az)} tone={styles.earth} />
          </div>
        </aside>
      </div>
      <p className={styles.section}>
        <span>03</span>The next {TIMELINE_DAYS} days
      </p>
      <SkyTimeline rows={timeline} startMs={timeMs} shownMs={shownMs} cutMs={timelineCut(data.ephemeris, timeMs)} hourlyRows={hourlyRowCount(timeMs, eph.dataEnd())} onDownload={downloadCsv} />
      {relayPlan && relayEndMs > timeMs && !(site.id !== null && neverSeesEarth(site.id)) && (
        <details className={styles.more}>
          <summary>Which DSN dish can reach the lander, hour by hour</summary>
          <DsnRelay key={`${siteKey}|${timeMs}`} eph={data.ephemeris} plan={relayPlan} startMs={timeMs} endMs={relayEndMs} shownMs={shownMs} />
        </details>
      )}
      <MissionPicker currentId={null} query={query} />
      {facts && <SkyInsight facts={facts} />}
      {site.id !== null && neverSeesEarth(site.id) && (
        <p className={styles.note} data-testid="far-side-note">
          Earth never rises at this site, so direct contact with Earth is impossible and there are no Golden hours. Landers on the
          far side talk to Earth through a relay satellite in lunar orbit, which our Comms rule does not include.
        </p>
      )}
      {site.id !== null && site.is_coarse_terrain && (
        <p className={styles.note} data-testid="coarse-note">
          The ground near this site comes from NASA&apos;s global LOLA map, whose pixels are 237 m wide, so close slopes are
          smoothed. At Apollo 11, the one place we could compare it with a finer map, the two skylines differed by up to about
          2°, mostly from ground within 1 km.
        </p>
      )}
      {data.heightAt && (
        <p className={styles.note}>
          This horizon is computed in your browser from NASA LOLA height tiles: full map detail close by, 480 m detail beyond
          40 km. At 32 test points it stayed within 0.1° of the full maps.
        </p>
      )}
      <p className={styles.note}>
        The view is from 2 m above the ground. The skyline and positions are exact; the height scale is stretched near the
        horizon, the Sun and Earth markers are not to scale, and terrain shading is for display, not real lighting.
      </p>
    </>
  );
}

export function SkyView() {
  const { selection, query } = useSelection();
  const mission = findMission(useSearchParams().get("replay"));
  if (mission) return <MissionReplay mission={mission} query={query} />;
  return <Sky site={selection.site} timeMs={selection.timeMs} query={query} />;
}

export function SkyViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Sky</h1>
      <p className={styles.place}>Calculating…</p>
    </div>
  );
}
