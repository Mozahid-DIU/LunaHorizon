"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LessonCard } from "@/components/classroom/LessonCard";
import { useClassroom } from "@/components/classroom/useClassroom";
import { DataNotice } from "@/components/data/DataNotice";
import { useSelection } from "@/components/selection/useSelection";
import { cellBox, latLonAt, layerPixels, LAYERS, mapCell, overlayOutsetPercent, type MapCell, type MapLayer } from "@/lib/atlasMap";
import { useMapGrid } from "@/lib/data/useMapGrid";
import type { MapGrid } from "@/lib/data/validate";
import { atlasAnswer } from "@/lib/classroomAnswers";
import { formatCoordinates } from "@/lib/siteSummary";
import { shortName } from "@/lib/sites";
import styles from "./atlas.module.css";
import { SiteCard, SiteCardFallback } from "./SiteCard";
import { MoonLight } from "./MoonLight";
import { SitePins } from "./SitePins";

const LAYER_ORDER: readonly MapLayer[] = ["golden", "lit", "earth"];
/** A tooltip this far across the map sits to the left of the pointer, so it stays on the map. */
const FLIP_TIP_LEFT_PERCENT = 55;
/** Coordinates a click puts in the address: 0.001 degrees is about 30 m on the Moon. */
const COORDINATE_DECIMALS = 3;

/** A tooltip this far down the map sits above the pointer. */
const FLIP_TIP_TOP_PERCENT = 72;
/** A finger that moves further than this is scrolling, not tapping. */
const TAP_SLOP_PX = 8;

/** A place the pointer is over, already rounded to what a click would choose. */
export interface Pointed {
  lat: number;
  lon: number;
  leftPercent: number;
  topPercent: number;
  isTouch: boolean;
}

const percentText = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;
const roundCoordinate = (value: number) => Number(value.toFixed(COORDINATE_DECIMALS));

interface MapEvent {
  clientX: number;
  clientY: number;
  currentTarget: HTMLDivElement;
  nativeEvent: Event;
  target: EventTarget;
}

/** Which kind of pointer sent an event; a click carries it on its native event. */
const isTouchEvent = (event: MapEvent) => (event.nativeEvent as Partial<PointerEvent>).pointerType === "touch";

/** Where on the map a pointer event landed, or null outside the disc. */
function pointedAt(event: MapEvent): Pointed | null {
  const box = event.currentTarget.getBoundingClientRect();
  const leftPercent = ((event.clientX - box.left) / box.width) * 100;
  const topPercent = ((event.clientY - box.top) / box.height) * 100;
  if (Math.hypot(leftPercent - 50, topPercent - 50) > 50) return null;
  const place = latLonAt(leftPercent, topPercent);
  // the same rounded place is read, shown, chosen and written to the address
  return { lat: roundCoordinate(place.lat), lon: roundCoordinate(place.lon), leftPercent, topPercent, isTouch: isTouchEvent(event) };
}

/** The cell a pointed place falls in, read when it is drawn so a grid that arrives later still counts. */
const cellOf = (grid: MapGrid | null, pointed: Pointed | null): MapCell | null => (grid && pointed ? mapCell(grid, pointed.lat, pointed.lon) : null);

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
        <b>Point at the map</b> to read a 5 km cell; <b>click</b> to check that exact point with its own horizon. The map finds
        regions; good ground can lie between its points. Relief shading is for display only.
      </p>
    </div>
  );
}

/** The pointed cell on the map: its outline, and a tooltip for a mouse. */
function CellReadout({ pointed, grid, layer }: { pointed: Pointed; grid: MapGrid; layer: MapLayer }) {
  const { leftPercent, topPercent, lat, lon } = pointed;
  const cell = cellOf(grid, pointed);
  if (!cell) return null;
  const box = cellBox(grid, cell.row, cell.col);
  const isFlipped = leftPercent > FLIP_TIP_LEFT_PERCENT;
  const isAbove = topPercent > FLIP_TIP_TOP_PERCENT;
  const place = {
    ...(isFlipped ? { right: `${100 - leftPercent}%` } : { left: `${leftPercent}%` }),
    ...(isAbove ? { bottom: `${100 - topPercent}%` } : { top: `${topPercent}%` }),
  };
  return (
    <>
      <div className={styles.cell} style={{ left: `${box.leftPercent}%`, top: `${box.topPercent}%`, width: `${box.sizePercent}%`, height: `${box.sizePercent}%` }} />
      {!pointed.isTouch && (
        <div className={`${styles.tip} ${isFlipped ? styles.tipFlipped : ""} ${isAbove ? styles.tipAbove : ""}`} data-testid="cell-tip" style={place}>
          <b style={{ color: `rgb(${LAYERS[layer].rgb.join(" ")})` }}>
            {percentText(cell.values[layer])} {LAYERS[layer].pinWord}
          </b>
          <span>5 km cell · {formatCoordinates(lat, lon)}</span>
          <em>Click to check this exact point</em>
        </div>
      )}
    </>
  );
}

