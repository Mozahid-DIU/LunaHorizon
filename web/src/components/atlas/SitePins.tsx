"use client";

import { useSelection } from "@/components/selection/useSelection";
import shares from "@/data/site-shares.json";
import { LAYERS, mapPosition, type MapLayer, type MapPosition } from "@/lib/atlasMap";
import { formatCoordinates } from "@/lib/siteSummary";
import { shortName, SITES } from "@/lib/sites";
import styles from "./atlas.module.css";

/** Beyond this, a label to the right of its pin would leave the map. */
const FLIP_LABEL_LEFT_PERCENT = 68;

const pinStyle = ({ leftPercent, topPercent }: MapPosition) => ({ left: `${leftPercent}%`, top: `${topPercent}%` });
const labelClass = ({ leftPercent }: MapPosition) =>
  `${styles.pin} ${leftPercent > FLIP_LABEL_LEFT_PERCENT ? styles.pinFlipped : ""}`;

export function SitePins({ layer }: { layer: MapLayer }) {
  const { selection, update } = useSelection();
  const { site: selected } = selection;
  const customPosition = selected.id === null ? mapPosition(selected.lat, selected.lon) : null;

  return (
    <>
      {SITES.map((site) => {
        const position = mapPosition(site.lat, site.lon);
        if (!position) return null;
        const share = shares[site.id as keyof typeof shares][layer];
        return (
          <button
            key={site.id}
            type="button"
            className={labelClass(position)}
            style={pinStyle(position)}
            aria-pressed={selected.id === site.id}
            onClick={() => update({ site })}
          >
            <span className={styles.dot} data-dot />
            <span className={styles.label}>
              <strong>{shortName(site)}</strong>
              <span style={{ color: `rgb(${LAYERS[layer].rgb.join(" ")})` }}>
                {(share / 10).toFixed(1)}% {LAYERS[layer].pinWord}
              </span>
            </span>
          </button>
        );
      })}
      {customPosition && (
        <div
          role="img"
          aria-label={`Custom site, ${formatCoordinates(selected.lat, selected.lon)}`}
          className={`${labelClass(customPosition)} ${styles.pinFixed}`}
          style={pinStyle(customPosition)}
        >
          <span className={styles.dot} data-dot />
          <span className={styles.label}>
            <strong>Custom site</strong>
          </span>
        </div>
      )}
    </>
  );
}
