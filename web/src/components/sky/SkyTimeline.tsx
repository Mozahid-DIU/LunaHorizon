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
}

export function SkyTimeline({ rows, startMs, shownMs, cutMs }: SkyTimelineProps) {
  const missionEnd = (MISSION_DAYS / TIMELINE_DAYS) * 100;
  return (
    <section className={styles.timeline} aria-label="Next 30 days">
      <h2>Next 30 days</h2>
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
