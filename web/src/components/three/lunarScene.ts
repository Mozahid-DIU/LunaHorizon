/**
 * The 3D scene: real tile heights at 1:1, lit from the engine's Sun direction, with shadows
 * from lightmap.ts. Two cameras: the lander's eye at 2 m, and an orbit above the site.
 * x is east, y is up, z is south; units are metres.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TerrainTiles } from "@/lib/data/loader";
import { levelIndices, levelPositions, sunVector } from "@/lib/terrain/terrainTiles";
import { createLightmap } from "./lightmap";
import { createBeacon, createEarth, createLander, createSkyline, createStars, createSun } from "./sceneObjects";

export type ViewMode = "above" | "eye";

export interface LunarScene {
  setSun(azDeg: number, elDeg: number, isLit: boolean): void;
  /** A phone gets a lower pixel ratio and a wider eye. */
  setPhone(isPhone: boolean): void;
  setEarth(azDeg: number, elDeg: number): void;
  setMode(mode: ViewMode): void;
  setSkyline(isShown: boolean): void;
  resize(width: number, height: number): void;
  /** The lit fraction of the ground at the site, from the shadow pass. */
  litAtLander(): number;
  dispose(): void;
}

const DEG = Math.PI / 180;
const MAX_DISTANCE_M = 150_000;
const LIGHT_DISTANCE_M = 300;
const EYE_FOV = { desktop: 58, phone: 72 };
const FOV_RANGE = [18, 95] as const;
const PITCH_RANGE = [-70, 80] as const;
const ABOVE_DISTANCE_M = 22_000;
const ABOVE_ELEVATION_DEG = 30;
/** Shadows are recomputed once the Sun has moved this far, and no more often than this. */
const SUN_MOVE_DEG = 0.03;
const SHADOW_INTERVAL_MS = 120;

function terrainGeometry(tiles: TerrainTiles, index: number): { geometry: BufferGeometry; positions: Float32Array } {
  const level = tiles.levels[index];
  const positions = levelPositions(level, tiles.meta.ground_m);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(levelIndices(level, index > 0 ? tiles.levels[index - 1] : null), 1));
  geometry.computeVertexNormals();
  return { geometry, positions };
}

/** Drag to look around from the lander, scroll to zoom, arrow keys to turn. */
class EyeLook {
  yaw = 0;
  pitch = 2;
  fov = EYE_FOV.desktop;
  private drag: { x: number; y: number; yaw: number; pitch: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: () => void,
  ) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("keydown", this.onKey);
  }

  enabled = false;

  private readonly onDown = (event: PointerEvent) => {
    if (!this.enabled || !event.isPrimary || event.button !== 0) return;
    this.drag = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onMove = (event: PointerEvent) => {
    if (!this.enabled || !this.drag || !event.isPrimary) return;
    const degPerPx = this.fov / this.canvas.clientHeight;
    this.yaw = this.drag.yaw - (event.clientX - this.drag.x) * degPerPx;
    this.pitch = Math.min(Math.max(this.drag.pitch + (event.clientY - this.drag.y) * degPerPx, PITCH_RANGE[0]), PITCH_RANGE[1]);
    this.onChange();
  };

  private readonly onUp = () => {
    this.drag = null;
  };

  private readonly onWheel = (event: WheelEvent) => {
    if (!this.enabled) return;
    event.preventDefault();
    this.fov = Math.min(Math.max(this.fov * (event.deltaY > 0 ? 1.1 : 0.9), FOV_RANGE[0]), FOV_RANGE[1]);
    this.onChange();
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    const turn: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] };
    const step = turn[event.key];
    if (!step) return;
    event.preventDefault();
    this.yaw += step[0];
    this.pitch = Math.min(Math.max(this.pitch + step[1], PITCH_RANGE[0]), PITCH_RANGE[1]);
    this.onChange();
  };

  apply(camera: PerspectiveCamera): void {
    const [x, y, z] = sunVector(this.yaw, this.pitch);
    camera.lookAt(camera.position.x + x, camera.position.y + y, camera.position.z + z);
    if (camera.fov !== this.fov) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("keydown", this.onKey);
  }
}

export interface SceneOptions {
  isPhone: boolean;
  /** Called after the first frame is on screen. */
  onReady: () => void;
  /** The browser took the graphics context away; the scene cannot draw any more. */
  onLost: () => void;
}

