import { AudioEngine } from './audio/AudioEngine';
import { BeatDetector } from './audio/BeatDetector';
import { DemoSynth } from './audio/DemoSynth';
import { CompareTrack } from './audio/CompareTrack';
import type { HearMode } from './audio/CompareTrack';
import { Metronome } from './audio/Metronome';
import type { SongFingerprint } from './audio/types';
import { DEFAULT_FINGERPRINT } from './audio/types';
import { analyzeBuffer } from './analysis/SongAnalyzer';
import { deriveStyle } from './analysis/fingerprint';
import type { DerivedStyle } from './analysis/fingerprint';
import { VisualManager } from './visuals/VisualManager';
import { Fallback2D } from './visuals/Fallback2D';
import type { ViewIntensity, VisualParams, WorldId } from './visuals/VisualParams';
import {
  WORLD_IDS,
  WORLD_LABELS,
  deriveLiveColors,
  intensityScales,
} from './visuals/VisualParams';
import { parseTrackMeta } from './metadata/MetadataParser';
import { AudioDynamics } from './audio/AudioDynamics';
import { saveSnapshot } from './export/snapshot';
import { ClipRecorder } from './export/recorder';

type SourceKind = 'file' | 'mic' | 'demo';

export class App {
  private engine = new AudioEngine();
  private detector = new BeatDetector();
  private dynamics = new AudioDynamics();
  private detectorB = new BeatDetector();
  private dynamicsB = new AudioDynamics();
  private demo = new DemoSynth(this.engine);
  private recorder = new ClipRecorder();
  private compare = new CompareTrack(this.engine.ctx, this.engine.recordDest);
  private metronome = new Metronome(this.engine.ctx);

  private manager: VisualManager | null = null;
  private fallback: Fallback2D | null = null;

  private fingerprint: SongFingerprint = { ...DEFAULT_FINGERPRINT };
  private fingerprintB: SongFingerprint = { ...DEFAULT_FINGERPRINT };
  private style: DerivedStyle = deriveStyle(this.fingerprint);
  private styleB: DerivedStyle = deriveStyle(this.fingerprintB);
  private source: SourceKind | null = null;
  private trackLabel = '';
  private loadToken = 0;
  private loadTokenB = 0;
  private scrubbing = false;

  // Options (session-only)
  private viewIntensity: ViewIntensity = 'normal';
  private showMeters = false;
  private cleanUi = false;
  private drawerOpen = false;
  private loopA: number | null = null;
  private loopB: number | null = null;
  private metroOn = false;
  private tapTimes: number[] = [];
  private tapBpm: number | null = null;
  private splitOn = false;
  private hearMode: HearMode = 'a';

