import * as THREE from 'three';
import { VisualWorld, fullscreenQuad, FULLSCREEN_VERT } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import { createSharedUniforms, updateSharedUniforms } from '../VisualParams';
import { GLSL_NOISE, GLSL_COMMON_UNIFORMS } from '../glsl';

/**
 * Album Pulse: cover art (or generated poster) breathing with the music.
 * Warp, chromatic split on beats, zoom pulse, glow border, dark blurred backdrop.
 */

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${GLSL_COMMON_UNIFORMS}
${GLSL_NOISE}
uniform sampler2D uArt;
uniform float uImgAspect;

vec2 coverUv(vec2 uv, float screenAspect, float imgAspect, float zoom) {
  // object-fit: contain for the centered art plane (square-ish region).
  vec2 p = (uv - 0.5);
  p *= vec2(screenAspect, 1.0);
  p /= zoom;
  // Art occupies a square of half-height 0.36.
  vec2 auv = p / 0.72 + 0.5;
  return auv;
}

void main() {
  vec2 uv = vUv;
  float zoom = 1.0 + uBass * 0.07 + uBeat * 0.05;

  vec2 auv = coverUv(uv, uAspect, uImgAspect, zoom);

  // Music-driven warp inside the art.
  vec2 warp = vec2(
    fbm(auv * 3.0 + uTime * 0.15),
    fbm(auv * 3.0 - uTime * 0.12 + 7.3)
  ) - 0.5;
  auv += warp * (0.012 + uMid * 0.03);

  bool inside = auv.x > 0.0 && auv.x < 1.0 && auv.y > 0.0 && auv.y < 1.0;

  // Backdrop: heavily offset samples of the art = cheap blur wash.
  vec2 buv = (uv - 0.5) * 0.5 + 0.5;
  vec3 back = texture2D(uArt, buv + warp * 0.3).rgb * 0.22;
  back = mix(back, uColorB * 0.2, 0.5);
  back *= 0.8 + uBass * 0.4;

  vec3 col = back;

  if (inside) {
    // Chromatic split kicks on beats.
    float split = uBeat * 0.012 + uTreble * 0.004;
    float rr = texture2D(uArt, auv + vec2(split, 0.0)).r;
    float gg = texture2D(uArt, auv).g;
    float bb = texture2D(uArt, auv - vec2(split, 0.0)).b;
    col = vec3(rr, gg, bb) * (0.92 + uVolume * 0.35 + uBeat * 0.18);
  } else {
    // Glow border hugging the art.
    vec2 edge = abs(auv - 0.5) - 0.5;
    float d = max(edge.x, edge.y);
    float glow = smoothstep(0.09, 0.0, d) * (0.35 + uBass * 0.8 + uBeat * 0.5);
    col += uColorC * glow;
  }

  // Vignette.
  vec2 vp = (uv - 0.5) * vec2(uAspect, 1.0);
  col *= 1.0 - dot(vp, vp) * 0.4;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class AlbumWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.Camera();
  private uniforms = createSharedUniforms();
  private material!: THREE.ShaderMaterial;
  private mesh!: THREE.Mesh;
  private aspect = 1;
  private texture: THREE.Texture | null = null;

  init(ctx: WorldContext): void {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.uniforms,
        uArt: { value: null },
        uImgAspect: { value: 1 },
      },
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = fullscreenQuad(this.material);
    this.scene.add(this.mesh);
    this.aspect = ctx.width / ctx.height;
  }

  /** Swap in new artwork (from ID3, iTunes, manual drop, or generated poster). */
  setArt(texture: THREE.Texture, imgAspect: number): void {
    this.texture?.dispose();
    this.texture = texture;
    texture.colorSpace = THREE.SRGBColorSpace;
    if (this.material) {
      this.material.uniforms.uArt.value = texture;
      this.material.uniforms.uImgAspect.value = imgAspect;
    }
  }

  get hasArt(): boolean {
    return this.texture !== null;
  }

  update(p: VisualParams, ctx: WorldContext): void {
    updateSharedUniforms(this.uniforms, p, this.aspect, ctx.spectrumTex);
    for (const key of Object.keys(this.uniforms)) {
      this.material.uniforms[key].value = this.uniforms[key].value;
    }
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
    this.texture = null;
  }
}
