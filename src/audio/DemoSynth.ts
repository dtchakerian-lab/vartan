import type { AudioEngine } from './AudioEngine';

/**
 * Procedural demo beat so the app can be shown with zero files and zero mic.
 * 120 BPM: kick, hats, bassline, and a pad — scheduled with a lookahead timer.
 */
export class DemoSynth {
  private engine: AudioEngine;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0; // 16th notes
  private readonly bpm = 120;
  running = false;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.engine.beginExternal('demo');
    this.step = 0;
    this.nextNoteTime = this.engine.ctx.currentTime + 0.06;
    const lookahead = () => {
      const ctx = this.engine.ctx;
      while (this.nextNoteTime < ctx.currentTime + 0.12) {
        this.scheduleStep(this.step, this.nextNoteTime);
        const secondsPer16th = 60 / this.bpm / 4;
        this.nextNoteTime += secondsPer16th;
        this.step = (this.step + 1) % 64;
      }
      this.timer = window.setTimeout(lookahead, 30);
    };
    lookahead();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  private scheduleStep(step: number, t: number): void {
    const beat16 = step % 16;
    if (beat16 % 4 === 0) this.kick(t); // four on the floor
    if (beat16 % 4 === 2) this.hat(t, 0.5);
    if (beat16 % 2 === 1) this.hat(t, 0.18);
    const bassNotes = [55, 55, 65.4, 49]; // A1 A1 C2 G1
    if (beat16 % 4 === 0) this.bass(t, bassNotes[Math.floor(step / 16) % 4]);
    if (step % 32 === 0) this.pad(t, Math.floor(step / 32) % 2);
  }

  private out(): AudioNode {
    return this.engine.inputNode;
  }

  private kick(t: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private hat(t: number, level: number): void {
    const ctx = this.engine.ctx;
    const len = 0.06;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * 0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(hp).connect(gain).connect(this.out());
    src.start(t);
  }

  private bass(t: number, freq: number): void {
    const ctx = this.engine.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(150, t + 0.22);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(lp).connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.26);
  }

  private pad(t: number, variant: number): void {
    const ctx = this.engine.ctx;
    const freqs = variant === 0 ? [220, 261.6, 329.6] : [196, 246.9, 293.7];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
      osc.connect(gain).connect(this.out());
      osc.start(t);
      osc.stop(t + 3.8);
    }
  }
}
