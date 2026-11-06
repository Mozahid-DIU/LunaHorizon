"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { BodyReadout, PlaybackBar } from "@/components/sky/SkyControls";
import { SkyStage, type SkySpan } from "@/components/sky/SkyStage";
import skyStyles from "@/components/sky/sky.module.css";
import { useCustomArt } from "@/components/sky/useCustomArt";
import { useReducedMotion, useSkyPlayback } from "@/components/sky/useSkyPlayback";
import { MISSIONS, type Mission } from "@/lib/replay";
import { endBesideSunset, formatDate, replayLength, replayRun, type ReplayRun } from "@/lib/replayRun";
import { formatUtc, withQuery } from "@/lib/selection";
import { formatCoordinates, formatDuration } from "@/lib/siteSummary";
import { isBesideView } from "@/lib/skyView";
import { findSite } from "@/lib/sites";
import { formatHours } from "@/lib/timeline";
import { findWindows, stateAt, type Ephemeris, type Window, type WindowKind } from "@/lib/windows";
import styles from "./replay.module.css";
import { usePlaceHeights, useReplayData, type ReplayPlace } from "./useReplayData";

const DAY_MS = 86_400_000;
/** Every replay plays in about this long, whatever its length in Moon time. */
const PLAY_DAYS_PER_RUN = 14;

/** A link to Sky with the planner's own site and date kept, and a replay chosen or cleared. */
export function replayHref(query: string, missionId: string | null): string {
  const params = new URLSearchParams(query);
  params.delete("replay");
  if (missionId) params.set("replay", missionId);
  return withQuery("/sky", params.toString());
}

