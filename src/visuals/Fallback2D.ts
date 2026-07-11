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

    g.fillStyle = `rgba(6, 6, 14, ${0.25 + p.beat * 0.1})`;
    g.fillRect(0, 0, w, h);

    const bars = 96;
    const baseR = Math.min(w, h) * (0.16 + p.bass * 0.05 + p.beat * 0.03);
    const colA = `#${p.colorA.getHexString()}`;
    const colC = `#${p.colorC.getHexString()}`;

    for (let i = 0; i < bars; i++) {
      const idx = Math.floor((i / bars) * spectrum.length * 0.5);
      const v = spectrum[idx] / 255;
      const angle = (i / bars) * Math.PI * 2 + p.time * 0.2 * p.speed;
      const len = baseR * 0.2 + v * Math.min(w, h) * 0.22;
      const x1 = cx + Math.cos(angle) * baseR;
      const y1 = cy + Math.sin(angle) * baseR;
      const x2 = cx + Math.cos(angle) * (baseR + len);
      const y2 = cy + Math.sin(angle) * (baseR + len);
      g.strokeStyle = i % 4 === 0 ? colC : colA;
      g.globalAlpha = 0.4 + v * 0.6;
      g.lineWidth = 2 + v * 3;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // Beat ring.
    if (p.beat > 0.02) {
      g.strokeStyle = colC;
      g.globalAlpha = p.beat * 0.8;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, baseR * (1.6 + (1 - p.beat) * 1.2), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
