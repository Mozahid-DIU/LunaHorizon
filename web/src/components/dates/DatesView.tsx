"use client";

import Link from "next/link";
import { useRef } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { compareQuery, compareValue, extraFor, joinQueries } from "@/lib/compare";
import { useDatesPlan } from "@/lib/data/useDatesPlan";
import { datesHeadline, formatChange, formatPercent, NEARBY_KM, nearbySites } from "@/lib/datesPlan";
import type { BestDate, SlipPlan, SlipRow } from "@/lib/planning";
import { formatUtc, selectionQuery, withQuery, type Selection } from "@/lib/selection";
import { MISSION_DAYS } from "@/lib/siteSummary";
import { findSite, shortName } from "@/lib/sites";
import { formatHours } from "@/lib/timeline";
import styles from "./dates.module.css";
import { NudgeSection } from "./NudgeSection";

const MISSION_HOURS = MISSION_DAYS * 24;

interface BestRowProps {
  rank: number;
  best: BestDate;
  selection: Selection;
  onUse: (timeMs: number) => void;
}

function BestRow({ rank, best, selection, onUse }: BestRowProps) {
  const { landingMs, score } = best;
  const isChosen = landingMs === selection.timeMs;
  const columnQuery = compareQuery([compareValue(extraFor(selection.site, landingMs, selection.timeMs))]);
  return (
    <li className={`${styles.bestRow} ${isChosen ? styles.bestChosen : ""}`}>
      <span className={styles.rank} aria-hidden="true">
        {rank}
      </span>
      <div className={styles.bestMain}>
        <strong data-testid="best-date">{formatUtc(landingMs)}</strong>
        <div className={styles.meter} aria-hidden="true">
          <i style={{ width: `${(score.goldenHours / MISSION_HOURS) * 100}%` }} />
        </div>
        <p>
          <span data-testid="best-golden">{formatHours(score.goldenHours)}</span> Golden · {formatHours(score.litHours)} Sun · {formatHours(score.commsHours)} Comms
        </p>
      </div>
      <div className={styles.bestActions}>
        {isChosen ? (
          <span className={styles.chosen}>Chosen date</span>
        ) : (
          <button type="button" onClick={() => onUse(landingMs)}>
            Use this date
          </button>
        )}
        <Link href={withQuery("/sky", selectionQuery({ site: selection.site, timeMs: landingMs }))}>Sky</Link>
        {!isChosen && <Link href={withQuery("/compare", joinQueries(selectionQuery(selection), columnQuery))}>Compare</Link>}
      </div>
    </li>
  );
}

function ChangeCells({ row, baseline }: { row: SlipRow; baseline: number }) {
  if (!row.score) return <td colSpan={2}>Past our data</td>;
  const percent = formatPercent(row.deltaPercent);
  return (
    <>
      <td data-testid="slip-golden">{formatHours(row.score.goldenHours)}</td>
      <td data-testid="slip-change" className={row.score.goldenHours < baseline ? styles.worse : ""}>
        {formatChange(row.score.goldenHours, baseline)}
        {percent && ` (${percent})`}
      </td>
    </>
  );
}

function SlipTable({ slip, selection }: { slip: SlipPlan; selection: Selection }) {
  const baseline = slip.baseline.goldenHours;
  const distances = new Map(nearbySites(selection.site).map(({ site, km }) => [site.id, km]));
  const label = (row: SlipRow) => {
    if (row.kind === "slip") return `${row.days} ${row.days === 1 ? "day" : "days"} later`;
    const site = findSite(row.siteId as string);
    const km = distances.get(row.siteId as string);
    return `${site ? shortName(site) : row.siteId}${km === undefined ? "" : `, ${Math.round(km)} km away`}`;
  };
  return (
    <table className={styles.slip} aria-labelledby="slip-title">
      <thead>
        <tr>
          <th scope="col">Change</th>
          <th scope="col">Golden</th>
          <th scope="col">Against chosen date</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">As chosen</th>
          <td data-testid="slip-golden">{formatHours(baseline)}</td>
          <td>—</td>
        </tr>
        {slip.rows.map((row) => (
          <tr key={row.siteId ?? row.days}>
            <th scope="row">{label(row)}</th>
            <ChangeCells row={row} baseline={baseline} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DatesView() {
  const { selection, query, update } = useSelection();
  const { site, timeMs } = selection;
  const result = useDatesPlan(site, timeMs);
  const headline = result.status === "ready" ? datesHeadline(result.plan.best, result.plan.slip?.baseline.goldenHours ?? null, result.plan.isSearchCut) : null;
  const heading = useRef<HTMLHeadingElement>(null);

  // the list goes away while the new search runs, so focus must not stay on its button
  const onUse = (ms: number) => {
    update({ timeMs: ms });
    heading.current?.focus();
  };
  const name = site.id === null ? "this custom site" : shortName(site);

  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Best {MISSION_DAYS}-day landings from {name}</p>
        <h1 ref={heading} tabIndex={-1}>
          {headline ? (
            <>
              {headline.lead}
              <em>{headline.emphasis}</em>
            </>
          ) : (
            "Best landing dates"
          )}
        </h1>
        <p className={styles.caveat}>
          For this exact point; ground nearby can differ. <Link href={withQuery("/ellipse", query)}>See the Landing Ellipse</Link>
        </p>
        {result.status === "ready" && !result.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      </div>

      <p role="status" className={styles.searching}>
        {result.status === "loading" ? "Searching 12 months…" : ""}
      </p>
      {result.status === "error" && <DataNotice error={result.error} retry={result.retry} />}
      {result.status === "ready" && !result.plan.slip && <p className={styles.searching}>A {MISSION_DAYS}-day mission from this date runs past our data, which ends in 2030.</p>}
      {result.status === "ready" && result.plan.slip && (
        <>
          {result.isFromTiles && <p className={styles.note}>Horizon computed in your browser from NASA LOLA height tiles.</p>}
          <div className={styles.layout}>
            <section aria-labelledby="best-title">
              <h2 id="best-title">{result.plan.isSearchCut ? "Best landings before our data ends" : "Best landings, 12 months from the chosen date"}</h2>
              <ol className={styles.bestList}>
                {result.plan.best.map((best, i) => (
                  <BestRow key={best.landingMs} rank={i + 1} best={best} selection={selection} onUse={onUse} />
                ))}
              </ol>
              <p className={styles.note}>
                Most Golden hours first, at least {MISSION_DAYS} days apart so each is a separate chance.
                {result.plan.isSearchCut && " The search stops where our data ends, in 2030."}
              </p>
            </section>
            <section aria-labelledby="slip-title">
              <h2 id="slip-title">If the plan changes</h2>
              <SlipTable slip={result.plan.slip} selection={selection} />
              <p className={styles.note}>
                {result.hasTerrain
                  ? `Nearby means our listed sites within ${NEARBY_KM} km; rows appear only where one exists.`
                  : "Nearby sites are left out: a flat horizon cannot be set against real terrain."}
              </p>
            </section>
          </div>
          <NudgeSection site={site} landingMs={timeMs} />
        </>
      )}
    </>
  );
}

export function DatesViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Best landing dates</h1>
      <p className={styles.caveat}>Calculating…</p>
    </div>
  );
}
