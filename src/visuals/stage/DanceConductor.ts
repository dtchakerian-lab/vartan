import type { SongFingerprint } from '../../audio/types';
import type { VisualParams } from '../VisualParams';
import type { AccentId, MoodPack, MoodPackId } from './MoodPacks';
import { liveMoodTarget, pickMoodPack, MOOD_PACKS } from './MoodPacks';

/** Clips are authored as if at this BPM. */
export const CLIP_NOMINAL_BPM = 120;

export interface ConductorState {
  pack: MoodPack;
  loop: MoodPackId;
  timeScale: number;
  accent: AccentId | null;
  punch: number;
}

/**
 * Auto-conducts dance: fingerprint sets baseline, live audio can shift pack
 * mid-song (with hysteresis) so a track isn't locked to one groove forever.
 */
export class DanceConductor {
  private basePack: MoodPack = MOOD_PACKS.groove;
  private livePackId: MoodPackId = 'groove';
  private lastAccentTime = -999;
  private accentRefractory = 0.32;
  private fingerprintKey = '';
  private packHoldUntil = 0;
  private readonly packHoldSec = 2.4;

  setFingerprint(fp: SongFingerprint): void {
    const key = [
      Math.round(fp.bpm),
      fp.energy.toFixed(2),
      fp.bassRatio.toFixed(2),
      fp.genreHint ?? '',
    ].join('|');
    if (key === this.fingerprintKey) return;
    this.fingerprintKey = key;
    this.basePack = pickMoodPack(fp);
    this.livePackId = this.basePack.id;
    this.packHoldUntil = 0;
  }

  update(p: VisualParams, fp: SongFingerprint, timeSec: number): ConductorState {
    this.setFingerprint(fp);

    const target = liveMoodTarget(
      this.basePack.id,
      p.liveEnergy,
      p.sectionPulse,
      p.bassHit,
      p.beat,
    );

    if (target !== this.livePackId && timeSec >= this.packHoldUntil) {
      this.livePackId = target;
      this.packHoldUntil = timeSec + this.packHoldSec;
    }

    const pack = MOOD_PACKS[this.livePackId];

    const bpm = Math.max(60, Math.min(190, fp.bpm || 120));
    let timeScale = bpm / CLIP_NOMINAL_BPM;
    timeScale *= 0.85 + p.liveEnergy * 0.35 + p.liveSpeed * 0.08;
    // Accents feel snappier when loud
    if (p.bassHit > 0.5) timeScale *= 1.06;
    timeScale = Math.max(0.55, Math.min(1.9, timeScale));

    let accent: AccentId | null = null;
    const canAccent = timeSec - this.lastAccentTime > this.accentRefractory;

    if (canAccent) {
      if (p.bassHit > 0.55 || (p.beat > 0.72 && p.bass > 0.45)) {
        accent = pack.bassAccent;
        this.lastAccentTime = timeSec;
      } else if (p.midHit > 0.62) {
        accent = pack.midAccent;
        this.lastAccentTime = timeSec;
      } else if (p.trebleHit > 0.72 && p.liveEnergy > 0.55) {
        accent = 'hit';
        this.lastAccentTime = timeSec;
      }
    }

    const punch = Math.min(
      1,
      p.beat * 0.55 + p.bassHit * 0.85 + p.sectionPulse * 0.4 + p.bass * 0.2,
    );

    return {
      pack,
      loop: pack.loop,
      timeScale,
      accent,
      punch,
    };
  }

  reset(): void {
    this.fingerprintKey = '';
    this.lastAccentTime = -999;
    this.packHoldUntil = 0;
    this.livePackId = 'groove';
    this.basePack = MOOD_PACKS.groove;
  }
}
