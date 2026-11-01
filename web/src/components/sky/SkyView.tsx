"use client";

import { useMemo, useState } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { useSiteData } from "@/lib/data/useSiteData";
import { formatUtc } from "@/lib/selection";
import { formatCoordinates } from "@/lib/siteSummary";
import { shortName, type SelectedSite } from "@/lib/sites";
import { isBesideView } from "@/lib/skyView";
import { stateAt, type BodyState } from "@/lib/windows";
import styles from "./sky.module.css";
import { SkyStage, type SkySpan } from "./SkyStage";

interface BodyReadoutProps {
  name: string;
  body: BodyState;
  isUp: boolean;
  isOutOfView: boolean;
  tone: string;
}

function BodyReadout({ name, body, isUp, isOutOfView, tone }: BodyReadoutProps) {
  return (
    <section className={styles.readout} aria-label={name}>
      <h2 className={tone}>{name}</h2>
      <p className={styles.state}>{isUp ? "Above the horizon" : "Below the horizon"}</p>
      <dl>
        <div>
          <dt>Elevation</dt>
          <dd>{body.el.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Azimuth</dt>
          <dd>{body.az.toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Skyline there</dt>
          <dd>{body.horizon.toFixed(2)}°</dd>
        </div>
      </dl>
      {isUp && isOutOfView && <p className={styles.hint}>Outside this view. Turn to find it.</p>}
    </section>
  );
}

function Sky({ site, timeMs }: { site: SelectedSite; timeMs: number }) {
  const data = useSiteData({ siteId: site.id, startMs: timeMs, endMs: timeMs });
  const [view, setView] = useState<SkySpan | null>(null);
  const isOutOfView = (az: number) => view !== null && isBesideView(az, view.centre, view.span);
  const state = useMemo(
    () => (data.status === "ready" ? stateAt(data.ephemeris, site, data.profile, timeMs) : null),
    [data, site, timeMs],
  );

  if (data.status === "loading") return <p className={styles.status}>Calculating…</p>;
  if (data.status === "error") return <DataNotice error={data.error} retry={data.retry} />;
  if (!state) return null;

  return (
    <>
      <SkyStage
        state={state}
        profile={data.profile}
        artSrc={data.hasTerrain && site.id !== null ? `/data/sky/${site.id}.webp` : null}
        viewKey={`${site.id ?? `${site.lat},${site.lon}`}|${timeMs}`}
        onViewChange={setView}
      />
      {!data.hasTerrain && <p className={styles.warning}>Flat horizon: terrain not included</p>}
      <div className={styles.readouts}>
        <BodyReadout name="Sun" body={state.sun} isUp={state.lit} isOutOfView={isOutOfView(state.sun.az)} tone={styles.sun} />
        <BodyReadout name="Earth" body={state.earth} isUp={state.earthVisible} isOutOfView={isOutOfView(state.earth.az)} tone={styles.earth} />
      </div>
      <p className={styles.note}>
        The view is from 2 m above the ground. The skyline and positions are exact; the height scale is stretched near the
        horizon, the Sun and Earth markers are not to scale, and terrain shading is for display, not real lighting.
      </p>
    </>
  );
}

export function SkyView() {
  const { selection } = useSelection();
  const { site, timeMs } = selection;

  return (
    <>
      <div className={styles.intro}>
        <h1>Sky from {shortName(site)}</h1>
        <p>
          {formatCoordinates(site.lat, site.lon)} · {formatUtc(timeMs)}
        </p>
      </div>
      <Sky site={site} timeMs={timeMs} />
    </>
  );
}

export function SkyViewFallback() {
  return (
    <div className={styles.intro}>
      <h1>Sky</h1>
      <p>Calculating…</p>
    </div>
  );
}
