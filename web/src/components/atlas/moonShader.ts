/**
 * WebGL program that lights the Atlas map's LOLA heights from the Sun's real direction.
 * Each pixel works out its own latitude and longitude on the polar map, so the Sun's elevation
 * and direction are the real ones for that spot; ground the Sun cannot reach is found by
 * stepping toward the Sun over the heights. Display only: no engine number comes from here.
 */

export const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // v_uv.y is 0 at the top, like the image rows
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_heights;
uniform vec2 u_range;        // metres that levels 0 and 65535 stand for
uniform float u_texel;       // 1 / size in pixels
uniform float u_metres;      // metres per pixel
uniform float u_radiusKm;    // the map's half-width
uniform float u_moonM;       // Moon radius in metres
uniform vec3 u_sun;          // unit vector to the Sun, Moon-fixed: x to 0 E, y to 90 E, z north

const float EXAGGERATION = 3.0;
const int STEPS = 72;
const float STEP_PX = 2.5;
const float SUN_RADIUS = 0.0047;  // sine of the Sun's half-width, so a touching disc still counts as up

float heightAt(vec2 uv) {
  vec4 t = texture2D(u_heights, uv);
  float level = floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5);
  return u_range.x + level / 65535.0 * (u_range.y - u_range.x);
}

void main() {
  vec2 c = v_uv * 2.0 - 1.0;
  if (dot(c, c) > 1.0) { gl_FragColor = vec4(0.0); return; }

  // the polar map's plane: x to 90 E, y to 0 E
  float x = c.x * u_radiusKm * 1000.0;
  float y = -c.y * u_radiusKm * 1000.0;
  float r = length(vec2(x, y));
  float lat = 2.0 * atan(r / (2.0 * u_moonM)) - 1.5707963;
  float lon = atan(x, y);
  float cl = cos(lat), sl = sin(lat), co = cos(lon), so = sin(lon);
  vec3 up = vec3(cl * co, cl * so, sl);
  vec3 east = vec3(-so, co, 0.0);
  vec3 north = vec3(-sl * co, -sl * so, cl);
  float sinEl = dot(u_sun, up);
  float e = dot(u_sun, east);
  float n = dot(u_sun, north);
  vec2 dir = e * vec2(co, -so) + n * vec2(so, co);
  float horiz = length(dir);
  dir = horiz > 0.0 ? dir / horiz : vec2(0.0, 1.0);

  float h0 = heightAt(v_uv);
  float dx = (heightAt(v_uv + vec2(u_texel, 0.0)) - heightAt(v_uv - vec2(u_texel, 0.0))) / (2.0 * u_metres);
  float dy = (heightAt(v_uv - vec2(0.0, u_texel)) - heightAt(v_uv + vec2(0.0, u_texel))) / (2.0 * u_metres);
  vec3 normal = normalize(vec3(-dx * EXAGGERATION, -dy * EXAGGERATION, 1.0));

  // a soft fixed light keeps unlit ground readable
  float base = clamp(dot(normal, normalize(vec3(-0.62, 0.62, 0.48))), 0.0, 1.0);

  bool isLit = sinEl > -SUN_RADIUS;
  if (isLit) {
    float rise = sinEl / max(horiz, 0.0001);
    vec2 stepUv = vec2(dir.x, -dir.y) * u_texel * STEP_PX;
    for (int i = 1; i <= STEPS; i++) {
      float dist = float(i) * STEP_PX * u_metres;
      vec2 p = v_uv + stepUv * float(i);
      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) break;
      if (heightAt(p) > h0 + dist * rise) { isLit = false; break; }
    }
  }

  vec3 light = vec3(dir * horiz, sinEl);
  float sun = clamp(dot(normal, normalize(light)) * 2.6, 0.0, 1.0);
  vec3 lit = vec3(1.0, 0.97, 0.9) * (0.34 + 0.66 * sun);
  vec3 dark = vec3(0.62, 0.68, 0.8) * (0.08 + 0.2 * base);
  gl_FragColor = vec4(isLit ? lit : dark, 1.0);
}`;

/** The Moon-fixed unit vector toward the Sun, from its sub-point. */
export function sunVector(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("no shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed");
  return shader;
}

export interface MoonProgram {
  draw: (sun: readonly [number, number, number]) => void;
  dispose: () => void;
}

export interface HeightsMeta {
  size_px: number;
  radius_km: number;
  moon_radius_m: number;
  min_m: number;
  max_m: number;
}

export function createMoonProgram(canvas: HTMLCanvasElement, image: HTMLImageElement, meta: HeightsMeta): MoonProgram {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false });
  if (!gl) throw new Error("WebGL is not available");
  const program = gl.createProgram();
  if (!program) throw new Error("no program");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link failed");
  gl.useProgram(program);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  // the heights are packed bytes, so the browser must not colour-correct them
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const at = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(at("u_heights"), 0);
  gl.uniform2f(at("u_range"), meta.min_m, meta.max_m);
  gl.uniform1f(at("u_texel"), 1 / meta.size_px);
  gl.uniform1f(at("u_metres"), (2 * meta.radius_km * 1000) / meta.size_px);
  gl.uniform1f(at("u_radiusKm"), meta.radius_km);
  gl.uniform1f(at("u_moonM"), meta.moon_radius_m);
  const sunAt = at("u_sun");
  gl.viewport(0, 0, canvas.width, canvas.height);

  return {
    draw: (sun) => {
      gl.uniform3f(sunAt, sun[0], sun[1], sun[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose: () => {
      gl.deleteTexture(texture);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
    },
  };
}
