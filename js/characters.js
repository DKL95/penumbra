/* =========================================================
   PENUMBRA — Personajes (modelos GLTF animados)
   - Superviviente: assets/models/Rogue_Hooded.glb — personaje
     low-poly de KayKit (Kay Lousberg, CC0) con su textura y
     animaciones Idle / Walking_A / Running_A. Se le ocultan las
     armas y se le pone una linterna en la mano.
   - Monstruo:      assets/models/Xbot.glb (animaciones idle /
     walk / run) convertido en demonio: piel carbonizada con
     grietas de lava (textura + mapa emisivo generados en
     <canvas>), cuernos, garras, púas y ojos ardientes pegados
     a los huesos del esqueleto.
   Se cargan con GLTFLoader (Three.js) y se animan con
   AnimationMixer, mezclando clips con crossFade.
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
    url: "assets/models/Xbot.glb",
    height: 2.25,
    yaw: 0,
    stretch: { x: 0.92, z: 0.92 },          // más alto y delgado
    clips: { idle: "idle", walk: "walk", run: "run" },
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

/* ---------------- Materiales del demonio ---------------- */
let demonMats = null;
function demonMaterials() {
  if (demonMats) return demonMats;
  const S = 1024;
  const col = document.createElement("canvas");
  const emi = document.createElement("canvas");
  col.width = col.height = emi.width = emi.height = S;
  const x = col.getContext("2d");
  const e = emi.getContext("2d");

  // base: piel quemada, rojo sangre muy oscuro
  x.fillStyle = "#3a0d0a"; x.fillRect(0, 0, S, S);
  e.fillStyle = "#000"; e.fillRect(0, 0, S, S);
  for (let i = 0; i < 320; i++) {
    const r = 10 + Math.random() * 80;
    const px = Math.random() * S, py = Math.random() * S;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const c = Math.random() < 0.55 ? "12,4,4" : Math.random() < 0.5 ? "92,22,14" : "60,14,10";
    g.addColorStop(0, `rgba(${c},.6)`);
    g.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }

  // grietas de lava: se dibujan igual en color y en el mapa emisivo
  function crack(px, py, ang, len, w, depth) {
    for (let s = 0; s < len; s++) {
      const nx = px + Math.cos(ang) * 14, ny = py + Math.sin(ang) * 14;
      x.strokeStyle = "rgba(255,120,40,.9)"; x.lineWidth = w;
      x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      e.strokeStyle = "#ff5a14"; e.lineWidth = w * 1.6;
      e.beginPath(); e.moveTo(px, py); e.lineTo(nx, ny); e.stroke();
      e.strokeStyle = "#ffd27a"; e.lineWidth = Math.max(0.6, w * 0.4);
      e.beginPath(); e.moveTo(px, py); e.lineTo(nx, ny); e.stroke();
      px = nx; py = ny;
      ang += (Math.random() - 0.5) * 0.8;
      w *= 0.93;
      if (depth < 2 && Math.random() < 0.12) crack(px, py, ang + (Math.random() - 0.5) * 2, len / 2, w, depth + 1);
    }
  }
  x.lineCap = e.lineCap = "round";
  for (let i = 0; i < 46; i++) crack(Math.random() * S, Math.random() * S, Math.random() * Math.PI * 2, 10 + Math.random() * 14, 2 + Math.random() * 3, 0);

  // costras negras encima
  for (let i = 0; i < 90; i++) {
    const px = Math.random() * S, py = Math.random() * S, r = 6 + Math.random() * 22;
    x.fillStyle = "rgba(6,2,2,.7)";
    x.beginPath(); x.ellipse(px, py, r, r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, Math.PI * 2); x.fill();
  }
  // grano
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n; d[i + 1] += n * 0.5; d[i + 2] += n * 0.5;
  }
  x.putImageData(img, 0, 0);

  const mk = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2);
    t.anisotropy = 4;
    return t;
  };
  const skin = mk(col, true), glow = mk(emi, true);

  demonMats = {
    surface: new THREE.MeshStandardMaterial({
      map: skin, emissiveMap: glow, emissive: 0xff3a0a, emissiveIntensity: 1.4,
      roughness: 0.7, metalness: 0.1,
    }),
    joints: new THREE.MeshStandardMaterial({ color: 0x120606, roughness: 0.32, metalness: 0.4 }),
    horn: new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.38, metalness: 0.25 }),
    hornTip: new THREE.MeshStandardMaterial({ color: 0x5a0f08, roughness: 0.3, emissive: 0x3a0500 }),
    spike: new THREE.MeshStandardMaterial({ color: 0x2a0806, roughness: 0.35, metalness: 0.2, emissive: 0x6a0e02, emissiveIntensity: 0.8 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffc23a }),
    eyeRim: new THREE.MeshBasicMaterial({ color: 0xff2a00 }),
  };
  return demonMats;
}