export function MissionPicker({ currentId, query }: { currentId: string | null; query: string }) {
  return (
    <nav className={styles.picker} aria-label="Mission Replay">
      <span>Replay a real landing</span>
      <ul>
        {MISSIONS.map((mission) => (
          <li key={mission.id}>
            <Link href={replayHref(query, mission.id)} aria-current={mission.id === currentId ? "page" : undefined}>
              {mission.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface Row {
  kind: WindowKind;
  label: string;
  windows: Window[];
}

function runRows(eph: Ephemeris, place: ReplayPlace, profile: readonly number[], startMs: number, endMs: number, hasDsn: boolean): Row[] {
  const kinds: [WindowKind, string][] = hasDsn
    ? [["lit", "Sun up"], ["earth", "Earth in view"], ["comms", "Contact possible"]]
    : [["lit", "Sun up"], ["earth", "Earth in view"]];
  return kinds.map(([kind, label]) => ({ kind, label, windows: findWindows(eph, place, profile, startMs, endMs, kind) }));
}

const totalHours = (windows: readonly Window[]) => windows.reduce((sum, w) => sum + (w.end - w.start), 0) / 3_600_000;

function rowSummary(row: Row): string {
  if (row.windows.length === 0) return `${row.label}: never during the replay.`;
  const first = row.windows[0];
  const last = row.windows[row.windows.length - 1];
  return `${row.label}: ${formatHours(totalHours(row.windows))} in ${row.windows.length} ${row.windows.length === 1 ? "stretch" : "stretches"}, from ${formatUtc(first.start)} to ${formatUtc(last.end)}.`;
}

interface MarksProps {
  startMs: number;
  lengthMs: number;
  marks: readonly { ms: number; label: string; tone: string }[];
}

function RunTimeline({ rows, startMs, lengthMs, shownMs, marks }: { rows: Row[]; shownMs: number } & MarksProps) {
  const at = (ms: number) => `${Math.min(100, Math.max(0, ((ms - startMs) / lengthMs) * 100))}%`;
  return (
    <figure className={styles.timeline} aria-label="The replay, hour by hour">
      {rows.map((row) => (
        <div key={row.kind} className={styles.row}>
          <span>{row.label}</span>
          <p className={styles.srOnly}>{rowSummary(row)}</p>
          <div className={styles.track} data-kind={row.kind} aria-hidden="true">
            {row.windows.map((w) => (
              <i key={w.start} style={{ left: at(w.start), width: `calc(${at(w.end)} - ${at(w.start)})` }} />
            ))}
            {marks.map((mark) => (
              <b key={mark.label} className={mark.tone} style={{ left: at(mark.ms) }} aria-hidden="true" />
            ))}
            <em style={{ left: at(shownMs) }} aria-hidden="true" />
          </div>
        </div>
      ))}
      <figcaption>
        {marks.map((mark) => (
          <span key={mark.label} className={mark.tone}>
            {mark.label}: {formatUtc(mark.ms)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Compare({ mission, run }: { mission: Mission; run: ReplayRun }) {
  const { record } = mission;
  const { landing } = run;
  const toEnd = record.endMs !== null ? record.endMs - mission.landedMs : null;
  const { hours } = run;
  return (
    <section className={styles.compare} aria-label="Our engine beside the record">
      <div>
        <h2>Our engine, from this point&apos;s own skyline</h2>
        <dl>
          <div>
            <dt>Sun at touchdown</dt>
            <dd>
              {landing.sun.el.toFixed(1)}° up, skyline {landing.sun.horizon.toFixed(1)}° there
            </dd>
          </div>
          <div>
            <dt>Earth at touchdown</dt>
            <dd>{landing.earthVisible ? `${landing.earth.el.toFixed(1)}° up` : "below the skyline"}</dd>
          </div>
          <div>
            <dt>Next sunset</dt>
            <dd data-testid="replay-sunset">{run.sunsetMs === null ? "not within 30 days" : `${formatUtc(run.sunsetMs)}, ${formatDuration(run.sunsetMs - mission.landedMs)} after touchdown`}</dd>
          </div>
          {run.sunsetMs !== null && run.nextSunriseMs !== null && (
            <div>
              <dt>Sunrise after that night</dt>
              <dd data-testid="replay-sunrise">{formatUtc(run.nextSunriseMs)}</dd>
            </div>
          )}
          <div>
            <dt>Earth</dt>
            <dd>{run.earthsetMs === null ? (landing.earthVisible ? "stays above the skyline" : "stays below the skyline") : `sets ${formatUtc(run.earthsetMs)}`}</dd>
          </div>
          {toEnd !== null && hours && (
            <div>
              <dt>Touchdown to the reported end</dt>
              <dd>
                Sun up {formatHours(hours.lit)} of {formatHours(toEnd / 3_600_000)}
                {mission.hasDsn && `, contact possible ${formatHours(hours.comms)}`}
              </dd>
            </div>
          )}
        </dl>
      </div>
      <div>
        <h2>What the team reported</h2>
        <p className={styles.endLabel}>
          {record.endLabel}: <strong data-testid="replay-end">{record.endMs === null ? `${formatDate(Date.parse(`${record.endDate}T00:00:00Z`))} (no time given)` : formatUtc(record.endMs)}</strong>
        </p>
        <blockquote>&ldquo;{record.quote}&rdquo;</blockquote>
        <p>{record.story}</p>
        <ul className={styles.sources}>
          {record.sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
                <span className={styles.srOnly}> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.verdict} data-testid="replay-verdict">
        {endBesideSunset(record, run.sunsetMs, landing.lit)}
      </p>
    </section>
  );
}

export function MissionReplay({ mission, query }: { mission: Mission; query: string }) {
  const data = useReplayData(mission);
  const ready = data.status === "ready" ? data : null;
  const isMotionReduced = useReducedMotion();
  const run = useMemo(
    () => ready && replayRun(ready.ephemeris, ready.place, ready.profile, mission.landedMs, mission.record.endMs),
    [ready, mission],
  );
  const lengthMs = run ? replayLength(mission.landedMs, mission.record, run.sunsetMs) : DAY_MS;
  const playback = useSkyPlayback(mission.id, lengthMs, isMotionReduced, lengthMs / (PLAY_DAYS_PER_RUN * DAY_MS));
  const shownMs = mission.landedMs + playback.offsetMs;
  const state = useMemo(() => ready && stateAt(ready.ephemeris, ready.place, ready.profile, shownMs), [ready, shownMs]);
  const rows = useMemo(
    () => ready && runRows(ready.ephemeris, ready.place, ready.profile, mission.landedMs, mission.landedMs + lengthMs, mission.hasDsn),
    [ready, mission, lengthMs],
  );
  const heights = usePlaceHeights(ready?.place ?? null, ready?.artSrc === null);
  const customArt = useCustomArt(heights, ready?.place.lat ?? 0, ready?.place.lon ?? 0);
  const [view, setView] = useState<SkySpan | null>(null);
  const site = findSite(mission.siteId);

  const marks = run
    ? [
        ...(mission.record.endMs !== null ? [{ ms: mission.record.endMs, label: "Reported end", tone: styles.endTone }] : []),
        ...(run.sunsetMs !== null && run.sunsetMs <= mission.landedMs + lengthMs ? [{ ms: run.sunsetMs, label: "Engine's sunset", tone: styles.sunTone }] : []),
      ]
    : [];

  return (
    <>
      <div className={skyStyles.intro}>
        <p className={skyStyles.status}>Mission Replay · {mission.agency}</p>
        <h1>
          {mission.name}, <em>{formatDate(mission.landedMs)}</em>
        </h1>
        <p className={skyStyles.place}>
          {ready ? ready.place.label : site?.name} · {ready ? formatCoordinates(ready.place.lat, ready.place.lon) : ""} · touchdown {formatUtc(mission.landedMs)}
        </p>
        <p className={skyStyles.lead}>The sky this lander saw from touchdown, worked out by the same engine as the planner, set beside what its team reported.</p>
        <p className={skyStyles.ellipse}>
          {mission.landedNote} <Link href={replayHref(query, null)}>Back to planning</Link>
        </p>
      </div>
      <MissionPicker currentId={mission.id} query={query} />
      {data.status === "error" && <DataNotice error={data.error} retry={data.retry} />}
      {data.status === "loading" && (
        <p className={skyStyles.calculating} role="status">
          Calculating…
        </p>
      )}
      {ready && run && state && rows && (
        <>
          <SkyStage state={state} start={run.landing} profile={ready.profile} artSrc={ready.artSrc ?? customArt} viewKey={mission.id} onViewChange={setView} />
          <PlaybackBar playback={playback} lengthMs={lengthMs} shownMs={shownMs} isMotionReduced={isMotionReduced} playLabel="Play the mission" sliderLabel="Time after touchdown" />
          <div className={styles.jumps} role="group" aria-label="Go to a moment">
            <button type="button" onClick={() => playback.seek(0)}>
              Touchdown
            </button>
            {marks.map((mark) => (
              <button key={mark.label} type="button" onClick={() => playback.seek(mark.ms - mission.landedMs)}>
                {mark.label}
              </button>
            ))}
          </div>
          <RunTimeline rows={rows} startMs={mission.landedMs} lengthMs={lengthMs} shownMs={shownMs} marks={marks} />
          <Compare mission={mission} run={run} />
          <div className={skyStyles.readouts}>
            <BodyReadout name="Sun" body={state.sun} isUp={state.lit} isOutOfView={view !== null && isBesideView(state.sun.az, view.centre, view.span)} tone={skyStyles.sun} />
            <BodyReadout name="Earth" body={state.earth} isUp={state.earthVisible} isOutOfView={view !== null && isBesideView(state.earth.az, view.centre, view.span)} tone={skyStyles.earth} />
          </div>
          {site?.is_coarse_terrain && (
            <p className={skyStyles.note}>
              The ground near this site comes from NASA&apos;s global LOLA map, whose pixels are 237 m wide, so close slopes are smoothed
              and the engine&apos;s sunset here is less exact than at the polar sites.
            </p>
          )}
          {mission.point === "touchdown" && (
            <p className={skyStyles.note}>
              This skyline is for the point where LROC found the lander. Our maps there have 80 m pixels, so the small crater it lies in is
              not part of this skyline.
            </p>
          )}
          <p className={skyStyles.note}>
            Sun and Earth positions for {new Date(mission.landedMs).getUTCFullYear()} come from the same NASA JPL files and code as the rest of
            LunaHorizon. Sunset here means the Sun&apos;s centre going below this point&apos;s skyline, seen from 2 m up.
          </p>
        </>
      )}
    </>
  );
}
