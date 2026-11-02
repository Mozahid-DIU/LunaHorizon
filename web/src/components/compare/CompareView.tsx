"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelection } from "@/components/selection/useSelection";
import { columnLabels, columnsOf, compareLead, compareValue, hasRepeat, MAX_COLUMNS, nextExtra, parseCompare, type CompareExtra } from "@/lib/compare";
import { DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { useSiteData } from "@/lib/data/useSiteData";
import { DATA_END_MS } from "@/lib/dataRange";
import { withQuery, type Selection } from "@/lib/selection";
import { MISSION_DAYS, siteSummary } from "@/lib/siteSummary";
import styles from "./compare.module.css";
import { CompareCard, type ColumnResult } from "./CompareCard";

/** One column's data. Hooks need a fixed count, so an empty slot loads the first column's files and shows nothing. */
function useColumn(column: Selection | undefined, standIn: Selection): ColumnResult {
  const { site, timeMs } = column ?? standIn;
  const { lat, lon } = site;
  const isShown = column !== undefined;
  const data = useSiteData({ site, startMs: timeMs, endMs: Math.min(timeMs + DEFAULT_SEARCH_MS, DATA_END_MS) });
  // plain values, so a change to another column does not redo this one
  const summary = useMemo(
    () => (isShown && data.status === "ready" ? siteSummary(data.ephemeris, { lat, lon }, data.profile, timeMs) : null),
    [isShown, data, lat, lon, timeMs],
  );
  return { data, summary };
}

export function CompareView() {
  const { selection, query, latestCompared, updateCompared } = useSelection();
  const params = useSearchParams();
  const { extras, problems } = useMemo(() => parseCompare(params, selection), [params, selection]);
  const columns = useMemo(() => columnsOf(selection, extras), [selection, extras]);

  // keys that follow a column when one before it is removed, so its open form goes with it
  const [slots, setSlots] = useState([1, 2]);
  const [notice, setNotice] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const wasRemoved = useRef(false);

  useEffect(() => {
    if (wasRemoved.current) addButton.current?.focus();
    wasRemoved.current = false;
  }, [columns.length]);

  // builds on what is on its way to the address, so a quick second change keeps the first
  const writeExtras = (change: (current: readonly CompareExtra[]) => CompareExtra[]) => {
    const values = latestCompared();
    const current = parseCompare({ getAll: () => [...values] }, selection).extras;
    const next = change(current).slice(0, MAX_COLUMNS - 1);
    if (hasRepeat(columnsOf(selection, next))) {
      setNotice("That site and date are already on the page.");
      return;
    }
    setNotice("");
    updateCompared(next.map(compareValue));
  };

  const isSame = (a: CompareExtra, b: CompareExtra) => compareValue(a) === compareValue(b);
  const onChange = (shown: CompareExtra, extra: CompareExtra) => writeExtras((current) => current.map((item) => (isSame(item, shown) ? extra : item)));
  const onRemove = (shown: CompareExtra, position: number) => {
    wasRemoved.current = true;
    setSlots((ids) => [...ids.filter((_, n) => n !== position), Math.max(...ids) + 1]);
    writeExtras((current) => current.filter((item) => !isSame(item, shown)));
  };

  const results = [useColumn(columns[0], selection), useColumn(columns[1], selection), useColumn(columns[2], selection)].slice(0, columns.length);
  const isSettled = results.every(({ data }) => data.status === "ready");
  const labels = columnLabels(columns);
  const lead = isSettled
    ? compareLead(results.map(({ summary, data }, i) => ({ label: labels[i], goldenHours: summary?.hours.golden ?? null, hasTerrain: data.status === "ready" && data.hasTerrain })))
    : null;
  const isAnyFlat = results.some(({ data }) => data.status === "ready" && !data.hasTerrain);
  const isAnyOut = isSettled && results.some(({ summary }) => summary === null);

  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{MISSION_DAYS}-day mission from each landing time</p>
        <h1>
          {lead ? (
            <>
              {lead.lead}
              <em>{lead.emphasis}</em>
            </>
          ) : (
            "Compare sites and dates"
          )}
        </h1>
        <p className={styles.caveat}>
          For these exact points; ground nearby can differ. <Link href={withQuery("/ellipse", query)}>See the Landing Ellipse</Link>
        </p>
        {isAnyFlat && <p className={styles.flatNote}>A flat horizon has no terrain to block the Sun or Earth, so it can read higher than a real site. It is left out of the ranking when real terrain is on the page.</p>}
        {lead && isAnyOut && <p className={styles.flatNote}>A column whose mission runs past our data is left out of this headline.</p>}
        <p role="status" className={styles.problems}>
          {[...problems, notice].filter(Boolean).join(" ")}
        </p>
      </div>

      <div className={styles.grid}>
        {columns.map((column, i) => (
          <CompareCard
            key={i === 0 ? 0 : slots[i - 1]}
            position={i + 1}
            column={column}
            result={results[i]}
            lead={lead}
            isBest={lead?.isBest[i] ?? false}
            extra={i === 0 ? null : extras[i - 1]}
            mainTimeMs={selection.timeMs}
            onChange={(extra) => onChange(extras[i - 1], extra)}
            onRemove={() => onRemove(extras[i - 1], i - 1)}
          />
        ))}
        {columns.length < MAX_COLUMNS && (
          <button ref={addButton} type="button" className={styles.add} onClick={() => writeExtras((current) => [...current, nextExtra(columnsOf(selection, current))])}>
            <span aria-hidden="true">+</span>
            Add a site or date
          </button>
        )}
      </div>
    </>
  );
}

export function CompareViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Compare sites and dates</h1>
      <p className={styles.caveat}>Calculating…</p>
    </div>
  );
}
