/* =========================================================
   PENUMBRA — Personajes
   - Superviviente: assets/models/Rogue_Hooded.glb — personaje
     low-poly de KayKit (Kay Lousberg, CC0) con su textura y
     animaciones Idle / Walking_A / Running_A. Se le ocultan las
     armas y se le pone una linterna en la mano.
     Se carga con GLTFLoader y se anima con AnimationMixer.
   - Monstruo: figura alta y delgada tipo "Slenderman", toda
     negra, armada por nosotros con primitivas de Three.js
     (cilindros, cajas y esferas) en una jerarquía de pivotes
     (cadera, rodilla, hombro, codo). Su caminata se anima por
     código con senos según la velocidad.
   ========================================================= */

import * as THREE from "three";
import { GLTFLoader } from "./lib/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./lib/addons/utils/SkeletonUtils.js";

const DEFS = {
  survivor: {
    url: "assets/models/Rogue_Hooded.glb",
    height: 1.7,
    yaw: 0,
    clips: { idle: "Idle", walk: "Walking_A", run: "Running_A" },
    // el modelo trae armas que el superviviente no usa
    hide: /knife|crossbow|throwable/i,
    walkSpeed: 1.7, runSpeed: 4.0,
    clipWalkSpeed: 1.7, clipRunSpeed: 4.4,  // m/s que "recorren" los clips
  },
  monster: {
    procedural: true,
    walkSpeed: 1.5, runSpeed: 4.3,
  },
};

const loader = new GLTFLoader();
const pending = {};   // kind -> Promise
const loaded = {};    // kind -> gltf

export function loadModels(onProgress) {
  let done = 0;
  const kinds = Object.keys(DEFS).filter((k) => DEFS[k].url);
  return Promise.all(kinds.map((kind) =>
    (pending[kind] ||= loader.loadAsync(DEFS[kind].url).then((g) => (loaded[kind] = g)))
      .then(() => onProgress && onProgress(++done, kinds.length))));
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- Linterna (malla) para la mano del superviviente ---------------- */
function flashlightMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.4, metalness: 0.7 }));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.3, metalness: 0.8 }));
  head.position.y = 0.1;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0 }));
  lens.position.y = 0.126; lens.rotation.x = -Math.PI / 2;
  g.add(body, head, lens);
  return g;
}

