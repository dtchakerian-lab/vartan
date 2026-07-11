import * as THREE from 'three';
import { VisualWorld } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import { createSharedUniforms, updateSharedUniforms } from '../VisualParams';
import { GLSL_NOISE } from '../glsl';

/**
 * Flagship world: spectrum terrain + living sky.
 * Reacts hard to transients, shifts color with the song, slows on quiet parts.
 */

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uVolume;
uniform float uBeat;
uniform float uLiveEnergy;
uniform float uBassHit;
uniform float uMidHit;
uniform float uTrebleHit;
uniform float uSectionPulse;
uniform float uLiveSpeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform sampler2D uSpectrum;
${GLSL_NOISE}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float t = uTime * (0.04 + uLiveSpeed * 0.07);

  vec2 q = vec2(fbm(p * 1.4 + vec2(t * 0.6, -t * 0.25)),
                fbm(p * 1.4 + vec2(-t * 0.35, t * 0.45) + 3.1));
  float curtain = fbm(p * vec2(2.0, 0.85) + q * (1.0 + uBass * 2.2 + uLiveEnergy * 1.4) + vec2(0.0, -t));

  float spec = texture2D(uSpectrum, vec2(vUv.x, 0.5)).r;
  float band = smoothstep(0.1, 0.8, curtain) * smoothstep(1.0, 0.05, vUv.y);

  vec3 col = mix(uColorB * 0.2, uColorA, band);
  col += uColorC * (spec * 0.45 + uTreble * 0.55 + uTrebleHit * 0.9);
  col *= 0.55 + uLiveEnergy * 0.75 + uBass * 0.45 + uBeat * 0.55;

  // Hit flashes wash the sky; section changes light the whole horizon.
  col += uColorC * uMidHit * 0.35 * smoothstep(0.7, 0.0, length(p));
  col += uColorA * uBassHit * 0.28;
  col += (uColorC * 0.6 + uColorA * 0.4) * uSectionPulse * 0.45 * smoothstep(1.2, 0.0, length(p));
  col *= 1.0 + uSectionPulse * 0.3;

  float stars = step(0.9982, hash21(floor(p * 180.0))) * (0.25 + uTreble + uTrebleHit);
  col += stars * (1.0 - band) * 0.9;

  col *= 1.0 - dot(p, p) * 0.28;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TERRAIN_VERT = /* glsl */ `
uniform sampler2D uHistory;
uniform float uHistRow;
uniform float uBass;
uniform float uBeat;
uniform float uBassHit;
uniform float uMidHit;
uniform float uLiveEnergy;
varying vec2 vUv;
varying float vHeight;
varying float vSpec;

void main() {
  vUv = uv;
  float row = fract(uv.y + uHistRow);
  float h = texture2D(uHistory, vec2(uv.x, row)).r;
  vSpec = h;
  vHeight = h;

  float centerDist = abs(uv.x - 0.5) * 2.0;
  float ripple = (uBeat + uBassHit * 0.85) * 0.65
    * sin(centerDist * 16.0 - uBeat * 6.0 - uMidHit * 4.0) * (1.0 - centerDist);

  vec3 pos = position;
  float peak = h * h * 5.5 + h * 1.2;
  pos.z = peak * (1.0 + uBass * 2.8 + uLiveEnergy * 1.1) + ripple;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const TERRAIN_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uTreble;
uniform float uTrebleHit;
uniform float uMidHit;
uniform float uBassHit;
uniform float uLiveEnergy;
varying vec2 vUv;
varying float vHeight;
varying float vSpec;

void main() {
  vec3 col = mix(uColorB * 0.15, uColorA, smoothstep(0.02, 0.75, vHeight));
  col += uColorC * smoothstep(0.45, 0.98, vHeight) * (1.0 + uTreble * 1.4 + uTrebleHit * 1.8);
  col += uColorA * uMidHit * 0.45 * vHeight;
  col += uColorC * uBassHit * 0.35;

  vec2 grid = abs(fract(vUv * vec2(52.0, 72.0)) - 0.5);
  float line = smoothstep(0.47, 0.5, max(grid.x, grid.y));
  col = mix(col, col * 1.8 + uColorC * 0.2, line * (0.35 + uLiveEnergy * 0.45));

  float fog = smoothstep(0.0, 0.8, vUv.y);
  col = mix(col, uColorB * 0.08, fog * 0.88);

  gl_FragColor = vec4(col, 1.0);
}
`;

