import * as THREE from 'three';
import { VisualWorld, fullscreenQuad, FULLSCREEN_VERT } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import { createSharedUniforms, updateSharedUniforms } from '../VisualParams';
import { GLSL_NOISE, GLSL_COMMON_UNIFORMS } from '../glsl';

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${GLSL_COMMON_UNIFORMS}
${GLSL_NOISE}

#define PI 3.14159265359

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  // Beat zoom breathes the whole mandala.
  float zoom = 1.0 + uBeat * 0.18 + uBass * 0.1;
  p /= zoom;

  float r = length(p);
  float a = atan(p.y, p.x);

  // Radial fold: segment count shifts subtly with mids.
  float segs = 8.0 + floor(uMid * 4.0) * 2.0;
  float fold = PI / segs;
  a = mod(a, 2.0 * fold);
  a = abs(a - fold);

  vec2 kp = vec2(cos(a), sin(a)) * r;

  float t = uTime * uSpeed * 0.22;
  float n = fbm(kp * (3.0 + uEnergy * 2.0) + vec2(t, -t * 0.7));

  // Spectrum ring: frequency content mapped along the radius.
  float spec = texture2D(uSpectrum, vec2(fract(r * 1.4 - t * 0.3), 0.5)).r;

  float rings = sin(r * (18.0 + uBass * 14.0) - uTime * uSpeed * 2.4 + n * 5.0);
  rings = smoothstep(0.1, 0.9, rings * 0.5 + 0.5);

  vec3 col = mix(uColorB, uColorA, rings);
  col = mix(col, uColorC, spec * spec * 1.2);
  col += uColorC * pow(1.0 - r, 3.0) * (uBass * 0.9 + uBeat * 0.6);
  col *= 0.75 + n * 0.5;

  // Center glow + edge fade.
  col *= smoothstep(1.15, 0.35, r);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class KaleidoscopeWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private uniforms = createSharedUniforms();
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private aspect = 1;

  init(ctx: WorldContext): void {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = fullscreenQuad(this.material);
    this.scene.add(this.mesh);
    this.aspect = ctx.width / ctx.height;
  }

  update(p: VisualParams, ctx: WorldContext): void {
    updateSharedUniforms(this.uniforms, p, this.aspect, ctx.spectrumTex);
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
