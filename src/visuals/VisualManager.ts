import * as THREE from 'three';
import type { VisualParams, WorldId } from './VisualParams';
import type { VisualWorld, WorldContext } from './VisualWorld';
import { FlowWorld } from './worlds/FlowWorld';
import { AuroraWorld } from './worlds/AuroraWorld';
import { ParticleWorld } from './worlds/ParticleWorld';
import { KaleidoscopeWorld } from './worlds/KaleidoscopeWorld';
import { WaveWorld } from './worlds/WaveWorld';
import { TunnelWorld } from './worlds/TunnelWorld';

const SPECTRUM_BINS = 64;
const HISTORY_ROWS = 64;

interface TextureLane {
  spectrumTex: THREE.DataTexture;
  spectrumData: Uint8Array;
  historyTex: THREE.DataTexture;
  historyData: Uint8Array;
  historyRow: number;
}

/**
 * Owns the WebGL renderer, spectrum/history textures (A + B for compare),
 * and the registry of lazily-created worlds.
 */
export class VisualManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  private worlds = new Map<WorldId, VisualWorld>();
  private activeId: WorldId = 'flow';
  private ctx: WorldContext;

  private laneA: TextureLane;
  private laneB: TextureLane;
  private split = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    this.laneA = createLane();
    this.laneB = createLane();

    this.ctx = {
      renderer: this.renderer,
      width: 1,
      height: 1,
      spectrumTex: this.laneA.spectrumTex,
      historyTex: this.laneA.historyTex,
      getHistoryRow: () => this.laneA.historyRow / HISTORY_ROWS,
    };

    this.resize();
    this.setWorld('flow');
  }

  private createWorld(id: WorldId): VisualWorld {
    let world: VisualWorld;
    switch (id) {
      case 'flow':
        world = new FlowWorld();
        break;
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

  setSplit(on: boolean): void {
    this.split = on;
    if (!on) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.ctx.width, this.ctx.height);
      const world = this.getWorld(this.activeId);
      world.resize(this.ctx.width, this.ctx.height);
    }
  }

  private updateLane(lane: TextureLane, spectrum: Uint8Array): void {
    const usable = Math.floor(spectrum.length * 0.5);
    const group = Math.max(1, Math.floor(usable / SPECTRUM_BINS));
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      let sum = 0;
      const base = i * group;
      for (let j = 0; j < group; j++) sum += spectrum[base + j];
      lane.spectrumData[i] = sum / group;
    }
    lane.spectrumTex.needsUpdate = true;

    lane.historyRow = (lane.historyRow + 1) % HISTORY_ROWS;
    lane.historyData.set(lane.spectrumData, lane.historyRow * SPECTRUM_BINS);
    lane.historyTex.needsUpdate = true;
  }

  private bindLane(lane: TextureLane): void {
    this.ctx.spectrumTex = lane.spectrumTex;
    this.ctx.historyTex = lane.historyTex;
    this.ctx.getHistoryRow = () => lane.historyRow / HISTORY_ROWS;
  }

  render(p: VisualParams, spectrum: Uint8Array): void {
    this.updateLane(this.laneA, spectrum);
    this.bindLane(this.laneA);
    const world = this.getWorld(this.activeId);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.ctx.width, this.ctx.height);
    world.resize(this.ctx.width, this.ctx.height);
    world.update(p, this.ctx);
    this.renderer.render(world.scene, world.camera);
  }

  renderSplit(
    paramsA: VisualParams,
    spectrumA: Uint8Array,
    paramsB: VisualParams,
    spectrumB: Uint8Array,
  ): void {
    const w = this.ctx.width;
    const h = this.ctx.height;
    const half = Math.floor(w / 2);
    const world = this.getWorld(this.activeId);

    this.renderer.setScissorTest(true);

    // Left = Track A
    this.updateLane(this.laneA, spectrumA);
    this.bindLane(this.laneA);
    this.renderer.setViewport(0, 0, half, h);
    this.renderer.setScissor(0, 0, half, h);
    world.resize(half, h);
    world.update(paramsA, this.ctx);
    this.renderer.render(world.scene, world.camera);

    // Right = Track B
    this.updateLane(this.laneB, spectrumB);
    this.bindLane(this.laneB);
    this.renderer.setViewport(half, 0, w - half, h);
    this.renderer.setScissor(half, 0, w - half, h);
    world.resize(w - half, h);
    world.update(paramsB, this.ctx);
    this.renderer.render(world.scene, world.camera);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.width = w;
    this.ctx.height = h;
    this.renderer.setSize(w, h);
    if (!this.split) {
      for (const world of this.worlds.values()) world.resize(w, h);
    }
  }

  dispose(): void {
    for (const world of this.worlds.values()) world.dispose();
    this.worlds.clear();
    disposeLane(this.laneA);
    disposeLane(this.laneB);
    this.renderer.dispose();
  }
}

function createLane(): TextureLane {
  const spectrumData = new Uint8Array(SPECTRUM_BINS);
  const spectrumTex = new THREE.DataTexture(
    spectrumData,
    SPECTRUM_BINS,
    1,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  spectrumTex.magFilter = THREE.LinearFilter;
  spectrumTex.minFilter = THREE.LinearFilter;

  const historyData = new Uint8Array(SPECTRUM_BINS * HISTORY_ROWS);
  const historyTex = new THREE.DataTexture(
    historyData,
    SPECTRUM_BINS,
    HISTORY_ROWS,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  historyTex.magFilter = THREE.LinearFilter;
  historyTex.minFilter = THREE.LinearFilter;
  historyTex.wrapT = THREE.RepeatWrapping;

  return { spectrumTex, spectrumData, historyTex, historyData, historyRow: 0 };
}

function disposeLane(lane: TextureLane): void {
  lane.spectrumTex.dispose();
  lane.historyTex.dispose();
}
