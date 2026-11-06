import { smoothArea, smoothPath } from "@/lib/chartPath";
import type { PowerSample } from "@/lib/power";
import { wattLabel } from "@/lib/powerPlan";
import styles from "./power.module.css";

const WIDTH = 1000;
const HEIGHT = 260;
const PAD = { top: 16, right: 92, bottom: 40, left: 124 };
const DAY_MS = 86_400_000;
const HEADROOM = 1.1;

interface PowerChartProps {
  samples: readonly PowerSample[];
  capacityWh: number;
  loadW: number;
  emptyAtMs: number | null;
  days: number;
  /** What the chart shows, in words, for screen readers. */
  summary: string;
}

/** Solar power and the load on the left scale, battery charge on the right, across the mission. */
export function PowerChart({ samples, capacityWh, loadW, emptyAtMs, days, summary }: PowerChartProps) {
  const startMs = samples[0].utcMs;
  const spanMs = days * DAY_MS;
  const maxW = Math.max(loadW, ...samples.map(({ solarW }) => solarW), 1) * HEADROOM;
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (ms: number) => PAD.left + ((ms - startMs) / spanMs) * plotW;
  const yW = (w: number) => PAD.top + plotH - (w / maxW) * plotH;
  const yCharge = (wh: number) => PAD.top + plotH - (wh / capacityWh) * plotH;

  const solarPoints = samples.map(({ utcMs, solarW }) => ({ x: x(utcMs), y: yW(solarW) }));
  const chargePoints = samples.map(({ utcMs, socWh }) => ({ x: x(utcMs), y: yCharge(socWh) }));
  const base = PAD.top + plotH;
  const dayTicks = Array.from({ length: Math.floor(days / 7) + 1 }, (_, i) => i * 7);

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary}>
      {[0, 0.5, 1].map((share) => (
        <g key={share}>
          <line className={styles.grid} x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH * (1 - share)} y2={PAD.top + plotH * (1 - share)} />
          <text className={styles.axisLeft} x={PAD.left - 8} y={PAD.top + plotH * (1 - share) + 4}>
            {wattLabel(maxW * share, maxW)}
          </text>
          <text className={styles.axisRight} x={WIDTH - PAD.right + 8} y={PAD.top + plotH * (1 - share) + 4}>
            {Math.round(share * 100)}%
          </text>
        </g>
      ))}
      {dayTicks.map((day) => (
        <text key={day} className={styles.axisBottom} x={PAD.left + (day / days) * plotW} y={HEIGHT - 8}>
          +{day}d
        </text>
      ))}
      <defs>
        <linearGradient id="power-solar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f5b841" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#f5b841" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="power-charge" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#46e6b4" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#46e6b4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className={styles.solarArea} d={smoothArea(solarPoints, base)} fill="url(#power-solar)" />
      <path className={styles.chargeArea} d={smoothArea(chargePoints, base)} fill="url(#power-charge)" />
      <path className={styles.solarLine} d={smoothPath(solarPoints)} pathLength={1} />
      <line className={styles.loadLine} x1={PAD.left} x2={WIDTH - PAD.right} y1={yW(loadW)} y2={yW(loadW)} />
      <path className={styles.chargeLine} d={smoothPath(chargePoints)} pathLength={1} />
      {emptyAtMs !== null && <line className={styles.emptyLine} data-testid="empty-marker" x1={x(emptyAtMs)} x2={x(emptyAtMs)} y1={PAD.top} y2={PAD.top + plotH} />}
    </svg>
  );
}
