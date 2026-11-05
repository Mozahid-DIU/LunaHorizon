"use client";

import { DataNotice } from "@/components/data/DataNotice";
import { useNudgePlan } from "@/lib/data/useNudgePlan";
import { isSameAnswer } from "@/lib/datesPlan";
import { canNudge, changeText, nudgeHeadline, type NudgePlan } from "@/lib/nudgePlan";
import { formatUtc } from "@/lib/selection";
import { MISSION_DAYS } from "@/lib/siteSummary";
import { hasHeightTiles, type SelectedSite } from "@/lib/sites";
import { formatHours } from "@/lib/timeline";
import styles from "./dates.module.css";

const MISSION_HOURS = MISSION_DAYS * 24;
/** Bars at under half the chosen landing's hours turn red. */
const LOW_SHARE = 0.5;
const GRID: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

const tone = (hours: number, base: number) => (isSameAnswer(hours, base) ? styles.flat : hours > base ? styles.up : styles.down);

/** The chosen point in the middle, the moved points around it, 1 km and 2 km out. The list below says the same in words. */
function Compass({ plan }: { plan: NudgePlan }) {
  const base = plan.chosenHours;
  const worst = plan.moved.reduce((a, b) => (b.goldenHours < a.goldenHours ? b : a));
  return (
    <div className={styles.compass} aria-hidden="true">
      <span className={styles.compassNorth}>N</span>
      <div className={`${styles.point} ${styles.pointCentre}`} style={{ gridColumn: 3, gridRow: 3 }} data-testid="nudge-centre">
        <b>{formatHours(base)}</b>
        <span className={styles.flat}>chosen</span>
        <small>here</small>
      </div>
      {plan.moved.map((m) => {
        const [dx, dy] = GRID[m.letter];
        const isWorst = m === worst && worst.goldenHours < base && !isSameAnswer(worst.goldenHours, base);
        return (
          <div
            key={`${m.km}${m.letter}`}
            className={`${styles.point} ${isWorst ? styles.pointWorst : ""}`}
            style={{ gridColumn: 3 + dx * m.km, gridRow: 3 + dy * m.km }}
            data-testid="nudge-point"
            data-place={`${m.km}${m.letter}`}
          >
            <b>{formatHours(m.goldenHours)}</b>
            <span className={tone(m.goldenHours, base)}>{changeText(m.goldenHours, base).match(/\(([^)]+)\)/)?.[1] ?? changeText(m.goldenHours, base)}</span>
            <small>
              {m.km} km {m.letter}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function DateCards({ plan, landingMs }: { plan: NudgePlan; landingMs: number }) {
  const [earlier, later] = plan.dates;
  const card = (label: string, hours: number | null, extra: string, className = "") => (
    <div className={`${styles.day} ${className}`} data-testid="nudge-day">
      <p>{label}</p>
      <b>{hours === null ? "—" : formatHours(hours)}</b>
      <span className={hours === null ? styles.flat : tone(hours, plan.chosenHours)}>{hours === null ? "Outside our data" : extra}</span>
    </div>
  );
  const change = (hours: number | null) => (hours === null ? "" : changeText(hours, plan.chosenHours));
  return (
    <div className={styles.days}>
      {card("1 day earlier", earlier.goldenHours, change(earlier.goldenHours))}
      {card("As chosen", plan.chosenHours, formatUtc(landingMs).split(",")[0], styles.dayChosen)}
      {card("1 day later", later.goldenHours, change(later.goldenHours))}
    </div>
  );
}

function ChangeList({ plan }: { plan: NudgePlan }) {
  const base = plan.chosenHours;
  const rows = [
    ...plan.moved.map((m) => ({ label: `${m.km} km ${m.direction}`, hours: m.goldenHours })),
    ...plan.dates.filter((d) => d.goldenHours !== null).map((d) => ({ label: d.days < 0 ? "1 day earlier" : "1 day later", hours: d.goldenHours as number })),
  ].sort((a, b) => a.hours - base - (b.hours - base));
  return (
    <ul className={styles.changes}>
      {rows.map(({ label, hours }) => (
        <li key={label} data-testid="nudge-change">
          <span>{label}</span>
          <span className={styles.changeTrack} aria-hidden="true">
            <i className={hours < base * LOW_SHARE ? styles.changeLow : ""} style={{ width: `${(hours / MISSION_HOURS) * 100}%` }} />
          </span>
          <em className={tone(hours, base)}>
            {formatHours(hours)} · {changeText(hours, base)}
          </em>
        </li>
      ))}
    </ul>
  );
}

function unavailableText(site: SelectedSite): string {
  if (!site.has_terrain) return "This point has no terrain horizon, so moving it would only move it across a flat horizon. The table above still shows what a delay changes.";
  if (hasHeightTiles(site.lat)) return "Some points 2 km from here fall north of 65° S, beyond our height tiles, so the nearby points cannot all be checked. The table above still shows what a delay changes.";
  return "Moving the point needs a horizon for every spot 1–2 km around it, and our height tiles cover only the south polar region, south of 65° S. The table above still shows what a delay changes.";
}

/** "Small change, big impact": the chosen landing moved 1-2 km, or a day either way. */
export function NudgeSection({ site, landingMs }: { site: SelectedSite; landingMs: number }) {
  const isPossible = site.has_terrain && canNudge(site);
  const result = useNudgePlan(site, landingMs, isPossible);
  return (
    <section className={styles.nudge} aria-labelledby="nudge-title">
      <h2 className={styles.eyebrow} id="nudge-title">
        Small change, big impact
      </h2>
      {!isPossible && <p className={styles.note}>{unavailableText(site)}</p>}
      <p role="status" className={styles.searching}>
        {result.status === "loading" ? "Building the horizons of 8 nearby points from NASA LOLA height tiles…" : ""}
      </p>
      {result.status === "error" && <DataNotice error={result.error} retry={result.retry} />}
      {result.status === "ready" && <NudgeResult plan={result.plan} landingMs={landingMs} />}
    </section>
  );
}

function NudgeResult({ plan, landingMs }: { plan: NudgePlan; landingMs: number }) {
  const { lead, emphasis, tail, isLoss } = nudgeHeadline(plan);
  return (
    <>
      <p className={styles.nudgeHeadline} data-testid="nudge-headline">
        {lead}
        <em className={isLoss ? styles.down : styles.up}>{emphasis}</em>
        {tail}
      </p>
      <p className={styles.nudgeSub}>
        The same {MISSION_DAYS}-day landing from points 1 km and 2 km away in each direction, and a day earlier or later, each against the
        landing as chosen. Each moved point gets its own horizon from NASA LOLA height tiles, computed in your browser.
      </p>
      <div className={styles.nudgeBody}>
        <Compass plan={plan} />
        <div>
          <h3 className={styles.eyebrow}>The same place, a day either side</h3>
          <DateCards plan={plan} landingMs={landingMs} />
          <h3 className={styles.eyebrow}>Every change, biggest loss first</h3>
          <ChangeList plan={plan} />
          <p className={styles.why}>
            <b>Why it can matter so much:</b> near the pole the Sun stays within a few degrees of the horizon, so a ridge a little higher
            than the ground around it can hide the Sun or Earth for days. These are 8 sample points; ground between them can differ again.
            The Landing Ellipse page looks closer, 100 m to 1 km.
          </p>
          {Math.floor(plan.centreHours) !== Math.floor(plan.chosenHours) && (
            <p className={styles.note}>
              At the chosen point the height tiles give {formatHours(plan.centreHours)} and the site&apos;s horizon file{" "}
              {formatHours(plan.chosenHours)}; everything here is measured against the file, as on the rest of the page.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
