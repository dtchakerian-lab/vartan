import * as THREE from 'three';
import { VisualWorld } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import { createSharedUniforms, updateSharedUniforms } from '../VisualParams';

/**
 * Frequency terrain: a plane whose rows are past spectrum frames
 * (scrolling history texture), flying toward the camera.
 */

const VERT = /* glsl */ `
uniform sampler2D uHistory;
uniform float uHistRow;
uniform float uBass;
uniform float uBeat;
uniform float uBassHit;
uniform float uMidHit;
uniform float uLiveEnergy;
varying vec2 vUv;
varying float vHeight;

void main() {
  vUv = uv;
  // Newest row at the far edge; scroll via row offset.
  float row = fract(uv.y + uHistRow);
  float h = texture2D(uHistory, vec2(uv.x, row)).r;

  // Emphasize peaks, add beat ripple radiating from center.
  float centerDist = abs(uv.x - 0.5) * 2.0;
  float ripple = (uBeat + uBassHit * 0.9) * 0.55
    * sin(centerDist * 16.0 - uBeat * 6.0 - uMidHit * 5.0) * (1.0 - centerDist);

  vHeight = h;
  vec3 pos = position;
  pos.z = (h * h * 3.6 + h * 0.65) * (1.0 + uBass * 1.6 + uLiveEnergy * 0.8) + ripple;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTreble;
varying vec2 vUv;
varying float vHeight;

void main() {
  // Valleys dark, peaks hot; accent line on the ridge tops.
  vec3 col = mix(uColorB * 0.25, uColorA, smoothstep(0.05, 0.7, vHeight));
  col += uColorC * smoothstep(0.55, 0.95, vHeight) * (0.8 + uTreble);

  // Grid lines for that synthwave read.
  vec2 grid = abs(fract(vUv * vec2(48.0, 64.0)) - 0.5);
  float line = smoothstep(0.46, 0.5, max(grid.x, grid.y));
  col = mix(col, col * 1.6 + uColorC * 0.12, line * 0.5);

  // Distance fog toward the horizon.
  float fog = smoothstep(0.0, 0.75, vUv.y);
  col = mix(col, uColorB * 0.12, fog * 0.85);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class WaveWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private uniforms = createSharedUniforms();
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private aspect = 1;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
  }

  init(ctx: WorldContext): void {
    const geo = new THREE.PlaneGeometry(14, 22, 95, 63);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.uniforms,
        uHistory: { value: ctx.historyTex },
        uHistRow: { value: 0 },
      },
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.rotation.x = -Math.PI / 2.35;
    this.mesh.position.set(0, -1.1, -6);
    this.scene.add(this.mesh);
    this.resize(ctx.width, ctx.height);
  }

  update(p: VisualParams, ctx: WorldContext): void {
    updateSharedUniforms(this.uniforms, p, this.aspect, ctx.spectrumTex);
    for (const key of Object.keys(this.uniforms)) {
      this.material.uniforms[key].value = this.uniforms[key].value;
    }
    this.material.uniforms.uHistRow.value = ctx.getHistoryRow();
    this.material.uniforms.uHistory.value = ctx.historyTex;

    // Camera: low over the terrain, bass bob, gentle sway.
    this.camera.position.set(
      Math.sin(p.time * 0.2) * 0.6,
      1.35 + p.bass * 0.35 + p.beat * 0.15,
      3.2,
    );
    this.camera.lookAt(0, 0.4, -6);
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
