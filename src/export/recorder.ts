import { triggerDownload, timestamp } from './snapshot';

const MAX_SECONDS = 30;

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

/**
 * Records the canvas (30fps) muxed with the app's audio stream.
 * Hard-capped at 30 seconds; downloads on stop.
 */
export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopTimer: number | null = null;
  private startedAt = 0;

  /** Fired with elapsed seconds while recording, and null when stopped. */
  onTick: ((elapsed: number | null) => void) | null = null;
  private tickTimer: number | null = null;

  get recording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  start(canvas: HTMLCanvasElement, audioStream: MediaStream): boolean {
    if (this.recording) return false;

    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) return false;

    try {
      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);

      this.chunks = [];
      this.recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
      });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => this.finish(mimeType);
      this.recorder.start(1000);
      this.startedAt = performance.now();

      this.stopTimer = window.setTimeout(() => this.stop(), MAX_SECONDS * 1000);
      this.tickTimer = window.setInterval(() => {
        this.onTick?.((performance.now() - this.startedAt) / 1000);
      }, 250);
      return true;
    } catch {
      this.recorder = null;
      return false;
    }
  }

  stop(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.onTick?.(null);
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private finish(mimeType: string): void {
    const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const blob = new Blob(this.chunks, { type: mimeType });
    this.chunks = [];
    this.recorder = null;
    if (blob.size === 0) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `vartan-clip-${timestamp()}.${ext}`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
