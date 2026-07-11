import * as THREE from 'three';
import type { SongFingerprint } from '../audio/types';
import type { WorldId } from '../visuals/VisualParams';

/**
 * Derives everything the render layer needs from a fingerprint:
 * palette, motion speed, and the auto-matched starting world.
 */

export interface DerivedStyle {
  colorA: THREE.Color;
  colorB: THREE.Color;
  colorC: THREE.Color;
  /** Global motion multiplier 0.5..1.8 derived from BPM + energy. */
  speed: number;
}

export function deriveStyle(fp: SongFingerprint): DerivedStyle {
  const hueBase = fp.brightness < 0.45
    ? lerp(0.72, 0.62, fp.brightness / 0.45)
    : lerp(0.55, 0.08, (fp.brightness - 0.45) / 0.55);

  const sat = lerp(0.45, 0.95, fp.energy);
  const lum = lerp(0.35, 0.55, fp.brightness);

  const colorA = new THREE.Color().setHSL(hueBase, sat, lum);
  const colorB = new THREE.Color().setHSL(
    frac(hueBase + (fp.bassRatio > 0.45 ? 0.08 : 0.14)),
    sat * 0.9,
    lum * 0.8,
  );
  const colorC = new THREE.Color().setHSL(
    frac(hueBase + 0.5),
    Math.min(1, sat * 1.1),
    lerp(0.5, 0.68, fp.energy),
  );

  const bpmNorm = clamp01((fp.bpm - 60) / 130);
  const speed = 0.5 + bpmNorm * 0.9 + fp.energy * 0.4;

  return { colorA, colorB, colorC, speed };
}

/** Auto-match: Flow adapts live to almost everything. */
export function matchWorld(fp: SongFingerprint): WorldId {
  if (fp.energy < 0.28 && fp.bpm < 88 && fp.beatRegularity < 0.45) return 'aurora';
  return 'flow';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function frac(v: number): number {
  return v - Math.floor(v);
}
