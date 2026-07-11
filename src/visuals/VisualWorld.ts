import * as THREE from 'three';
import type { VisualParams } from './VisualParams';

export interface WorldContext {
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  spectrumTex: THREE.DataTexture;
  historyTex: THREE.DataTexture;
  /** Row (0..1) most recently written into historyTex. */
  getHistoryRow: () => number;
}

/** Base class: each world owns its scene + camera. */
export abstract class VisualWorld {
  abstract readonly scene: THREE.Scene;
  abstract readonly camera: THREE.Camera;

  abstract init(ctx: WorldContext): void;
  abstract update(p: VisualParams, ctx: WorldContext): void;
  abstract dispose(): void;

  resize(_width: number, _height: number): void {
    /* optional per-world */
  }
}

/** Fullscreen-triangle helper shared by pure shader worlds. */
export function fullscreenQuad(material: THREE.ShaderMaterial): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
