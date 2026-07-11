/**
 * Onset detector on the (already smoothed-ish) bass band.
 * Compares instantaneous bass to a rolling average; fires when it spikes.
 * Output is an envelope that jumps to 1 and decays, ideal for shader pulses.
 */
export class BeatDetector {
  private history: number[] = [];
  private readonly historySize = 43; // ~0.7s at 60fps
  private lastBeatTime = 0;
  private envelope = 0;

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    timeSec: number,
    dt: number,
  ): number {
    const signal = Math.max(bass, mid * 0.92, treble * 0.55, volume);
    this.history.push(signal);
    if (this.history.length > this.historySize) this.history.shift();

    const mean =
      this.history.reduce((a, b) => a + b, 0) / Math.max(1, this.history.length);

    const refractory = 0.14;
    const threshold = mean * 1.28 + 0.015;

    if (
      signal > threshold &&
      signal > 0.04 &&
      timeSec - this.lastBeatTime > refractory
    ) {
      this.lastBeatTime = timeSec;
      this.envelope = 1;
    }

    this.envelope *= Math.exp(-dt * 6.5);
    if (this.envelope < 0.001) this.envelope = 0;
    return this.envelope;
  }

  reset(): void {
    this.history = [];
    this.envelope = 0;
    this.lastBeatTime = 0;
  }
}
