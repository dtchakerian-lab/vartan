import { AudioEngine } from './audio/AudioEngine';
import { BeatDetector } from './audio/BeatDetector';
import { DemoSynth } from './audio/DemoSynth';
import type { SongFingerprint } from './audio/types';
import { DEFAULT_FINGERPRINT } from './audio/types';
import { analyzeBuffer } from './analysis/SongAnalyzer';
import { deriveStyle } from './analysis/fingerprint';
import type { DerivedStyle } from './analysis/fingerprint';
import { VisualManager } from './visuals/VisualManager';
import { Fallback2D } from './visuals/Fallback2D';
import type { VisualParams, WorldId } from './visuals/VisualParams';
import { WORLD_IDS, WORLD_LABELS, deriveLiveColors } from './visuals/VisualParams';
import { parseTrackMeta } from './metadata/MetadataParser';
import { AudioDynamics } from './audio/AudioDynamics';
import { saveSnapshot } from './export/snapshot';
import { ClipRecorder } from './export/recorder';

type SourceKind = 'file' | 'mic' | 'demo';

export class App {
  private engine = new AudioEngine();
  private detector = new BeatDetector();
  private dynamics = new AudioDynamics();
  private demo = new DemoSynth(this.engine);
  private recorder = new ClipRecorder();

  private manager: VisualManager | null = null;
  private fallback: Fallback2D | null = null;

  private fingerprint: SongFingerprint = { ...DEFAULT_FINGERPRINT };
  private style: DerivedStyle = deriveStyle(this.fingerprint);
  private source: SourceKind | null = null;
  private trackLabel = '';
  private loadToken = 0;
  private scrubbing = false;

  // UI elements
  private el = {
    hero: byId('hero'),
    dropzone: byId('dropzone'),
    heroHint: byId('hero-hint'),
    controls: byId('controls'),
    chips: byId('world-chips'),
    btnPlay: byId<HTMLButtonElement>('btn-play'),
    seekBar: byId<HTMLInputElement>('seek-bar'),
    btnMic: byId<HTMLButtonElement>('btn-mic'),
    btnDemo: byId<HTMLButtonElement>('btn-demo'),
    btnSnapshot: byId<HTMLButtonElement>('btn-snapshot'),
    btnRecord: byId<HTMLButtonElement>('btn-record'),
    btnEject: byId<HTMLButtonElement>('btn-eject'),
    btnFullscreen: byId<HTMLButtonElement>('btn-fullscreen'),
    fileInput: byId<HTMLInputElement>('file-input'),
    trackTitle: byId('track-title'),
    timeLabel: byId('time-label'),
    recLabel: byId('rec-label'),
    analyzing: byId('analyzing'),
    unlockOverlay: byId('unlock-overlay'),
    btnUnlock: byId<HTMLButtonElement>('btn-unlock'),
    toast: byId('toast'),
  };

  private toastTimer: number | null = null;
  private idleTimer: number | null = null;
  private lastFrameTime = performance.now();

  start(): void {
    const stage = byId('stage');
    try {
      this.manager = new VisualManager(stage);
    } catch {
      this.fallback = new Fallback2D(stage);
      // No shader worlds in 2D mode; hide the style chips.
      this.el.chips.style.display = 'none';
    }

    this.buildChips();
    this.bindEvents();
    this.loop();
  }

  // ---------------------------------------------------------------- sources

