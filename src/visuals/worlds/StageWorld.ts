import * as THREE from 'three';
import { VisualWorld } from '../VisualWorld';
import type { WorldContext } from '../VisualWorld';
import type { VisualParams } from '../VisualParams';
import type { SongFingerprint } from '../../audio/types';
import { DanceConductor } from '../stage/DanceConductor';
import { createStageDancer } from '../stage/createDancer';
import type { StageClipName, StageDancer } from '../stage/createDancer';
import type { MoodPackId } from '../stage/MoodPacks';

/**
 * Isolated spectacle world: hooded dancer on a dark reactive stage.
 * Does not share geometry with shader worlds.
 */
export class StageWorld extends VisualWorld {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private dancer: StageDancer | null = null;
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
  private baseCamZ = 3.4;
  private baseCamY = 1.35;

  constructor() {
    super();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    this.camera.position.set(0, this.baseCamY, this.baseCamZ);
    this.camera.lookAt(0, 1.1, 0);
  }

  init(_ctx: WorldContext): void {
    this.scene.background = new THREE.Color(0x050508);
    this.scene.fog = new THREE.FogExp2(0x050508, 0.085);

    const amb = new THREE.AmbientLight(0x1a1528, 0.35);
    this.scene.add(amb);

    this.keyLight = new THREE.SpotLight(0xaa88ff, 28, 18, Math.PI / 5, 0.45, 1.2);
    this.keyLight.position.set(1.6, 4.2, 2.4);
    this.keyLight.target.position.set(0, 1.1, 0);
    this.scene.add(this.keyLight, this.keyLight.target);

    this.fillLight = new THREE.PointLight(0x22ddcc, 6, 10, 2);
    this.fillLight.position.set(-2.2, 1.8, 1.5);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xff6688, 1.4);
    this.rimLight.position.set(-1.5, 2.5, -3);
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
    this.floor.position.y = 0;
    this.scene.add(this.floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.72, 64),
      new THREE.MeshBasicMaterial({
        color: 0x7c5cff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
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

    this.dancer = createStageDancer();
    this.scene.add(this.dancer.root);
    this.playLoop('groove');
  }

  /** Call when track fingerprint (or demo defaults) change. */
  setFingerprint(fp: SongFingerprint): void {
    this.fingerprint = { ...fp };
    this.conductor.setFingerprint(fp);
  }

  update(p: VisualParams, _ctx: WorldContext): void {
    // Keep fingerprint in sync with live params when app pushes bpm fields
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

    if (this.dancer) {
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
    }

    // Lights follow palette + punch
    this.keyLight.color.copy(p.colorA);
    this.keyLight.intensity = 18 + state.punch * 22 + p.liveEnergy * 10;
    this.fillLight.color.copy(p.colorC);
    this.fillLight.intensity = 4 + p.treble * 8 + state.punch * 6;
    this.rimLight.color.copy(p.colorB);
    this.rimLight.intensity = 0.8 + p.bass * 1.4 + state.punch * 1.2;

    this.floorMat.emissive.copy(p.colorA).multiplyScalar(0.25 + state.punch * 0.55);
    this.floorMat.emissiveIntensity = 0.25 + p.bass * 0.5 + state.punch * 0.7;

    this.backdropMat.color.copy(p.colorB).multiplyScalar(0.35 + p.liveEnergy * 0.25);
    (this.haze.material as THREE.MeshBasicMaterial).color.copy(p.colorA);
    (this.haze.material as THREE.MeshBasicMaterial).opacity =
      0.05 + p.liveEnergy * 0.1 + state.punch * 0.08;

    // Camera punch on hits
    const pull = 1 - state.punch * 0.12 * p.cameraPull;
    this.camera.position.z = this.baseCamZ * pull;
    this.camera.position.y = this.baseCamY + state.punch * 0.04;
    this.camera.position.x = Math.sin(p.time * 0.15) * 0.08;
    this.camera.lookAt(0, 1.05 + p.bass * 0.05, 0);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.conductor.reset();
    this.dancer?.dispose();
    this.dancer = null;
    this.floor.geometry.dispose();
    this.floorMat.dispose();
    this.backdrop.geometry.dispose();
    this.backdropMat.dispose();
    this.haze.geometry.dispose();
    (this.haze.material as THREE.Material).dispose();
    this.scene.clear();
  }

  private playLoop(name: MoodPackId): void {
    if (!this.dancer) return;
    const action = this.dancer.actions[name];
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    this.currentLoop = name;
  }

  private crossfadeLoop(name: MoodPackId): void {
    if (!this.dancer || this.currentLoop === name) return;
    const next = this.dancer.actions[name];
    const prev = this.currentLoop ? this.dancer.actions[this.currentLoop] : null;
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, 0.35, false);
    }
    this.currentLoop = name;
  }

  private fireAccent(name: StageClipName, timeSec: number): void {
    if (!this.dancer) return;
    const action = this.dancer.actions[name];
    if (!action) return;

    const loop = this.currentLoop ? this.dancer.actions[this.currentLoop] : null;
    if (loop) loop.setEffectiveWeight(0.45);

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.fadeIn(0.04);
    action.play();

    const dur = action.getClip().duration / Math.max(0.55, this.dancer.mixer.timeScale);
    this.accentUntil = timeSec + dur * 0.9;
    this.accentRestoring = true;
  }
}
