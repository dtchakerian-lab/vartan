/**
 * Quiet click track scheduled from BPM. Routes to destination only
 * (not the analyser) so it never drives visuals.
 */
export class Metronome {
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private bpm = 120;
  private enabled = false;
  private playing = false;
  private nextClick = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.14;
    this.gain.connect(ctx.destination);
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(240, bpm));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && this.playing) this.resync();
  }

  setPlaying(on: boolean): void {
    this.playing = on;
    if (on && this.enabled) this.resync();
  }

  /** Call every frame while the app is running. */
  update(): void {
    if (!this.enabled || !this.playing) return;
    const interval = 60 / this.bpm;
    const horizon = this.ctx.currentTime + 0.12;
    while (this.nextClick < horizon) {
      if (this.nextClick >= this.ctx.currentTime - 0.02) {
        this.scheduleClick(this.nextClick);
      }
      this.nextClick += interval;
    }
  }

  private resync(): void {
    const interval = 60 / this.bpm;
    const now = this.ctx.currentTime;
    this.nextClick = now + 0.05;
    // Align to a clean phase so the first click isn't delayed oddly.
    this.nextClick = Math.ceil(now / interval) * interval;
    if (this.nextClick < now + 0.04) this.nextClick += interval;
  }

  private scheduleClick(when: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1180;
    env.gain.value = 0;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(1, when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(when);
    osc.stop(when + 0.05);
  }
}
