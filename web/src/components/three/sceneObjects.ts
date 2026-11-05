/** The things in the sky and on the ground that are not terrain: Sun, Earth, stars, lander, skyline line. */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { sunVector } from "@/lib/terrain/terrainTiles";

/** Where the Sun, Earth and stars are drawn, in metres: beyond the terrain, within the camera's reach. */
export const SUN_DISTANCE_M = 300_000;
export const EARTH_DISTANCE_M = 220_000;
export const STAR_DISTANCE_M = 450_000;
export const SKYLINE_DISTANCE_M = 120_000;
/** Angular radii as seen from the Moon: the Sun 0.265 degrees, the Earth 0.95 degrees. */
const SUN_RADIUS_DEG = 0.265;
const EARTH_RADIUS_DEG = 0.95;
const DEG = Math.PI / 180;
const STAR_COUNT = 2200;

function radialTexture(stops: readonly (readonly [number, string])[]): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface SkyBody {
  group: Group;
  /** Points the body along an azimuth and elevation from the site. */
  place(azDeg: number, elDeg: number): void;
  dispose(): void;
}

/** The Sun's disc, hidden by terrain like anything else, and a glow that fades when the engine says it has set. */
export function createSun(): SkyBody & { setLit(isLit: boolean): void } {
  const disc = new Sprite(new SpriteMaterial({ map: radialTexture([[0, "#fff8e8"], [0.9, "#fff1cc"], [1, "#fff1cc00"]]), depthWrite: false }));
  const discSize = 2 * SUN_DISTANCE_M * Math.tan(SUN_RADIUS_DEG * DEG);
  disc.scale.set(discSize, discSize, 1);
  const glow = new Sprite(
    new SpriteMaterial({ map: radialTexture([[0, "#f5b84188"], [0.35, "#f5b84133"], [1, "#f5b84100"]]), depthWrite: false, blending: AdditiveBlending, transparent: true }),
  );
  glow.scale.set(discSize * 26, discSize * 26, 1);
  const group = new Group();
  group.add(glow, disc);
  return {
    group,
    place(az, el) {
      group.position.set(...sunVector(az, el)).multiplyScalar(SUN_DISTANCE_M);
    },
    setLit(isLit) {
      glow.material.opacity = isLit ? 1 : 0.15;
    },
    dispose() {
      disc.material.map?.dispose();
      disc.material.dispose();
      glow.material.map?.dispose();
      glow.material.dispose();
    },
  };
}

/** A plain Earth, lit by the same Sun so its phase is right; blue with white cloud bands. */
export function createEarth(): SkyBody {
  const radius = EARTH_DISTANCE_M * Math.tan(EARTH_RADIUS_DEG * DEG);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2a67c4";
  ctx.fillRect(0, 0, 512, 256);
  // a repeatable scatter of land and cloud, not a map of anything
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#5d7d3a" : "#f1f4f8";
    ctx.globalAlpha = i % 3 === 0 ? 0.9 : 0.55;
    ctx.beginPath();
    ctx.ellipse(random() * 512, 30 + random() * 196, 12 + random() * 50, 6 + random() * 18, random() * Math.PI, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#f6f8fb";
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 242, 512, 14);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(new SphereGeometry(radius, 48, 32), new MeshStandardMaterial({ map, roughness: 0.8, metalness: 0 }));
  const group = new Group();
  group.add(mesh);
  return {
    group,
    place(az, el) {
      group.position.set(...sunVector(az, el)).multiplyScalar(EARTH_DISTANCE_M);
    },
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      map.dispose();
    },
  };
}

/** A fixed field of stars; the real sky is black, and these only give the view depth. */
export function createStars(): Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  let seed = 42;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const z = random() * 2 - 1;
    const a = random() * 2 * Math.PI;
    const r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(a) * STAR_DISTANCE_M, z * STAR_DISTANCE_M, r * Math.sin(a) * STAR_DISTANCE_M], i * 3);
    const bright = 0.4 + random() * 0.6;
    colors.set([bright, bright, bright * (0.9 + random() * 0.1)], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return new Points(geometry, new PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
}

/** A small lander, about three metres tall, built from plain shapes; it casts a shadow. */
export function createLander(): Group {
  const group = new Group();
  const gold = new MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.75, roughness: 0.35 });
  const dark = new MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.4, roughness: 0.6 });
  const panel = new MeshStandardMaterial({ color: 0x18264f, metalness: 0.5, roughness: 0.3 });
  const add = (mesh: Mesh) => {
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const body = add(new Mesh(new CylinderGeometry(0.75, 0.75, 1.1, 8), gold));
  body.position.y = 1.45;
  const deck = add(new Mesh(new BoxGeometry(1.5, 0.08, 1.5), dark));
  deck.position.y = 2.04;
  const solar = add(new Mesh(new BoxGeometry(1.7, 0.05, 1.1), panel));
  solar.position.y = 2.55;
  const mast = add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.5), dark));
  mast.position.y = 2.3;
  const dish = add(new Mesh(new CylinderGeometry(0.28, 0.1, 0.12, 16), dark));
  dish.position.set(0.55, 2.25, 0.4);
  dish.rotation.z = -0.6;
  for (let i = 0; i < 4; i++) {
    const angle = (i + 0.5) * (Math.PI / 2);
    const leg = add(new Mesh(new CylinderGeometry(0.04, 0.04, 2.1), dark));
    leg.position.set(Math.cos(angle) * 0.95, 0.95, Math.sin(angle) * 0.95);
    leg.rotation.z = Math.cos(angle) * 0.42;
    leg.rotation.x = -Math.sin(angle) * 0.42;
    const foot = add(new Mesh(new CylinderGeometry(0.16, 0.16, 0.04, 12), dark));
    foot.position.set(Math.cos(angle) * 1.35, 0.02, Math.sin(angle) * 1.35);
  }
  return group;
}

/** A ring and a name over the lander, the same size at any distance, so it can be found from above. */
export function createBeacon(): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "#eef1f8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(32, 32, 11, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#eef1f8";
  ctx.beginPath();
  ctx.arc(32, 32, 3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.font = "600 26px IBM Plex Sans, sans-serif";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#000";
  ctx.shadowBlur = 6;
  ctx.fillText("Lander", 54, 33);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
  sprite.center.set(32 / 256, 0.5);
  sprite.scale.set(0.26, 0.065, 1);
  sprite.position.set(0, 3, 0);
  sprite.renderOrder = 11;
  return sprite;
}

/** The horizon file's 360 degree profile as a line in the sky, seen from the lander's eye. */
export function createSkyline(profile: readonly number[], eye: Vector3): Line {
  const points: number[] = [];
  for (let az = 0; az <= 360; az++) {
    const [x, y, z] = sunVector(az, profile[az % 360]);
    points.push(eye.x + x * SKYLINE_DISTANCE_M, eye.y + y * SKYLINE_DISTANCE_M, eye.z + z * SKYLINE_DISTANCE_M);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  const line = new Line(geometry, new LineBasicMaterial({ color: 0x46e6b4, depthTest: false, transparent: true, opacity: 0.95 }));
  line.renderOrder = 10;
  line.frustumCulled = false;
  return line;
}
