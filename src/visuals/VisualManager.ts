import * as THREE from 'three';
import type { VisualParams, WorldId } from './VisualParams';
import type { VisualWorld, WorldContext } from './VisualWorld';
import { AuroraWorld } from './worlds/AuroraWorld';
import { ParticleWorld } from './worlds/ParticleWorld';
import { KaleidoscopeWorld } from './worlds/KaleidoscopeWorld';
import { WaveWorld } from './worlds/WaveWorld';
import { TunnelWorld } from './worlds/TunnelWorld';
import { AlbumWorld } from './worlds/AlbumWorld';

const SPECTRUM_BINS = 64;
const HISTORY_ROWS = 64;

/**
 * Owns the WebGL renderer, shared spectrum/history textures,
 * and the registry of lazily-created worlds.
 */
export class VisualManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  private worlds = new Map<WorldId, VisualWorld>();
  private activeId: WorldId = 'particles';
  private ctx: WorldContext;

  private spectrumTex: THREE.DataTexture;
  private spectrumData: Uint8Array;
  private historyTex: THREE.DataTexture;
  private historyData: Uint8Array;
  private historyRow = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // snapshots
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.spectrumData = new Uint8Array(SPECTRUM_BINS);
    this.spectrumTex = new THREE.DataTexture(
      this.spectrumData,
      SPECTRUM_BINS,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.spectrumTex.magFilter = THREE.LinearFilter;
    this.spectrumTex.minFilter = THREE.LinearFilter;

    this.historyData = new Uint8Array(SPECTRUM_BINS * HISTORY_ROWS);
    this.historyTex = new THREE.DataTexture(
      this.historyData,
      SPECTRUM_BINS,
      HISTORY_ROWS,
      THREE.RedFormat,
      THREE.UnsignedByteType,
    );
    this.historyTex.magFilter = THREE.LinearFilter;
    this.historyTex.minFilter = THREE.LinearFilter;
    this.historyTex.wrapT = THREE.RepeatWrapping;

    this.ctx = {
      renderer: this.renderer,
      width: 1,
      height: 1,
      spectrumTex: this.spectrumTex,
      historyTex: this.historyTex,
      getHistoryRow: () => this.historyRow / HISTORY_ROWS,
    };

    this.resize();
  }

  private createWorld(id: WorldId): VisualWorld {
    let world: VisualWorld;
    switch (id) {
      case 'aurora':
        world = new AuroraWorld();
        break;
      case 'particles':
        world = new ParticleWorld();
        break;
      case 'kaleidoscope':
        world = new KaleidoscopeWorld();
        break;
      case 'waves':
        world = new WaveWorld();
        break;
      case 'tunnel':
        world = new TunnelWorld();
        break;
      case 'album':
        world = new AlbumWorld();
        break;
    }
    world.init(this.ctx);
    world.resize(this.ctx.width, this.ctx.height);
    return world;
  }

  private getWorld(id: WorldId): VisualWorld {
    let world = this.worlds.get(id);
    if (!world) {
      world = this.createWorld(id);
      this.worlds.set(id, world);
    }
    return world;
  }

  setWorld(id: WorldId): void {
    this.activeId = id;
    this.getWorld(id);
  }

  get currentWorld(): WorldId {
    return this.activeId;
  }

  get albumWorld(): AlbumWorld {
    return this.getWorld('album') as AlbumWorld;
  }

  /** Push this frame's spectrum into the shared textures. */
  private updateTextures(spectrum: Uint8Array): void {
    // Group the useful lower half of FFT bins into SPECTRUM_BINS buckets.
    const usable = Math.floor(spectrum.length * 0.5);
    const group = Math.max(1, Math.floor(usable / SPECTRUM_BINS));
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      let sum = 0;
      const base = i * group;
      for (let j = 0; j < group; j++) sum += spectrum[base + j];
      this.spectrumData[i] = sum / group;
    }
    this.spectrumTex.needsUpdate = true;

    this.historyRow = (this.historyRow + 1) % HISTORY_ROWS;
    this.historyData.set(this.spectrumData, this.historyRow * SPECTRUM_BINS);
    this.historyTex.needsUpdate = true;
  }

  render(p: VisualParams, spectrum: Uint8Array): void {
    this.updateTextures(spectrum);
    const world = this.getWorld(this.activeId);
    world.update(p, this.ctx);
    this.renderer.render(world.scene, world.camera);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.width = w;
    this.ctx.height = h;
    this.renderer.setSize(w, h);
    for (const world of this.worlds.values()) world.resize(w, h);
  }

  dispose(): void {
    for (const world of this.worlds.values()) world.dispose();
    this.worlds.clear();
    this.renderer.dispose();
  }
}
