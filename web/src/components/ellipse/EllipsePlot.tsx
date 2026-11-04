import type { EllipseScores } from "@/lib/ellipse";
import { formatRing, plotRadius, RINGS_M } from "@/lib/ellipse";
import styles from "./ellipse.module.css";

const SIZE = 320;
const CENTRE = SIZE / 2;
const OUTER = 130;
const DIMMEST = 0.15;
/** Ring labels sit between the north and north-east points, where no dot is drawn. */
const LABEL_BEARING_DEG = 22.5;

const radiusFor = (distanceM: number) => plotRadius(distanceM, OUTER);

function place(distanceM: number, bearingDeg: number): { x: number; y: number } {
  const r = radiusFor(distanceM);
  const angle = (bearingDeg * Math.PI) / 180;
  return { x: CENTRE + r * Math.sin(angle), y: CENTRE - r * Math.cos(angle) };
}

interface EllipsePlotProps {
  scores: EllipseScores;
  ringM: number;
  summary: string;
}

/** The landing zone seen from above, north up: each point shaded by its Golden share of the mission. */
export function EllipsePlot({ scores, ringM, summary }: EllipsePlotProps) {
  const { touchdown } = scores;
  // shading runs from the zone's fewest Golden hours to its most, so small differences still show
  const inZone = scores.points.filter(({ point }) => point.ring_m <= ringM).map(({ score }) => score.goldenHours);
  const low = Math.min(...inZone);
  const span = Math.max(...inZone) - low;
  const shade = (hours: number) => (span === 0 ? 1 : DIMMEST + (1 - DIMMEST) * ((hours - low) / span));
  const athena = touchdown && place(touchdown.point.distance_m, touchdown.point.bearing_deg);
  return (
    <svg className={styles.plot} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={summary}>
      {RINGS_M.map((ring) => (
        <g key={ring}>
          <circle className={ring <= ringM ? styles.ringOn : styles.ringOff} cx={CENTRE} cy={CENTRE} r={radiusFor(ring)} />
          <text className={styles.ringLabel} {...place(ring, LABEL_BEARING_DEG)} dy={-3}>
            {formatRing(ring)}
          </text>
        </g>
      ))}
      <text className={styles.north} x={CENTRE} y={14}>
        N
      </text>
      {scores.points.map(({ point, score }) => {
        const { x, y } = place(point.ring_m, point.bearing_deg);
        const isIn = point.ring_m <= ringM;
        return (
          <circle
            key={`${point.ring_m}-${point.bearing_deg}`}
            className={isIn ? styles.dot : styles.dotOut}
            data-testid="zone-point"
            data-golden={score.goldenHours}
            cx={x}
            cy={y}
            r={point.ring_m === 0 ? 9 : 7}
            style={{ fillOpacity: isIn ? shade(score.goldenHours) : 0 }}
          />
        );
      })}
      {athena && (
        <g className={styles.athena} data-testid="athena-marker">
          <path d={`M ${athena.x - 6} ${athena.y - 6} L ${athena.x + 6} ${athena.y + 6} M ${athena.x + 6} ${athena.y - 6} L ${athena.x - 6} ${athena.y + 6}`} />
          {/* to the left of the cross: the 500 m south-east point sits just to its right */}
          <text x={athena.x - 9} y={athena.y + 4} textAnchor="end">
            Athena
          </text>
        </g>
      )}
    </svg>
  );
}
