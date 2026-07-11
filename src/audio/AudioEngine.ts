import type { AudioFrameMetrics, AudioSourceMode } from './types';

/**
 * Owns the single AudioContext and the analyser chain.
 *
 * Routing:
 *   source -> sourceBus -> analyser -> monitorGain -> speakers
 *                       \-> recordDest (for MediaRecorder clips)
 *
 * Mic mode sets monitorGain to 0 so the room doesn't feed back.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private readonly sourceBus: GainNode;
  private readonly monitorGain: GainNode;
  readonly recordDest: MediaStreamAudioDestinationNode;

  private freqData: Uint8Array<ArrayBuffer>;

  mode: AudioSourceMode | null = null;
  buffer: AudioBuffer | null = null;
  playing = false;

  private bufferSource: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private pausedAt = 0;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  /** Called when a file track reaches its natural end. */
  onended: (() => void) | null = null;

  // Smoothed band values (fast attack, slow release).
  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private sVol = 0;

  constructor() {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;

    this.sourceBus = this.ctx.createGain();
    this.monitorGain = this.ctx.createGain();
    this.recordDest = this.ctx.createMediaStreamDestination();

    this.sourceBus.connect(this.analyser);
    this.analyser.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);
    this.sourceBus.connect(this.recordDest);

    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
  }

  /** Must be called from a user gesture before audio will flow. */
  async unlock(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* overlay will retry */
      }
    }
  }

  get unlocked(): boolean {
    return this.ctx.state === 'running';
  }

  /** Node other sources (e.g. the demo synth) should connect into. */
  get inputNode(): AudioNode {
    return this.sourceBus;
  }

  async loadFile(file: File | Blob): Promise<AudioBuffer> {
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.stopAll();
    this.buffer = buffer;
    this.mode = 'file';
    this.pausedAt = 0;
    this.monitorGain.gain.value = 1;
    return buffer;
  }

  play(): void {
    if (this.mode !== 'file' || !this.buffer || this.playing) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.sourceBus);
    const offset = this.pausedAt % this.buffer.duration;
    src.start(0, offset);
    src.onended = () => {
      // Ignore stops we triggered ourselves via pause().
      if (this.bufferSource === src && this.playing) {
        this.playing = false;
        this.pausedAt = 0;
        this.bufferSource = null;
        this.onended?.();
      }
    };
    this.bufferSource = src;
    this.startedAt = this.ctx.currentTime - offset;
    this.playing = true;
  }

  pause(): void {
    if (this.mode !== 'file' || !this.playing) return;
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

  get currentTime(): number {
    if (this.mode !== 'file' || !this.buffer) return 0;
    return this.playing ? this.ctx.currentTime - this.startedAt : this.pausedAt;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  async useMic(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    this.stopAll();
    this.micStream = stream;
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.sourceBus);
    this.monitorGain.gain.value = 0; // no speaker output -> no feedback
    this.mode = 'mic';
    this.playing = true;
  }

  /** Used by the demo synth: marks engine live without a buffer. */
  beginExternal(mode: AudioSourceMode): void {
    this.stopAll();
    this.mode = mode;
    this.monitorGain.gain.value = 1;
    this.playing = true;
  }

  stopAll(): void {
    if (this.bufferSource) {
      try {
        this.bufferSource.stop();
      } catch {
        /* noop */
      }
      this.bufferSource = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      for (const t of this.micStream.getTracks()) t.stop();
      this.micStream = null;
    }
    this.playing = false;
    this.pausedAt = 0;
  }

  /**
   * Read current spectrum and compute smoothed band levels.
   * Band edges assume ~44.1/48kHz: bin width ~= sampleRate/2048.
   */
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
      const k = next > prev ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 6);
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
      beat: 0, // filled in by BeatDetector
      spectrum: this.freqData,
    };
  }
}
