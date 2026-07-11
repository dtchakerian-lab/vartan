import * as THREE from 'three';

/**
 * Generated poster: when a track has no artwork anywhere, build a
 * palette-driven gradient poster with the track title so Album Pulse
 * always has something beautiful to animate.
 */
export function generatePoster(
  title: string,
  artist: string,
  colorA: THREE.Color,
  colorB: THREE.Color,
  colorC: THREE.Color,
): HTMLCanvasElement {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;

  const hexA = `#${colorA.getHexString()}`;
  const hexB = `#${colorB.getHexString()}`;
  const hexC = `#${colorC.getHexString()}`;

  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, hexB);
  grad.addColorStop(0.55, hexA);
  grad.addColorStop(1, hexB);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  // Layered translucent circles for depth.
  for (let i = 0; i < 14; i++) {
    const r = 60 + Math.random() * 320;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radial = g.createRadialGradient(x, y, 0, x, y, r);
    radial.addColorStop(0, `${hexC}33`);
    radial.addColorStop(1, `${hexC}00`);
    g.fillStyle = radial;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Accent ring.
  g.strokeStyle = hexC;
  g.globalAlpha = 0.85;
  g.lineWidth = 10;
  g.beginPath();
  g.arc(size / 2, size / 2 - 40, 220, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;

  // Big initial inside the ring.
  const initial = (title.trim()[0] || 'V').toUpperCase();
  g.fillStyle = '#ffffff';
  g.font = '700 300px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(initial, size / 2, size / 2 - 30);

  // Title + artist.
  g.font = '600 52px system-ui, sans-serif';
  g.fillText(truncate(title, 26), size / 2, size - 190);
  if (artist) {
    g.globalAlpha = 0.75;
    g.font = '400 40px system-ui, sans-serif';
    g.fillText(truncate(artist, 30), size / 2, size - 120);
    g.globalAlpha = 1;
  }

  return canvas;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