  private el = {
    hero: byId('hero'),
    dropzone: byId('dropzone'),
    heroHint: byId('hero-hint'),
    controls: byId('controls'),
    chips: byId('world-chips'),
    btnPlay: byId<HTMLButtonElement>('btn-play'),
    seekWrap: byId('seek-wrap'),
    seekBar: byId<HTMLInputElement>('seek-bar'),
    loopMarks: byId('loop-marks'),
    loopMarkA: byId('loop-mark-a'),
    loopMarkB: byId('loop-mark-b'),
    btnMic: byId<HTMLButtonElement>('btn-mic'),
    btnDemo: byId<HTMLButtonElement>('btn-demo'),
    btnSnapshot: byId<HTMLButtonElement>('btn-snapshot'),
    btnRecord: byId<HTMLButtonElement>('btn-record'),
    btnEject: byId<HTMLButtonElement>('btn-eject'),
    btnFullscreen: byId<HTMLButtonElement>('btn-fullscreen'),
    btnOptions: byId<HTMLButtonElement>('btn-options'),
    btnOptionsFloat: byId<HTMLButtonElement>('btn-options-float'),
    btnDrawerClose: byId<HTMLButtonElement>('btn-drawer-close'),
    drawer: byId('options-drawer'),
    drawerBackdrop: byId('drawer-backdrop'),
    bpmPill: byId<HTMLButtonElement>('bpm-pill'),
    meters: byId('meters'),
    meterBass: byId('meter-bass'),
    meterMid: byId('meter-mid'),
    meterTreble: byId('meter-treble'),
    splitOverlay: byId('split-overlay'),
    splitLabelA: byId('split-label-a'),
    splitLabelB: byId('split-label-b'),
    infoBpm: byId('info-bpm'),
    infoEnergy: byId('info-energy'),
    infoBass: byId('info-bass'),
    infoBright: byId('info-bright'),
    infoTap: byId('info-tap'),
    intensityRow: byId('intensity-row'),
    optMeters: byId<HTMLInputElement>('opt-meters'),
    optClean: byId<HTMLInputElement>('opt-clean'),
    btnLoopA: byId<HTMLButtonElement>('btn-loop-a'),
    btnLoopB: byId<HTMLButtonElement>('btn-loop-b'),
    btnLoopClear: byId<HTMLButtonElement>('btn-loop-clear'),
    loopStatus: byId('loop-status'),
    optMetro: byId<HTMLInputElement>('opt-metro'),
    btnTapTempo: byId<HTMLButtonElement>('btn-tap-tempo'),
    compareHint: byId('compare-hint'),
    compareControls: byId('compare-controls'),
    btnLoadB: byId<HTMLButtonElement>('btn-load-b'),
    trackBLabel: byId('track-b-label'),
    optSplit: byId<HTMLInputElement>('opt-split'),
    hearRow: byId('hear-row'),
    btnClearB: byId<HTMLButtonElement>('btn-clear-b'),
    fileInput: byId<HTMLInputElement>('file-input'),
    fileInputB: byId<HTMLInputElement>('file-input-b'),
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
      this.manager.setStageFingerprint(this.fingerprint);
    } catch {
      this.fallback = new Fallback2D(stage);
      this.el.chips.style.display = 'none';
    }

