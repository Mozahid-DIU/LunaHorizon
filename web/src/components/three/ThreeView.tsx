"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { LessonCard } from "@/components/classroom/LessonCard";
import { useClassroom } from "@/components/classroom/useClassroom";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { useReducedMotion, useSkyPlayback } from "@/components/sky/useSkyPlayback";
import { CALCULATING, DATA_FAILED, threeAnswer, type LessonAnswer } from "@/lib/classroomAnswers";
import { DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { DATA_END_MS } from "@/lib/dataRange";
import { useSiteData } from "@/lib/data/useSiteData";
import { formatUtc, selectionQuery, withQuery } from "@/lib/selection";
import { formatCoordinates, formatDuration, type BodyOutlook } from "@/lib/siteSummary";
import { hasTiles, shortName, SITES, type CuratedSite, type SelectedSite } from "@/lib/sites";
import { eventWindows, goldenStatus, outlookAt, skyDataEnd } from "@/lib/skyOutlook";
import { PLAY_RATE } from "@/lib/skyView";
import { axisPercent, TIMELINE_DAYS, timelineCut, timelineRows, type TimelineRow } from "@/lib/timeline";
import { stateAt, type SiteState } from "@/lib/windows";
import type { ViewMode } from "./lunarScene";
import styles from "./three.module.css";
import { useTerrainTiles } from "./useTerrainTiles";

const TerrainScene = dynamic(() => import("./TerrainScene"), { ssr: false, loading: () => <p className={styles.starting}>Starting the 3D view…</p> });

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Moon hours per real second, as a multiple of the Sky page's own pace. */
const speedFactor = (hoursPerSecond: number) => (hoursPerSecond * HOUR_MS) / (PLAY_RATE * 1000);
const SPEEDS: readonly { label: string; factor: number }[] = [
  { label: "6 h/s", factor: speedFactor(6) },
  { label: "1 d/s", factor: speedFactor(24) },
  { label: "3 d/s", factor: speedFactor(72) },
];
const DEFAULT_SPEED = SPEEDS[1].factor;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const PHONE_QUERY = "(max-width: 900px)";

const compassWord = (az: number) => COMPASS[Math.round(az / 45) % 8];
const wholeAz = (az: number) => Math.round(az) % 360;
/** To one decimal, with the sign taken from the rounded value so that −0.04 reads 0.0. */
function degrees(value: number): string {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return `${value < 0 && rounded > 0 ? "−" : ""}${rounded.toFixed(1)}°`;
}

function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

function Unavailable({ site, timeMs }: { site: SelectedSite; timeMs: number }) {
  const sites = SITES.filter(hasTiles);
  return (
    <div className={styles.unavailable}>
      <p className={styles.eyebrow}>Lander&apos;s-eye 3D</p>
      <h1>No 3D tiles for {site.id === null ? "this custom site" : shortName(site)}</h1>
      <p>
        The 3D view is built from LOLA&apos;s fine polar maps, which we have turned into tiles for {sites.length} sites near the south
        pole. The Sky page still gives this site&apos;s horizon and windows.
      </p>
      <ul>
        {sites.map((tileSite) => (
          <li key={tileSite.id}>
            <Link href={withQuery("/3d", selectionQuery({ site: tileSite, timeMs }))}>{shortName(tileSite)}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Readout({ value, tone, children }: { value: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className={styles.readout}>
      <b className={tone}>{value}</b>
      <span>{children}</span>
    </div>
  );
}

function eventText(outlook: BodyOutlook, shownMs: number, isSearchCut: boolean, rises: string, sets: string): [string, string] {
  if (outlook.eventMs === null) return [isSearchCut ? "Beyond our data" : `Not in ${DEFAULT_SEARCH_MS / DAY_MS} days`, `to ${outlook.isUp ? sets : rises}`];
  return [formatDuration(outlook.eventMs - shownMs), `to ${outlook.isUp ? sets : rises}`];
}

interface FilmProps {
  rows: TimelineRow[];
  startMs: number;
  cutMs: number | null;
  shownMs: number;
  lengthMs: number;
  isPlaying: boolean;
  isMotionReduced: boolean;
  speed: number;
  onSpeed: (factor: number) => void;
  onToggle: () => void;
  onSeek: (offsetMs: number) => void;
}

/** The 30 days as a strip of film: Golden gold, Sun alone dim, night dark, Earth up as a blue line. */
function Film({ rows, startMs, cutMs, shownMs, lengthMs, isPlaying, isMotionReduced, speed, onSpeed, onToggle, onSeek }: FilmProps) {
  const row = (kind: TimelineRow["kind"]) => rows.find((r) => r.kind === kind)?.windows ?? [];
  const span = (start: number, end: number) => ({ left: `${axisPercent(start, startMs)}%`, width: `${axisPercent(end, startMs) - axisPercent(start, startMs)}%` });
  return (
    <div className={styles.film}>
      <div className={styles.filmHead}>
        {isMotionReduced ? (
          <span className={styles.motionNote}>Animation is off for reduced motion. Use the slider.</span>
        ) : (
          <button type="button" className={styles.play} onClick={onToggle}>
            {isPlaying ? "Pause" : `Play ${TIMELINE_DAYS} days`}
          </button>
        )}
        <span className={styles.keys} aria-hidden="true">
          <span className={styles.keyGolden}>Golden</span>
          <span className={styles.keySun}>Sun only</span>
          <span className={styles.keyEarth}>Earth up</span>
          <span className={styles.keyNight}>Night</span>
        </span>
        <span className={styles.speeds} role="group" aria-label="Playback speed">
          {SPEEDS.map(({ label, factor }) => (
            <button key={factor} type="button" aria-pressed={speed === factor} onClick={() => onSpeed(factor)}>
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className={styles.strip} aria-hidden="true">
        {row("lit").map(({ start, end }) => (
          <i key={start} className={styles.stripSun} style={span(start, end)} />
        ))}
        {row("golden").map(({ start, end }) => (
          <i key={start} className={styles.stripGolden} style={span(start, end)} />
        ))}
        {row("earth").map(({ start, end }) => (
          <i key={start} className={styles.stripEarth} style={span(start, end)} />
        ))}
        {cutMs !== null && <i className={styles.stripCut} style={{ left: `${axisPercent(cutMs, startMs)}%` }} />}
        <b className={styles.stripHead} style={{ left: `${axisPercent(shownMs, startMs)}%` }} />
      </div>
      <input
        type="range"
        className={styles.scrub}
        aria-label="Time after the chosen date"
        aria-valuetext={formatUtc(shownMs)}
        min={0}
        max={lengthMs / HOUR_MS}
        step="any"
        value={(shownMs - startMs) / HOUR_MS}
        onChange={(event) => onSeek(Number(event.target.value) * HOUR_MS)}
      />
      <div className={styles.ticks} aria-hidden="true">
        <span style={{ left: 0 }}>{formatUtc(startMs).split(",")[0]}</span>
        <span style={{ left: "50%" }}>+{TIMELINE_DAYS / 2} d</span>
        {cutMs !== null ? (
          <span style={{ left: `${axisPercent(cutMs, startMs)}%` }}>data ends</span>
        ) : (
          <span style={{ left: "100%" }}>+{TIMELINE_DAYS} d</span>
        )}
      </div>
      <p className={styles.srOnly}>
        {rows.map(({ label, hours }) => `${label}: ${Math.floor(hours)} h of the ${TIMELINE_DAYS} days`).join(". ")}.
      </p>
    </div>
  );
}

function ThreeLesson({ answer }: { answer: LessonAnswer }) {
  // only in Classroom mode, so the page is unchanged without it
  if (!useClassroom()) return null;
  return (
    <div className={styles.lesson}>
      <LessonCard id="3d" answer={answer} />
    </div>
  );
}

/** The lesson keeps its place, and its open answer, while the stage below it loads. */
function withLesson(lesson: React.ReactNode, content: React.ReactNode) {
  return (
    <>
      {lesson}
      {content}
    </>
  );
}

function Stage({ site, timeMs }: { site: CuratedSite; timeMs: number }) {
  const data = useSiteData({ site, startMs: timeMs, endMs: skyDataEnd(timeMs, Math.min(timeMs + TIMELINE_DAYS * DAY_MS, DATA_END_MS)) });
  const tilesResult = useTerrainTiles(site.id);
  const isPhone = usePhoneLayout();
  const isMotionReduced = useReducedMotion();
  const [mode, setMode] = useState<ViewMode>("above");
  const [isSkylineShown, setSkylineShown] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const endMs = Math.min(timeMs + TIMELINE_DAYS * DAY_MS, DATA_END_MS);
  const lengthMs = endMs - timeMs;
  const playback = useSkyPlayback(`${site.id}|${timeMs}`, lengthMs, isMotionReduced, speed);
  const shownMs = Math.min(timeMs + Math.round(playback.offsetMs / MINUTE_MS) * MINUTE_MS, endMs);

  const ready = data.status === "ready" ? data : null;
  const state: SiteState | null = useMemo(() => (ready ? stateAt(ready.ephemeris, site, ready.profile, shownMs) : null), [ready, site, shownMs]);
  const events = useMemo(() => (ready ? eventWindows(ready.ephemeris, site, ready.profile, timeMs, endMs) : null), [endMs, ready, site, timeMs]);
  const rows = useMemo(() => (ready ? timelineRows(ready.ephemeris, site, ready.profile, timeMs) : null), [ready, site, timeMs]);
  const outlook = events && state ? outlookAt(events, shownMs, state) : null;
  const isFailed = data.status === "error" || tilesResult.status === "error";
  const lesson = <ThreeLesson answer={isFailed ? DATA_FAILED : state ? threeAnswer(state.sun, state.lit, degrees) : CALCULATING} />;

  if (data.status === "error") return withLesson(lesson, <DataNotice error={data.error} retry={data.retry} />);
  if (tilesResult.status === "error") return withLesson(lesson, <DataNotice error={tilesResult.error} retry={tilesResult.retry} />);
  if (lengthMs <= 0) return withLesson(lesson, <p className={styles.starting}>This date is at the end of our data, which stops on 31 December 2030. Choose an earlier date.</p>);
  if (!ready || !state || !outlook || !rows || tilesResult.status !== "ready") return withLesson(lesson, <p className={styles.starting}>Loading the terrain…</p>);

  const status = goldenStatus(state);
  const [sunEvent, sunTo] = eventText(outlook.sun, shownMs, outlook.isSearchCut, "sunrise", "sunset");
  const [earthEvent, earthTo] = eventText(outlook.earth, shownMs, outlook.isSearchCut, "Earthrise", "Earthset");
  return withLesson(
    lesson,
    <div className={styles.stage} data-mode={mode}>
      <TerrainScene
        tiles={tilesResult.tiles}
        profile={ready.profile}
        sun={{ az: state.sun.az, el: state.sun.el, isLit: state.lit }}
        earth={{ az: state.earth.az, el: state.earth.el }}
        mode={mode}
        isSkylineShown={isSkylineShown}
        isPhone={isPhone}
      />

      <div className={`${styles.glass} ${styles.topPanel}`}>
        <p className={styles.eyebrow}>Lander&apos;s-eye 3D</p>
        <h1 className={styles.title}>
          {shortName(site)}
          <small data-testid="three-time">
            {formatUtc(shownMs)} · {formatCoordinates(site.lat, site.lon)}
          </small>
        </h1>
        <div className={styles.modes} role="group" aria-label="View">
          <button type="button" aria-pressed={mode === "above"} onClick={() => setMode("above")}>
            From above
          </button>
          <button type="button" aria-pressed={mode === "eye"} onClick={() => setMode("eye")}>
            Lander&apos;s eye
          </button>
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>Heights 1:1</span>
          <button type="button" className={styles.chip} aria-pressed={isSkylineShown} onClick={() => setSkylineShown((shown) => !shown)} disabled={mode !== "eye"}>
            Skyline check
          </button>
        </div>
      </div>

      <aside className={`${styles.glass} ${styles.readouts}`} aria-label="From the engine">
        <p className={styles.eyebrow}>From the engine</p>
        <Readout value={degrees(state.sun.el)} tone={styles.sunTone}>
          Sun {state.lit ? "above" : "below"} the skyline, which is {degrees(state.sun.horizon)} there, {compassWord(state.sun.az)} ({wholeAz(state.sun.az)}°)
        </Readout>
        <Readout value={degrees(state.earth.el)} tone={styles.earthTone}>
          Earth {state.earthVisible ? "above" : "below"} the skyline, which is {degrees(state.earth.horizon)} there, {compassWord(state.earth.az)} ({wholeAz(state.earth.az)}°)
        </Readout>
        <Readout value={sunEvent}>{sunTo}</Readout>
        <Readout value={earthEvent}>{earthTo}</Readout>
        <Readout value={status.isOpen ? "Golden" : "Not Golden"} tone={status.isOpen ? styles.mintTone : undefined}>
          {status.isOpen ? "Sun and Earth both up" : status.text}
        </Readout>
        <small>Every number comes from the horizon file and the engine. The 3D only draws them.</small>
      </aside>

      <p className={styles.caption}>
        LOLA heights at 1:1: 20 m cells to 3 km, 200 m to 30 km, then 1 km cells to 150 km that keep the highest point around each
        node. Shadows are worked out from these tiles toward the engine&apos;s Sun, with the Sun&apos;s width. A trace of fill light
        shows shadowed ground, which on the Moon is black. The lander is a stand-in shape; the Earth is a plain sphere lit by the same
        Sun, so its phase is right.
      </p>

      <Film
        rows={rows}
        startMs={timeMs}
        cutMs={timelineCut(ready.ephemeris, timeMs)}
        shownMs={shownMs}
        lengthMs={lengthMs}
        isPlaying={playback.isPlaying}
        isMotionReduced={isMotionReduced}
        speed={speed}
        onSpeed={setSpeed}
        onToggle={playback.toggle}
        onSeek={playback.seek}
      />
    </div>
  );
}

export function ThreeView() {
  const { selection } = useSelection();
  const { site, timeMs } = selection;
  if (!hasTiles(site)) return withLesson(<ThreeLesson answer={threeAnswer(null, false, degrees)} />, <Unavailable site={site} timeMs={timeMs} />);
  return <Stage key={site.id} site={site} timeMs={timeMs} />;
}

export function ThreeViewFallback() {
  return <p className={styles.starting}>Loading…</p>;
}
