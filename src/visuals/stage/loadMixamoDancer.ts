import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AccentId, MoodPackId } from './MoodPacks';
import { CHARACTER_FILE, CLIP_FILES } from './MoodPacks';

export type StageClipName = MoodPackId | AccentId;

export interface MixamoDancer {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<StageClipName, THREE.AnimationAction>;
  hips: THREE.Object3D | null;
  dispose: () => void;
}

const ALL_CLIPS: StageClipName[] = [
  'sway',
  'groove',
  'bounce',
  'stomp',
  'hit',
  'jump',
  'headbang',
];

/**
 * Load Mixamo "The Boss" + dance clips. Animations are armature-only GLBs
 * retargeted onto the character via shared mixamorig bone names.
 */
export async function loadMixamoDancer(baseUrl = './stage/'): Promise<MixamoDancer> {
  const loader = new GLTFLoader();
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const character = await loader.loadAsync(`${prefix}${CHARACTER_FILE}`);
  const root = character.scene;
  root.name = 'mixamoDancer';

  // This GLB is already ~meter scale (hips ~0.96m). Do NOT apply Mixamo's old 0.01 cm→m scale.
  root.scale.setScalar(1);
  root.position.set(0, 0, 0);
  root.rotation.y = Math.PI; // face camera

  styleCharacter(root);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {} as Record<StageClipName, THREE.AnimationAction>;

  await Promise.all(
    ALL_CLIPS.map(async (id) => {
      const gltf = await loader.loadAsync(`${prefix}${CLIP_FILES[id]}`);
      const src = gltf.animations[0];
      if (!src) throw new Error(`No animation in ${CLIP_FILES[id]}`);
      const clip = src.clone();
      clip.name = id;
      const action = mixer.clipAction(clip);
      if (id === 'hit' || id === 'jump' || id === 'headbang') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      actions[id] = action;
    }),
  );

  const hips =
    root.getObjectByName('mixamorig:Hips') ??
    root.getObjectByName('mixamorig_Hips') ??
    null;

  return {
    root,
    mixer,
    actions,
    hips,
    dispose: () => {
      mixer.stopAllAction();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}

/** Dark stage look — cool silhouette without celebrity likeness. */
function styleCharacter(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      mat.color.multiplyScalar(0.55);
      mat.metalness = Math.min(1, mat.metalness + 0.15);
      mat.roughness = Math.max(0.4, mat.roughness * 0.85);
      mat.emissive = new THREE.Color(0x0a0814);
      mat.envMapIntensity = 0.5;
      mat.needsUpdate = true;
    }
  });
}
