"use client";

import Link from "next/link";
import { useState } from "react";
import { LessonCard } from "@/components/classroom/LessonCard";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { CALCULATING, DATA_FAILED, ellipseAnswer, type LessonAnswer } from "@/lib/classroomAnswers";
import { useEllipseScores } from "@/lib/data/useEllipseScores";
import { DATA_END_MS } from "@/lib/dataRange";
import { ellipseHeadline, formatRing, pointName, RINGS_M, zoneSummary, type EllipseScores, type ScoredPoint } from "@/lib/ellipse";
import { formatUtc, selectionQuery, withQuery } from "@/lib/selection";
import { MISSION_DAYS } from "@/lib/siteSummary";
import { shortName, SITES } from "@/lib/sites";
import { formatHours } from "@/lib/timeline";
import { EllipsePlot } from "./EllipsePlot";
import styles from "./ellipse.module.css";

const DEFAULT_RING_M = 500;
const DATA_END_YEAR = new Date(DATA_END_MS).getUTCFullYear();
const LROC_ATHENA = "https://lroc.im-ldi.com/images/1408";
const NASA_ATHENA = "https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/";

function Card({ label, item, testId }: { label: string; item: ScoredPoint; testId: string }) {
  return (
    <div className={styles.card} data-testid={testId}>
      <dt>{label}</dt>
      <dd>
        <strong>{formatHours(item.score.goldenHours)}</strong>
        <span>{pointName(item.point)}</span>
      </dd>
    </div>
  );
}

function AthenaStory({ scores }: { scores: EllipseScores }) {
  const { touchdown } = scores;
  if (!touchdown) return null;
  const { point, score } = touchdown;
  return (
    <section className={styles.story} aria-labelledby="athena-title">
      <h2 id="athena-title">Where Athena came down</h2>
      <p>
        IM-2 Athena aimed for this target. It touched down on 6 March 2025, and{" "}
        <a href={LROC_ATHENA}>LROC images</a> show it on its side in a crater about 20 m across, at {Math.abs(point.lat)}°S,{" "}
        {point.lon}°E: {point.distance_m} m from the target, bearing {point.bearing_deg}°.{" "}
        {/* NASA: the lander being on its side was "preventing it from fully operating the drill and other instruments
            before its batteries were depleted." */}
        <a href={NASA_ATHENA}>NASA</a> reported that its batteries ran out before it could fully run its instruments.
      </p>
      <p className={styles.athenaHours} data-testid="athena-hours">
        Landing on that spot at the chosen date: <strong>{formatHours(score.goldenHours)}</strong> Golden.
      </p>
      <p className={styles.note}>
        The map here has 80 m pixels, so a crater 20 m across is not in these horizons. The {point.distance_m} m and{" "}
        {point.bearing_deg}° are our own calculation from LROC&apos;s position. To see the sky Athena itself saw in March 2025,
        open its <Link href="/sky?replay=im-2">Mission Replay</Link>.
      </p>
    </section>
  );
}

