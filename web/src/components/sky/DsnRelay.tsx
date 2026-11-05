"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { dayRing, gapSentence, hoursText, listeningAt, relayHeadline, type Relay, type Station } from "@/lib/dsnRelay";
import { formatUtc } from "@/lib/selection";
import type { Ephemeris } from "@/lib/windows";
import styles from "./sky.module.css";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SHADES = [styles.relayGoldstone, styles.relayMadrid, styles.relayCanberra];
const RING_CENTRE = 130;
const RING_RADII = [104, 84, 64];
const RING_TICKS = [0, 6, 12, 18];

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
/** A share of the time axis as a left offset across the lanes, which carry names and shares at the sides. */
const trackLeft = (pct: number) => `calc(var(--relay-name) + var(--relay-gap) + (100% - var(--relay-name) - var(--relay-hours) - 2 * var(--relay-gap)) * ${pct / 100})`;
const names = (stations: Station[]) => stations.map(({ place }) => place).join(" and ");

function arcPath(radius: number, fromHour: number, toHour: number): string {
  const angle = (hour: number) => (hour / 24) * 2 * Math.PI - Math.PI / 2;
  const [a0, a1] = [angle(fromHour), angle(toHour)];
  const large = toHour - fromHour > 12 ? 1 : 0;
  const point = (a: number) => `${RING_CENTRE + radius * Math.cos(a)} ${RING_CENTRE + radius * Math.sin(a)}`;
  return `M ${point(a0)} A ${radius} ${radius} 0 ${large} 1 ${point(a1)}`;
}

/** The UTC day around the shown time, one ring per station, a hand at the shown hour. */
function RelayRing({ eph, shownMs, stations }: { eph: Ephemeris; shownMs: number; stations: Station[] }) {
  const ring = dayRing(eph, shownMs);
  const hourOfDay = (shownMs % DAY_MS) / HOUR_MS;
  const hand = (hourOfDay / 24) * 2 * Math.PI - Math.PI / 2;
  const runs = (bit: number) => {
    const found: [number, number][] = [];
    let open: number | null = null;
    [...ring, null].forEach((mask, hour) => {
      const isOn = mask !== null && ((mask >> bit) & 1) === 1;
      if (isOn && open === null) open = hour;
      if (!isOn && open !== null) {
        found.push([open, hour]);
        open = null;
      }
    });
    return found;
  };
  return (
    <svg className={styles.relayRing} viewBox="-10 -10 280 280" role="img" aria-label={`Hour by hour on ${formatUtc(shownMs).split(",")[0]}: which stations hear the Moon`}>
      {RING_RADII.map((radius, bit) => (
        <g key={bit}>
          <circle className={styles.relayRingTrack} cx={RING_CENTRE} cy={RING_CENTRE} r={radius} />
          {runs(bit).map(([from, to]) => (
            <path key={from} className={SHADES[bit]} d={arcPath(radius, from, to)} />
          ))}
          <text className={styles.relayRingLetter} x={RING_CENTRE + 4} y={RING_CENTRE - radius + 4}>
            {stations[bit]?.place.charAt(0)}
          </text>
        </g>
      ))}
      {ring.map((mask, hour) => (mask === 0 ? <path key={hour} className={styles.relayRingGap} d={arcPath(116, hour, hour + 1)} /> : null))}
      {RING_TICKS.map((hour) => {
        const a = (hour / 24) * 2 * Math.PI - Math.PI / 2;
        return (
          <text key={hour} className={styles.relayRingTick} x={RING_CENTRE + 124 * Math.cos(a)} y={RING_CENTRE + 124 * Math.sin(a) + 4}>
            {String(hour).padStart(2, "0")}h
          </text>
        );
      })}
      <line className={styles.relayRingHand} x1={RING_CENTRE} y1={RING_CENTRE} x2={RING_CENTRE + 114 * Math.cos(hand)} y2={RING_CENTRE + 114 * Math.sin(hand)} />
      <circle className={styles.relayRingHub} cx={RING_CENTRE} cy={RING_CENTRE} r={5} />
      <text className={styles.relayRingTime} x={RING_CENTRE} y={RING_CENTRE + 28}>
        {formatUtc(shownMs).split(", ")[1]}
      </text>
    </svg>
  );
}

interface DsnRelayProps {
  eph: Ephemeris;
  plan: Relay;
  startMs: number;
  endMs: number;
  shownMs: number;
}

