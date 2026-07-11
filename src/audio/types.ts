/** Per-frame metrics computed from the live analyser. All values 0..1. */
export interface AudioFrameMetrics {
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  /** Beat envelope: spikes to ~1 on a detected beat, decays fast. */
  beat: number;
  /** Raw byte frequency data (analyser.frequencyBinCount long). */
  spectrum: Uint8Array;
}

/** Computed once per loaded track (files only; mic/demo use defaults). */
export interface SongFingerprint {
  bpm: number;
  energy: number;
  bassRatio: number;
  brightness: number;
  beatRegularity: number;
  genreHint?: string;
}

export const DEFAULT_FINGERPRINT: SongFingerprint = {
  bpm: 120,
  energy: 0.6,
  bassRatio: 0.4,
  brightness: 0.5,
  beatRegularity: 0.5,
};

export type AudioSourceMode = 'file' | 'mic' | 'demo';
