"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import shares from "@/data/site-shares.json";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { evidenceOf, gapsWithin, MISSION_MS, watchList } from "@/lib/brief";
import { useDataFile } from "@/lib/data/useDataFile";
import { useDatesPlan } from "@/lib/data/useDatesPlan";
import { useEllipseScores } from "@/lib/data/useEllipseScores";
import { useNudgePlan } from "@/lib/data/useNudgePlan";
import { useSiteData } from "@/lib/data/useSiteData";
import { dataLoader } from "@/lib/data/loader";
import { relay } from "@/lib/dsnRelay";
import { zoneSummary } from "@/lib/ellipse";
import { canNudge } from "@/lib/nudgePlan";
import { DEFAULT_SETUP, runPower } from "@/lib/powerPlan";
import { formatUtc, withQuery } from "@/lib/selection";
import { MISSION_DAYS, siteSummary } from "@/lib/siteSummary";
import { shortName } from "@/lib/sites";
import { skyDataEnd } from "@/lib/skyOutlook";
import { TIMELINE_DAYS, timelineCut, timelineRows } from "@/lib/timeline";
import { DATA_END_MS } from "@/lib/dataRange";
import { NUDGE_KM, DIRECTIONS } from "@/lib/nudgePlan";
import { SITES } from "@/lib/sites";
import { stateAt } from "@/lib/windows";
import styles from "./brief.module.css";
import { PageOne, PageTwo, type BriefData, type Part } from "./BriefPages";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The Sun's path is drawn from a point every two hours. */
const PATH_STEP_MS = 2 * HOUR_MS;
const ZONE_RING_M = 500;
const LIVE_ORIGIN = "https://lunahorizon.vercel.app";

const loadValidation = () => dataLoader.loadValidation();
const DATA_END_TEXT = formatUtc(DATA_END_MS).split(",")[0];

/** The map a curated site's horizon was built from, as its file names it; null for custom points. */
function useHorizonSource(siteId: string | null): string | null {
  const [found, setFound] = useState<{ id: string; source: string } | null>(null);
  useEffect(() => {
    if (siteId === null) return;
    let isCurrent = true;
    dataLoader.loadHorizon(siteId).then(
      (file) => isCurrent && setFound({ id: siteId, source: file.source }),
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, [siteId]);
  return found?.id === siteId ? found.source : null;
}

/** The moment the page opened, for "Prepared"; the server's render leaves it out. */
function usePreparedMs(): number | null {
  const [openedMs] = useState(() => (typeof window === "undefined" ? null : Date.now()));
  return openedMs;
}

function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => LIVE_ORIGIN,
  );
}

function Toolbar({ title, isReady, waiting }: { title: string; isReady: boolean; waiting: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.toolbar} data-print="hide">
      <div>
        <p className={styles.toolbarTitle}>Mission Brief</p>
        <p className={styles.toolbarSub}>{title} · 2 pages, A4</p>
      </div>
      <button type="button" className={styles.secondary} onClick={copy}>
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button type="button" className={styles.primary} onClick={() => window.print()} disabled={!isReady} data-testid="brief-print">
        {isReady ? "Print or save as PDF" : `Finishing ${waiting} ${waiting === 1 ? "calculation" : "calculations"}…`}
      </button>
    </div>
  );
}

