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

After pushing to `main`, the workflow builds and publishes `dist/` to the **`gh-pages` branch**.

**One-time GitHub setup:**

1. Repo **Settings → Pages**
2. **Build and deployment → Source:** choose **Deploy from a branch**
3. **Branch:** `gh-pages` → folder **`/ (root)`** → Save

If `gh-pages` does not appear yet, run the workflow once (Actions tab), then refresh Settings.

Live URL: `https://dtchakerian-lab.github.io/vartan/`

Also ensure **Settings → Actions → General → Workflow permissions** is set to **Read and write permissions** (required for the deploy push).

## Features

- Audio file upload (MP3/WAV/M4A/OGG), microphone, or built-in demo beat
- Six visual worlds: **Flow**, Aurora, Galaxy, Prism, Terrain, Neon
- Offline song fingerprint (BPM, energy, bass, brightness) drives palette + motion
- **Options drawer** (gear / `O`): musician tools without cluttering the canvas
  - **Track info** — BPM pill + energy/bass/brightness readout; tap-tempo result
  - **Display** — intensity Calm / Normal / Intense (fixes over-zoom on Flow/Terrain); band meters; Clean UI
  - **Practice** — A–B loop on the seek bar; metronome from detected (or tapped) BPM; tap tempo
  - **Compare** — load Track B, **split canvas A|B**, Hear A / Hear B / Mix (file mode only)
- Save PNG snapshots, record 30-second clips (with audio), fullscreen
- Canvas2D fallback when WebGL is unavailable

## Not supported (by design)

- No YouTube / remote URL convert — save an MP3 locally, then drop it in
- No accounts, cloud sync, or settings persistence (options reset on reload)
- No backend, API keys, or audio leaving the device

## Keyboard

| Key | Action |
|-----|--------|
| Space | Play / pause |
| O | Options drawer |
| Esc | Close drawer |
| F | Fullscreen |
| S | Snapshot |

## Current product snapshot (for the next AI / human)

As of the Musician Options Drawer work:

- Flagship world is **Flow** (spectrum terrain + sky), not Album Pulse
- Options live in a right-side accordion drawer; main chrome stays minimal
- Compare is **true scissor split** on one WebGL canvas with dual analysers (`CompareTrack`)
- Intensity scales displace + camera pull in Flow / Terrain
- Docs of record: this README + [`docs/PROJECT.md`](docs/PROJECT.md)