export class FlowWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private uniforms = createSharedUniforms();
  private skyUniforms: Record<string, THREE.IUniform> = {};
  private terrainMaterial!: THREE.ShaderMaterial;
  private skyMaterial!: THREE.ShaderMaterial;
  private terrain!: THREE.Mesh;
  private aspect = 1;
  private shake = 0;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
  }

  init(ctx: WorldContext): void {
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uVolume: { value: 0 },
        uBeat: { value: 0 },
        uLiveEnergy: { value: 0 },
        uBassHit: { value: 0 },
        uMidHit: { value: 0 },
        uTrebleHit: { value: 0 },
        uSectionPulse: { value: 0 },
        uLiveSpeed: { value: 1 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uColorC: { value: new THREE.Color() },
        uSpectrum: { value: ctx.spectrumTex },
      },
      depthWrite: false,
      depthTest: false,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyMaterial);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.scene.add(sky);

    this.terrainMaterial = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        ...this.uniforms,
        uHistory: { value: ctx.historyTex },
        uHistRow: { value: 0 },
      },
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(16, 24, 110, 72);
    this.terrain = new THREE.Mesh(geo, this.terrainMaterial);
    this.terrain.rotation.x = -Math.PI / 2.35;
    this.terrain.position.set(0, -1.2, -5.5);
    this.scene.add(this.terrain);

    this.skyUniforms = this.skyMaterial.uniforms;
    this.resize(ctx.width, ctx.height);
  }

  update(p: VisualParams, ctx: WorldContext): void {
    updateSharedUniforms(this.uniforms, p, this.aspect, ctx.spectrumTex);
    for (const key of Object.keys(this.uniforms)) {
      this.terrainMaterial.uniforms[key].value = this.uniforms[key].value;
    }
    this.terrainMaterial.uniforms.uHistRow.value = ctx.getHistoryRow();

    this.skyUniforms.uTime.value = p.time;
    this.skyUniforms.uAspect.value = this.aspect;
    this.skyUniforms.uBass.value = p.bass;
    this.skyUniforms.uMid.value = p.mid;
    this.skyUniforms.uTreble.value = p.treble;
    this.skyUniforms.uVolume.value = p.volume;
    this.skyUniforms.uBeat.value = p.beat;
    this.skyUniforms.uLiveEnergy.value = p.liveEnergy;
    this.skyUniforms.uBassHit.value = p.bassHit;
    this.skyUniforms.uMidHit.value = p.midHit;
    this.skyUniforms.uTrebleHit.value = p.trebleHit;
    this.skyUniforms.uSectionPulse.value = p.sectionPulse;
    this.skyUniforms.uLiveSpeed.value = p.liveSpeed;
    (this.skyUniforms.uColorA.value as THREE.Color).copy(p.colorA);
    (this.skyUniforms.uColorB.value as THREE.Color).copy(p.colorB);
    (this.skyUniforms.uColorC.value as THREE.Color).copy(p.colorC);
    this.skyUniforms.uSpectrum.value = ctx.spectrumTex;

    const hit = p.bassHit * 0.7 + p.midHit * 0.45 + p.beat * 0.5 + p.sectionPulse * 0.4;
    this.shake += (hit - this.shake) * Math.min(1, p.dt * 18);
    const t = p.time * 0.04 * p.liveSpeed;
    const dist = 7.2 - p.bass * 1.4 - p.liveEnergy * 0.6 - p.sectionPulse * 0.9 + this.shake * 0.35;
    this.camera.position.set(
      Math.sin(t) * 0.35 + this.shake * 0.08 * Math.sin(p.time * 40),
      1.0 + p.mid * 0.35 + this.shake * 0.06,
      dist,
    );
    this.camera.lookAt(0, -0.4 + p.mid * 0.2, -8);
    this.terrain.position.z = -5.5 - p.bass * 0.4 - this.shake * 0.25;
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.terrain.geometry.dispose();
    this.terrainMaterial.dispose();
    this.skyMaterial.dispose();
  }
}
