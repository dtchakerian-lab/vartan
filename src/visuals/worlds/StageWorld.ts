import * as THREE from 'three';
import { VisualWorld } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import type { SongFingerprint } from '../../audio/types';
import { DanceConductor } from '../stage/DanceConductor';
import { createStageDancer } from '../stage/createDancer';
import type { StageClipName } from '../stage/createDancer';
import { loadMixamoDancer } from '../stage/loadMixamoDancer';
import type { MixamoDancer } from '../stage/loadMixamoDancer';
import type { MoodPackId } from '../stage/MoodPacks';

type AnyDancer = {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<StageClipName, THREE.AnimationAction>;
  hips?: THREE.Object3D | null;
  dispose: () => void;
};

/**
 * Isolated spectacle world: Mixamo dancer on a dark reactive stage.
 * Falls back to procedural hooded figure if GLBs fail to load.
 */
export class StageWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private dancer: AnyDancer | null = null;
  private loadToken = 0;
  private ready = false;
  private conductor = new DanceConductor();
  private fingerprint: SongFingerprint = {
    bpm: 120,
    energy: 0.6,
    bassRatio: 0.4,
    brightness: 0.5,
    beatRegularity: 0.5,
  };

  private keyLight!: THREE.SpotLight;
  private fillLight!: THREE.PointLight;
  private rimLight!: THREE.DirectionalLight;
  private floorMat!: THREE.MeshStandardMaterial;
  private backdropMat!: THREE.MeshBasicMaterial;
  private floor!: THREE.Mesh;
  private backdrop!: THREE.Mesh;
  private haze!: THREE.Mesh;

  private currentLoop: MoodPackId | null = null;
  private accentUntil = 0;
  private accentRestoring = false;
  private baseCamZ = 3.6;
  private baseCamY = 1.45;
  private usingMixamo = false;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 40);
    this.camera.position.set(0, this.baseCamY, this.baseCamZ);
    this.camera.lookAt(0, 1.05, 0);
  }

  init(_ctx: WorldContext): void {
    this.scene.background = new THREE.Color(0x050508);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.08);

    const amb = new THREE.AmbientLight(0x1a1528, 0.4);
    this.scene.add(amb);

    this.keyLight = new THREE.SpotLight(0xaa88ff, 32, 20, Math.PI / 5, 0.45, 1.15);
    this.keyLight.position.set(1.8, 4.4, 2.6);
    this.keyLight.target.position.set(0, 1.0, 0);
    this.scene.add(this.keyLight, this.keyLight.target);

    this.fillLight = new THREE.PointLight(0x22ddcc, 7, 12, 2);
    this.fillLight.position.set(-2.4, 1.9, 1.6);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xff6688, 1.6);
    this.rimLight.position.set(-1.6, 2.6, -3.2);
    this.scene.add(this.rimLight);

    this.floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a12,
      metalness: 0.85,
      roughness: 0.25,
      emissive: new THREE.Color(0x110822),
      emissiveIntensity: 0.35,
    });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.65, 64),
      new THREE.MeshBasicMaterial({
        color: 0x7c5cff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.scene.add(ring);

    this.backdropMat = new THREE.MeshBasicMaterial({
      color: 0x12081f,
      transparent: true,
      opacity: 0.9,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), this.backdropMat);
    this.backdrop.position.set(0, 2.4, -3.2);
    this.scene.add(this.backdrop);

    this.haze = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshBasicMaterial({
        color: 0x6644aa,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      }),
    );
    this.haze.position.set(0, 1.6, -1.5);
    this.scene.add(this.haze);

    void this.bootDancer();
  }

  setFingerprint(fp: SongFingerprint): void {
    this.fingerprint = { ...fp };
    this.conductor.setFingerprint(fp);
  }

  update(p: VisualParams, _ctx: WorldContext): void {
    if (p.bpm > 0) {
      this.fingerprint = {
        ...this.fingerprint,
        bpm: p.bpm,
        energy: p.energy,
        bassRatio: p.bassRatio,
        brightness: p.brightness,
        genreHint: p.genreHint,
      };
    }

    const state = this.conductor.update(p, this.fingerprint, p.time);

    if (this.ready && this.dancer) {
      if (this.currentLoop !== state.loop && p.time >= this.accentUntil) {
        this.crossfadeLoop(state.loop);
      }

      if (state.accent && p.time >= this.accentUntil) {
        this.fireAccent(state.accent, p.time);
      }

      if (this.accentRestoring && p.time >= this.accentUntil) {
        this.accentRestoring = false;
        if (this.currentLoop) {
          this.dancer.actions[this.currentLoop].setEffectiveWeight(1);
        }
      }

      this.dancer.mixer.timeScale = state.timeScale;
      this.dancer.mixer.update(p.dt);
      this.leashHips();
    }

    this.keyLight.color.copy(p.colorA);
    this.keyLight.intensity = 20 + state.punch * 24 + p.liveEnergy * 12;
    this.fillLight.color.copy(p.colorC);
    this.fillLight.intensity = 4 + p.treble * 9 + state.punch * 6;
    this.rimLight.color.copy(p.colorB);
    this.rimLight.intensity = 0.9 + p.bass * 1.5 + state.punch * 1.3;

    this.floorMat.emissive.copy(p.colorA).multiplyScalar(0.25 + state.punch * 0.55);
    this.floorMat.emissiveIntensity = 0.25 + p.bass * 0.55 + state.punch * 0.75;

    this.backdropMat.color.copy(p.colorB).multiplyScalar(0.35 + p.liveEnergy * 0.25);
    (this.haze.material as THREE.MeshBasicMaterial).color.copy(p.colorA);
    (this.haze.material as THREE.MeshBasicMaterial).opacity =
      0.05 + p.liveEnergy * 0.12 + state.punch * 0.1;

    const pull = 1 - state.punch * 0.14 * p.cameraPull;
    this.camera.position.z = this.baseCamZ * pull;
    this.camera.position.y = this.baseCamY + state.punch * 0.05;
    this.camera.position.x = Math.sin(p.time * 0.12) * 0.12;
    this.camera.lookAt(0, 1.0 + p.bass * 0.06, 0);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.loadToken++;
    this.conductor.reset();
    this.dancer?.dispose();
    this.dancer = null;
    this.ready = false;
    this.floor.geometry.dispose();
    this.floorMat.dispose();
    this.backdrop.geometry.dispose();
    this.backdropMat.dispose();
    this.haze.geometry.dispose();
    (this.haze.material as THREE.Material).dispose();
    this.scene.clear();
  }

  private async bootDancer(): Promise<void> {
    const token = ++this.loadToken;
    try {
      const mixamo = await loadMixamoDancer(`${import.meta.env.BASE_URL}stage/`);
      if (token !== this.loadToken) {
        mixamo.dispose();
        return;
      }
      this.attachDancer(mixamo, true);
    } catch (err) {
      console.warn('[Stage] Mixamo load failed, using procedural dancer', err);
      if (token !== this.loadToken) return;
      const procedural = createStageDancer();
      this.attachDancer(procedural, false);
    }
  }

  private attachDancer(dancer: AnyDancer | MixamoDancer, mixamo: boolean): void {
    if (this.dancer) {
      this.scene.remove(this.dancer.root);
      this.dancer.dispose();
    }
    this.dancer = dancer;
    this.usingMixamo = mixamo;
    this.scene.add(dancer.root);
    this.ready = true;
    this.playLoop('groove');
    this.conductor.setFingerprint(this.fingerprint);
  }

  /** Keep dancer on stage while allowing side-to-side / bob from the clip. */
  private leashHips(): void {
    const hips = this.dancer?.hips;
    if (!hips || !this.usingMixamo) return;
    // Meter-scale Mixamo: small leash so they don't walk off the platform
    hips.position.x = THREE.MathUtils.clamp(hips.position.x, -0.7, 0.7);
    hips.position.z = THREE.MathUtils.clamp(hips.position.z, -0.55, 0.55);
  }

  private playLoop(name: MoodPackId): void {
    if (!this.dancer) return;
    const action = this.dancer.actions[name];
    if (!action) return;
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    this.currentLoop = name;
  }

  private crossfadeLoop(name: MoodPackId): void {
    if (!this.dancer || this.currentLoop === name) return;
    const next = this.dancer.actions[name];
    const prev = this.currentLoop ? this.dancer.actions[this.currentLoop] : null;
    if (!next) return;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, 0.45, false);
    }
    this.currentLoop = name;
  }

  private fireAccent(name: StageClipName, timeSec: number): void {
    if (!this.dancer) return;
    const action = this.dancer.actions[name];
    if (!action) return;

    const loop = this.currentLoop ? this.dancer.actions[this.currentLoop] : null;
    if (loop) loop.setEffectiveWeight(0.4);

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(0.06);
    action.play();

    const dur = action.getClip().duration / Math.max(0.55, this.dancer.mixer.timeScale);
    // Accents can be long Mixamo takes — cap interrupt window
    this.accentUntil = timeSec + Math.min(1.1, dur * 0.55);
    this.accentRestoring = true;
  }
}