export function BriefView() {
  const { selection, query } = useSelection();
  const { site, timeMs } = selection;
  const origin = useOrigin();
  const preparedMs = usePreparedMs();
  const data = useSiteData({ site, startMs: timeMs, endMs: skyDataEnd(timeMs, timeMs + TIMELINE_DAYS * DAY_MS) });
  const dates = useDatesPlan(site, timeMs);
  const zoneState = useEllipseScores(site.id ?? "", timeMs, site.id !== null && site.has_ellipse);
  const nudgeState = useNudgePlan(site, timeMs, site.has_terrain && canNudge(site));
  const validation = useDataFile(loadValidation);
  const horizonSource = useHorizonSource(site.id);
  const ready = data.status === "ready" ? data : null;

  const core = useMemo(() => {
    if (!ready) return null;
    const { ephemeris: eph, profile } = ready;
    const summary = siteSummary(eph, site, profile, timeMs);
    if (!summary) return null;
    const sunPath: [number, number][] = [];
    for (let t = timeMs; t <= timeMs + MISSION_MS; t += PATH_STEP_MS) {
      const { sun } = stateAt(eph, site, profile, t);
      sunPath.push([sun.az, sun.el]);
    }
    const power = runPower(eph, site, profile, timeMs, DEFAULT_SETUP);
    return {
      summary,
      state: stateAt(eph, site, profile, timeMs),
      rows: timelineRows(eph, site, profile, timeMs),
      relay: relay(eph, timeMs, Math.min(timeMs + TIMELINE_DAYS * DAY_MS, eph.dataEnd())),
      cutMs: timelineCut(eph, timeMs),
      sunPath,
      power: power.status === "ready" ? power.run : null,
    };
  }, [ready, site, timeMs]);

  const title = `${shortName(site)} · ${formatUtc(timeMs)}`;
  if (data.status === "error") return <DataNotice error={data.error} retry={data.retry} />;
  if (data.status === "loading") return <p className={styles.status}>Calculating…</p>;
  if (!core || !ready) {
    return (
      <div className={styles.empty}>
        <h1>Mission Brief</h1>
        <p>
          A {MISSION_DAYS}-day mission from this date runs past our data, which ends on {DATA_END_TEXT}. Choose an earlier date.
        </p>
      </div>
    );
  }

  const zone: Part<ReturnType<typeof zoneSummary>> =
    site.id === null || !site.has_ellipse
      ? { state: "none", why: `Landing-zone horizons exist for ${SITES.filter((s) => s.has_ellipse).map((s) => shortName(s)).join(", ")}; this site is not one of them.` }
      : zoneState.status === "ready"
        ? zoneState.scores
          ? { state: "ready", value: zoneSummary(zoneState.scores, ZONE_RING_M) }
          : { state: "none", why: "The landing zone cannot be scored past the end of our data." }
        : zoneState.status === "error"
          ? { state: "failed", why: "The landing-zone calculation did not finish; the Ellipse page has the details." }
          : { state: "pending" };
  const nudge: BriefData["nudge"] = !(site.has_terrain && canNudge(site))
    ? { state: "none", why: `Moving the point needs height tiles for every spot ${NUDGE_KM.join("–")} km around it in ${DIRECTIONS.length} directions; they cover only the south polar region, south of 65° S.` }
    : nudgeState.status === "ready"
      ? { state: "ready", value: nudgeState.plan }
      : nudgeState.status === "error"
        ? { state: "failed", why: "The nearby points did not finish; the Dates page has the details." }
        : { state: "pending" };
  const best: BriefData["best"] =
    dates.status === "ready"
      ? { state: "ready", value: { best: dates.plan.best, isSearchCut: dates.plan.isSearchCut } }
      : dates.status === "error"
        ? { state: "failed", why: "The date search did not finish; the Dates page has the details." }
        : { state: "pending" };
  const evidence: BriefData["evidence"] =
    validation.status === "ready" ? { state: "ready", value: evidenceOf(validation.value) } : validation.status === "error" ? { state: "failed", why: "The validation file could not be read; see the Proof page." } : { state: "pending" };
  const power: BriefData["power"] = core.power ? { state: "ready", value: core.power } : { state: "none", why: "The mission runs past our data." };

  const watch = watchList({
    landingMs: timeMs,
    summary: core.summary,
    missionGaps: gapsWithin(core.relay.gaps, timeMs),
    zone: zone.state === "ready" ? zone.value : null,
    slip: dates.status === "ready" ? dates.plan.slip : null,
    power: core.power,
  });
  const waiting = [zone, nudge, best, evidence].filter((part) => part.state === "pending").length;
  const brief: BriefData = {
    site,
    landingMs: timeMs,
    url: `${origin}${withQuery("/brief", query)}`,
    preparedMs,
    ...core,
    profile: ready.profile,
    hasTerrain: ready.hasTerrain,
    isFromTiles: ready.heightAt !== null,
    terrainSource: horizonSource,
    isFarSide: site.id !== null && (shares as Record<string, { earth: number }>)[site.id]?.earth === 0,
    isCoarse: site.id !== null && site.is_coarse_terrain,
    dataEndText: DATA_END_TEXT,
    power,
    zone,
    nudge,
    best,
    watch,
    evidence,
  };

  return (
    <div className={styles.brief} data-brief>
      <Toolbar title={title} isReady={waiting === 0} waiting={waiting} />
      {waiting > 0 && (
        <p className={styles.printOnly} data-testid="brief-incomplete">
          INCOMPLETE: this brief was printed while {waiting} {waiting === 1 ? "calculation was" : "calculations were"} still running.
        </p>
      )}
      <p role="status" className={styles.srOnly}>
        {waiting > 0 ? `Finishing ${waiting} calculations` : "The brief is complete"}
      </p>
      <PageOne data={brief} />
      <PageTwo data={brief} isWaiting={waiting > 0} />
    </div>
  );
}

export function BriefViewFallback() {
  return <p className={styles.status}>Calculating…</p>;
}