export function createLunarScene(canvas: HTMLCanvasElement, tiles: TerrainTiles, profile: readonly number[], options: SceneOptions): LunarScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.isPhone ? 1.5 : 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(0x02030a);

  const built = tiles.levels.map((_, i) => terrainGeometry(tiles, i));
  const lightmap = createLightmap(
    renderer,
    tiles.levels,
    built.map(({ positions }) => positions),
    MAX_DISTANCE_M,
  );
  built.forEach(({ geometry }, i) => {
    const mesh = new Mesh(geometry, lightmap.material);
    mesh.receiveShadow = i === 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
  });

  // the Moon has no air: one hard light, and only a trace of fill so shadowed ground can be made out
  const sunLight = new DirectionalLight(0xfff4e0, 2.6);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -14;
  sunLight.shadow.camera.right = 14;
  sunLight.shadow.camera.top = 8;
  sunLight.shadow.camera.bottom = -8;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = LIGHT_DISTANCE_M * 2.5;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.03;
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight, sunLight.target, new AmbientLight(0x8a94b8, 0.07));

  const sun = createSun();
  const earth = createEarth();
  const stars = createStars();
  const lander = createLander();
  const beacon = createBeacon();
  const eyeHeight = tiles.meta.observer_height_m;
  const skyline = createSkyline(profile, new Vector3(0, eyeHeight, 0));
  skyline.visible = false;
  scene.add(sun.group, earth.group, stars, lander, beacon, skyline);

  const eyeCamera = new PerspectiveCamera(options.isPhone ? EYE_FOV.phone : EYE_FOV.desktop, 1, 0.5, 1_000_000);
  eyeCamera.position.set(0, eyeHeight, 0);
  const aboveCamera = new PerspectiveCamera(50, 1, 0.5, 1_000_000);
  const controls = new OrbitControls(aboveCamera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 40;
  controls.maxDistance = 160_000;
  controls.maxPolarAngle = 86 * DEG;
  controls.zoomSpeed = 0.8;

  let isDirty = true;
  const markDirty = () => {
    isDirty = true;
  };
  let isShadowPending = false;
  let shadowDoneAt = -Infinity;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    options.onLost();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  controls.addEventListener("change", markDirty);
  const look = new EyeLook(canvas, markDirty);
  look.fov = eyeCamera.fov;

  let mode: ViewMode = "above";
  let isSkylineShown = false;
  let lastShadowSun: Vector3 | null = null;
  let isAbovePlaced = false;
  const sunDir = new Vector3(0, 1, 0);

  const applyMode = () => {
    controls.enabled = mode === "above";
    look.enabled = mode === "eye";
    lander.visible = mode === "above";
    beacon.visible = mode === "above";
    skyline.visible = mode === "eye" && isSkylineShown;
    markDirty();
  };
  applyMode();

  let frame = 0;
  let hasRendered = false;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    // shadows follow the Sun at a steady pace, so fast playback does not stall on them
    if (isShadowPending && performance.now() - shadowDoneAt >= SHADOW_INTERVAL_MS) {
      isShadowPending = false;
      lightmap.update(sunDir);
      lastShadowSun = sunDir.clone();
      shadowDoneAt = performance.now();
      isDirty = true;
    }
    const moved = controls.enabled && controls.update();
    if (!isDirty && !moved) return;
    isDirty = false;
    if (mode === "eye") look.apply(eyeCamera);
    renderer.render(scene, mode === "eye" ? eyeCamera : aboveCamera);
    if (!hasRendered) {
      hasRendered = true;
      options.onReady();
    }
  };
  frame = requestAnimationFrame(loop);

  return {
    setSun(az, el, isLit) {
      sunDir.set(...sunVector(az, el));
      sunLight.position.copy(sunDir).multiplyScalar(LIGHT_DISTANCE_M);
      sun.place(az, el);
      sun.setLit(isLit);
      if (!lastShadowSun || lastShadowSun.angleTo(sunDir) > SUN_MOVE_DEG * DEG) isShadowPending = true;
      if (!isAbovePlaced) {
        // start opposite the Sun, looking toward it, so the shadows run toward the viewer
        isAbovePlaced = true;
        const horizontal = new Vector3(sunDir.x, 0, sunDir.z).normalize();
        const back = Math.cos(ABOVE_ELEVATION_DEG * DEG) * ABOVE_DISTANCE_M;
        aboveCamera.position.set(-horizontal.x * back, Math.sin(ABOVE_ELEVATION_DEG * DEG) * ABOVE_DISTANCE_M, -horizontal.z * back);
        controls.update();
        look.yaw = az;
      }
      markDirty();
    },
    setEarth(az, el) {
      earth.place(az, el);
      markDirty();
    },
    setPhone(isPhone) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, isPhone ? 1.5 : 2));
      look.fov = isPhone ? EYE_FOV.phone : EYE_FOV.desktop;
      markDirty();
    },
    setMode(next) {
      mode = next;
      applyMode();
    },
    setSkyline(isShown) {
      isSkylineShown = isShown;
      applyMode();
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      for (const camera of [eyeCamera, aboveCamera]) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      markDirty();
    },
    litAtLander: () => lightmap.litAtCentre(),
    dispose() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      look.dispose();
      lightmap.dispose();
      sun.dispose();
      earth.dispose();
      beacon.material.map?.dispose();
      // everything else: the terrain, the stars, the lander's parts and the skyline
      scene.traverse((object) => {
        const item = object as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        item.geometry?.dispose();
        if (Array.isArray(item.material)) item.material.forEach((m) => m.dispose());
        else item.material?.dispose();
      });
      sunLight.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
