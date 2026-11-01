"use client";

import { useMemo, useState } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { useSiteData } from "@/lib/data/useSiteData";
import { formatUtc } from "@/lib/selection";
import { formatCoordinates } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import { frameTime, isBesideView, playbackEnd } from "@/lib/skyView";
import { stateAt, type BodyState } from "@/lib/windows";
import styles from "./sky.module.css";
import { SkyStage, type SkySpan } from "./SkyStage";
import { useReducedMotion, useSkyPlayback, type SkyPlayback } from "./useSkyPlayback";

const HOUR_MS = 3_600_000;

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

function Sky({ site, timeMs }: { site: SelectedSite; timeMs: number }) {
  const endMs = playbackEnd(timeMs);
  const lengthMs = endMs - timeMs;
  const siteKey = site.id ?? `${site.lat},${site.lon}`;
  const data = useSiteData({ siteId: site.id, startMs: timeMs, endMs });
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

  if (data.status === "loading") return <p className={styles.status}>Calculating…</p>;
  if (data.status === "error") return <DataNotice error={data.error} retry={data.retry} />;
  if (!state || !start) return null;

  return (
    <>
      <SkyStage
        state={state}
        start={start}
        profile={data.profile}
        artSrc={data.hasTerrain && site.id !== null ? `/data/sky/${site.id}.webp` : null}
        viewKey={`${siteKey}|${timeMs}`}
        onViewChange={setView}
      />
      {lengthMs > 0 && <PlaybackBar playback={playback} lengthMs={lengthMs} shownMs={shownMs} isMotionReduced={isMotionReduced} />}
      {!data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
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
  const { selection } = useSelection();
  const { site, timeMs } = selection;

  return (
    <>
      <div className={styles.intro}>
        <h1>Sky from {shortName(site)}</h1>
        <p>
          {formatCoordinates(site.lat, site.lon)} · {formatUtc(timeMs)}
        </p>
      </div>
      <Sky site={site} timeMs={timeMs} />
    </>
  );
}

export function SkyViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Sky</h1>
      <p>Calculating…</p>
    </div>
  );
}