/** Which Deep Space Network station hears the Moon: now, through the shown day, and across the 30 days. */
export function DsnRelay({ eph, plan, startMs, endMs, shownMs }: DsnRelayProps) {
  const [pointMs, setPointMs] = useState<number | null>(null);
  const stations = plan.lanes.map(({ station }) => station);
  const now = listeningAt(eph, shownMs);
  const { lead, emphasis } = relayHeadline(plan);
  const at = (ms: number) => Math.min(Math.max(((ms - startMs) / (endMs - startMs)) * 100, 0), 100);
  // the pointer moves over the file's hours: the first may begin before the range, the last starts before its end
  const firstHour = Math.floor(startMs / HOUR_MS) * HOUR_MS;
  const lastHour = Math.ceil(endMs / HOUR_MS) * HOUR_MS - HOUR_MS;
  const toHour = (ms: number) => Math.min(Math.max(Math.floor(ms / HOUR_MS) * HOUR_MS, firstHour), lastHour);
  const pointed = pointMs === null ? null : listeningAt(eph, pointMs);
  const span = plan.totalHours % 24 === 0 ? `${plan.totalHours / 24} days` : `${hoursText(plan.totalHours)} hours`;

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    // the time axis is the track column, not the names or the shares beside it
    const box = event.currentTarget.querySelector(`.${styles.relayTrack}`)?.getBoundingClientRect();
    if (!box || event.clientX < box.left || event.clientX >= box.right) {
      if (event.pointerType !== "touch") setPointMs(null);
      return;
    }
    setPointMs(toHour(startMs + ((event.clientX - box.left) / box.width) * (endMs - startMs)));
  };
  const onLeave = (event: PointerEvent<HTMLDivElement>) => {
    // a tap keeps its answer on screen, and so does a keyboard walk
    if (event.pointerType !== "touch" && document.activeElement !== event.currentTarget) setPointMs(null);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageDown: 24, PageUp: -24 };
    const from = pointMs ?? toHour(shownMs);
    const next = event.key === "Home" ? firstHour : event.key === "End" ? lastHour : event.key in steps ? toHour(from + steps[event.key] * HOUR_MS) : null;
    if (next === null) return;
    event.preventDefault();
    setPointMs(next);
  };

  return (
    <section className={styles.relay} aria-labelledby="relay-title">
      <div className={styles.relayHead}>
        <div>
          <p className={styles.relayLabel} id="relay-title">
            Who on Earth can hear the Moon
          </p>
          <h2 className={styles.relayHeadline}>
            {lead}
            <em>{emphasis}</em>
          </h2>
          <p className={styles.relaySub}>NASA&apos;s Deep Space Network has one big station in each third of the world, so one is almost always facing the Moon.</p>
        </div>
        <p className={`${styles.relayNow} ${now.length === 0 ? styles.relayNowNone : ""}`} data-testid="relay-now">
          <i aria-hidden="true" />
          {now.length === 0 ? "No station listening now" : `${names(now)} listening now`}
        </p>
      </div>

      <div className={styles.relayBody}>
        <figure className={styles.relayRingBox}>
          <RelayRing eph={eph} shownMs={shownMs} stations={stations} />
          <figcaption>Hour by hour on {formatUtc(shownMs).split(",")[0]} (UTC). The hand is the time shown above; red marks an hour with no station.</figcaption>
        </figure>

        <div>
          <p className={styles.relayPointer} id="relay-pointer" data-testid="relay-pointer" aria-live="polite">
            {pointMs === null
              ? "Point at the lanes, or use the arrow keys, to see who listens."
              : `${formatUtc(pointMs)}: ${pointed && pointed.length > 0 ? names(pointed) : "no station"}`}
          </p>
          <div
            className={styles.relayLanes}
            tabIndex={0}
            role="group"
            aria-label={`Stations across the ${span}. Arrow keys move an hour, Page keys a day.`}
            aria-describedby="relay-pointer"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={onLeave}
            onKeyDown={onKey}
            onBlur={() => setPointMs(null)}
          >
            {plan.lanes.map(({ station, windows, hours }) => (
              <div className={styles.relayLane} key={station.bit} data-testid="relay-lane">
                <span className={styles.relayName}>
                  {station.place}
                  <small>{station.country}</small>
                </span>
                <span className={styles.relayTrack}>
                  {windows.map(({ start, end }) => (
                    <i key={start} className={SHADES[station.bit]} data-start={start} data-end={end} style={{ left: `${at(start)}%`, width: `${at(end) - at(start)}%` }} />
                  ))}
                </span>
                <span className={styles.relayHours} data-testid="relay-hours">
                  {percent(hours, plan.totalHours)}
                </span>
              </div>
            ))}
            <div className={`${styles.relayLane} ${styles.relayGapLane}`}>
              <span className={styles.relayName}>
                No station
                <small>listening</small>
              </span>
              <span className={styles.relayTrack}>
                {plan.gaps.map(({ start, end }) => (
                  <i key={start} data-testid="relay-gap" style={{ left: `${at(start)}%`, width: `${Math.max(at(end) - at(start), 0.35)}%` }} />
                ))}
              </span>
              <span className={styles.relayHours}>{hoursText(plan.gapHours)} h</span>
            </div>
            <b className={styles.relayCursor} aria-hidden="true" style={{ left: trackLeft(at(pointMs ?? shownMs)), opacity: pointMs === null ? 0.5 : 1 }} />
          </div>
        </div>
      </div>

      <div className={styles.relayShare}>
        <div className={styles.relayBar} aria-hidden="true">
          {plan.lanes.map(({ station, hours }) => (
            <span key={station.bit} className={SHADES[station.bit]} style={{ flexGrow: hours }} />
          ))}
          {plan.gapHours > 0 && <span className={styles.relayBarGap} style={{ flexGrow: Math.max(plan.gapHours, plan.totalHours / 200) }} />}
        </div>
        <p className={styles.relayKeys}>
          {plan.lanes.map(({ station, hours }) => (
            <span key={station.bit}>
              <i className={SHADES[station.bit]} aria-hidden="true" />
              {station.place} {percent(hours, plan.totalHours)}
            </span>
          ))}
          <span>
            <i className={styles.relayBarGap} aria-hidden="true" />
            No station {((plan.gapHours / plan.totalHours) * 100).toFixed(1)}%
          </span>
        </p>
        <p className={styles.relayWhy}>
          <b>Why gaps happen:</b> {gapSentence(plan, startMs)} The shares add up to more than 100% because two stations often listen at once. Each hour uses where the Moon is at the start of that hour.
        </p>
      </div>
    </section>
  );
}
