"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { countdown, DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { useSiteData } from "@/lib/data/useSiteData";
import { formatUtc, withQuery } from "@/lib/selection";
import { eventWindows, goldenStatus, outlookAt, skyDataEnd, skyHeadline, type GoldenStatus } from "@/lib/skyOutlook";
import { formatCoordinates, formatDuration, MISSION_DAYS, outlookFrom, siteSummary, type BodyOutlook, type SiteSummary } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import { frameTime, isBesideView, playbackEnd } from "@/lib/skyView";
import { stateAt, type BodyState } from "@/lib/windows";
import styles from "./sky.module.css";
import { SkyStage, type SkySpan } from "./SkyStage";
import { useCustomArt } from "./useCustomArt";
import { useReducedMotion, useSkyPlayback, type SkyPlayback } from "./useSkyPlayback";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

interface CountdownItemProps {
  name: string;
  outlook: BodyOutlook;
  isSearchCut: boolean;
  shownMs: number;
  rises: string;
  sets: string;
  tone: string;
}

interface BodyReadoutProps {
  name: string;
  body: BodyState;
  isUp: boolean;
  isOutOfView: boolean;
  tone: string;
}

function BodyReadout({ name, body, isUp, isOutOfView, tone }: BodyReadoutProps) {
  return (
    <section className={styles.readout} aria-label={name}>
      <h2 className={tone}>{name}</h2>
      <p className={styles.state}>{isUp ? "Above the horizon" : "Below the horizon"}</p>
      <dl>
        <div>
          <dt>Elevation</dt>
          <dd>{body.el.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Azimuth</dt>
          <dd>{body.az.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Skyline there</dt>
          <dd>{body.horizon.toFixed(2)}°</dd>
        </div>
      </dl>
      {isUp && isOutOfView && <p className={styles.hint}>Outside this view. Turn to find it.</p>}
    </section>
  );
}

interface PlaybackBarProps {
  playback: SkyPlayback;
  lengthMs: number;
  shownMs: number;
  isMotionReduced: boolean;
}

function PlaybackBar({ playback, lengthMs, shownMs, isMotionReduced }: PlaybackBarProps) {
  return (
    <div className={styles.playback}>
      {isMotionReduced ? (
        <span className={styles.motionNote}>Animation is off for reduced motion. Use the slider.</span>
      ) : (
        <button type="button" className={styles.play} onClick={playback.toggle}>
          {playback.isPlaying ? "Pause" : "Play the next 14 days"}
        </button>
      )}
      <input
        type="range"
        aria-label="Time after the chosen date"
        aria-valuetext={formatUtc(shownMs)}
        min={0}
        max={lengthMs / HOUR_MS}
        step="any"
        value={playback.offsetMs / HOUR_MS}
        onChange={(event) => playback.seek(Number(event.target.value) * HOUR_MS)}
      />
      <span className={styles.time} data-testid="sky-time">
        {formatUtc(shownMs)}
      </span>
    </div>
  );
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
          Land at this time and {headline.hours} of {MISSION_DAYS * 24} mission hours have sunlight, Earth in view and a DSN
          station listening.
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
  const events = useMemo(
    () => (data.status === "ready" ? eventWindows(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );
  // moving frames read from the run's windows; a frame that has settled asks the engine directly
  const { isPlaying } = playback;
  const settledMs = useDeferredValue(shownMs);
  const stillOutlook = useMemo(
    () => (data.status === "ready" && !isPlaying ? outlookFrom(countdown(data.ephemeris, site, data.profile, settledMs)) : null),
    [data, isPlaying, site, settledMs],
  );
  const outlook = stillOutlook && settledMs === shownMs ? stillOutlook : events && state && outlookAt(events, shownMs, state);

  if (data.status === "loading" || data.status === "error" || !state || !start || !outlook) {
    return (
      <>
        <SkyIntro site={site} timeMs={timeMs} query={query} summary={null} status={null} />
        {data.status === "error" ? <DataNotice error={data.error} retry={data.retry} /> : <p className={styles.calculating}>Calculating…</p>}
      </>
    );
  }

  return (
    <>
      <SkyIntro site={site} timeMs={timeMs} query={query} summary={summary} status={goldenStatus(state)} />
      {!data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      <SkyStage
        state={state}
        start={start}
        profile={data.profile}
        artSrc={site.id !== null ? `/data/sky/${site.id}.webp` : customArt}
        viewKey={`${siteKey}|${timeMs}`}
        onViewChange={setView}
      />
      {lengthMs > 0 && <PlaybackBar playback={playback} lengthMs={lengthMs} shownMs={shownMs} isMotionReduced={isMotionReduced} />}
      <section className={styles.countdown} aria-label="Countdown">
        <CountdownItem name="Earth" outlook={outlook.earth} isSearchCut={outlook.isSearchCut} shownMs={shownMs} rises="Earthrise" sets="Earthset" tone={styles.earth} />
        <CountdownItem name="Sun" outlook={outlook.sun} isSearchCut={outlook.isSearchCut} shownMs={shownMs} rises="sunrise" sets="sunset" tone={styles.sun} />
      </section>
      {data.heightAt && (
        <p className={styles.note}>
          This horizon is computed in your browser from NASA LOLA height tiles: full map detail close by, 480 m detail beyond
          40 km. At 32 test points it stayed within 0.1° of the full maps.
        </p>
      )}
      <div className={styles.readouts}>
        <BodyReadout name="Sun" body={state.sun} isUp={state.lit} isOutOfView={isOutOfView(state.sun.az)} tone={styles.sun} />
        <BodyReadout name="Earth" body={state.earth} isUp={state.earthVisible} isOutOfView={isOutOfView(state.earth.az)} tone={styles.earth} />
      </div>
      <p className={styles.note}>
        The view is from 2 m above the ground. The skyline and positions are exact; the height scale is stretched near the
        horizon, the Sun and Earth markers are not to scale, and terrain shading is for display, not real lighting.
      </p>
    </>
  );
}

export function SkyView() {
  const { selection, query } = useSelection();
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
