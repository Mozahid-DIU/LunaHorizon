"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import shares from "@/data/site-shares.json";
import { LAYERS, mapCell, mapPosition, type MapLayer } from "@/lib/atlasMap";
import { useMapGrid } from "@/lib/data/useMapGrid";
import { useYearShares } from "@/lib/data/useYearShares";
import { DEFAULT_SEARCH_MS } from "@/lib/countdown";
import { useSiteData } from "@/lib/data/useSiteData";
import { DATA_END_MS } from "@/lib/dataRange";
import { formatUtc, withQuery } from "@/lib/selection";
import { formatCoordinates, formatDays, formatDuration, MISSION_DAYS, siteSummary, type BodyOutlook, type Span, type SiteSummary } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import styles from "./atlas.module.css";

const SEARCH_DAYS = DEFAULT_SEARCH_MS / 86_400_000;

function MissionBar({ label, hours, spans, tone }: { label: string; hours: number; spans: Span[]; tone: string }) {
  return (
    <div className={styles.bar}>
      <span className={tone}>{label}</span>
      <div className={styles.track} role="img" aria-label={`${label}: ${formatDays(hours)} of ${MISSION_DAYS} days`}>
        {spans.map((span) => (
          <i key={span.from} className={tone} style={{ left: `${span.from * 100}%`, width: `${(span.to - span.from) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

interface CountdownProps {
  outlook: BodyOutlook;
  rises: string;
  sets: string;
  landingMs: number;
  isSearchCut: boolean;
}

function Countdown({ outlook, rises, sets, landingMs, isSearchCut }: CountdownProps) {
  const { isUp, eventMs } = outlook;
  const noEvent = isSearchCut ? "Beyond our data" : `Not in ${SEARCH_DAYS} days`;
  return (
    <div>
      <strong>{eventMs === null ? noEvent : formatDuration(eventMs - landingMs)}</strong>
      <span>to {isUp ? sets : rises}</span>
    </div>
  );
}

interface ResultsProps {
  summary: SiteSummary;
  landingMs: number;
  hasTerrain: boolean;
  isFromTiles: boolean;
}

function Results({ summary, landingMs, hasTerrain, isFromTiles }: ResultsProps) {
  return (
    <>
      <p className={styles.headline}>
        {formatDays(summary.hours.golden)} of {MISSION_DAYS} days
      </p>
      <p className={styles.subhead}>golden if you land on {formatUtc(landingMs)}</p>
      <div className={styles.bars}>
        <MissionBar label="Sun" hours={summary.hours.lit} spans={summary.spans.lit} tone={styles.sun} />
        <MissionBar label="Comms" hours={summary.hours.comms} spans={summary.spans.comms} tone={styles.earth} />
        <MissionBar label="Golden" hours={summary.hours.golden} spans={summary.spans.golden} tone={styles.golden} />
      </div>
      <div className={styles.countdowns}>
        <Countdown outlook={summary.earth} rises="Earthrise" sets="Earthset" landingMs={landingMs} isSearchCut={summary.isSearchCut} />
        <Countdown outlook={summary.sun} rises="sunrise" sets="sunset" landingMs={landingMs} isSearchCut={summary.isSearchCut} />
      </div>
      {!hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      {isFromTiles && <p className={styles.note}>Horizon computed in your browser from NASA LOLA height tiles.</p>}
    </>
  );
}

interface MapVersusProps {
  site: SelectedSite;
  layer: MapLayer;
  /** The point's own horizon, for a custom point; a curated site's shares are already on file. */
  profile: readonly number[];
}

/** Rule 1 on screen: the map's 5 km cell against the point's own horizon, for the same five years. */
function MapVersus({ site, layer, profile }: MapVersusProps) {
  const grid = useMapGrid();
  const isCustom = site.id === null;
  const own = useYearShares(site.lat, site.lon, isCustom ? profile : null);
  if (!mapPosition(site.lat, site.lon)) return null;
  const cell = grid.status === "ready" ? mapCell(grid.value, site.lat, site.lon) : null;
  const word = LAYERS[layer].pinWord;
  const percent = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;
  const ownText = isCustom
    ? own.status === "ready"
      ? percent(own.shares[layer])
      : own.status === "error"
        ? "not counted"
        : "counting…"
    : percent(shares[site.id as keyof typeof shares][layer]);
  return (
    <details className={styles.versus} data-testid="map-versus">
      <summary className={styles.eyebrow}>Map vs this point</summary>
      <div className={styles.versusCols}>
        <div>
          <b className={styles.versusDim} data-testid="versus-cell">
            {cell ? percent(cell.values[layer]) : grid.status === "ready" ? "no value" : "…"}
          </b>
          <small>the 5 km map cell here, {word}, 2026–30</small>
        </div>
        <div>
          <b data-testid="versus-own">{ownText}</b>
          <small>this exact point, its own horizon, {word}, 2026–30</small>
        </div>
      </div>
      <p>
        The map finds regions. The number comes from this point&apos;s own horizon,{" "}
        {isCustom ? "computed in your browser from NASA LOLA height tiles." : "from the site's horizon file."}
      </p>
    </details>
  );
}

function CardBody({ site, timeMs, layer }: { site: SelectedSite; timeMs: number; layer: MapLayer }) {
  const data = useSiteData({ site, startMs: timeMs, endMs: Math.min(timeMs + DEFAULT_SEARCH_MS, DATA_END_MS) });
  const summary = useMemo(
    () => (data.status === "ready" ? siteSummary(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );

  if (data.status === "loading") return <p className={styles.status}>Calculating…</p>;
  if (data.status === "error") return <DataNotice error={data.error} retry={data.retry} />;
  if (!summary) {
    return <p className={styles.status}>A {MISSION_DAYS}-day mission from this date runs past our data, which ends in 2030. Choose an earlier date.</p>;
  }
  return (
    <>
      <Results summary={summary} landingMs={timeMs} hasTerrain={data.hasTerrain} isFromTiles={data.heightAt !== null} />
      {data.hasTerrain && <MapVersus site={site} layer={layer} profile={data.profile} />}
    </>
  );
}

export function SiteCard({ layer }: { layer: MapLayer }) {
  const { selection, query } = useSelection();
  const { site, timeMs } = selection;

  return (
    <section className={styles.card} aria-label="Selected site">
      <p className={styles.eyebrow}>{site.id === null ? "Your point" : "Selected site"}</p>
      <h2>{shortName(site)}</h2>
      <p className={styles.coordinates}>{formatCoordinates(site.lat, site.lon)}</p>
      <CardBody site={site} timeMs={timeMs} layer={layer} />
      {!mapPosition(site.lat, site.lon) && <p className={styles.note}>This site lies outside the south polar map.</p>}
      <p className={styles.note}>
        For this exact point; ground nearby can differ. <Link href={withQuery("/ellipse", query)}>See the Landing Ellipse</Link>
      </p>
      <Link className={styles.cta} href={withQuery("/sky", query)}>
        See the sky from here →
      </Link>
    </section>
  );
}

export function SiteCardFallback() {
  return (
    <section className={styles.card} aria-label="Selected site">
      <p className={styles.status}>Calculating…</p>
    </section>
  );
}
