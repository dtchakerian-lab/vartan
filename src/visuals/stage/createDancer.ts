import * as THREE from 'three';
import type { AccentId, MoodPackId } from './MoodPacks';

export type StageClipName = MoodPackId | AccentId;

export interface StageDancer {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<StageClipName, THREE.AnimationAction>;
  dispose: () => void;
}

const MAT = {
  body: 0x0c0c12,
  trim: 0x1a1a24,
  hood: 0x08080e,
};

/**
 * Cool hooded silhouette dancer — Tool-stage energy, no celebrity likeness.
 * Hierarchy is animated via AnimationMixer (Mixamo-swap friendly naming).
 */
export function createStageDancer(): StageDancer {
  const root = new THREE.Group();
  root.name = 'dancer';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: MAT.body,
    roughness: 0.92,
    metalness: 0.08,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: MAT.trim,
    roughness: 0.85,
    metalness: 0.15,
  });
  const hoodMat = new THREE.MeshStandardMaterial({
    color: MAT.hood,
    roughness: 1,
    metalness: 0,
  });

  const hips = part('hips');
  const spine = part('spine');
  const chest = part('chest');
  const neck = part('neck');
  const head = part('head');
  const hood = part('hood');

  const armLU = part('armLU');
  const armLL = part('armLL');
  const armRU = part('armRU');
  const armRL = part('armRL');
  const handL = part('handL');
  const handR = part('handR');

  const legLU = part('legLU');
  const legLL = part('legLL');
  const legRU = part('legRU');
  const legRL = part('legRL');
  const footL = part('footL');
  const footR = part('footR');

  root.add(hips);
  hips.add(spine);
  spine.add(chest);
  chest.add(neck);
  neck.add(head);
  head.add(hood);
  chest.add(armLU, armRU);
  armLU.add(armLL);
  armLL.add(handL);
  armRU.add(armRL);
  armRL.add(handR);
  hips.add(legLU, legRU);
  legLU.add(legLL);
  legLL.add(footL);
  legRU.add(legRL);
  legRL.add(footR);

  // Rest pose offsets
  hips.position.set(0, 1.02, 0);
  spine.position.set(0, 0.12, 0);
  chest.position.set(0, 0.28, 0);
  neck.position.set(0, 0.22, 0);
  head.position.set(0, 0.14, 0.02);
  hood.position.set(0, 0.06, -0.02);

  armLU.position.set(0.22, 0.16, 0);
  armLL.position.set(0, -0.32, 0);
  handL.position.set(0, -0.28, 0);
  armRU.position.set(-0.22, 0.16, 0);
  armRL.position.set(0, -0.32, 0);
  handR.position.set(0, -0.28, 0);

  legLU.position.set(0.1, -0.05, 0);
  legLL.position.set(0, -0.42, 0);
  footL.position.set(0, -0.4, 0.04);
  legRU.position.set(-0.1, -0.05, 0);
  legRL.position.set(0, -0.42, 0);
  footR.position.set(0, -0.4, 0.04);

  // Slight natural arm hang
  armLU.rotation.z = 0.18;
  armRU.rotation.z = -0.18;

  // Geometry
  hips.add(box(0.28, 0.14, 0.16, bodyMat, 0, 0, 0));
  spine.add(box(0.2, 0.22, 0.12, bodyMat, 0, 0.1, 0));
  chest.add(box(0.36, 0.32, 0.18, bodyMat, 0, 0.05, 0));
  chest.add(box(0.38, 0.08, 0.2, trimMat, 0, -0.1, 0)); // belt band
  neck.add(box(0.1, 0.12, 0.1, bodyMat, 0, 0.04, 0));

  // Hooded head — void face (no features)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), hoodMat);
  skull.scale.set(1, 1.05, 0.95);
  head.add(skull);
  const cowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65),
    hoodMat,
  );
  cowl.rotation.x = 0.35;
  cowl.position.set(0, 0.02, -0.02);
  hood.add(cowl);
  const hoodPeak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), hoodMat);
  hoodPeak.rotation.x = -0.9;
  hoodPeak.position.set(0, 0.12, -0.12);
  hood.add(hoodPeak);

  armLU.add(box(0.09, 0.3, 0.09, bodyMat, 0, -0.14, 0));
  armLL.add(box(0.075, 0.28, 0.075, bodyMat, 0, -0.12, 0));
  handL.add(box(0.08, 0.08, 0.1, trimMat, 0, -0.02, 0.02));
  armRU.add(box(0.09, 0.3, 0.09, bodyMat, 0, -0.14, 0));
  armRL.add(box(0.075, 0.28, 0.075, bodyMat, 0, -0.12, 0));
  handR.add(box(0.08, 0.08, 0.1, trimMat, 0, -0.02, 0.02));

  legLU.add(box(0.12, 0.4, 0.12, bodyMat, 0, -0.18, 0));
  legLL.add(box(0.1, 0.38, 0.1, bodyMat, 0, -0.16, 0));
  footL.add(box(0.12, 0.06, 0.22, trimMat, 0, -0.02, 0.04));
  legRU.add(box(0.12, 0.4, 0.12, bodyMat, 0, -0.18, 0));
  legRL.add(box(0.1, 0.38, 0.1, bodyMat, 0, -0.16, 0));
  footR.add(box(0.12, 0.06, 0.22, trimMat, 0, -0.02, 0.04));

  const clips = buildClips();
  const mixer = new THREE.AnimationMixer(root);
  const actions = {} as Record<StageClipName, THREE.AnimationAction>;
  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    const name = clip.name as StageClipName;
    if (name === 'hit' || name === 'jump' || name === 'headbang') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    actions[name] = action;
  }

  const materials = [bodyMat, trimMat, hoodMat];
  return {
    root,
    mixer,
    actions,
    dispose: () => {
      mixer.stopAllAction();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      for (const m of materials) m.dispose();
    },
  };
}

