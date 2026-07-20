import type { SongFingerprint } from '../../audio/types';

export type MoodPackId = 'sway' | 'groove' | 'bounce' | 'stomp';

export type AccentId = 'hit' | 'jump' | 'headbang';

export interface MoodPack {
  id: MoodPackId;
  loop: MoodPackId;
  /** Preferred accent on bass hits. */
  bassAccent: AccentId;
  /** Preferred accent on mid/snare-ish hits. */
  midAccent: AccentId;
}

export const MOOD_PACKS: Record<MoodPackId, MoodPack> = {
  sway: { id: 'sway', loop: 'sway', bassAccent: 'hit', midAccent: 'hit' },
  groove: { id: 'groove', loop: 'groove', bassAccent: 'hit', midAccent: 'jump' },
  bounce: { id: 'bounce', loop: 'bounce', bassAccent: 'jump', midAccent: 'hit' },
  stomp: { id: 'stomp', loop: 'stomp', bassAccent: 'headbang', midAccent: 'hit' },
};

/**
 * Pick a dance vocabulary from fingerprint (once per track).
 * Genre keywords nudge; energy / BPM / bass decide the rest.
 */
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