// cuerno curvo: tubo a lo largo de una curva que se afila hasta la punta
function hornGeometry(curve, r0, tubular = 18, radial = 10) {
  const g = new THREE.TubeGeometry(curve, tubular, r0, radial, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, c);
    const k = 1 - t * 0.94;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

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

/* ---------------- Personaje ---------------- */
export class Character {
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
      if (kind === "monster") {
        const m = demonMaterials();
        o.material = /joint/i.test(o.name) ? m.joints : m.surface;
      }
    });
    hidden.forEach((o) => { o.visible = false; });

    // escala a la altura deseada (sin contar lo oculto)
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.model.traverse((o) => {
      if (o.isMesh && o.visible && !hidden.some((h) => h === o || h.getObjectById(o.id))) box.expandByObject(o);
    });
    const h = box.max.y - box.min.y || 1;
    const s = def.height / h;
    this.pivot.scale.set(s * (def.stretch?.x || 1), s, s * (def.stretch?.z || 1));
    this.pivot.position.y = -box.min.y * s;
    this.root.updateMatrixWorld(true);

    if (kind === "monster") this.addDemonParts();
    if (kind === "survivor") this.addFlashlight();

    // animaciones
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, name] of Object.entries(def.clips)) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
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

  addDemonParts() {
    const m = demonMaterials();
    const head = this.bone(/head$/i);

    // cuernos: salen de la frente, se abren y se curvan hacia atrás
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(side * 0.08, 0.08, 0.02),
        new THREE.Vector3(side * 0.17, 0.18, -0.04),
        new THREE.Vector3(side * 0.19, 0.3, -0.15),
        new THREE.Vector3(side * 0.13, 0.37, -0.26),
      ]);
      const horn = new THREE.Mesh(hornGeometry(curve, 0.042), m.horn);
      this.attach(head, horn, side * 0.055, 0.15, 0.05);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), m.hornTip);
      tip.position.copy(curve.getPointAt(1));
      horn.add(tip);
    }

    // ojos ardientes: núcleo amarillo con halo rojo
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), m.eye);
      const rim = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), m.eyeRim);
      rim.scale.set(1.25, 0.6, 0.5);
      eye.add(rim, core);
      eye.rotation.z = side * -0.35;   // ojos rasgados hacia arriba
      this.attach(head, eye, side * 0.042, 0.1, 0.165);
    }
    this.eyeLight = new THREE.PointLight(0xff4a10, 0.5, 2.2, 2);
    this.attach(head, this.eyeLight, 0, 0.1, 0.45);

    // púas en la espalda
    // la base del cono en el origen, para que la púa salga de la piel
    const spikeGeo = new THREE.ConeGeometry(0.04, 0.24, 6).translate(0, 0.12, 0);
    for (const [re, list] of [
      [/spine2$/i, [[0.03, -0.15], [0.14, -0.14]]],
      [/spine1$/i, [[0.05, -0.15]]],
      [/spine$/i, [[0.05, -0.14]]],
    ]) {
      const b = this.bone(re);
      list.forEach(([y, z], i) => {
        const sp = new THREE.Mesh(spikeGeo, m.spike);
        sp.rotation.x = -Math.PI / 2 - 0.5;   // hacia atrás y un poco arriba
        sp.scale.setScalar(1 - i * 0.15);
        this.attach(b, sp, 0, y, z);
      });
    }

    // garras: tres por mano, a lo largo del eje de los dedos
    const clawGeo = new THREE.ConeGeometry(0.014, 0.15, 6).translate(0, 0.075, 0);
    for (const [re, dir] of [[/lefthand$/i, 1], [/righthand$/i, -1]]) {
      const hand = this.bone(re);
      [-0.022, 0, 0.022].forEach((z) => {
        const c = new THREE.Mesh(clawGeo, m.spike);
        c.rotation.z = -dir * Math.PI / 2;      // apuntar hacia los dedos (±X local)
        c.rotation.y = z * 4;
        this.attach(hand, c, dir * 0.15, -0.01, z);
      });
    }
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
    if (this.kind === "monster") {
      // la lava "respira" y los ojos titilan
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.2);
      demonMaterials().surface.emissiveIntensity = 0.9 + pulse * 1.1;
      if (this.eyeLight) this.eyeLight.intensity = 0.4 + pulse * 0.3 + Math.random() * 0.1;
    }
  }

  dispose() { this.root.removeFromParent(); this.mixer.stopAllAction(); }
}

export const CharacterDefs = DEFS;
