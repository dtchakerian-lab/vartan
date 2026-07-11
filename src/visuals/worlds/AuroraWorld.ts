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

void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  float t = uTime * (0.06 + uSpeed * 0.05);

  // Vertical aurora curtains: domain-warped fbm.
  vec2 q = vec2(fbm(p * 1.6 + vec2(t * 0.7, -t * 0.3)),
                fbm(p * 1.6 + vec2(-t * 0.4, t * 0.5) + 4.7));
  float curtain = fbm(p * vec2(2.2, 0.9) + q * (1.2 + uBass * 1.4) + vec2(0.0, -t));

  // Height falloff so it hangs from the top like an aurora.
  float band = smoothstep(0.15, 0.75, curtain) * smoothstep(0.95, 0.1, uv.y * 0.9 - curtain * 0.35);

  // Spectrum shimmer along x.
  float spec = texture2D(uSpectrum, vec2(uv.x, 0.5)).r;
  band += spec * 0.22 * smoothstep(0.6, 0.0, abs(uv.y - 0.35));

  vec3 col = mix(uColorB * 0.35, uColorA, band);
  col += uColorC * band * band * (0.35 + uTreble * 0.9);

  // Bass bloom: whole sky breathes.
  col *= 0.85 + uBass * 0.55 + uBeat * 0.3;

  // Star field in the dark regions.
  float stars = step(0.9985, hash21(floor(p * 220.0))) * (0.4 + uTreble);
  col += stars * (1.0 - band) * 0.8;

  // Soft vignette.
  col *= 1.0 - dot(p, p) * 0.35;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class AuroraWorld extends VisualWorld {
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
