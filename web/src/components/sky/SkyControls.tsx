"use client";

import { formatUtc } from "@/lib/selection";
import type { BodyState } from "@/lib/windows";
import styles from "./sky.module.css";
import type { SkyPlayback } from "./useSkyPlayback";

const HOUR_MS = 3_600_000;

interface BodyReadoutProps {
  name: string;
  body: BodyState;
  isUp: boolean;
  isOutOfView: boolean;
  tone: string;
}

export function BodyReadout({ name, body, isUp, isOutOfView, tone }: BodyReadoutProps) {
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
  playLabel?: string;
  sliderLabel?: string;
}

export function PlaybackBar({ playback, lengthMs, shownMs, isMotionReduced, playLabel = "Play the next 14 days", sliderLabel = "Time after the chosen date" }: PlaybackBarProps) {
  return (
    <div className={styles.playback}>
      {isMotionReduced ? (
        <span className={styles.motionNote}>Animation is off for reduced motion. Use the slider.</span>
      ) : (
        <button type="button" className={styles.play} onClick={playback.toggle}>
          {playback.isPlaying ? "Pause" : playLabel}
        </button>
      )}
      <input
        type="range"
        aria-label={sliderLabel}
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