  private async loadAudioFile(file: File): Promise<void> {
    const token = ++this.loadToken;
    await this.engine.unlock();
    this.checkUnlocked();

    this.demo.stop();
    this.detector.reset();
    this.dynamics.reset();
    this.source = 'file';

    this.el.analyzing.classList.remove('hidden');
    this.showToast(null);

    let buffer: AudioBuffer;
    try {
      buffer = await this.engine.loadFile(file);
    } catch {
      this.el.analyzing.classList.add('hidden');
      this.setHint("Couldn't read that file — try an MP3, WAV, or M4A.", true);
      return;
    }
    if (token !== this.loadToken) return;

    // Load paused: the user browses themes and hits play themselves.
    this.enterLiveUi();
    this.trackLabel = file.name.replace(/\.[a-z0-9]+$/i, '');
    this.el.trackTitle.textContent = this.trackLabel;
    this.showToast('Ready — pick a theme, then press play.');

    // Metadata for track title (art lookup is silent; never switches worlds).
    void this.resolveMeta(file, token);

    // Fingerprint analysis.
    try {
      const fp = await analyzeBuffer(buffer);
      if (token !== this.loadToken) return;
      this.applyFingerprint(fp);
    } finally {
      if (token === this.loadToken) this.el.analyzing.classList.add('hidden');
    }
  }

  private applyFingerprint(fp: SongFingerprint): void {
    this.fingerprint = fp;
    this.style = deriveStyle(fp);
  }

  private async resolveMeta(file: File, token: number): Promise<void> {
    const meta = await parseTrackMeta(file);
    if (token !== this.loadToken) return;

    if (meta.title) {
      this.trackLabel = meta.artist ? `${meta.artist} — ${meta.title}` : meta.title;
      this.el.trackTitle.textContent = this.trackLabel;
    }
    if (meta.genreHint) this.fingerprint.genreHint = meta.genreHint;
  }

  private async useMic(): Promise<void> {
    await this.engine.unlock();
    this.checkUnlocked();
    try {
      this.demo.stop();
      await this.engine.useMic();
    } catch {
      this.setHint('Microphone blocked — drop an audio file instead.', true);
      return;
    }
    if (!this.engine.unlocked) {
      this.el.unlockOverlay.classList.remove('hidden');
      this.setHint('Tap “Enable audio” on screen, then click Mic again.', true);
      return;
    }
    ++this.loadToken;
    this.detector.reset();
    this.dynamics.reset();
    this.source = 'mic';
    this.applyFingerprint({ ...DEFAULT_FINGERPRINT, energy: 0.85, brightness: 0.65 });
    this.trackLabel = 'Microphone';
    this.el.trackTitle.textContent = 'Listening…';
    this.setHint('Clap near the laptop mic — level shows top-right.');
    this.enterLiveUi();
  }

  private async useDemo(): Promise<void> {
    await this.engine.unlock();
    this.checkUnlocked();
    ++this.loadToken;
    this.detector.reset();
    this.dynamics.reset();
    this.source = 'demo';
    this.applyFingerprint({
      bpm: 120,
      energy: 0.75,
      bassRatio: 0.5,
      brightness: 0.45,
      beatRegularity: 0.9,
    });
    this.demo.start();
    this.trackLabel = 'Demo beat';
    this.el.trackTitle.textContent = 'Demo beat — 120 BPM';
    this.enterLiveUi();
  }

  private routeFile(file: File): void {
    if (file.type.startsWith('image/')) {
      this.showToast('Drop an audio file — visuals react to the music itself.');
      return;
    }
    void this.loadAudioFile(file);
  }

  private eject(): void {
    ++this.loadToken;
    this.recorder.stop();
    this.demo.stop();
    this.engine.stopAll();
    this.source = null;
    this.trackLabel = '';
    this.el.trackTitle.textContent = '';
    this.el.controls.classList.add('hidden');
    this.el.hero.classList.remove('hidden');
    this.el.analyzing.classList.add('hidden');
    this.setHint('');
  }

  // ---------------------------------------------------------------- UI

  private enterLiveUi(): void {
    this.el.hero.classList.add('hidden');
    this.el.controls.classList.remove('hidden');
    this.el.controls.classList.remove('faded');
    this.setHint('');
    this.updatePlayButton();
    this.scheduleIdleFade();
  }

