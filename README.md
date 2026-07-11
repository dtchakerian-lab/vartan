# Vartan

Drop a song. Watch it come alive.

Vartan is a free, browser-only music visualizer built for classrooms: real-time WebGL visuals driven by the music itself — bass, tempo, energy, brightness. No accounts, no API keys, no uploads; everything runs on the device.

**Full product spec and architecture: [docs/PROJECT.md](docs/PROJECT.md)** — read that first before changing anything.

## Quick start

```bash
npm install
npm run dev      # local dev at http://localhost:5173/vartan/
npm run build    # production build to dist/
```

## Deploy

Pushing to `main` auto-deploys to GitHub Pages via `.github/workflows/deploy.yml` (Settings → Pages → Source: GitHub Actions). The app is served at `https://<username>.github.io/vartan/`.

## Features

- Audio file upload (MP3/WAV/M4A/OGG), microphone, or built-in demo beat
- Six visual worlds: Aurora, Galaxy, Prism, Terrain, Neon, Pulse
- Auto-match: song fingerprint (BPM, energy, bass, brightness) picks the style and palette
- Album Pulse: embedded cover art, iTunes lookup (silent fallback), manual image drop, or generated poster
- Save PNG snapshots, record 30-second clips (with audio), fullscreen
- Canvas2D fallback when WebGL is unavailable