    this.buildChips();
    this.bindEvents();
    this.refreshOptionsUi();
    this.loop();
  }

  // ---------------------------------------------------------------- sources

  private async loadAudioFile(file: File): Promise<void> {
    const token = ++this.loadToken;
    await this.engine.unlock();
    this.checkUnlocked();

    this.demo.stop();
    this.clearCompareTrack();
    this.detector.reset();
    this.dynamics.reset();
    this.source = 'file';
    this.clearLoop();
    this.tapTimes = [];
    this.tapBpm = null;

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

    this.enterLiveUi();
    this.trackLabel = file.name.replace(/\.[a-z0-9]+$/i, '');
    this.el.trackTitle.textContent = this.trackLabel;
    this.showToast('Ready — Stage is live. Press play.');
    this.applyHearMode();
    this.refreshCompareAvailability();

    void this.resolveMeta(file, token);

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
    this.syncMetroBpm();
    this.refreshTrackInfo();
    this.manager?.setStageFingerprint(fp);
  }

  private async resolveMeta(file: File, token: number): Promise<void> {
    const meta = await parseTrackMeta(file);
    if (token !== this.loadToken) return;

    if (meta.title) {
      this.trackLabel = meta.artist ? `${meta.artist} — ${meta.title}` : meta.title;
      this.el.trackTitle.textContent = this.trackLabel;
      this.refreshSplitLabels();
    }
    if (meta.genreHint) {
      this.fingerprint.genreHint = meta.genreHint;
      this.manager?.setStageFingerprint(this.fingerprint);
    }
  }

  private async useMic(): Promise<void> {
    await this.engine.unlock();
    this.checkUnlocked();
    try {
      this.demo.stop();
      this.clearCompareTrack();
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
    this.clearLoop();
    this.applyFingerprint({ ...DEFAULT_FINGERPRINT, energy: 0.85, brightness: 0.65 });
    this.trackLabel = 'Microphone';
    this.el.trackTitle.textContent = 'Listening…';
    this.setHint('Clap near the laptop mic — level shows top-right.');
    this.engine.setMonitorLevel(0);
    this.enterLiveUi();
    this.refreshCompareAvailability();
  }

  private async useDemo(): Promise<void> {
    await this.engine.unlock();
    this.checkUnlocked();
    ++this.loadToken;
    this.clearCompareTrack();
    this.detector.reset();
    this.dynamics.reset();
    this.source = 'demo';
    this.clearLoop();
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
    this.engine.setMonitorLevel(1);
    this.enterLiveUi();
    this.refreshCompareAvailability();
  }

  private routeFile(file: File): void {
    if (file.type.startsWith('image/')) {
      this.showToast('Drop an audio file — visuals react to the music itself.');
      return;
    }
    void this.loadAudioFile(file);
  }

  private async loadTrackB(file: File): Promise<void> {
    if (this.source !== 'file') {
      this.showToast('Compare needs a file on Track A first.');
      return;
    }
    const token = ++this.loadTokenB;
    this.el.analyzing.classList.remove('hidden');
    try {
      await this.engine.unlock();
      const buffer = await this.compare.load(
        file,
        file.name.replace(/\.[a-z0-9]+$/i, ''),
      );
      if (token !== this.loadTokenB) return;
      const fp = await analyzeBuffer(buffer);
      if (token !== this.loadTokenB) return;
      this.fingerprintB = fp;
      this.styleB = deriveStyle(fp);
      this.detectorB.reset();
      this.dynamicsB.reset();
      this.el.trackBLabel.textContent = this.compare.label || 'Track B';
      this.el.optSplit.disabled = false;
      this.applyHearMode();
      if (this.engine.playing) {
        this.compare.seek(this.engine.currentTime);
        this.compare.play();
      } else {
        this.compare.seek(this.engine.currentTime);
      }
      this.refreshSplitLabels();
      this.showToast('Track B ready — enable Split view to compare.');
    } catch {
      this.showToast("Couldn't read Track B — try an MP3, WAV, or M4A.");
    } finally {
      if (token === this.loadTokenB) this.el.analyzing.classList.add('hidden');
    }
  }

  private clearCompareTrack(): void {
    this.compare.clear();
    this.splitOn = false;
    this.hearMode = 'a';
    this.el.optSplit.checked = false;
    this.el.optSplit.disabled = true;
    this.el.trackBLabel.textContent = 'No Track B';
    this.manager?.setSplit(false);
    this.el.splitOverlay.classList.add('hidden');
    this.applyHearMode();
    this.refreshHearButtons();
    this.refreshSplitLabels();
  }

  private eject(): void {
    ++this.loadToken;
    ++this.loadTokenB;
    this.recorder.stop();
    this.demo.stop();
    this.metronome.setPlaying(false);
    this.engine.stopAll();
    this.engine.setMonitorLevel(1);
    this.clearCompareTrack();
    this.source = null;
    this.trackLabel = '';
    this.el.trackTitle.textContent = '';
    this.el.controls.classList.add('hidden');
    this.el.hero.classList.remove('hidden');
    this.el.analyzing.classList.add('hidden');
    this.el.bpmPill.classList.add('hidden');
    this.clearLoop();
    this.tapBpm = null;
    this.tapTimes = [];
    this.setHint('');
    this.refreshTrackInfo();
    this.refreshCompareAvailability();
    this.closeDrawer();
  }

  // ---------------------------------------------------------------- UI

  private enterLiveUi(): void {
    this.el.hero.classList.add('hidden');
    this.el.controls.classList.remove('hidden');
    this.el.controls.classList.remove('faded');
    this.setHint('');
    this.updatePlayButton();
    this.scheduleIdleFade();
    this.refreshCompareAvailability();
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
    if (id === 'stage') this.manager.setStageFingerprint(this.fingerprint);
    this.refreshChips();
    this.refreshSplitLabels();
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
    this.el.seekWrap.classList.toggle('hidden', !showTransport);
    if (this.source === 'mic') {
      this.syncMetroPlaying();
      return;
    }
    const playing =
      this.source === 'demo' ? this.demo.running : this.engine.playing;
    btn.textContent = playing ? '⏸' : '▶';
    this.syncMetroPlaying();
  }

  private togglePlay(): void {
    if (this.source === 'file') {
      if (this.engine.playing) {
        this.engine.pause();
        if (this.compare.loaded) this.compare.pause();
      } else {
        this.engine.play();
        if (this.compare.loaded) {
          this.compare.seek(this.engine.currentTime);
          this.compare.play();
        }
      }
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
    if (this.cleanUi) return;
    this.el.controls.classList.remove('faded');
    this.idleTimer = window.setTimeout(() => {
      if (this.source && !this.recorder.recording && !this.drawerOpen) {
        this.el.controls.classList.add('faded');
      }
    }, 3500);
  }

  // ---------------------------------------------------------------- options

  private openDrawer(section?: string): void {
    this.drawerOpen = true;
    this.el.drawer.classList.remove('hidden');
    this.el.drawer.classList.add('open');
    this.el.drawerBackdrop.classList.remove('hidden');
    this.el.controls.classList.remove('faded');
    if (section) {
      const details = this.el.drawer.querySelectorAll('details.drawer-section');
      details.forEach((d) => {
        const el = d as HTMLDetailsElement;
        const sum = el.querySelector('summary');
        el.open = !!sum && sum.textContent?.trim().toLowerCase().includes(section);
      });
    }
  }

  private closeDrawer(): void {
    this.drawerOpen = false;
    this.el.drawer.classList.add('hidden');
    this.el.drawer.classList.remove('open');
    this.el.drawerBackdrop.classList.add('hidden');
    this.scheduleIdleFade();
  }

  private toggleDrawer(): void {
    if (this.drawerOpen) this.closeDrawer();
    else this.openDrawer();
  }

  private refreshOptionsUi(): void {
    this.el.intensityRow.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.intensity === this.viewIntensity);
    });
    this.el.optMeters.checked = this.showMeters;
    this.el.optClean.checked = this.cleanUi;
    this.el.optMetro.checked = this.metroOn;
    this.el.optSplit.checked = this.splitOn;
    this.el.meters.classList.toggle('hidden', !this.showMeters);
    document.body.classList.toggle('clean-ui', this.cleanUi);
    this.el.btnOptionsFloat.classList.toggle('hidden', !this.cleanUi);
    this.refreshHearButtons();
    this.refreshLoopUi();
    this.refreshTrackInfo();
    this.refreshCompareAvailability();
    this.refreshSplitLabels();
  }

  private refreshHearButtons(): void {
    this.el.hearRow.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hear === this.hearMode);
    });
  }

  private refreshTrackInfo(): void {
    const fp = this.fingerprint;
    const hasFile = this.source === 'file';
    const bpm = hasFile ? Math.round(fp.bpm) : this.source === 'demo' ? 120 : null;
    if (bpm !== null && this.source) {
      this.el.bpmPill.textContent = `${bpm} BPM`;
      this.el.bpmPill.classList.remove('hidden');
      this.el.infoBpm.textContent = String(bpm);
    } else if (this.source === 'mic') {
      this.el.bpmPill.classList.add('hidden');
      this.el.infoBpm.textContent = '—';
    } else {
      this.el.bpmPill.classList.add('hidden');
      this.el.infoBpm.textContent = '—';
    }
    this.el.infoEnergy.textContent = levelWord(fp.energy);
    this.el.infoBass.textContent = levelWord(fp.bassRatio);
    this.el.infoBright.textContent = levelWord(fp.brightness);
    this.el.infoTap.textContent = this.tapBpm !== null ? `~${this.tapBpm}` : '—';
  }

  private refreshCompareAvailability(): void {
    const ok = this.source === 'file';
    this.el.compareControls.classList.toggle('disabled', !ok);
    this.el.compareHint.textContent = ok
      ? 'Load a second track to split the canvas. (Stage uses Track A when Split is on.)'
      : 'Compare needs a file on Track A (not mic/demo).';
    if (!ok) {
      this.el.optSplit.disabled = true;
    } else if (!this.compare.loaded) {
      this.el.optSplit.disabled = true;
    }
  }

  private refreshSplitLabels(): void {
    const splitActive = this.splitOn && this.compare.loaded;
    const stageMode = this.manager?.currentWorld === 'stage';
    // Stage keeps full-bleed (Track A dance only) — still show overlay chrome + hint
    this.el.splitOverlay.classList.toggle('hidden', !splitActive);
    this.el.splitOverlay.classList.toggle('stage-mode', splitActive && !!stageMode);
    this.el.splitLabelA.textContent = `A · ${this.trackLabel || 'Track A'}`;
    this.el.splitLabelB.textContent = stageMode
      ? 'Stage uses Track A'
      : `B · ${this.compare.label || 'Track B'}`;
  }

  private applyHearMode(): void {
    if (this.source === 'mic') {
      this.engine.setMonitorLevel(0);
      this.compare.setGain(0);
      return;
    }
    if (!this.compare.loaded) {
      this.engine.setMonitorLevel(1);
      this.compare.setGain(0);
      return;
    }
    if (this.hearMode === 'a') {
      this.engine.setMonitorLevel(1);
      this.compare.setHearMode('a');
    } else if (this.hearMode === 'b') {
      this.engine.setMonitorLevel(0);
      this.compare.setHearMode('b');
    } else {
      this.engine.setMonitorLevel(0.55);
      this.compare.setHearMode('mix');
    }
  }

  private setSplit(on: boolean): void {
    if (on && (!this.compare.loaded || this.source !== 'file')) {
      this.splitOn = false;
      this.el.optSplit.checked = false;
      return;
    }
    this.splitOn = on;
    this.manager?.setSplit(on);
    this.refreshSplitLabels();
    if (on && this.engine.playing && this.compare.loaded && !this.compare.playing) {
      this.compare.seek(this.engine.currentTime);
      this.compare.play();
    }
  }

  private syncMetroBpm(): void {
    const bpm = this.tapBpm ?? Math.round(this.fingerprint.bpm);
    this.metronome.setBpm(bpm);
  }

  private syncMetroPlaying(): void {
    const playing =
      this.source === 'file'
        ? this.engine.playing
        : this.source === 'demo'
          ? this.demo.running
          : false;
    this.metronome.setEnabled(this.metroOn);
    this.metronome.setPlaying(playing && this.metroOn);
  }

  private clearLoop(): void {
    this.loopA = null;
    this.loopB = null;
    this.refreshLoopUi();
  }

  private refreshLoopUi(): void {
    const dur = this.engine.duration;
    if (this.loopA !== null && this.loopB !== null && this.loopB > this.loopA) {
      this.el.loopStatus.textContent = `Loop ${fmt(this.loopA)} → ${fmt(this.loopB)}`;
      this.el.loopMarks.classList.remove('hidden');
      if (dur > 0) {
        this.el.loopMarkA.style.left = `${(this.loopA / dur) * 100}%`;
        this.el.loopMarkB.style.left = `${(this.loopB / dur) * 100}%`;
      }
    } else if (this.loopA !== null) {
      this.el.loopStatus.textContent = `A at ${fmt(this.loopA)} — set B`;
      this.el.loopMarks.classList.remove('hidden');
      if (dur > 0) {
        this.el.loopMarkA.style.left = `${(this.loopA / dur) * 100}%`;
        this.el.loopMarkB.style.left = `${(this.loopA / dur) * 100}%`;
      }
    } else {
      this.el.loopStatus.textContent = 'No loop';
      this.el.loopMarks.classList.add('hidden');
    }
  }

  private registerTap(): void {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter((t) => now - t < 3000);
    this.tapTimes.push(now);
    if (this.tapTimes.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      this.tapBpm = Math.round(60000 / avg);
      this.syncMetroBpm();
      this.refreshTrackInfo();
    }
  }

  private buildParams(
    time: number,
    dt: number,
    live: ReturnType<AudioDynamics['update']>,
    beat: number,
    style: DerivedStyle,
    fp: SongFingerprint,
  ): VisualParams {
    const colors = deriveLiveColors(style, live);
    const scales = intensityScales(this.viewIntensity);
    return {
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
      energy: fp.energy,
      brightness: fp.brightness,
      speed: style.speed,
      bpm: this.tapBpm ?? fp.bpm,
      bassRatio: fp.bassRatio,
      genreHint: fp.genreHint,
      colorA: colors.colorA,
      colorB: colors.colorB,
      colorC: colors.colorC,
      displaceScale: scales.displaceScale,
      cameraPull: scales.cameraPull,
    };
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

    this.el.fileInputB.addEventListener('change', () => {
      const file = this.el.fileInputB.files?.[0];
      this.el.fileInputB.value = '';
      if (file && file.type.startsWith('audio')) void this.loadTrackB(file);
      else if (file) void this.loadTrackB(file);
    });

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
    this.el.btnOptions.addEventListener('click', () => this.toggleDrawer());
    this.el.btnOptionsFloat.addEventListener('click', () => this.toggleDrawer());
    this.el.btnDrawerClose.addEventListener('click', () => this.closeDrawer());
    this.el.drawerBackdrop.addEventListener('click', () => this.closeDrawer());
    this.el.bpmPill.addEventListener('click', () => this.openDrawer('track'));

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
      if (this.compare.loaded) this.compare.seek(t);
      this.el.timeLabel.textContent = `${fmt(t)} / ${fmt(this.engine.duration)}`;
    });

    this.engine.onended = () => {
      if (this.compare.loaded) this.compare.pause();
      this.updatePlayButton();
    };

    // Display options
    this.el.intensityRow.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-intensity]');
      if (!btn?.dataset.intensity) return;
      this.viewIntensity = btn.dataset.intensity as ViewIntensity;
      this.refreshOptionsUi();
    });
    this.el.optMeters.addEventListener('change', () => {
      this.showMeters = this.el.optMeters.checked;
      this.refreshOptionsUi();
    });
    this.el.optClean.addEventListener('change', () => {
      this.cleanUi = this.el.optClean.checked;
      this.refreshOptionsUi();
    });

    // Practice
    this.el.btnLoopA.addEventListener('click', () => {
      if (this.source !== 'file') {
        this.showToast('A–B loop needs a file track.');
        return;
      }
      this.loopA = this.engine.currentTime;
      if (this.loopB !== null && this.loopB <= this.loopA) this.loopB = null;
      this.refreshLoopUi();
    });
    this.el.btnLoopB.addEventListener('click', () => {
      if (this.source !== 'file') {
        this.showToast('A–B loop needs a file track.');
        return;
      }
      const t = this.engine.currentTime;
      if (this.loopA === null) {
        this.loopA = 0;
      }
      if (t <= this.loopA) {
        this.showToast('Set B after point A.');
        return;
      }
      this.loopB = t;
      this.refreshLoopUi();
    });
    this.el.btnLoopClear.addEventListener('click', () => this.clearLoop());
    this.el.optMetro.addEventListener('change', () => {
      this.metroOn = this.el.optMetro.checked;
      this.syncMetroBpm();
      this.syncMetroPlaying();
    });
    this.el.btnTapTempo.addEventListener('click', () => this.registerTap());

    // Compare
    this.el.btnLoadB.addEventListener('click', () => this.el.fileInputB.click());
    this.el.btnClearB.addEventListener('click', () => {
      this.clearCompareTrack();
      this.showToast('Track B cleared.');
    });
    this.el.optSplit.addEventListener('change', () => {
      this.setSplit(this.el.optSplit.checked);
    });
    this.el.hearRow.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-hear]');
      if (!btn?.dataset.hear) return;
      this.hearMode = btn.dataset.hear as HearMode;
      this.applyHearMode();
      this.refreshHearButtons();
    });

    window.addEventListener('resize', () => {
      this.manager?.resize();
      this.fallback?.resize();
    });

    const wake = () => this.scheduleIdleFade();
    window.addEventListener('pointermove', wake);
    window.addEventListener('touchstart', wake, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'f' || e.key === 'F') {
        this.toggleFullscreen();
      } else if (e.key === 's' || e.key === 'S') {
        this.snapshot();
      } else if (e.key === 'o' || e.key === 'O') {
        this.toggleDrawer();
      } else if (e.key === 'Escape') {
        if (this.drawerOpen) this.closeDrawer();
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

    // A–B loop wrap
    if (
      this.source === 'file' &&
      this.engine.playing &&
      this.loopA !== null &&
      this.loopB !== null &&
      this.loopB > this.loopA &&
      this.engine.currentTime >= this.loopB
    ) {
      this.engine.seek(this.loopA);
      if (this.compare.loaded) this.compare.seek(this.loopA);
    }

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

    const live = this.dynamics.update(bass, mid, treble, volume, frame.spectrum, dt);
    const beat = this.detector.update(live.bass, live.mid, live.treble, live.volume, time, dt);
    const paramsA = this.buildParams(time, dt, live, beat, this.style, this.fingerprint);

    const splitActive = this.splitOn && this.compare.loaded && !!this.manager;
    const stageSplit = splitActive && this.manager!.currentWorld === 'stage';

    if (splitActive && !stageSplit) {
      const frameB = this.compare.getFrame(dt);
      const liveB = this.dynamicsB.update(
        frameB.bass,
        frameB.mid,
        frameB.treble,
        frameB.volume,
        frameB.spectrum,
        dt,
      );
      const beatB = this.detectorB.update(
        liveB.bass,
        liveB.mid,
        liveB.treble,
        liveB.volume,
        time,
        dt,
      );
      const paramsB = this.buildParams(
        time,
        dt,
        liveB,
        beatB,
        this.styleB,
        this.fingerprintB,
      );
      this.manager!.renderSplit(paramsA, frame.spectrum, paramsB, frameB.spectrum);
    } else if (this.manager) {
      // Stage + split: full-bleed dancer driven by Track A only (Hear A/B/Mix still works)
      this.manager.render(paramsA, frame.spectrum);
    } else {
      this.fallback?.render(paramsA, frame.spectrum);
    }

    if (this.showMeters) {
      this.el.meterBass.style.width = `${Math.round(live.bass * 100)}%`;
      this.el.meterMid.style.width = `${Math.round(live.mid * 100)}%`;
      this.el.meterTreble.style.width = `${Math.round(live.treble * 100)}%`;
    }

    this.metronome.update();

    if (this.source === 'file' && this.engine.duration > 0) {
      this.el.seekWrap.classList.remove('hidden');
      if (!this.scrubbing) {
        const pct = (this.engine.currentTime / this.engine.duration) * 1000;
        this.el.seekBar.value = String(Math.round(pct));
      }
      this.el.timeLabel.textContent = `${fmt(this.engine.currentTime)} / ${fmt(this.engine.duration)}`;
    } else if (this.source === 'mic') {
      this.el.seekWrap.classList.add('hidden');
      const lvl = Math.round(volume * 100);
      this.el.timeLabel.textContent =
        lvl > 3 ? `mic ${lvl}%` : 'mic — clap near laptop';
    } else if (this.source === 'demo') {
      this.el.seekWrap.classList.add('hidden');
      this.el.timeLabel.textContent = 'loop';
    } else {
      this.el.seekWrap.classList.add('hidden');
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

function levelWord(v: number): string {
  if (v < 0.34) return 'Low';
  if (v < 0.66) return 'Med';
  return 'High';
}