function part(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function q(x: number, y: number, z: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
}

function quatTrack(
  path: string,
  times: number[],
  keys: THREE.Quaternion[],
): THREE.QuaternionKeyframeTrack {
  const values: number[] = [];
  for (const k of keys) values.push(k.x, k.y, k.z, k.w);
  return new THREE.QuaternionKeyframeTrack(path, times, values);
}

function posTrack(
  path: string,
  times: number[],
  keys: THREE.Vector3[],
): THREE.VectorKeyframeTrack {
  const values: number[] = [];
  for (const k of keys) values.push(k.x, k.y, k.z);
  return new THREE.VectorKeyframeTrack(path, times, values);
}

function buildClips(): THREE.AnimationClip[] {
  const t4 = [0, 0.25, 0.5, 0.75, 1];
  const t2 = [0, 0.5, 1];

  const sway = new THREE.AnimationClip('sway', 1, [
    quatTrack(
      'hips.quaternion',
      t4,
      [q(0, 0, 0.06), q(0, 0, -0.06), q(0, 0, 0.06), q(0, 0, -0.06), q(0, 0, 0.06)],
    ),
    quatTrack(
      'spine.quaternion',
      t4,
      [q(0, 0.08, 0), q(0, -0.08, 0), q(0, 0.08, 0), q(0, -0.08, 0), q(0, 0.08, 0)],
    ),
    quatTrack(
      'chest.quaternion',
      t4,
      [q(0.04, 0.05, 0), q(0.02, -0.05, 0), q(0.04, 0.05, 0), q(0.02, -0.05, 0), q(0.04, 0.05, 0)],
    ),
    quatTrack(
      'armLU.quaternion',
      t4,
      [q(0.1, 0, 0.25), q(0.05, 0, 0.2), q(0.1, 0, 0.25), q(0.05, 0, 0.2), q(0.1, 0, 0.25)],
    ),
    quatTrack(
      'armRU.quaternion',
      t4,
      [q(0.1, 0, -0.25), q(0.05, 0, -0.2), q(0.1, 0, -0.25), q(0.05, 0, -0.2), q(0.1, 0, -0.25)],
    ),
    quatTrack(
      'legLU.quaternion',
      t2,
      [q(0.04, 0, 0.02), q(-0.02, 0, 0.02), q(0.04, 0, 0.02)],
    ),
    quatTrack(
      'legRU.quaternion',
      t2,
      [q(-0.02, 0, -0.02), q(0.04, 0, -0.02), q(-0.02, 0, -0.02)],
    ),
    posTrack(
      'hips.position',
      t2,
      [
        new THREE.Vector3(0, 1.02, 0),
        new THREE.Vector3(0, 1.035, 0),
        new THREE.Vector3(0, 1.02, 0),
      ],
    ),
  ]);

  const groove = new THREE.AnimationClip('groove', 1, [
    posTrack(
      'hips.position',
      t4,
      [
        new THREE.Vector3(0, 1.0, 0),
        new THREE.Vector3(0, 1.06, 0),
        new THREE.Vector3(0, 1.0, 0),
        new THREE.Vector3(0, 1.06, 0),
        new THREE.Vector3(0, 1.0, 0),
      ],
    ),
    quatTrack(
      'hips.quaternion',
      t4,
      [q(0.05, 0.1, 0), q(-0.02, -0.1, 0), q(0.05, 0.1, 0), q(-0.02, -0.1, 0), q(0.05, 0.1, 0)],
    ),
    quatTrack(
      'chest.quaternion',
      t4,
      [q(0.08, 0.12, 0), q(0.02, -0.12, 0), q(0.08, 0.12, 0), q(0.02, -0.12, 0), q(0.08, 0.12, 0)],
    ),
    quatTrack(
      'armLU.quaternion',
      t4,
      [q(0.35, 0.1, 0.4), q(0.15, -0.1, 0.35), q(0.35, 0.1, 0.4), q(0.15, -0.1, 0.35), q(0.35, 0.1, 0.4)],
    ),
    quatTrack(
      'armLL.quaternion',
      t4,
      [q(0.4, 0, 0), q(0.15, 0, 0), q(0.4, 0, 0), q(0.15, 0, 0), q(0.4, 0, 0)],
    ),
    quatTrack(
      'armRU.quaternion',
      t4,
      [q(0.15, -0.1, -0.35), q(0.35, 0.1, -0.4), q(0.15, -0.1, -0.35), q(0.35, 0.1, -0.4), q(0.15, -0.1, -0.35)],
    ),
    quatTrack(
      'armRL.quaternion',
      t4,
      [q(0.15, 0, 0), q(0.4, 0, 0), q(0.15, 0, 0), q(0.4, 0, 0), q(0.15, 0, 0)],
    ),
    quatTrack(
      'legLU.quaternion',
      t4,
      [q(0.25, 0, 0.05), q(-0.05, 0, 0.05), q(0.25, 0, 0.05), q(-0.05, 0, 0.05), q(0.25, 0, 0.05)],
    ),
    quatTrack(
      'legLL.quaternion',
      t4,
      [q(0.35, 0, 0), q(0.05, 0, 0), q(0.35, 0, 0), q(0.05, 0, 0), q(0.35, 0, 0)],
    ),
    quatTrack(
      'legRU.quaternion',
      t4,
      [q(-0.05, 0, -0.05), q(0.25, 0, -0.05), q(-0.05, 0, -0.05), q(0.25, 0, -0.05), q(-0.05, 0, -0.05)],
    ),
    quatTrack(
      'legRL.quaternion',
      t4,
      [q(0.05, 0, 0), q(0.35, 0, 0), q(0.05, 0, 0), q(0.35, 0, 0), q(0.05, 0, 0)],
    ),
    quatTrack(
      'head.quaternion',
      t4,
      [q(0.05, 0.15, 0), q(0.02, -0.15, 0), q(0.05, 0.15, 0), q(0.02, -0.15, 0), q(0.05, 0.15, 0)],
    ),
  ]);

  const bounce = new THREE.AnimationClip('bounce', 1, [
    posTrack(
      'hips.position',
      t4,
      [
        new THREE.Vector3(0, 0.96, 0),
        new THREE.Vector3(0, 1.12, 0),
        new THREE.Vector3(0, 0.96, 0),
        new THREE.Vector3(0, 1.12, 0),
        new THREE.Vector3(0, 0.96, 0),
      ],
    ),
    quatTrack(
      'hips.quaternion',
      t4,
      [q(0.12, 0, 0), q(-0.08, 0, 0), q(0.12, 0, 0), q(-0.08, 0, 0), q(0.12, 0, 0)],
    ),
    quatTrack(
      'chest.quaternion',
      t4,
      [q(0.15, 0.2, 0), q(-0.05, -0.2, 0), q(0.15, 0.2, 0), q(-0.05, -0.2, 0), q(0.15, 0.2, 0)],
    ),
    quatTrack(
      'armLU.quaternion',
      t4,
      [q(0.6, 0.2, 0.7), q(0.2, -0.3, 0.5), q(0.6, 0.2, 0.7), q(0.2, -0.3, 0.5), q(0.6, 0.2, 0.7)],
    ),
    quatTrack(
      'armRU.quaternion',
      t4,
      [q(0.2, -0.3, -0.5), q(0.6, 0.2, -0.7), q(0.2, -0.3, -0.5), q(0.6, 0.2, -0.7), q(0.2, -0.3, -0.5)],
    ),
    quatTrack(
      'armLL.quaternion',
      t2,
      [q(0.7, 0, 0), q(0.2, 0, 0), q(0.7, 0, 0)],
    ),
    quatTrack(
      'armRL.quaternion',
      t2,
      [q(0.2, 0, 0), q(0.7, 0, 0), q(0.2, 0, 0)],
    ),
    quatTrack(
      'legLU.quaternion',
      t4,
      [q(0.45, 0, 0.08), q(-0.1, 0, 0.08), q(0.45, 0, 0.08), q(-0.1, 0, 0.08), q(0.45, 0, 0.08)],
    ),
    quatTrack(
      'legLL.quaternion',
      t4,
      [q(0.7, 0, 0), q(0.1, 0, 0), q(0.7, 0, 0), q(0.1, 0, 0), q(0.7, 0, 0)],
    ),
    quatTrack(
      'legRU.quaternion',
      t4,
      [q(-0.1, 0, -0.08), q(0.45, 0, -0.08), q(-0.1, 0, -0.08), q(0.45, 0, -0.08), q(-0.1, 0, -0.08)],
    ),
    quatTrack(
      'legRL.quaternion',
      t4,
      [q(0.1, 0, 0), q(0.7, 0, 0), q(0.1, 0, 0), q(0.7, 0, 0), q(0.1, 0, 0)],
    ),
  ]);

  const stomp = new THREE.AnimationClip('stomp', 1, [
    posTrack(
      'hips.position',
      t4,
      [
        new THREE.Vector3(0, 0.98, 0),
        new THREE.Vector3(0, 1.08, 0),
        new THREE.Vector3(0, 0.94, 0),
        new THREE.Vector3(0, 1.08, 0),
        new THREE.Vector3(0, 0.98, 0),
      ],
    ),
    quatTrack(
      'hips.quaternion',
      t4,
      [q(0.1, 0.18, 0), q(0.02, -0.18, 0), q(0.18, 0.1, 0), q(0.02, -0.18, 0), q(0.1, 0.18, 0)],
    ),
    quatTrack(
      'chest.quaternion',
      t4,
      [q(0.2, 0.15, 0.05), q(0.05, -0.2, -0.05), q(0.25, 0.1, 0), q(0.05, -0.2, -0.05), q(0.2, 0.15, 0.05)],
    ),
    quatTrack(
      'head.quaternion',
      t4,
      [q(0.25, 0.1, 0), q(0.05, -0.15, 0), q(0.35, 0.05, 0), q(0.05, -0.15, 0), q(0.25, 0.1, 0)],
    ),
    quatTrack(
      'armLU.quaternion',
      t4,
      [q(0.5, 0.3, 0.5), q(0.9, -0.2, 0.3), q(0.4, 0.4, 0.6), q(0.9, -0.2, 0.3), q(0.5, 0.3, 0.5)],
    ),
    quatTrack(
      'armRU.quaternion',
      t4,
      [q(0.9, 0.2, -0.3), q(0.4, -0.4, -0.6), q(0.9, 0.2, -0.3), q(0.5, -0.3, -0.5), q(0.9, 0.2, -0.3)],
    ),
    quatTrack(
      'legLU.quaternion',
      t4,
      [q(0.5, 0, 0.1), q(0.05, 0, 0.1), q(0.55, 0, 0.12), q(0.05, 0, 0.1), q(0.5, 0, 0.1)],
    ),
    quatTrack(
      'legLL.quaternion',
      t4,
      [q(0.55, 0, 0), q(0.08, 0, 0), q(0.65, 0, 0), q(0.08, 0, 0), q(0.55, 0, 0)],
    ),
    quatTrack(
      'legRU.quaternion',
      t4,
      [q(0.05, 0, -0.1), q(0.5, 0, -0.1), q(0.05, 0, -0.1), q(0.55, 0, -0.12), q(0.05, 0, -0.1)],
    ),
    quatTrack(
      'legRL.quaternion',
      t4,
      [q(0.08, 0, 0), q(0.55, 0, 0), q(0.08, 0, 0), q(0.65, 0, 0), q(0.08, 0, 0)],
    ),
  ]);

  const hit = new THREE.AnimationClip('hit', 0.4, [
    quatTrack(
      'chest.quaternion',
      [0, 0.12, 0.4],
      [q(0, 0, 0), q(-0.25, 0.15, 0), q(0, 0, 0)],
    ),
    quatTrack(
      'armLU.quaternion',
      [0, 0.1, 0.4],
      [q(0.2, 0, 0.3), q(1.1, 0.2, 0.2), q(0.2, 0, 0.3)],
    ),
    quatTrack(
      'armRU.quaternion',
      [0, 0.1, 0.4],
      [q(0.2, 0, -0.3), q(1.1, -0.2, -0.2), q(0.2, 0, -0.3)],
    ),
    quatTrack(
      'head.quaternion',
      [0, 0.12, 0.4],
      [q(0, 0, 0), q(0.2, 0, 0), q(0, 0, 0)],
    ),
  ]);

  const jump = new THREE.AnimationClip('jump', 0.5, [
    posTrack(
      'hips.position',
      [0, 0.15, 0.3, 0.5],
      [
        new THREE.Vector3(0, 1.02, 0),
        new THREE.Vector3(0, 1.35, 0),
        new THREE.Vector3(0, 1.15, 0),
        new THREE.Vector3(0, 1.02, 0),
      ],
    ),
    quatTrack(
      'armLU.quaternion',
      [0, 0.15, 0.5],
      [q(0.2, 0, 0.3), q(-0.4, 0, 0.8), q(0.2, 0, 0.3)],
    ),
    quatTrack(
      'armRU.quaternion',
      [0, 0.15, 0.5],
      [q(0.2, 0, -0.3), q(-0.4, 0, -0.8), q(0.2, 0, -0.3)],
    ),
    quatTrack(
      'legLU.quaternion',
      [0, 0.15, 0.5],
      [q(0.1, 0, 0.05), q(0.6, 0, 0.1), q(0.1, 0, 0.05)],
    ),
    quatTrack(
      'legRU.quaternion',
      [0, 0.15, 0.5],
      [q(0.1, 0, -0.05), q(0.6, 0, -0.1), q(0.1, 0, -0.05)],
    ),
  ]);

  const headbang = new THREE.AnimationClip('headbang', 0.45, [
    quatTrack(
      'head.quaternion',
      [0, 0.12, 0.25, 0.45],
      [q(0, 0, 0), q(0.7, 0, 0), q(-0.15, 0, 0), q(0, 0, 0)],
    ),
    quatTrack(
      'chest.quaternion',
      [0, 0.12, 0.25, 0.45],
      [q(0, 0, 0), q(0.35, 0, 0), q(-0.05, 0, 0), q(0, 0, 0)],
    ),
    quatTrack(
      'spine.quaternion',
      [0, 0.12, 0.45],
      [q(0, 0, 0), q(0.2, 0, 0), q(0, 0, 0)],
    ),
  ]);

  return [sway, groove, bounce, stomp, hit, jump, headbang];
}
