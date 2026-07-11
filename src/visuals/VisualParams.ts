import * as THREE from 'three';

export type WorldId =
  | 'flow'
  | 'aurora'
  | 'particles'
  | 'kaleidoscope'
  | 'waves'
  | 'tunnel';

export const WORLD_IDS: WorldId[] = [
  'flow',
  'aurora',
  'particles',
  'kaleidoscope',
  'waves',
  'tunnel',
];

export const WORLD_LABELS: Record<WorldId, string> = {
  flow: 'Flow',
  aurora: 'Aurora',
  particles: 'Galaxy',
  kaleidoscope: 'Prism',
  waves: 'Terrain',
  tunnel: 'Neon',
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
  /** Sharp low-band attack (kick). */
  bassHit: number;
  /** Snare / guitar pick / vocal consonants. */
  midHit: number;
  /** Cymbal / hi-hat sparkle. */
  trebleHit: number;
  /** Rolling loudness — quiet vs loud sections. */
  liveEnergy: number;
  /** Live motion multiplier (energy + hits). */
  liveSpeed: number;
  /** Fingerprint-derived baseline per track. */
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
    uBassHit: { value: 0 },
    uMidHit: { value: 0 },
    uTrebleHit: { value: 0 },
    uLiveEnergy: { value: 0 },
    uLiveSpeed: { value: 1 },
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
  u.uBassHit.value = p.bassHit;
  u.uMidHit.value = p.midHit;
  u.uTrebleHit.value = p.trebleHit;
  u.uLiveEnergy.value = p.liveEnergy;
  u.uLiveSpeed.value = p.liveSpeed;
  u.uEnergy.value = p.energy;
  u.uSpeed.value = p.speed * p.liveSpeed;
  u.uAspect.value = aspect;
  (u.uColorA.value as THREE.Color).copy(p.colorA);
  (u.uColorB.value as THREE.Color).copy(p.colorB);
  (u.uColorC.value as THREE.Color).copy(p.colorC);
  u.uSpectrum.value = spectrumTex;
}

/** Shift palette live from spectral tilt + section energy. */
export function deriveLiveColors(
  base: { colorA: THREE.Color; colorB: THREE.Color; colorC: THREE.Color },
  live: { hueShift: number; liveEnergy: number; warmth: number; bassHit: number; trebleHit: number },
): { colorA: THREE.Color; colorB: THREE.Color; colorC: THREE.Color } {
  const colorA = base.colorA.clone();
  const colorB = base.colorB.clone();
  const colorC = base.colorC.clone();

  const hue = live.hueShift + (live.warmth - 0.5) * 0.06;
  const satBoost = live.liveEnergy * 0.12 + live.bassHit * 0.08 + live.trebleHit * 0.06;
  const lumBoost = live.liveEnergy * 0.14 + live.bassHit * 0.06;

  colorA.offsetHSL(hue, satBoost, lumBoost * 0.5);
  colorB.offsetHSL(hue * 0.7, satBoost * 0.6, lumBoost * 0.25);
  colorC.offsetHSL(hue * 1.2 + live.trebleHit * 0.04, satBoost * 1.1, lumBoost * 0.7);

  return { colorA, colorB, colorC };
}
