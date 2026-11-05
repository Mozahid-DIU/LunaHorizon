import { skyFrame } from "@/lib/brief";
import styles from "./brief.module.css";

const WIDTH = 380;
const HEIGHT = 170;
const COMPASS: readonly (readonly [string, number])[] = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];

interface BriefSkyProps {
  profile: readonly number[];
  /** The Sun's azimuth and elevation through the mission, in order. */
  sunPath: readonly (readonly [number, number])[];
  sun: { az: number; el: number };
  earth: { az: number; el: number };
  isSunUp: boolean;
  isEarthUp: boolean;
}

/** The 360 degree skyline from the horizon file, the Sun's path over the mission and where Earth is at landing. */
export function BriefSky({ profile, sunPath, sun, earth, isSunUp, isEarthUp }: BriefSkyProps) {
  const frame = skyFrame(profile, [...sunPath.map(([, el]) => el), earth.el], WIDTH, HEIGHT - 16);
  // the Sun at landing sits in the middle
  const x = (az: number) => ((((az - sun.az + 180) % 360) + 360) % 360) * (WIDTH / 360);
  const y = (el: number) => ((frame.topDeg - el) / (frame.topDeg - frame.bottomDeg)) * (HEIGHT - 16);
  const ground = [...profile.map((el, az) => [x(az), y(el)] as const)].sort((a, b) => a[0] - b[0]);
  const groundPath = `M0 ${HEIGHT} ${ground.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(" ")} L${WIDTH} ${HEIGHT} Z`;
  // the path breaks where it crosses the picture's edge
  const segments: string[] = [];
  let current = "";
  let lastX: number | null = null;
  for (const [az, el] of sunPath) {
    const px = x(az);
    if (lastX !== null && Math.abs(px - lastX) > WIDTH / 2) {
      segments.push(current);
      current = "";
    }
    current += `${current ? "L" : "M"}${px.toFixed(1)} ${y(el).toFixed(1)} `;
    lastX = px;
  }
  segments.push(current);
  const zeroY = y(0);
  return (
    <figure className={styles.fig}>
      <svg className={styles.sky} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="The skyline all the way round, the Sun's path over the mission, and Earth at landing">
        <defs>
          <linearGradient id="brief-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a3d47" />
            <stop offset="1" stopColor="#1a1c23" />
          </linearGradient>
        </defs>
        <line x1={0} x2={WIDTH} y1={zeroY} y2={zeroY} stroke="#ffffff26" strokeDasharray="3 4" />
        <text x={WIDTH - 4} y={zeroY - 3} fill="#a3adc6" fontSize={8} textAnchor="end" className={styles.skyText}>
          0°
        </text>
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#f5b841" strokeWidth={1.6} strokeOpacity={0.85} />
        ))}
        <path d={groundPath} fill="url(#brief-ground)" stroke="#9aa3b8" strokeWidth={0.8} />
        <circle cx={x(sun.az)} cy={y(sun.el)} r={5} fill="#fff3d0" opacity={isSunUp ? 1 : 0.4} />
        <text x={x(sun.az) + 8} y={y(sun.el) - 8} fill="#f5b841" fontSize={9} className={styles.skyText}>
          {isSunUp ? "Sun at landing" : "Sun at landing, behind the skyline"}
        </text>
        <circle cx={x(earth.az)} cy={y(earth.el)} r={4} fill="#6fb0ff" opacity={isEarthUp ? 1 : 0.4} />
        <text x={x(earth.az) + 7} y={y(earth.el) - 7} fill="#6fb0ff" fontSize={9} className={styles.skyText}>
          {isEarthUp ? "Earth" : "Earth, behind the skyline"}
        </text>
        {COMPASS.map(([name, az]) => (
          <text key={name} x={x(az)} y={HEIGHT - 4} fill="#a3adc6" fontSize={9} textAnchor="middle" className={styles.skyText}>
            {name}
          </text>
        ))}
      </svg>
      <figcaption>
        The skyline all the way round, with the Sun&apos;s path over the {sunPath.length > 1 ? "mission" : "landing"} (gold) and Earth at landing (blue).
        Heights are stretched {Math.round(frame.stretch)}× so the skyline can be seen.
      </figcaption>
    </figure>
  );
}
