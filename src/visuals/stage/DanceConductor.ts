import type { SongFingerprint } from '../../audio/types';
import type { VisualParams } from '../VisualParams';
import type { AccentId, MoodPack, MoodPackId } from './MoodPacks';
import { pickMoodPack } from './MoodPacks';

/** Clips are authored as if at this BPM. */
export const CLIP_NOMINAL_BPM = 120;

export interface ConductorState {
  pack: MoodPack;
  loop: MoodPackId;
  /** Multiplier for AnimationMixer.timeScale */
  timeScale: number;
  /** One-shot to fire this frame, if any. */
  accent: AccentId | null;
  /** 0..1 punch for lights / camera. */
  punch: number;
}

/**
 * Maps fingerprint + live VisualParams → which clip to play and how hard.
 * Same genre pack can still feel different via BPM, hits, and energy.
 */
export class DanceConductor {
  private pack: MoodPack = pickMoodPack({
    bpm: 120,
    energy: 0.6,
    bassRatio: 0.4,
    brightness: 0.5,
    beatRegularity: 0.5,
  });
  private lastAccentTime = -999;
  private accentRefractory = 0.28;
  private fingerprintKey = '';

  setFingerprint(fp: SongFingerprint): void {
    const key = [
      Math.round(fp.bpm),
      fp.energy.toFixed(2),
      fp.bassRatio.toFixed(2),
      fp.genreHint ?? '',
    ].join('|');
    if (key === this.fingerprintKey) return;
    this.fingerprintKey = key;
    this.pack = pickMoodPack(fp);
  }

  update(p: VisualParams, fp: SongFingerprint, timeSec: number): ConductorState {
    this.setFingerprint(fp);

    const bpm = Math.max(60, Math.min(190, fp.bpm || 120));
    let timeScale = bpm / CLIP_NOMINAL_BPM;
    // Live energy nudges speed without leaving the pocket.
    timeScale *= 0.88 + p.liveEnergy * 0.28 + p.liveSpeed * 0.06;
    timeScale = Math.max(0.55, Math.min(1.85, timeScale));

    let accent: AccentId | null = null;
    const canAccent = timeSec - this.lastAccentTime > this.accentRefractory;

    if (canAccent) {
      if (p.bassHit > 0.55 || (p.beat > 0.72 && p.bass > 0.45)) {
        accent = this.pack.bassAccent;
        this.lastAccentTime = timeSec;
      } else if (p.midHit > 0.62) {
        accent = this.pack.midAccent;
        this.lastAccentTime = timeSec;
      } else if (p.trebleHit > 0.72 && p.liveEnergy > 0.55) {
        accent = 'hit';
        this.lastAccentTime = timeSec;
      }
    }

    const punch = Math.min(
      1,
      p.beat * 0.55 + p.bassHit * 0.85 + p.sectionPulse * 0.35 + p.bass * 0.2,
    );

    return {
      pack: this.pack,
      loop: this.pack.loop,
      timeScale,
      accent,
      punch,
    };
  }

  reset(): void {
    this.fingerprintKey = '';
    this.lastAccentTime = -999;
  }
}
