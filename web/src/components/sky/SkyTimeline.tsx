import { useEffect, useRef, useState } from "react";
import { MISSION_DAYS } from "@/lib/siteSummary";
import { formatUtc } from "@/lib/selection";
import { axisPercent, formatEdge, formatHours, TIMELINE_DAYS, TIMELINE_TICKS, type TimelineRow } from "@/lib/timeline";
import styles from "./sky.module.css";

const HOUR_MS = 3_600_000;

const TONES: Record<TimelineRow["kind"], string> = {
  lit: styles.barSun,
  earth: styles.barEarth,
  dsn: styles.barDsn,
  comms: styles.barEarth,
  golden: styles.barGolden,
};

interface SkyTimelineProps {
  rows: readonly TimelineRow[];
  startMs: number;
  shownMs: number;
  /** Where the data stops, if that comes before the end of the 30 days. */
  cutMs: number | null;
  /** How many rows the hourly file holds. */
  hourlyRows: number;
  /** Saves the timeline as a CSV file. */
  onDownload: (what: "hourly" | "windows") => Promise<void>;
}

function DownloadMenu({ onDownload, hourlyRows }: { onDownload: SkyTimelineProps["onDownload"]; hourlyRows: number }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const close = () => {
    if (menu.current) menu.current.open = false;
    summary.current?.focus();
  };
  const pick = async (what: "hourly" | "windows") => {
    try {
      await onDownload(what);
      setFailed(false);
      close();
    } catch {
      setFailed(true);
    }
  };

  // Escape or a click elsewhere closes the menu
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) close();
    };
    const onPointer = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  const span = hourlyRows === TIMELINE_DAYS * 24 ? `${TIMELINE_DAYS} days` : `${hourlyRows} hours, to the end of our data`;
  return (
    <details className={styles.download} ref={menu}>
      <summary data-testid="csv-menu" ref={summary}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        Download CSV
      </summary>
      <div className={styles.downloadMenu}>
        <button type="button" onClick={() => pick("hourly")} data-testid="csv-hourly">
          <b>Hourly data, {span}</b>
          <span>
            {hourlyRows} rows, one every hour from the chosen time: Sun and Earth position, the skyline in their direction, whether each is above
            it, DSN stations listening, Comms, Golden
          </span>
        </button>
        <button type="button" onClick={() => pick("windows")} data-testid="csv-windows">
          <b>Windows</b>
          <span>Every Sun, Earth, DSN, Comms and Golden window: start, end and hours. Edges are found to within 30 s; DSN changes on the hour.</span>
        </button>
        {failed && (
          <p className={styles.downloadError} role="alert">
            The file could not be prepared: a data file did not load. Try again.
          </p>
        )}
      </div>
    </details>
  );
}

export function SkyTimeline({ rows, startMs, shownMs, cutMs, hourlyRows, onDownload }: SkyTimelineProps) {
  const missionEnd = (MISSION_DAYS / TIMELINE_DAYS) * 100;
  return (
    <section className={styles.timeline} aria-label="Next 30 days">
      <div className={styles.timelineHead}>
        <h2>Next 30 days</h2>
        <DownloadMenu onDownload={onDownload} hourlyRows={hourlyRows} />
      </div>
      <div className={styles.chart}>
        {rows.map(({ kind, label, windows, hours }) => (
          <div className={styles.timelineRow} key={kind}>
            <span className={styles.rowName}>{label}</span>
            <div className={styles.timelineTrack}>
              {windows.map(({ start, end }) => (
                <i
                  key={start}
                  className={TONES[kind]}
                  data-start={start}
                  data-end={end}
                  style={{ left: `${axisPercent(start, startMs)}%`, width: `${axisPercent(end, start)}%` }}
                />
              ))}
            </div>
            <span className={styles.rowHours}>{formatHours(hours)}</span>
          </div>
        ))}
        <div className={styles.overlay} aria-hidden="true">
          {cutMs !== null && <u className={styles.noData} data-testid="timeline-cut" style={{ left: `${axisPercent(cutMs, startMs)}%` }} />}
          <b className={styles.missionEnd} style={{ left: `${missionEnd}%` }} />
          <b className={styles.nowMarker} data-testid="timeline-now" style={{ left: `${axisPercent(shownMs, startMs)}%` }} />
        </div>
      </div>
      <div className={styles.axis}>
        <div>
          {TIMELINE_TICKS.map((day) => (
            <span key={day} style={{ left: `${(day / TIMELINE_DAYS) * 100}%` }}>
              +{day}d
            </span>
          ))}
        </div>
      </div>
      <p className={styles.axisNote}>
        The dashed line ends the {MISSION_DAYS}-day mission. Comms needs Earth in view and a DSN station listening; Golden also needs the Sun.
        {cutMs !== null && ` Our data ends on ${formatUtc(cutMs).split(",")[0]}.`}
      </p>
      <details className={styles.windowList}>
        <summary>List every window</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">From (UTC)</th>
              <th scope="col">To (UTC)</th>
              <th scope="col">Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ kind, label, windows }) =>
              windows.map(({ start, end, startClipped, endClipped }) => (
                <tr key={`${kind}-${start}`}>
                  <th scope="row">{label}</th>
                  <td>{startClipped ? "already open" : formatEdge(start)}</td>
                  <td>{endClipped ? "still open" : formatEdge(end)}</td>
                  <td>{((end - start) / HOUR_MS).toFixed(1)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </details>
    </section>
  );
}