/* ---------------- Superviviente (GLTF) ---------------- */
class GltfCharacter {
  constructor(kind) {
    const def = DEFS[kind];
    const gltf = loaded[kind];
    if (!gltf) throw new Error(`Modelo ${kind} no cargado`);
    this.kind = kind;
    this.def = def;
    this.time = 0;

    // root: posición / rotación en el mundo · pivot: corrige escala y orientación del modelo
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.model = SkeletonUtils.clone(gltf.scene);
    this.pivot.add(this.model);
    this.pivot.rotation.y = def.yaw;

    const hidden = [];
    this.model.traverse((o) => {
      if (def.hide && def.hide.test(o.name)) hidden.push(o);
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // las mallas con skinning a veces se recortan mal
    });
    hidden.forEach((o) => { o.visible = false; });

    // huesos por nombre sin prefijo (mixamorig:Spine1 -> Spine1)
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, "")] = o; });
    const sameBones = (key) => [this.bones[key], this.bones["Left" + key], this.bones["Right" + key]].filter(Boolean);
    for (const [key, k] of Object.entries(def.boneScale || {})) sameBones(key).forEach((b) => b.scale.setScalar(k));
    this.hunch = [];
    for (const [key, a] of Object.entries(def.hunch || {}))
      sameBones(key).forEach((b) => this.hunch.push([b, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a)]));
    if (def.armSpread)
      for (const [b, side] of [[this.bones.LeftArm, 1], [this.bones.RightArm, -1]])
        if (b) this.hunch.push([b, new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), side * def.armSpread)]);

    // escala a la altura deseada (sin contar lo oculto)
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.model.traverse((o) => {
      if (o.isMesh && o.visible && !hidden.some((h) => h === o || h.getObjectById(o.id))) box.expandByObject(o);
    });
    const h = box.max.y - box.min.y || 1;
    const s = def.height / h;
    this.pivot.scale.setScalar(s);
    this.pivot.position.y = -box.min.y * s;
    this.root.updateMatrixWorld(true);

    if (kind === "survivor") this.addFlashlight();

    // animaciones (si se deforma el esqueleto, sin las pistas de escala de los clips)
    if (def.boneScale && !gltf.clipsNoScale)
      gltf.clipsNoScale = gltf.animations.map((c) =>
        new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => !t.name.endsWith(".scale"))));
    const clips = def.boneScale ? gltf.clipsNoScale : gltf.animations;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, name] of Object.entries(def.clips)) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.play("idle", 0);
  }

  bone(re) {
    let found = null;
    this.model.traverse((o) => { if (!found && o.isBone && re.test(o.name)) found = o; });
    return found;
  }

  // pega una malla (construida en metros) a un hueso, compensando su escala
  attach(bone, mesh, x = 0, y = 0, z = 0) {
    if (!bone) return null;
    const ws = new THREE.Vector3();
    bone.getWorldScale(ws);
    const k = 1 / (ws.y || 1);           // unidades locales del hueso por metro
    mesh.scale.multiplyScalar(k);
    mesh.position.set(x * k, y * k, z * k);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bone.add(mesh);
    return mesh;
  }

  addFlashlight() {
    const hand = this.bone(/^handslot[._]?r$/i) || this.bone(/^hand[._]?r$/i);
    const fl = flashlightMesh();
    fl.rotation.x = Math.PI / 2;
    this.attach(hand, fl, 0, 0.02, 0.02);
  }

  play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || this.current === name) return;
    const prev = this.actions[this.current];
    next.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, true);
    else if (prev) prev.stop();
    this.current = name;
  }

  // ajusta la animación a la velocidad real para que los pies no "patinen"
  setMotion(speed) {
    const d = this.def;
    if (speed < 0.15) this.play("idle");
    else if (speed < (d.walkSpeed + d.runSpeed) / 2) {
      this.play("walk");
      this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / d.clipWalkSpeed, 0.6, 1.5);
    } else {
      this.play("run");
      this.actions.run.timeScale = THREE.MathUtils.clamp(speed / d.clipRunSpeed, 0.7, 1.4);
    }
  }

  update(dt) {
    this.mixer.update(dt);
    this.time += dt;
    // joroba encima de la pose del clip
    for (const [b, q] of this.hunch) b.quaternion.multiply(q);
  }

  dispose() { this.root.removeFromParent(); this.mixer.stopAllAction(); }
}

