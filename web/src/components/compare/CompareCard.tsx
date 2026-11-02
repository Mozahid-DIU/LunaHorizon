import Link from "next/link";
import { DataNotice } from "@/components/data/DataNotice";
import { shortfall, type CompareExtra, type CompareLead } from "@/lib/compare";
import { DEFAULT_SEARCH_MS } from "@/lib/countdown";
import type { SiteData } from "@/lib/data/useSiteData";
import { formatUtc, selectionQuery, withQuery, type Selection } from "@/lib/selection";
import { formatCoordinates, formatDuration, MISSION_DAYS, type BodyOutlook, type SiteSummary, type Span } from "@/lib/siteSummary";
import { shortName } from "@/lib/sites";
import { formatHours } from "@/lib/timeline";
import { ColumnControls } from "./ColumnControls";
import styles from "./compare.module.css";

const DAY_MS = 86_400_000;

export interface ColumnResult {
  data: SiteData;
  summary: SiteSummary | null;
}

function MissionRow({ label, hours, spans, tone }: { label: string; hours: number; spans: Span[]; tone: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowName}>{label}</span>
      <div className={styles.track} aria-hidden="true">
        {spans.map(({ from, to }) => (
          <i key={from} className={tone} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} />
        ))}
      </div>
      <span className={styles.rowHours} data-testid={`hours-${label}`}>
        {formatHours(hours)}
      </span>
    </div>
  );
}

interface NextChangeProps {
  outlook: BodyOutlook;
  rises: string;
  sets: string;
  landingMs: number;
  isSearchCut: boolean;
}

function NextChange({ outlook, rises, sets, landingMs, isSearchCut }: NextChangeProps) {
  const { isUp, eventMs } = outlook;
  const noEvent = isSearchCut ? "Beyond our data" : `Not in ${DEFAULT_SEARCH_MS / DAY_MS} days`;
  return (
    <div>
      <dt>To {isUp ? sets : rises}</dt>
      <dd>{eventMs === null ? noEvent : formatDuration(eventMs - landingMs)}</dd>
    </div>
  );
}

interface ResultsProps {
  summary: SiteSummary;
  landingMs: number;
  lead: CompareLead | null;
  isBest: boolean;
}

function Results({ summary, landingMs, lead, isBest }: ResultsProps) {
  const behind = lead && shortfall(summary.hours.golden, lead.best);
  return (
    <>
      <div className={styles.golden}>
        <strong data-testid="golden-hours">{formatHours(summary.hours.golden)}</strong>
        <span>Golden, of {MISSION_DAYS * 24} mission hours</span>
        {isBest && <span className={styles.best}>Most Golden hours</span>}
        {behind && <span className={styles.behind}>{behind}</span>}
      </div>
      <div className={styles.rows}>
        <MissionRow label="Sun" hours={summary.hours.lit} spans={summary.spans.lit} tone={styles.sun} />
        <MissionRow label="Comms" hours={summary.hours.comms} spans={summary.spans.comms} tone={styles.earth} />
        <MissionRow label="Golden" hours={summary.hours.golden} spans={summary.spans.golden} tone={styles.mint} />
      </div>
      <dl className={styles.changes}>
        <NextChange outlook={summary.earth} rises="Earthrise" sets="Earthset" landingMs={landingMs} isSearchCut={summary.isSearchCut} />
        <NextChange outlook={summary.sun} rises="sunrise" sets="sunset" landingMs={landingMs} isSearchCut={summary.isSearchCut} />
      </dl>
    </>
  );
}

function ColumnBody({ column, result, lead, isBest }: { column: Selection; result: ColumnResult; lead: CompareLead | null; isBest: boolean }) {
  const { data, summary } = result;
  if (data.status === "ready" && summary) return <Results summary={summary} landingMs={column.timeMs} lead={lead} isBest={isBest} />;
  return (
    <div className={styles.message}>
      {data.status === "loading" && <p>Calculating…</p>}
      {data.status === "error" && <DataNotice error={data.error} retry={data.retry} />}
      {data.status === "ready" && <p>A {MISSION_DAYS}-day mission from this date runs past our data, which ends in 2030.</p>}
    </div>
  );
}

interface CompareCardProps {
  position: number;
  column: Selection;
  result: ColumnResult;
  lead: CompareLead | null;
  isBest: boolean;
  /** Null for the first column, which the top bar controls. */
  extra: CompareExtra | null;
  mainTimeMs: number;
  onChange: (extra: CompareExtra) => void;
  onRemove: () => void;
}

export function CompareCard({ position, column, result, lead, isBest, extra, mainTimeMs, onChange, onRemove }: CompareCardProps) {
  const { site, timeMs } = column;
  const { data } = result;
  const titleId = `compare-column-${position}`;
  return (
    <section className={`${styles.card} ${isBest ? styles.cardBest : ""}`} aria-labelledby={`${titleId} ${titleId}-place ${titleId}-time`}>
      <header className={styles.head}>
        <h2 id={titleId}>{site.id === null ? "Custom site" : shortName(site)}</h2>
        <p id={`${titleId}-place`}>{formatCoordinates(site.lat, site.lon)}</p>
        <p id={`${titleId}-time`}>{formatUtc(timeMs)}</p>
        {extra ? (
          <ColumnControls position={position} extra={extra} timeMs={timeMs} mainTimeMs={mainTimeMs} onChange={onChange} onRemove={onRemove} />
        ) : (
          <p className={styles.fromBar}>Chosen in the top bar</p>
        )}
      </header>
      <ColumnBody column={column} result={result} lead={lead} isBest={isBest} />
      <footer className={styles.foot}>
        {data.status === "ready" && !data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
        {data.status === "ready" && data.heightAt !== null && <p>Horizon computed in your browser from NASA LOLA height tiles.</p>}
        <Link href={withQuery("/sky", selectionQuery(column))}>See the sky from here →</Link>
      </footer>
    </section>
  );
}
