import type { SongFingerprint } from '../../audio/types';

export type MoodPackId = 'sway' | 'groove' | 'bounce' | 'stomp';

export type AccentId = 'hit' | 'jump' | 'headbang';

export interface MoodPack {
  id: MoodPackId;
  loop: MoodPackId;
  bassAccent: AccentId;
  midAccent: AccentId;
}

/** Maps mood ids → Mixamo GLB filenames in public/stage/ */
export const CLIP_FILES: Record<MoodPackId | AccentId, string> = {
  sway: 'animation-rumba.glb',
  groove: 'animation-hiphop.glb',
  bounce: 'animation-samba.glb',
  stomp: 'animation-snake-hiphop.glb',
  hit: 'animation-tut-hiphop.glb',
  jump: 'animation-silly-dancing.glb',
  headbang: 'animation-breakdance-uprock.glb',
};

export const CHARACTER_FILE = 'character-the-boss.glb';

export const MOOD_PACKS: Record<MoodPackId, MoodPack> = {
  sway: { id: 'sway', loop: 'sway', bassAccent: 'hit', midAccent: 'hit' },
  groove: { id: 'groove', loop: 'groove', bassAccent: 'hit', midAccent: 'jump' },
  bounce: { id: 'bounce', loop: 'bounce', bassAccent: 'jump', midAccent: 'hit' },
  stomp: { id: 'stomp', loop: 'stomp', bassAccent: 'headbang', midAccent: 'hit' },
};

const ORDER: MoodPackId[] = ['sway', 'groove', 'bounce', 'stomp'];

/** Baseline pack from offline fingerprint (no user clicks). */
export function pickMoodPack(fp: SongFingerprint): MoodPack {
  const hint = (fp.genreHint ?? '').toLowerCase();
  const bpm = fp.bpm;
  const energy = fp.energy;
  const bass = fp.bassRatio;

  if (
    /\b(ambient|classical|piano|acoustic|folk|jazz|soul|r&b|rnb|ballad)\b/.test(hint) ||
    (energy < 0.38 && bpm < 100)
  ) {
    return MOOD_PACKS.sway;
  }

  if (
    /\b(metal|rock|punk|hardcore|industrial|grunge)\b/.test(hint) ||
    (bass > 0.55 && energy > 0.55)
  ) {
    return MOOD_PACKS.stomp;
  }

  if (
    /\b(edm|electro|techno|house|trance|dubstep|dance|drum\s*&?\s*bass|dnb)\b/.test(
      hint,
    ) ||
    (bpm >= 128 && energy > 0.5)
  ) {
    return MOOD_PACKS.bounce;
  }

  if (bpm >= 118 && energy >= 0.45) return MOOD_PACKS.bounce;
  if (bass > 0.5 && energy >= 0.42) return MOOD_PACKS.stomp;
  if (energy < 0.42) return MOOD_PACKS.sway;
  return MOOD_PACKS.groove;
}

/**
 * Live pack from energy / section / hits — can escalate or chill mid-song.
 * Target is relative to the track's baseline so a calm song doesn't jump to stomp
 * from a tiny spike.
 */
export function liveMoodTarget(
  base: MoodPackId,
  liveEnergy: number,
  sectionPulse: number,
  bassHit: number,
  beat: number,
): MoodPackId {
  const baseIdx = ORDER.indexOf(base);
  let idx = baseIdx;

  if (liveEnergy < 0.22) idx = Math.min(idx, 0);
  else if (liveEnergy < 0.38) idx = Math.min(idx, 1);
  else if (liveEnergy > 0.82 || sectionPulse > 0.55) idx = Math.min(3, baseIdx + 1);
  else if (liveEnergy > 0.65) idx = Math.max(idx, Math.min(3, baseIdx + 1));

  // Hard hits can briefly escalate one step above baseline
  if ((bassHit > 0.7 || beat > 0.85) && liveEnergy > 0.45) {
    idx = Math.min(3, Math.max(idx, baseIdx + 1));
  }

  // Very quiet → always allow full chill regardless of metal baseline
  if (liveEnergy < 0.18) idx = 0;

  return ORDER[idx];
}