function Unavailable({ timeMs }: { timeMs: number }) {
  const sites = SITES.filter((site) => site.has_ellipse);
  return (
    <div className={styles.unavailable}>
      <p>We have landing-zone horizons for {sites.length} sites, where the fine polar maps can tell points 100 m apart:</p>
      <ul>
        {sites.map((site) => (
          <li key={site.id}>
            <Link href={withQuery("/ellipse", selectionQuery({ site, timeMs }))}>{shortName(site)}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Zone({ siteId, timeMs }: { siteId: string; timeMs: number }) {
  const [ringM, setRingM] = useState(DEFAULT_RING_M);
  const result = useEllipseScores(siteId, timeMs);
  const scores = result.status === "ready" ? result.scores : null;
  const zone = scores && zoneSummary(scores, ringM);
  const headline = zone && ellipseHeadline(zone, ringM);
  const summary = headline ? `${headline.lead}${headline.emphasis}` : "Landing zone points around the target";
  const widest = scores && zoneSummary(scores, Math.max(...RINGS_M));
  const lesson: LessonAnswer =
    result.status === "loading"
      ? CALCULATING
      : result.status === "error"
        ? DATA_FAILED
        : ellipseAnswer(widest && { best: widest.best.score.goldenHours, worst: widest.worst.score.goldenHours }, true);

  return (
    <>
      <h1>
        {headline ? (
          <>
            {headline.lead}
            <em>{headline.emphasis}</em>
          </>
        ) : (
          "Landing zone"
        )}
      </h1>
      <p className={styles.caveat}>
        For a {MISSION_DAYS}-day mission landing on {formatUtc(timeMs)}.
      </p>
      <LessonCard id="ellipse" answer={lesson} />
      <div className={styles.rings} role="group" aria-label="Landing zone size">
        {RINGS_M.map((ring) => (
          <button key={ring} type="button" aria-pressed={ring === ringM} onClick={() => setRingM(ring)}>
            Within {formatRing(ring)}
          </button>
        ))}
      </div>
      {result.status === "loading" && <p className={styles.note}>Calculating…</p>}
      {result.status === "error" && <DataNotice error={result.error} retry={result.retry} />}
      {result.status === "ready" && !scores && <p className={styles.note}>A {MISSION_DAYS}-day mission from this date runs past our data, which ends in {DATA_END_YEAR}.</p>}
      {scores && zone && (
        <>
          <div className={styles.layout}>
            <figure className={styles.figure}>
              <EllipsePlot scores={scores} ringM={ringM} summary={summary} />
              <figcaption>Brighter dots get more Golden hours within this zone. North is up.</figcaption>
            </figure>
            <dl className={styles.cards}>
              <Card label="Best" item={zone.best} testId="zone-best" />
              <Card label="Median" item={zone.median} testId="zone-median" />
              <Card label="Worst" item={zone.worst} testId="zone-worst" />
              <Card label="On target" item={zone.target} testId="zone-target" />
            </dl>
          </div>
          <AthenaStory scores={scores} />
          <details className={styles.list}>
            <summary>List all {zone.count} points in this zone</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Point</th>
                  <th scope="col">Golden</th>
                  <th scope="col">Sun</th>
                  <th scope="col">Comms</th>
                </tr>
              </thead>
              <tbody>
                {zone.points.map(({ point, score }) => (
                  <tr key={`${point.ring_m}-${point.bearing_deg}`}>
                    <th scope="row">{pointName(point)}</th>
                    <td>{formatHours(score.goldenHours)}</td>
                    <td>{formatHours(score.litHours)}</td>
                    <td>{formatHours(score.commsHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </>
  );
}

export function EllipseView() {
  const { selection } = useSelection();
  const { site, timeMs } = selection;
  const hasZone = site.id !== null && site.has_ellipse;
  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Landing off target at {site.id === null ? "this custom site" : shortName(site)}</p>
        {hasZone ? (
          <Zone key={site.id} siteId={site.id as string} timeMs={timeMs} />
        ) : (
          <>
            <h1>Landing zone</h1>
            <LessonCard id="ellipse" answer={ellipseAnswer(null, false)} />
            <Unavailable timeMs={timeMs} />
          </>
        )}
      </div>
      <p className={styles.limits}>
        Landers rarely touch down exactly on target. This page checks the target and 8 points on rings 100 m, 500 m and 1 km
        away, each with its own horizon from 2 m above the ground. The median is the middle of these sample points, not the
        likeliest landing spot. The rings are circles; a real landing ellipse depends on the approach, and ground between the
        points can differ. Near IM-1 and IM-2 the maps have 80 m pixels and near the Shackleton rim 20 m, so the 100 m ring is
        only one to five pixels from the target. The rings in the picture are evenly spaced, not to scale.
      </p>
    </>
  );
}

export function EllipseViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Landing zone</h1>
      <p className={styles.caveat}>Calculating…</p>
    </div>
  );
}
