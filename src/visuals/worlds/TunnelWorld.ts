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

  // Camera sway.
  p += vec2(sin(uTime * 0.5), cos(uTime * 0.37)) * 0.04 * uEnergy;

  float r = length(p) + 1e-4;
  float a = atan(p.y, p.x);

  // Fly forward: depth coordinate from inverse radius.
  float fly = uTime * uSpeed * 1.6;
  float z = 0.35 / r + fly;

  // Neon rings: pulse thickness with bass, snap with beat.
  float ringFreq = 2.0;
  float ring = fract(z * ringFreq);
  float thickness = 0.06 + uBass * 0.1 + uBeat * 0.08;
  float glow = smoothstep(thickness, 0.0, abs(ring - 0.5) * (1.0 / ringFreq) * 2.0);

  // Angular struts sampled from the spectrum: music paints the walls.
  float specA = texture2D(uSpectrum, vec2(fract(a / (2.0 * PI) + 0.5), 0.5)).r;
  float struts = smoothstep(0.55, 1.0, sin(a * 12.0 + fly * 2.0) * 0.5 + 0.5) * specA;

  float n = fbm(vec2(a * 2.0, z * 0.8));

  vec3 col = uColorB * 0.15;
  col += uColorA * glow * (0.8 + specA);
  col += uColorC * struts * 0.9;
  col += uColorA * n * 0.15;

  // Depth fade: far end goes dark, near edge glows.
  float depth = smoothstep(0.0, 0.5, r);
  col *= mix(0.25, 1.15, depth);

  // Beat flash down the tunnel core.
  col += uColorC * pow(1.0 - r, 5.0) * uBeat * 1.4;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class TunnelWorld extends VisualWorld {
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