  private buildChips(): void {
    for (const id of WORLD_IDS) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.world = id;
      chip.textContent = WORLD_LABELS[id];
      chip.addEventListener('click', () => this.setWorld(id));
      this.el.chips.appendChild(chip);
    }
    this.refreshChips();
  }

  private setWorld(id: WorldId): void {
    if (!this.manager) return;
    this.manager.setWorld(id);
    this.refreshChips();
  }

  private refreshChips(): void {
    const active = this.manager?.currentWorld;
    this.el.chips.querySelectorAll<HTMLElement>('.chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.world === active);
    });
  }

  private updatePlayButton(): void {
    const btn = this.el.btnPlay;
    const showTransport = this.source === 'file';
    btn.style.display = this.source === 'mic' ? 'none' : '';
    this.el.seekBar.classList.toggle('hidden', !showTransport);
    if (this.source === 'mic') return;
    const playing =
      this.source === 'demo' ? this.demo.running : this.engine.playing;
    btn.textContent = playing ? '⏸' : '▶';
  }

  private togglePlay(): void {
    if (this.source === 'file') {
      if (this.engine.playing) this.engine.pause();
      else this.engine.play();
    } else if (this.source === 'demo') {
      if (this.demo.running) this.demo.stop();
      else this.demo.start();
    }
    this.updatePlayButton();
  }

  private toggleRecord(): void {
    if (this.recorder.recording) {
      this.recorder.stop();
      this.el.btnRecord.classList.remove('recording');
      return;
    }
    const canvas = this.manager?.canvas ?? this.fallback?.canvas;
    if (!canvas || !this.source) return;
    const ok = this.recorder.start(canvas, this.engine.recordDest.stream);
    if (!ok) {
      this.showToast("Recording isn't supported in this browser.");
      return;
    }
    this.el.btnRecord.classList.add('recording');
    this.recorder.onTick = (elapsed) => {
      if (elapsed === null) {
        this.el.recLabel.textContent = '';
        this.el.btnRecord.classList.remove('recording');
      } else {
        this.el.recLabel.textContent = `${Math.floor(elapsed)}s / 30s`;
      }
    };
  }

  private snapshot(): void {
    const canvas = this.manager?.canvas ?? this.fallback?.canvas;
    if (canvas) saveSnapshot(canvas);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  private setHint(text: string, error = false): void {
    this.el.heroHint.textContent = text;
    this.el.heroHint.classList.toggle('error', error);
  }

  private showToast(text: string | null): void {
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    if (!text) {
      this.el.toast.classList.add('hidden');
      return;
    }
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastTimer = window.setTimeout(() => {
      this.el.toast.classList.add('hidden');
    }, 3200);
  }

  private checkUnlocked(): void {
    if (!this.engine.unlocked) {
      this.el.unlockOverlay.classList.remove('hidden');
    }
  }

  private scheduleIdleFade(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.el.controls.classList.remove('faded');
    this.idleTimer = window.setTimeout(() => {
      if (this.source && !this.recorder.recording) {
        this.el.controls.classList.add('faded');
      }
    }, 3500);
  }

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    const dz = this.el.dropzone;
    dz.addEventListener('click', () => this.el.fileInput.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.el.fileInput.click();
    });

    this.el.fileInput.addEventListener('change', () => {
      const file = this.el.fileInput.files?.[0];
      this.el.fileInput.value = '';
      if (file) this.routeFile(file);
    });

    // Whole-window drag & drop.
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
    window.addEventListener('dragleave', (e) => {
      if (e.target === document.documentElement || !e.relatedTarget) {
        dz.classList.remove('dragover');
      }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.routeFile(file);
    });

    this.el.btnMic.addEventListener('click', () => void this.useMic());
    this.el.btnDemo.addEventListener('click', () => void this.useDemo());
    this.el.btnPlay.addEventListener('click', () => this.togglePlay());
    this.el.btnSnapshot.addEventListener('click', () => this.snapshot());
    this.el.btnRecord.addEventListener('click', () => this.toggleRecord());
    this.el.btnEject.addEventListener('click', () => this.eject());
    this.el.btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

    this.el.btnUnlock.addEventListener('click', () => {
      void this.engine.unlock().then(() => {
        if (this.engine.unlocked) {
          this.el.unlockOverlay.classList.add('hidden');
        }
      });
    });

    const seek = this.el.seekBar;
    seek.addEventListener('pointerdown', () => {
      this.scrubbing = true;
    });
    seek.addEventListener('pointerup', () => {
      this.scrubbing = false;
    });
    seek.addEventListener('input', () => {
      if (this.source !== 'file' || this.engine.duration <= 0) return;
      const t = (Number(seek.value) / 1000) * this.engine.duration;
      this.engine.seek(t);
      this.el.timeLabel.textContent = `${fmt(t)} / ${fmt(this.engine.duration)}`;
    });

    this.engine.onended = () => this.updatePlayButton();

    window.addEventListener('resize', () => {
      this.manager?.resize();
      this.fallback?.resize();
    });

    const wake = () => this.scheduleIdleFade();
    window.addEventListener('pointermove', wake);
    window.addEventListener('touchstart', wake, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 's' || e.key === 'S') {
        this.snapshot();
      }
    });
  }

  // ---------------------------------------------------------------- loop

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    const time = now / 1000;

    const frame = this.engine.getFrame(dt);

    let bass = frame.bass;
    let mid = frame.mid;
    let treble = frame.treble;
    let volume = frame.volume;
    if (this.source === 'mic') {
      const micLvl = this.engine.micLevel();
      volume = Math.max(volume, micLvl);
      bass = Math.max(bass, micLvl * 0.55);
      mid = Math.max(mid, micLvl * 0.9);
      treble = Math.max(treble, micLvl * 0.35);
    }

    // AGC-normalize bands against the recent mix, then beat-detect on those
    // (relative signals make hits obvious even in a dense wall of sound).
    const live = this.dynamics.update(bass, mid, treble, volume, frame.spectrum, dt);
    const beat = this.detector.update(live.bass, live.mid, live.treble, live.volume, time, dt);
    const colors = deriveLiveColors(this.style, live);

    const params: VisualParams = {
      time,
      dt,
      bass: live.bass,
      mid: live.mid,
      treble: live.treble,
      volume: live.volume,
      beat,
      bassHit: live.bassHit,
      midHit: live.midHit,
      trebleHit: live.trebleHit,
      liveEnergy: live.liveEnergy,
      sectionPulse: live.sectionPulse,
      liveSpeed: live.liveSpeed,
      energy: this.fingerprint.energy,
      brightness: this.fingerprint.brightness,
      speed: this.style.speed,
      colorA: colors.colorA,
      colorB: colors.colorB,
      colorC: colors.colorC,
    };

    if (this.manager) this.manager.render(params, frame.spectrum);
    else this.fallback?.render(params, frame.spectrum);

    // Transport readout + seek bar for file playback.
    if (this.source === 'file' && this.engine.duration > 0) {
      this.el.seekBar.classList.remove('hidden');
      if (!this.scrubbing) {
        const pct = (this.engine.currentTime / this.engine.duration) * 1000;
        this.el.seekBar.value = String(Math.round(pct));
      }
      this.el.timeLabel.textContent = `${fmt(this.engine.currentTime)} / ${fmt(this.engine.duration)}`;
    } else if (this.source === 'mic') {
      this.el.seekBar.classList.add('hidden');
      const lvl = Math.round(volume * 100);
      this.el.timeLabel.textContent =
        lvl > 3 ? `mic ${lvl}%` : 'mic — clap near laptop';
    } else if (this.source === 'demo') {
      this.el.seekBar.classList.add('hidden');
      this.el.timeLabel.textContent = 'loop';
    } else {
      this.el.seekBar.classList.add('hidden');
      this.el.timeLabel.textContent = '';
    }
  };
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