/* ---------------- Monstruo: Slenderman de primitivas ---------------- */
// modelo en metros, pies en y = 0, mirando hacia +Z (igual que los GLTF)
let slenderMat = null;
class SlenderCharacter {
  constructor() {
    this.kind = "monster";
    this.def = DEFS.monster;
    this.time = 0;
    this.phase = 0;   // fase del ciclo de pasos
    this.amp = 0;     // amplitud actual del balanceo (0 quieto, 1 corriendo)
    this.speed = 0;

    slenderMat ||= new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.75, metalness: 0.0 });
    const mat = slenderMat;
    const mesh = (geo, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const pivot = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    // segmento que cuelga hacia abajo desde su pivote
    const limb = (parent, len, r0, r1) =>
      mesh(new THREE.CylinderGeometry(r0, r1, len, 8).translate(0, -len / 2, 0), parent);

    this.root = new THREE.Group();

    // piernas: cadera -> rodilla (muslo y espinilla larguísimos)
    const HIP = 1.25, LEG = 0.62;
    this.legs = [-1, 1].map((side) => {
      const hip = pivot(this.root, side * 0.1, HIP, 0);
      limb(hip, LEG, 0.055, 0.045);
      const knee = pivot(hip, 0, -LEG, 0);
      limb(knee, LEG, 0.045, 0.035);
      mesh(new THREE.BoxGeometry(0.08, 0.05, 0.24), knee, 0, -LEG + 0.02, 0.06); // zapato
      return { hip, knee };
    });

    // parte de arriba (sube y baja al caminar): torso, cuello y cabeza
    this.upper = pivot(this.root, 0, HIP, 0);
    const torso = mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.78, 10), this.upper, 0, 0.39, 0);
    torso.scale.z = 0.55;
    mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8), this.upper, 0, 0.84, 0);
    this.head = pivot(this.upper, 0, 0.9, 0);
    const skull = mesh(new THREE.SphereGeometry(0.12, 16, 12), this.head, 0, 0.13, 0.01);
    skull.scale.set(0.85, 1.25, 0.95);   // cabeza alargada y sin cara

    // brazos: hombro -> codo, muy largos, con dedos finos
    const ARM = 0.56;
    this.arms = [-1, 1].map((side) => {
      const shoulder = pivot(this.upper, side * 0.23, 0.74, 0);
      shoulder.rotation.z = side * 0.06;
      limb(shoulder, ARM, 0.035, 0.03);
      const elbow = pivot(shoulder, 0, -ARM, 0);
      limb(elbow, ARM, 0.03, 0.022);
      const hand = pivot(elbow, 0, -ARM, 0);
      mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), hand, 0, -0.04, 0);
      for (let i = 0; i < 4; i++) {
        const f = mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.17, 5).translate(0, -0.085, 0),
          hand, 0, -0.07, -0.024 + i * 0.016);
        f.rotation.x = (i - 1.5) * 0.08;
        f.rotation.z = side * 0.12;
      }
      return { shoulder, elbow };
    });
  }

  setMotion(speed) { this.speed = speed; }

  update(dt) {
    this.time += dt;
    const t = this.time;
    // la amplitud sigue a la velocidad con suavizado: sin saltos al arrancar o frenar
    const target = THREE.MathUtils.clamp(this.speed / this.def.runSpeed, 0, 1);
    this.amp += (target - this.amp) * Math.min(1, dt * 6);
    // un ciclo completo (dos pasos) cada ~1.9 m: piernas largas
    this.phase += dt * this.speed * (Math.PI * 2 / 1.9);

    const a = this.amp, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const legSwing = 0.25 + a * 0.45, armSwing = 0.15 + a * 0.55;
    const moving = Math.min(1, this.speed / 0.4);

    // piernas: rotación negativa en X = hacia adelante; la rodilla se dobla al adelantar la pierna
    this.legs.forEach(({ hip, knee }, i) => {
      const k = i === 0 ? 1 : -1;
      hip.rotation.x = -s * k * legSwing * moving;
      knee.rotation.x = Math.max(0, c * k) * (0.5 + a * 0.6) * moving;
    });
    // brazos opuestos a las piernas, codos un poco doblados
    this.arms.forEach(({ shoulder, elbow }, i) => {
      const k = i === 0 ? -1 : 1;
      shoulder.rotation.x = -s * k * armSwing * moving + Math.sin(t * 0.8 + i) * 0.03;
      elbow.rotation.x = -0.12 - a * 0.5;
    });

    // rebote al pisar y algo encorvado al correr
    this.upper.position.y = 1.25 - Math.abs(c) * 0.035 * moving;
    this.upper.rotation.x = 0.04 + a * 0.18;
    // quieto: respira y ladea la cabeza despacio (inquietante)
    const idle = 1 - moving;
    this.upper.scale.y = 1 + Math.sin(t * 1.3) * 0.006;
    this.head.rotation.z = Math.sin(t * 0.35) * 0.32 * idle + Math.sin(t * 0.9) * 0.03;
    this.head.rotation.x = 0.08 - a * 0.1;
  }

  dispose() { this.root.removeFromParent(); }
}

export function createCharacter(kind) {
  return DEFS[kind].procedural ? new SlenderCharacter() : new GltfCharacter(kind);
}

export const CharacterDefs = DEFS;
