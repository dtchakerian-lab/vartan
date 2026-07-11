import type { VisualParams } from './VisualParams';

/**
 * Canvas2D fallback for devices without WebGL2:
 * radial spectrum + beat ring. Degraded but functional.
 */
export class Fallback2D {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;
    this.resize();
  }

  render(p: VisualParams, spectrum: Uint8Array): void {
    const { width: w, height: h } = this.canvas;
    const g = this.ctx;
    const cx = w / 2;
    const cy = h / 2;

    const hit = p.beat + p.bassHit + p.midHit * 0.6;
    g.fillStyle = `rgba(6, 6, 14, ${0.18 + hit * 0.15})`;
    g.fillRect(0, 0, w, h);

    const bars = 96;
    const baseR = Math.min(w, h) * (0.14 + p.bass * 0.08 + hit * 0.05 + p.liveEnergy * 0.04);
    const colA = `#${p.colorA.getHexString()}`;
    const colC = `#${p.colorC.getHexString()}`;

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * spectrum.length * 0.5);
      const v = spectrum[idx] / 255;
      const angle = (i / bars) * Math.PI * 2 + p.time * 0.25 * p.liveSpeed;
      const len = baseR * 0.15 + v * Math.min(w, h) * (0.28 + p.liveEnergy * 0.12);
      const x1 = cx + Math.cos(angle) * baseR;
      const y1 = cy + Math.sin(angle) * baseR;
      const x2 = cx + Math.cos(angle) * (baseR + len);
      const y2 = cy + Math.sin(angle) * (baseR + len);
      g.strokeStyle = i % 4 === 0 ? colC : colA;
      g.globalAlpha = 0.35 + v * 0.65 + p.trebleHit * 0.2;
      g.lineWidth = 2 + v * 4 + p.midHit * 2;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.globalAlpha = 1;

    if (hit > 0.02) {
      g.strokeStyle = colC;
      g.globalAlpha = hit * 0.9;
      g.lineWidth = 3 + p.bassHit * 4;
      g.beginPath();
      g.arc(cx, cy, baseR * (1.5 + (1 - hit) * 1.4), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
