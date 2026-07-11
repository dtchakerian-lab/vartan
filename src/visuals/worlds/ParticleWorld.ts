import * as THREE from 'three';
import { VisualWorld } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import { createSharedUniforms, updateSharedUniforms } from '../VisualParams';

const COUNT = 6000;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uBass;
uniform float uTreble;
uniform float uBeat;
uniform float uSpeed;
uniform float uImpulse;
uniform float uPixelRatio;
attribute float aSeed;
attribute float aRadius;
varying float vSeed;
varying float vDepth;

void main() {
  vSeed = aSeed;

  float t = uTime * uSpeed * 0.15;

  // Orbit: each particle circles at its own radius/speed with vertical drift.
  float angle = aSeed * 6.28318 + t * (0.4 + aSeed * 0.8);
  float wobble = sin(t * 2.0 + aSeed * 40.0) * 0.15;

  // Beat impulse pushes the whole galaxy outward, then it relaxes.
  float radius = aRadius * (1.0 + uImpulse * 0.35 * aSeed) + wobble;

  vec3 pos = vec3(
    cos(angle) * radius,
    sin(aSeed * 90.0 + t * 1.4) * (0.4 + aRadius * 0.25),
    sin(angle) * radius
  );

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepth = clamp(-mv.z / 9.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = (1.4 + aSeed * 2.4) * (1.0 + uTreble * 2.4 + uBeat * 1.2 + uTrebleHit * 1.8);
  gl_PointSize = size * uPixelRatio * (4.5 / max(0.5, -mv.z));
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform float uBass;
uniform float uLiveEnergy;
varying float vSeed;
varying float vDepth;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float dist = length(d);
  if (dist > 0.5) discard;
  float glow = smoothstep(0.5, 0.05, dist);

  vec3 col = mix(uColorA, uColorC, vSeed);
  col = mix(col, uColorB, vDepth * 0.6);
  col *= 0.55 + uBass * 1.2 + uLiveEnergy * 0.45;

  gl_FragColor = vec4(col * glow, glow);
}
`;

export class ParticleWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private uniforms = createSharedUniforms();
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points;
  private impulse = 0;
  private aspect = 1;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
    this.camera.position.set(0, 1.2, 5.5);
    this.camera.lookAt(0, 0, 0);
  }

  init(ctx: WorldContext): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3); // required attr, animated in shader
    const seeds = new Float32Array(COUNT);
    const radii = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      seeds[i] = Math.random();
      // Disc distribution with dense core.
      radii[i] = Math.pow(Math.random(), 0.6) * 3.4 + 0.25;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.uniforms,
        uImpulse: { value: 0 },
        uPixelRatio: { value: ctx.renderer.getPixelRatio() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.resize(ctx.width, ctx.height);
  }

  update(p: VisualParams, ctx: WorldContext): void {
    updateSharedUniforms(this.uniforms, p, this.aspect, ctx.spectrumTex);
    for (const key of Object.keys(this.uniforms)) {
      this.material.uniforms[key].value = this.uniforms[key].value;
    }

    // Beat + transient impulse with spring-back.
    const hit = p.beat + p.bassHit * 0.85 + p.midHit * 0.55;
    this.impulse += (hit - this.impulse) * Math.min(1, p.dt * 16);
    this.material.uniforms.uImpulse.value = this.impulse;

    const t = p.time * 0.05 * p.liveSpeed;
    const dist = 5.5 - p.bass * 1.6 - p.liveEnergy * 0.8 - this.impulse * 0.4;
    this.camera.position.set(Math.sin(t) * dist, 1.2 + Math.sin(p.time * 0.3) * 0.3, Math.cos(t) * dist);
    this.camera.lookAt(0, 0, 0);
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
