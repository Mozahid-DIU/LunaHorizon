/**
 * Shadows for the terrain, computed on the GPU the way the engine finds a horizon: from every
 * tile node a ray runs toward the Sun across the three height grids, and the node is lit by
 * however much of the Sun's disc clears the ground along it. The result is one small texture
 * per level, which the terrain material multiplies into the sunlight.
 */
import {
  DataTexture,
  FloatType,
  GLSL3,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import type { TerrainLevels } from "@/lib/terrain/terrainTiles";

/** The Sun's angular radius from the Moon, in radians, for the soft edge of each shadow. */
const SUN_RADIUS_RAD = 0.0046;
/** A node with no height is stored far below anything real. */
const MISSING = -1e9;
const LEVELS = 3;

/** Declarations and the height lookup shared by the shadow pass and the terrain material. */
const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D up0;
uniform sampler2D up1;
uniform sampler2D up2;
uniform vec3 halfSize;
uniform vec3 stepSize;
uniform vec3 gridSize;

float fetchUp(int level, ivec2 texel) {
  float value = texelFetch(up2, texel, 0).r;
  if (level == 0) value = texelFetch(up0, texel, 0).r;
  else if (level == 1) value = texelFetch(up1, texel, 0).r;
  return value;
}

// the height a straight ray compares against: the finest level holding the point, blended between its nodes
float upAt(float east, float north) {
  for (int level = 0; level < ${LEVELS}; level++) {
    float extent = halfSize[level];
    if (abs(east) > extent || abs(north) > extent) continue;
    float step = stepSize[level];
    int size = int(gridSize[level]);
    float fc = (east + extent) / step;
    float fr = (extent - north) / step;
    int c0 = min(int(floor(fc)), size - 2);
    int r0 = min(int(floor(fr)), size - 2);
    float tx = fc - float(c0);
    float ty = fr - float(r0);
    float a = fetchUp(level, ivec2(c0, r0));
    float b = fetchUp(level, ivec2(c0 + 1, r0));
    float c = fetchUp(level, ivec2(c0, r0 + 1));
    float d = fetchUp(level, ivec2(c0 + 1, r0 + 1));
    if (min(min(a, b), min(c, d)) < -1e8) return -1e9;
    return mix(mix(a, b, tx), mix(c, d, tx), ty);
  }
  return -1e9;
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
${HEIGHT_GLSL}
uniform int level;
uniform vec3 sunDir; // east, up, north
uniform float sunRadius;
uniform float maxDistance;
out vec4 outColor;

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  float up0v = fetchUp(level, texel);
  if (up0v < -1e8) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float extent = halfSize[level];
  float step = stepSize[level];
  float east0 = float(texel.x) * step - extent;
  float north0 = extent - float(texel.y) * step;
  float horiz = length(sunDir.xz);
  if (horiz < 1e-6) { outColor = vec4(1.0); return; }
  vec2 dir = sunDir.xz / horiz;
  float climb = sunDir.y / horiz; // rise per metre along the ground
  // how far above the ray the ground reaches, as an angle seen along the ray; the Sun's disc is sunRadius wide
  float worst = -1.0;
  float t = step;
  while (t <= maxDistance) {
    float e = east0 + dir.x * t;
    float n = north0 + dir.y * t;
    float ground = upAt(e, n);
    if (ground > -1e8) {
      float rayUp = up0v + climb * t;
      float block = atan((ground - rayUp) * horiz, t);
      worst = max(worst, block);
      if (worst > sunRadius) break;
    }
    // walk at the pace of the grid the ray is crossing
    float d = max(abs(e), abs(n));
    t += d < halfSize[0] ? stepSize[0] : (d < halfSize[1] ? stepSize[1] : stepSize[2]);
  }
  // the part of the disc above the ground's edge: a circle segment, as the engine's sunDiscFraction
  float d = clamp(worst / sunRadius, -1.0, 1.0);
  float lit = (acos(d) - d * sqrt(1.0 - d * d)) / 3.14159265;
  outColor = vec4(lit, 0.0, 0.0, 1.0);
}
`;

/** Reads the lit value of a point from the finest level's shadow texture that holds it. */
const LIT_GLSL = /* glsl */ `
uniform sampler2D lit0;
uniform sampler2D lit1;
uniform sampler2D lit2;
uniform vec3 litHalf;
uniform vec3 litStep;
uniform vec3 litSize;
varying vec3 vTerrainPos;

float terrainLit(vec3 p) {
  float east = p.x;
  float north = -p.z;
  for (int level = 0; level < ${LEVELS}; level++) {
    float extent = litHalf[level];
    if (abs(east) > extent || abs(north) > extent) continue;
    vec2 uv = (vec2((east + extent) / litStep[level], (extent - north) / litStep[level]) + 0.5) / litSize[level];
    if (level == 0) return texture2D(lit0, uv).r;
    if (level == 1) return texture2D(lit1, uv).r;
    return texture2D(lit2, uv).r;
  }
  return 1.0;
}

// fine regolith grain, so the ground is not a flat tint
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float terrainGrain(vec3 p) {
  float fine = valueNoise(p.xz * 0.7);
  float mid = valueNoise(p.xz * 0.05);
  float broad = valueNoise(p.xz * 0.002);
  return 0.82 + 0.12 * fine + 0.12 * mid + 0.1 * broad;
}
`;

export interface Lightmap {
  /** The material for the terrain meshes, which shades with these shadows. */
  material: MeshStandardMaterial;
  /** Recomputes every level's shadows for a Sun direction (scene frame: x east, y up, z south). */
  update(sunDir: Vector3): void;
  /** The lit fraction at the site itself, read back from the finest level. */
  litAtCentre(): number;
  dispose(): void;
}

function upTexture(size: number, up: Float32Array): DataTexture {
  const texture = new DataTexture(up, size, size, RedFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** `positions` are the scene points from levelPositions, whose y is the curved height. */
export function createLightmap(renderer: WebGLRenderer, levels: TerrainLevels, positions: readonly Float32Array[], maxDistance: number): Lightmap {
  const upTextures = levels.map((level, i) => {
    const up = new Float32Array(level.size * level.size);
    for (let n = 0; n < up.length; n++) up[n] = Number.isNaN(level.heights[n]) ? MISSING : positions[i][n * 3 + 1];
    return upTexture(level.size, up);
  });
  const targets = levels.map(
    ({ size }) =>
      new WebGLRenderTarget(size, size, {
        format: RGBAFormat,
        type: UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      }),
  );
  const halfSize = new Vector3(...levels.map(({ half_size_m }) => half_size_m));
  const stepSize = new Vector3(...levels.map(({ step_m }) => step_m));
  const gridSize = new Vector3(...levels.map(({ size }) => size));

  const shadowMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: SHADOW_FRAGMENT,
    uniforms: {
      up0: { value: upTextures[0] },
      up1: { value: upTextures[1] },
      up2: { value: upTextures[2] },
      halfSize: { value: halfSize },
      stepSize: { value: stepSize },
      gridSize: { value: gridSize },
      level: { value: 0 },
      sunDir: { value: new Vector3(0, 1, 0) },
      sunRadius: { value: SUN_RADIUS_RAD },
      maxDistance: { value: maxDistance },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new Scene();
  quadScene.add(new Mesh(new PlaneGeometry(2, 2), shadowMaterial));
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const litUniforms = {
    lit0: { value: targets[0].texture },
    lit1: { value: targets[1].texture },
    lit2: { value: targets[2].texture },
    litHalf: { value: halfSize },
    litStep: { value: stepSize },
    litSize: { value: gridSize },
  };
  const material = new MeshStandardMaterial({ color: 0x9a948a, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, litUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${LIT_GLSL}`)
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= terrainGrain(vTerrainPos);")
      .replace("getDirectionalLightInfo( directionalLight, directLight );", "getDirectionalLightInfo( directionalLight, directLight );\ndirectLight.color *= terrainLit(vTerrainPos);");
  };
  material.customProgramCacheKey = () => "lunar-terrain";

  const pixel = new Uint8Array(4);
  const centre = Math.floor(levels[0].size / 2);

  return {
    material,
    update(sunDir) {
      // the shadow pass works in east, up, north
      shadowMaterial.uniforms.sunDir.value.set(sunDir.x, sunDir.y, -sunDir.z);
      const previous = renderer.getRenderTarget();
      for (let level = 0; level < LEVELS; level++) {
        shadowMaterial.uniforms.level.value = level;
        renderer.setRenderTarget(targets[level]);
        renderer.render(quadScene, quadCamera);
      }
      renderer.setRenderTarget(previous);
    },
    litAtCentre() {
      renderer.readRenderTargetPixels(targets[0], centre, centre, 1, 1, pixel);
      return pixel[0] / 255;
    },
    dispose() {
      upTextures.forEach((texture) => texture.dispose());
      targets.forEach((target) => target.dispose());
      shadowMaterial.dispose();
      material.dispose();
    },
  };
}
