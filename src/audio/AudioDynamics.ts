/** Per-frame live dynamics: AGC-normalized bands, transients, loudness, tilt. */
export interface LiveDynamics {
  /** Bands renormalized against the last few seconds of the mix (0..1). */
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  bassHit: number;
  midHit: number;
  trebleHit: number;
  /** Rolling loudness 0..1 — verse quiet, chorus loud. */
  liveEnergy: number;
  /** -0.2..0.2 hue offset from where energy sits in the spectrum. */
  hueShift: number;
  /** Motion multiplier 0.35..2.8 derived from live energy + hits. */
  liveSpeed: number;
  /** Warmth 0..1 — bass-heavy vs bright. */
  warmth: number;
}

/**
 * Adaptive gain per band: tracks a rolling floor/ceiling so a dense mix
 * (where raw levels sit pinned high) still produces full-range motion.
 * A kick reads relative to the last few seconds, not an absolute scale.
 */
class BandAgc {
  private floor = 0;
  private ceil = 0.3;

  normalize(v: number, dt: number): number {
    // Floor climbs slowly toward sustained loudness, falls quickly on drops.
    const fRise = 1 - Math.exp(-dt * 0.3);
    const fFall = 1 - Math.exp(-dt * 2.2);
    this.floor += (v - this.floor) * (v > this.floor ? fRise : fFall);

    // Ceiling grabs peaks fast, decays slowly so headroom stays realistic.
    const cRise = 1 - Math.exp(-dt * 8);
    const cFall = 1 - Math.exp(-dt * 0.25);
    this.ceil += (v - this.ceil) * (v > this.ceil ? cRise : cFall);

    this.floor = Math.min(this.floor, v);
    this.ceil = Math.max(this.ceil, this.floor + 0.07, 0.05);

    const n = clamp01((v - this.floor) / (this.ceil - this.floor));
    // Blend in some absolute level so silence stays dark and quiet parts stay calm,
    // then a contrast curve to separate mid-levels.
    const blended = n * 0.72 + clamp01(v * 1.5) * 0.28;
    return blended * blended * (3 - 2 * blended);
  }

  reset(): void {
    this.floor = 0;
    this.ceil = 0.3;
  }
}

/**
 * Tracks transients and section-level energy so visuals can punch on hits
 * and breathe on slow swells — not just follow smoothed band levels.
 */
export class AudioDynamics {
  private agcBass = new BandAgc();
  private agcMid = new BandAgc();
  private agcTreble = new BandAgc();
  private agcVolume = new BandAgc();

  private prevBass = 0;
  private prevMid = 0;
  private prevTreble = 0;
  private sEnergy = 0;
  private sWarmth = 0.5;
  private sHue = 0;

  reset(): void {
    this.agcBass.reset();
    this.agcMid.reset();
    this.agcTreble.reset();
    this.agcVolume.reset();
    this.prevBass = 0;
    this.prevMid = 0;
    this.prevTreble = 0;
    this.sEnergy = 0;
    this.sWarmth = 0.5;
    this.sHue = 0;
  }

  update(
    rawBass: number,
    rawMid: number,
    rawTreble: number,
    rawVolume: number,
    spectrum: Uint8Array,
    dt: number,
  ): LiveDynamics {
    const bass = this.agcBass.normalize(rawBass, dt);
    const mid = this.agcMid.normalize(rawMid, dt);
    const treble = this.agcTreble.normalize(rawTreble, dt);
    const volume = this.agcVolume.normalize(rawVolume, dt);

    const bassHit = clamp01(Math.max(0, bass - this.prevBass * 0.6) * 3.6);
    const midHit = clamp01(Math.max(0, mid - this.prevMid * 0.55) * 4.0);
    const trebleHit = clamp01(Math.max(0, treble - this.prevTreble * 0.5) * 4.5);

    this.prevBass = bass;
    this.prevMid = mid;
    this.prevTreble = treble;

    const targetEnergy = clamp01(volume * 1.05 + bassHit * 0.25 + midHit * 0.15);
    const eUp = 1 - Math.exp(-dt * 22);
    const eDown = 1 - Math.exp(-dt * 4.5);
    this.sEnergy += (targetEnergy - this.sEnergy) * (targetEnergy > this.sEnergy ? eUp : eDown);

    const { centroid, warmth } = spectralTilt(spectrum);
    const hUp = 1 - Math.exp(-dt * 16);
    const hDown = 1 - Math.exp(-dt * 5);
    this.sWarmth += (warmth - this.sWarmth) * (warmth > this.sWarmth ? hUp : hDown);

    const hueTarget = (centroid - 0.5) * 0.38 + (trebleHit - bassHit) * 0.12;
    this.sHue += (hueTarget - this.sHue) * (Math.abs(hueTarget - this.sHue) > 0.02 ? hUp : hDown);

    const hitBoost = bassHit * 0.55 + midHit * 0.35 + trebleHit * 0.25;
    const liveSpeed = clampRange(0.32 + this.sEnergy * 2.1 + hitBoost * 1.4, 0.32, 2.85);

    return {
      bass,
      mid,
      treble,
      volume,
      bassHit,
      midHit,
      trebleHit,
      liveEnergy: this.sEnergy,
      hueShift: this.sHue,
      liveSpeed,
      warmth: this.sWarmth,
    };
  }
}

function spectralTilt(spectrum: Uint8Array): { centroid: number; warmth: number } {
  const n = Math.min(spectrum.length, 128);
  let sum = 0;
  let weighted = 0;
  let low = 0;
  let high = 0;
  const split = Math.floor(n * 0.35);
  for (let i = 0; i < n; i++) {
    const v = spectrum[i] / 255;
    sum += v;
    weighted += v * i;
    if (i < split) low += v;
    else high += v;
  }
  const centroid = sum > 1e-4 ? weighted / sum / Math.max(1, n - 1) : 0.5;
  const warmth = clamp01(low / (low + high + 1e-4));
  return { centroid, warmth };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clampRange(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
