import type { BestDate } from "@/lib/planning";
import { formatUtc } from "@/lib/selection";
import { MISSION_DAYS } from "@/lib/siteSummary";
import { formatHours } from "@/lib/timeline";
import styles from "./dates.module.css";

const DAY_MS = 86_400_000;
const MISSION_HOURS = MISSION_DAYS * 24;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface YearStripProps {
  best: readonly BestDate[];
  startMs: number;
  endMs: number;
}

/** The searched months on one axis, each best landing a bar as tall as its Golden hours. The list below says the same in words. */
export function YearStrip({ best, startMs, endMs }: YearStripProps) {
  const span = endMs - startMs;
  const at = (ms: number) => `${((ms - startMs) / span) * 100}%`;
  const months: number[] = [];
  const first = new Date(startMs);
  for (let m = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1); m < endMs; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) {
    months.push(m);
  }
  return (
    <figure className={styles.strip} aria-hidden="true">
      <div className={styles.stripPlot}>
        {months.map((m) => (
          <span key={m} className={styles.stripMonth} style={{ left: at(m) }}>
            {MONTHS[new Date(m).getUTCMonth()]}
            {new Date(m).getUTCMonth() === 0 && <small> {new Date(m).getUTCFullYear()}</small>}
          </span>
        ))}
        <b className={styles.stripChosen} style={{ left: at(startMs) }}>
          <span>Chosen</span>
        </b>
        {best.map(({ landingMs, score }, i) => (
          <i
            key={landingMs}
            className={styles.stripBar}
            style={{ left: at(landingMs), height: `${Math.max(4, (score.goldenHours / MISSION_HOURS) * 100)}%`, animationDelay: `${i * 70}ms` }}
            title={`${i + 1}. ${formatUtc(landingMs)}: ${formatHours(score.goldenHours)} Golden`}
          >
            <span>{i + 1}</span>
          </i>
        ))}
      </div>
      <figcaption className={styles.stripCaption}>
        {formatUtc(startMs).split(",")[0]} to {formatUtc(Math.min(endMs, startMs + 365 * DAY_MS)).split(",")[0]} · bar height = Golden hours of a {MISSION_DAYS}-day mission
      </figcaption>
    </figure>
  );
}
