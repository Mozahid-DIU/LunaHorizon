"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { DataNotice } from "@/components/data/DataNotice";
import { layerPixels, LAYERS, overlayOutsetPercent, type MapLayer } from "@/lib/atlasMap";
import { useMapGrid } from "@/lib/data/useMapGrid";
import type { MapGrid } from "@/lib/data/validate";
import styles from "./atlas.module.css";
import { SiteCard, SiteCardFallback } from "./SiteCard";
import { SitePins } from "./SitePins";

const LAYER_ORDER: readonly MapLayer[] = ["golden", "lit", "earth"];

function MapOverlay({ grid, layer }: { grid: MapGrid; layer: MapLayer }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const outset = overlayOutsetPercent(grid);

  useEffect(() => {
    canvas.current?.getContext("2d")?.putImageData(new ImageData(layerPixels(grid, layer), grid.size, grid.size), 0, 0);
  }, [grid, layer]);

  return (
    <canvas
      ref={canvas}
      data-testid="map-layer"
      className={styles.overlay}
      width={grid.size}
      height={grid.size}
      style={{ inset: `-${outset}%`, width: `${100 + 2 * outset}%`, height: `${100 + 2 * outset}%` }}
      aria-hidden="true"
    />
  );
}

function MapKey({ layer }: { layer: MapLayer }) {
  const { title, rgb, lowPercent, highPercent } = LAYERS[layer];
  const colour = `rgb(${rgb.join(" ")})`;
  return (
    <div className={styles.key}>
      <p className={styles.keyTitle}>{title}, 2026–30</p>
      <div className={styles.keyBar} style={{ backgroundImage: `linear-gradient(90deg, #8d96ad, ${colour})` }} />
      <div className={styles.keyEnds}>
        <span>{lowPercent === 0 ? "0%" : `under ${lowPercent}%`}</span>
        <span>{highPercent === 100 ? "100%" : `${highPercent}%+`}</span>
      </div>
      <p className={styles.keyNote}>
        A 5 km overview for finding regions; good ground can lie between its points. Site numbers use each site&apos;s own
        horizon. Relief shading is for display only.
      </p>
    </div>
  );
}

export function AtlasView() {
  const [layer, setLayer] = useState<MapLayer>("golden");
  const map = useMapGrid();

  return (
    <div className={styles.atlas}>
      <section className={styles.intro}>
        <h1>
          Find the right place and the <em>right time</em> to land on the Moon.
        </h1>
        <p>The glow marks ground that {LAYERS[layer].glow}, from real NASA terrain.</p>
      </section>

      <div className={styles.map} data-testid="map">
        <div className={styles.surface}>
          <Image
            className={styles.relief}
            src="/data/map/relief.webp"
            alt="Shaded relief map of the lunar south pole, reaching 300 km from the pole"
            width={1600}
            height={1600}
            sizes="(max-width: 1279px) 100vw, 1040px"
            unoptimized
            priority
          />
          <div className={styles.tint} />
          {map.status === "ready" && <MapOverlay grid={map.value} layer={layer} />}
        </div>
        <Suspense>
          <SitePins layer={layer} />
        </Suspense>
      </div>

      <div className={styles.controls}>
        <div className={styles.layers} role="group" aria-label="Map layer">
          {LAYER_ORDER.map((id) => (
            <button key={id} type="button" aria-pressed={layer === id} onClick={() => setLayer(id)}>
              {LAYERS[id].label}
            </button>
          ))}
        </div>
        {map.status === "error" ? (
          <div className={styles.keyError}>
            <DataNotice error={map.error} retry={map.retry} />
          </div>
        ) : (
          <MapKey layer={layer} />
        )}
      </div>

      <div className={styles.cardColumn}>
        <Suspense fallback={<SiteCardFallback />}>
          <SiteCard />
        </Suspense>
      </div>
    </div>
  );
}
