import * as THREE from 'three';

export type WorldId =
  | 'aurora'
  | 'particles'
  | 'kaleidoscope'
  | 'waves'
  | 'tunnel'
  | 'album';

export const WORLD_IDS: WorldId[] = [
  'aurora',
  'particles',
  'kaleidoscope',
  'waves',
  'tunnel',
  'album',
];

export const WORLD_LABELS: Record<WorldId, string> = {
  aurora: 'Aurora',
  particles: 'Galaxy',
  kaleidoscope: 'Prism',
  waves: 'Terrain',
  tunnel: 'Neon',
  album: 'Pulse',
};

/** Everything a world receives every frame. */
export interface VisualParams {
  time: number;
  dt: number;
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  beat: number;
  /** Fingerprint-derived, stable per track. */
  energy: number;
  brightness: number;
  speed: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  colorC: THREE.Color;
}

/** Uniforms every shader world shares. Worlds may add their own. */
export function createSharedUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uTreble: { value: 0 },
    uVolume: { value: 0 },
    uBeat: { value: 0 },
    uEnergy: { value: 0.6 },
    uSpeed: { value: 1 },
    uAspect: { value: 1 },
    uColorA: { value: new THREE.Color(0x6633ff) },
    uColorB: { value: new THREE.Color(0x220a66) },
    uColorC: { value: new THREE.Color(0x22ddcc) },
    uSpectrum: { value: null as THREE.DataTexture | null },
  };
}

export function updateSharedUniforms(
  u: Record<string, THREE.IUniform>,
  p: VisualParams,
  aspect: number,
  spectrumTex: THREE.DataTexture,
): void {
  u.uTime.value = p.time;
  u.uBass.value = p.bass;
  u.uMid.value = p.mid;
  u.uTreble.value = p.treble;
  u.uVolume.value = p.volume;
  u.uBeat.value = p.beat;
  u.uEnergy.value = p.energy;
  u.uSpeed.value = p.speed;
  u.uAspect.value = aspect;
  (u.uColorA.value as THREE.Color).copy(p.colorA);
  (u.uColorB.value as THREE.Color).copy(p.colorB);
  (u.uColorC.value as THREE.Color).copy(p.colorC);
  u.uSpectrum.value = spectrumTex;
}
