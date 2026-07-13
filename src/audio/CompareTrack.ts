import type { AudioFrameMetrics } from './types';

export type HearMode = 'a' | 'b' | 'mix';

/**
 * Slim second-file player for A|B compare. Shares the main AudioContext;
 * owns its own analyser + monitor gain. Does not touch mic/demo.
 */
export class CompareTrack {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly gain: GainNode;
  private readonly recordDest: MediaStreamAudioDestinationNode | null;

  private freqData: Uint8Array<ArrayBuffer>;
  private buffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  playing = false;

  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private sVol = 0;

  label = '';

  constructor(ctx: AudioContext, recordDest: MediaStreamAudioDestinationNode | null = null) {
    this.ctx = ctx;
    this.recordDest = recordDest;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.analyser.connect(this.gain);
    this.gain.connect(ctx.destination);
    if (recordDest) this.gain.connect(recordDest);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  get loaded(): boolean {
    return this.buffer !== null;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get currentTime(): number {
    if (!this.buffer) return 0;
    return this.playing ? this.ctx.currentTime - this.startedAt : this.pausedAt;
  }

  async load(file: File | Blob, label = ''): Promise<AudioBuffer> {
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    this.stop();
    this.buffer = buffer;
    this.pausedAt = 0;
    this.label = label;
    return buffer;
  }

  play(): void {
    if (!this.buffer || this.playing) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.analyser);
    const offset = this.pausedAt % this.buffer.duration;
    src.start(0, offset);
    src.onended = () => {
      if (this.bufferSource === src && this.playing) {
        this.playing = false;
        this.pausedAt = 0;
        this.bufferSource = null;
      }
    };
    this.bufferSource = src;
    this.startedAt = this.ctx.currentTime - offset;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.ctx.currentTime - this.startedAt;
    this.playing = false;
    const src = this.bufferSource;
    this.bufferSource = null;
    try {
      src?.stop();
    } catch {
      /* already stopped */
    }
  }

  seek(seconds: number): void {
    if (!this.buffer) return;
    const t = Math.max(0, Math.min(seconds, this.buffer.duration));
    const wasPlaying = this.playing;
    if (this.playing) this.pause();
    this.pausedAt = t;
    if (wasPlaying) this.play();
  }

  stop(): void {
    if (this.bufferSource) {
      try {
        this.bufferSource.stop();
      } catch {
        /* noop */
      }
      this.bufferSource = null;
    }
    this.playing = false;
    this.pausedAt = 0;
  }

  clear(): void {
    this.stop();
    this.buffer = null;
    this.label = '';
    this.sBass = this.sMid = this.sTreble = this.sVol = 0;
    this.setGain(0);
  }

  /** Apply hear mode for Track B's output level. */
  setHearMode(mode: HearMode): void {
    if (mode === 'a') this.setGain(0);
    else if (mode === 'b') this.setGain(1);
    else this.setGain(0.55);
  }

  setGain(v: number): void {
    this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  getFrame(dt: number): AudioFrameMetrics {
    this.analyser.getByteFrequencyData(this.freqData);
    const n = this.freqData.length;
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const bandAvg = (loHz: number, hiHz: number): number => {
      const lo = Math.max(1, Math.floor(loHz / binHz));
      const hi = Math.min(n - 1, Math.ceil(hiHz / binHz));
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += this.freqData[i];
      return sum / ((hi - lo + 1) * 255);
    };

    const bass = bandAvg(20, 250);
    const mid = bandAvg(250, 2000);
    const treble = bandAvg(2000, 12000);
    const volume = bass * 0.5 + mid * 0.35 + treble * 0.15;

    const smooth = (prev: number, next: number): number => {
      const attack = 1 - Math.exp(-dt * 45);
      const release = 1 - Math.exp(-dt * 14);
      const k = next > prev ? attack : release;
      return prev + (next - prev) * k;
    };
    this.sBass = smooth(this.sBass, bass);
    this.sMid = smooth(this.sMid, mid);
    this.sTreble = smooth(this.sTreble, treble);
    this.sVol = smooth(this.sVol, volume);

    return {
      bass: this.sBass,
      mid: this.sMid,
      treble: this.sTreble,
      volume: this.sVol,
      beat: 0,
      spectrum: this.freqData,
    };
  }
}
