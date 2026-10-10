/* =========================================================
   PENUMBRA — Personajes (modelos GLTF animados)
   - Superviviente: assets/models/Soldier.glb (texturas propias,
     animaciones Idle / Walk / Run).
   - Monstruo:      assets/models/Xbot.glb (animaciones idle /
     walk / run) + textura de piel podrida generada en <canvas>
     y ojos emisivos pegados al hueso de la cabeza.
   Se cargan con GLTFLoader (Three.js) y se animan con
   AnimationMixer, mezclando clips con crossFade.
   ========================================================= */

import * as THREE from "three";
import { GLTFLoader } from "./lib/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./lib/addons/utils/SkeletonUtils.js";

const DEFS = {
  survivor: {
    url: "assets/models/Soldier.glb",
    height: 1.75,
    yaw: Math.PI,          // el modelo mira hacia -Z; lo giramos a +Z
    walkSpeed: 1.7, runSpeed: 4.0,
    clipWalkSpeed: 1.6, clipRunSpeed: 4.2,  // m/s que "recorren" los clips
  },
  monster: {
    url: "assets/models/Xbot.glb",
    height: 2.2,
    yaw: 0,
    stretch: { x: 0.92, z: 0.92 },          // más alto y delgado
    walkSpeed: 1.5, runSpeed: 4.3,
    clipWalkSpeed: 1.5, clipRunSpeed: 4.0,
  },
};

const loader = new GLTFLoader();
const pending = {};   // kind -> Promise
const loaded = {};    // kind -> gltf

export function loadModels(onProgress) {
  let done = 0;
  const kinds = Object.keys(DEFS);
  return Promise.all(kinds.map((kind) =>
    (pending[kind] ||= loader.loadAsync(DEFS[kind].url).then((g) => (loaded[kind] = g)))
      .then(() => onProgress && onProgress(++done, kinds.length))));
}

/* ---------------- Textura procedural del monstruo ---------------- */
let monsterMats = null;
function monsterMaterials() {
  if (monsterMats) return monsterMats;
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");

  // base: piel gris verdosa, enferma
  x.fillStyle = "#8a8670"; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const r = 10 + Math.random() * 70;
    const px = Math.random() * S, py = Math.random() * S;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const pick = Math.random();
    const col = pick < 0.45 ? "120,104,80" : pick < 0.75 ? "70,78,62" : "130,52,46";
    g.addColorStop(0, `rgba(${col},.55)`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // venas
  x.lineCap = "round";
  for (let v = 0; v < 70; v++) {
    let px = Math.random() * S, py = Math.random() * S;
    let ang = Math.random() * Math.PI * 2;
    x.strokeStyle = Math.random() < 0.6 ? "rgba(110,20,24,.55)" : "rgba(30,40,70,.45)";
    x.lineWidth = 1 + Math.random() * 2.5;
    x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 14; s++) {
      ang += (Math.random() - 0.5) * 0.9;
      px += Math.cos(ang) * 18; py += Math.sin(ang) * 18;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // llagas y costras
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * S, py = Math.random() * S, r = 4 + Math.random() * 14;
    x.fillStyle = "rgba(60,8,8,.85)";
    x.beginPath(); x.ellipse(px, py, r, r * (0.5 + Math.random()), Math.random() * 3, 0, Math.PI * 2); x.fill();
    x.fillStyle = "rgba(150,120,60,.35)";
    x.beginPath(); x.arc(px - r * 0.2, py - r * 0.2, r * 0.35, 0, Math.PI * 2); x.fill();
  }
  // grano
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);

  const skin = new THREE.CanvasTexture(c);
  skin.colorSpace = THREE.SRGBColorSpace;
  skin.wrapS = skin.wrapT = THREE.RepeatWrapping;
  skin.repeat.set(2, 2);
  skin.anisotropy = 4;

  monsterMats = {
    surface: new THREE.MeshStandardMaterial({ map: skin, roughness: 0.72, metalness: 0.0, color: 0xffffff }),
    joints: new THREE.MeshStandardMaterial({ map: skin, roughness: 0.55, metalness: 0.0, color: 0xa0584c }),
    eye: new THREE.MeshBasicMaterial({ color: 0xff2a14 }),
  };
  return monsterMats;
}

/* ---------------- Personaje ---------------- */
export class Character {
  constructor(kind) {
    const def = DEFS[kind];
    const gltf = loaded[kind];
    if (!gltf) throw new Error(`Modelo ${kind} no cargado`);
    this.kind = kind;
    this.def = def;

    // root: posición / rotación en el mundo · pivot: corrige escala y orientación del modelo
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.model = SkeletonUtils.clone(gltf.scene);
    this.pivot.add(this.model);
    this.pivot.rotation.y = def.yaw;

    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // las mallas con skinning a veces se recortan mal
      if (kind === "monster") {
        const m = monsterMaterials();
        o.material = /joint/i.test(o.name) ? m.joints : m.surface;
      }
    });

    // escala a la altura deseada
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const h = box.max.y - box.min.y || 1;
    const s = def.height / h;
    this.pivot.scale.set(s * (def.stretch?.x || 1), s, s * (def.stretch?.z || 1));
    this.pivot.position.y = -box.min.y * s;

    if (kind === "monster") this.addEyes();

    // animaciones
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase();
      if (["idle", "walk", "run"].includes(key)) this.actions[key] = this.mixer.clipAction(clip);
    }
    this.current = null;
    this.play("idle", 0);
  }

  addEyes() {
    let head = null;
    this.model.traverse((o) => { if (o.isBone && /head$/i.test(o.name)) head = o; });
    if (!head) return;
    const m = monsterMaterials();
    // el hueso está en las unidades internas del modelo: k = unidades locales por metro
    this.root.updateMatrixWorld(true);
    const wsc = new THREE.Vector3();
    head.getWorldScale(wsc);
    const k = 1 / (wsc.y || 1);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022 * k, 10, 10), m.eye);
      eye.position.set(side * 0.035 * k, 0.09 * k, 0.085 * k);
      head.add(eye);
    }
    const glow = new THREE.PointLight(0xff2a14, 0.6, 1.4, 2);
    glow.position.set(0, 0.09 * k, 0.2 * k);
    head.add(glow);
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

  update(dt) { this.mixer.update(dt); }

  dispose() { this.root.removeFromParent(); this.mixer.stopAllAction(); }
}

export const CharacterDefs = DEFS;
