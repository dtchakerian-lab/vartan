/** Shared GLSL chunks: hash, value noise, fbm, palette helpers. */
export const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }
  return v;
}
`;

export const GLSL_COMMON_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uEnergy;
uniform float uSpeed;
uniform float uAspect;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform sampler2D uSpectrum;
`;