function AtlasLesson() {
  const { site } = useSelection().selection;
  return (
    <div className={styles.lesson}>
      <LessonCard id="atlas" answer={atlasAnswer(site.id, shortName(site))} />
    </div>
  );
}

/** Only in Classroom mode, so the page is unchanged without it. */
function AtlasLessonSlot() {
  if (!useClassroom()) return null;
  return (
    <Suspense>
      <AtlasLesson />
    </Suspense>
  );
}

interface LiveMoonProps {
  isPlaying: boolean;
  timeLabel: React.RefObject<HTMLSpanElement | null>;
  onReady: () => void;
}

function LiveMoon(props: LiveMoonProps) {
  return <MoonLight timeMs={useSelection().selection.timeMs} {...props} />;
}

export function AtlasView() {
  const [layer, setLayer] = useState<MapLayer>("golden");
  const [isLightPlaying, setLightPlaying] = useState(true);
  const [isLightReady, setLightReady] = useState(false);
  const lightTime = useRef<HTMLSpanElement>(null);
  const onLightReady = useCallback(() => setLightReady(true), []);
  const [pointed, setPointed] = useState<Pointed | null>(null);
  const map = useMapGrid();
  const grid = map.status === "ready" ? map.value : null;
  // the pins hand over a way to choose a point; a ref, so handing it over never re-renders the map
  const chooseRef = useRef<((lat: number, lon: number) => void) | null>(null);
  const onPinsReady = useCallback((choose: (lat: number, lon: number) => void) => {
    chooseRef.current = choose;
  }, []);

  const touchStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const choose = (at: Pointed) => {
    chooseRef.current?.(at.lat, at.lon);
    setPointed(null);
  };
  const isOnPin = (event: MapEvent) => (event.target as HTMLElement).closest("button") !== null;

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    setPointed(pointedAt(event));
  };
  // a mouse chooses with a plain left click; a pin is a button of its own
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isTouchEvent(event) || isOnPin(event)) return;
    const at = pointedAt(event);
    if (at) choose(at);
  };
  // a finger reads a cell with a tap that does not move; a scroll is left alone
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && event.isPrimary && !isOnPin(event)) touchStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;
    const at = pointedAt(event);
    if (at) setPointed(at);
  };
  const onPointerCancel = () => {
    touchStart.current = null;
  };

  return (
    <>
      <AtlasLessonSlot />
      <div className={styles.atlas}>
        <section className={styles.intro}>
          <p className={styles.section}>
            <span>01</span>Lunar south pole
          </p>
          <h1>
            Find the right place and the <em>right time</em> to land on the Moon.
          </h1>
          <p>The glow marks ground that {LAYERS[layer].glow}, from real NASA terrain.</p>
        </section>

        <div
          className={styles.map}
          data-testid="map"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setPointed((p) => (p?.isTouch ? p : null))}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={onClick}
        >
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
            <Suspense>
              <LiveMoon isPlaying={isLightPlaying} timeLabel={lightTime} onReady={onLightReady} />
            </Suspense>
            <div className={styles.tint} />
            {map.status === "ready" && <MapOverlay grid={map.value} layer={layer} />}
          </div>
          <Suspense>
            <SitePins layer={layer} onReady={onPinsReady} />
          </Suspense>
          {pointed && grid && <CellReadout pointed={pointed} grid={grid} layer={layer} />}
        </div>

        {pointed?.isTouch && grid && cellOf(grid, pointed) && (
          <div className={styles.sheet} data-testid="cell-sheet" role="status">
            <div>
              <b style={{ color: `rgb(${LAYERS[layer].rgb.join(" ")})` }}>
                {percentText(cellOf(grid, pointed)!.values[layer])} {LAYERS[layer].pinWord}
              </b>
              <span>5 km cell · {formatCoordinates(pointed.lat, pointed.lon)} · 2026–30</span>
            </div>
            <button type="button" aria-label={`Check this point, ${formatCoordinates(pointed.lat, pointed.lon)}`} onClick={() => choose(pointed)}>
              Check this point
            </button>
          </div>
        )}

        <div className={styles.controls}>
          <p className={styles.section}>
            <span>02</span>Map layer
          </p>
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
          {isLightReady && (
            <div className={styles.light}>
              <p className={styles.section}>
                <span>03</span>Sunlight
              </p>
              <div className={styles.lightRow}>
                <button type="button" onClick={() => setLightPlaying((playing) => !playing)} aria-label={isLightPlaying ? "Pause the sunlight" : "Play the sunlight"}>
                  {isLightPlaying ? "❚❚" : "▶"}
                </button>
                <p>
                  Lit from the real Sun direction at <span ref={lightTime} />, one lunar day in 24 s. Shadowed ground is shown dim so it stays readable.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className={styles.cardColumn}>
          <Suspense fallback={<SiteCardFallback />}>
            <SiteCard layer={layer} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
