import type { SongFingerprint } from '../audio/types';
import { DEFAULT_FINGERPRINT } from '../audio/types';

/**
 * Offline track analysis with zero dependencies: OfflineAudioContext renders
 * band-filtered versions of the track, then plain-array DSP extracts
 * energy, bass/brightness ratios, and BPM via onset autocorrelation.
 *
 * Analyzes up to ~70s from just past the intro to keep it fast.
 */
export async function analyzeBuffer(buffer: AudioBuffer): Promise<SongFingerprint> {
  const work = analyze(buffer);
  const timeout = new Promise<SongFingerprint>((resolve) =>
    setTimeout(() => resolve({ ...DEFAULT_FINGERPRINT }), 10_000),
  );
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return { ...DEFAULT_FINGERPRINT };
  }
}

async function analyze(buffer: AudioBuffer): Promise<SongFingerprint> {
  const sampleRate = 22050;
  const skip = Math.min(10, buffer.duration * 0.1);
  const dur = Math.min(70, buffer.duration - skip);
  if (dur < 3) return { ...DEFAULT_FINGERPRINT };

  const [full, low, high] = await Promise.all([
    renderFiltered(buffer, sampleRate, skip, dur, null),
    renderFiltered(buffer, sampleRate, skip, dur, { type: 'lowpass', frequency: 160 }),
    renderFiltered(buffer, sampleRate, skip, dur, { type: 'highpass', frequency: 2000 }),
  ]);

  const fullRms = rms(full);
  const lowRms = rms(low);
  const highRms = rms(high);

  // Map typical program RMS (0..~0.25) to 0..1 with a soft curve.
  const energy = clamp01(Math.sqrt(fullRms / 0.22));
  const bassRatio = clamp01(lowRms / (lowRms + highRms + 1e-6));
  const brightness = clamp01(highRms / (lowRms + highRms + 1e-6) * 1.4);

  const { bpm, regularity } = detectBpm(low, sampleRate);

  return {
    bpm,
    energy,
    bassRatio,
    brightness,
    beatRegularity: regularity,
  };
}

interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
}

async function renderFiltered(
  buffer: AudioBuffer,
  sampleRate: number,
  skip: number,
  dur: number,
  filter: FilterSpec | null,
): Promise<Float32Array> {
  const length = Math.floor(dur * sampleRate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let node: AudioNode = src;
  if (filter) {
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter.type;
    biquad.frequency.value = filter.frequency;
    biquad.Q.value = 0.707;
    node.connect(biquad);
    node = biquad;
  }
  node.connect(ctx.destination);
  src.start(0, skip, dur);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

function rms(data: Float32Array): number {
  let sum = 0;
  // Stride for speed; plenty of samples for a stable RMS.
  for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i];
  return Math.sqrt(sum / (data.length / 4));
}

/**
 * BPM from the low-band signal:
 * 1. Rectified + smoothed envelope, downsampled to 200 Hz.
 * 2. Onset strength = positive envelope difference.
 * 3. Autocorrelation over lags for 60..190 BPM; harmonic disambiguation.
 */
function detectBpm(
  low: Float32Array,
  sampleRate: number,
): { bpm: number; regularity: number } {
  const envRate = 200;
  const hop = Math.floor(sampleRate / envRate);
  const envLen = Math.floor(low.length / hop);
  if (envLen < envRate * 4) return { bpm: 120, regularity: 0.3 };

  const env = new Float32Array(envLen);
  let smooth = 0;
  const k = 1 - Math.exp(-1 / (envRate * 0.02)); // ~20ms smoothing
  for (let i = 0; i < envLen; i++) {
    let peak = 0;
    const base = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = Math.abs(low[base + j]);
      if (v > peak) peak = v;
    }
    smooth += (peak - smooth) * k;
    env[i] = smooth;
  }

  const onset = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    const d = env[i] - env[i - 1];
    onset[i] = d > 0 ? d : 0;
  }
  const mean = onset.reduce((a, b) => a + b, 0) / envLen;
  for (let i = 0; i < envLen; i++) onset[i] -= mean;

  const minLag = Math.floor((60 / 190) * envRate); // fast bound
  const maxLag = Math.ceil((60 / 60) * envRate); // slow bound
  let bestLag = 0;
  let bestVal = -Infinity;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < envLen; i++) sum += onset[i] * onset[i + lag];
    corr[lag] = sum / (envLen - lag);
    if (corr[lag] > bestVal) {
      bestVal = corr[lag];
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestVal <= 0) return { bpm: 120, regularity: 0.3 };

  // Prefer the half-tempo lag when it correlates nearly as well
  // (avoids reporting 170 BPM for an 85 BPM track and vice versa).
  const half = bestLag * 2;
  if (half <= maxLag && corr[half] > bestVal * 0.72) {
    bestLag = half;
    bestVal = corr[half];
  }

  let bpm = Math.round((60 * envRate) / bestLag);
  while (bpm > 190) bpm = Math.round(bpm / 2);
  while (bpm < 60) bpm *= 2;

  const corrMean =
    corr.slice(minLag).reduce((a, b) => a + Math.abs(b), 0) / (maxLag - minLag + 1);
  const regularity = clamp01(bestVal / (corrMean * 4 + 1e-9));

  return { bpm, regularity };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
