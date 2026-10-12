/* =========================================================
   PENUMBRA — Personajes (modelos GLTF animados)
   - Superviviente: assets/models/Rogue_Hooded.glb — personaje
     low-poly de KayKit (Kay Lousberg, CC0) con su textura y
     animaciones Idle / Walking_A / Running_A. Se le ocultan las
     armas y se le pone una linterna en la mano.
   - Monstruo:      assets/models/Xbot.glb (animaciones idle /
     walk / run) convertido en una abominación: se deforma su
     esqueleto (torso enorme, brazos largos, manos gigantes,
     joroba) y se le pegan a los huesos cuernos de carnero,
     seis ojos, hocico con colmillos, costillas expuestas, púas
     de hueso y garras. Piel de carne quemada con venas
     (textura, mapa emisivo y de relieve generados en <canvas>).
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
    height: 2.3,
    yaw: 0,
    clips: { idle: "idle", walk: "walk", run: "run" },
    // deforma el esqueleto (escala uniforme por hueso): torso enorme,
    // brazos largos, manos gigantes y cabeza pequeña
    boneScale: { Spine1: 1.12, Spine2: 1.25, Neck: 0.68, ForeArm: 1.18, Hand: 1.35, UpLeg: 0.95 },
    // joroba: giro extra (rad, eje X del hueso) sobre la animación
    hunch: { Spine: 0.22, Spine1: 0.38, Spine2: 0.32, Neck: -0.5, Head: -0.38 },
    armSpread: 0.4,                          // brazos colgando separados del cuerpo
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

/* ---------------- Materiales de la abominación ---------------- */
let monsterMats = null;
function monsterMaterials() {
  if (monsterMats) return monsterMats;
  const S = 1024;
  const col = document.createElement("canvas");
  const emi = document.createElement("canvas");
  const bmp = document.createElement("canvas");
  col.width = col.height = emi.width = emi.height = bmp.width = bmp.height = S;
  const x = col.getContext("2d");
  const e = emi.getContext("2d");
  const b = bmp.getContext("2d");

  // base: carne quemada y podrida, gris pardo con zonas en carne viva
  x.fillStyle = "#241a17"; x.fillRect(0, 0, S, S);
  e.fillStyle = "#000"; e.fillRect(0, 0, S, S);
  b.fillStyle = "#808080"; b.fillRect(0, 0, S, S);
  const blob = (ctx, px, py, r, c) => {
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, c); g.addColorStop(1, c.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
  };
  for (let i = 0; i < 420; i++) {
    const r = 8 + Math.random() * 70, px = Math.random() * S, py = Math.random() * S;
    const k = Math.random();
    blob(x, px, py, r, k < 0.4 ? "rgba(10,7,6,.6)" : k < 0.7 ? "rgba(58,40,32,.55)" : k < 0.88 ? "rgba(70,74,58,.4)" : "rgba(110,22,16,.55)");
    blob(b, px, py, r, k < 0.5 ? "rgba(20,20,20,.5)" : "rgba(230,230,230,.45)");
  }
  // venas: oscuras en el color, apenas brasa en el emisivo
  function vein(px, py, ang, len, w, depth) {
    for (let s = 0; s < len; s++) {
      const nx = px + Math.cos(ang) * 12, ny = py + Math.sin(ang) * 12;
      x.strokeStyle = "rgba(60,8,6,.85)"; x.lineWidth = w;
      x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      e.strokeStyle = "#b5300c"; e.lineWidth = w * 0.7;
      e.beginPath(); e.moveTo(px, py); e.lineTo(nx, ny); e.stroke();
      b.strokeStyle = "rgba(255,255,255,.8)"; b.lineWidth = w * 1.4;
      b.beginPath(); b.moveTo(px, py); b.lineTo(nx, ny); b.stroke();
      px = nx; py = ny;
      ang += (Math.random() - 0.5) * 1.1;
      w *= 0.9;
      if (depth < 2 && Math.random() < 0.18) vein(px, py, ang + (Math.random() - 0.5) * 2.4, len / 2, w, depth + 1);
    }
  }
  x.lineCap = e.lineCap = b.lineCap = "round";
  for (let i = 0; i < 40; i++) vein(Math.random() * S, Math.random() * S, Math.random() * Math.PI * 2, 8 + Math.random() * 12, 1.5 + Math.random() * 2.5, 0);
  // cicatrices y llagas
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * S, py = Math.random() * S, l = 30 + Math.random() * 70, a = Math.random() * Math.PI;
    x.strokeStyle = "rgba(120,60,50,.7)"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    b.strokeStyle = "rgba(0,0,0,.9)"; b.lineWidth = 4;
    b.beginPath(); b.moveTo(px, py); b.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); b.stroke();
    for (let k = 0; k < l; k += 9) {
      const sx = px + Math.cos(a) * k, sy = py + Math.sin(a) * k;
      x.beginPath(); x.moveTo(sx - Math.sin(a) * 6, sy + Math.cos(a) * 6); x.lineTo(sx + Math.sin(a) * 6, sy - Math.cos(a) * 6); x.stroke();
    }
  }
  for (let i = 0; i < 30; i++) {
    const px = Math.random() * S, py = Math.random() * S, r = 5 + Math.random() * 14;
    blob(x, px, py, r * 1.6, "rgba(140,30,20,.8)");
    blob(e, px, py, r, "rgba(120,30,6,.9)");
    blob(b, px, py, r, "rgba(0,0,0,.9)");
  }
  // grano
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.7;
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

  monsterMats = {
    flesh: new THREE.MeshStandardMaterial({
      map: mk(col, true), emissiveMap: mk(emi, true), emissive: 0xff4a10, emissiveIntensity: 0.6,
      bumpMap: mk(bmp, false), bumpScale: 3, roughness: 0.62, metalness: 0.05,
    }),
    joints: new THREE.MeshStandardMaterial({ color: 0x1a0d0a, roughness: 0.5 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 0.7, bumpMap: mk(bmp, false), bumpScale: 1.5 }),
    horn: new THREE.MeshStandardMaterial({ color: 0x17110e, roughness: 0.45, metalness: 0.15 }),
    teeth: new THREE.MeshStandardMaterial({ color: 0xd9cca6, roughness: 0.35 }),
    maw: new THREE.MeshStandardMaterial({ color: 0x2a0303, roughness: 0.4, emissive: 0x5a0800, emissiveIntensity: 0.8 }),
    eye: new THREE.MeshBasicMaterial({ color: 0xffd04a }),
    eyeRim: new THREE.MeshBasicMaterial({ color: 0xff2200 }),
  };
  return monsterMats;
}

// cuerno / garra curva: tubo a lo largo de una curva que se afila hasta la punta
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
        const m = monsterMaterials();
        o.material = /joint/i.test(o.name) ? m.joints : m.flesh;
      }
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

    if (kind === "monster") this.addMonsterParts();
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

  addMonsterParts() {
    const m = monsterMaterials();
    const B = this.bones;
    const head = B.Head;

    // cuernos de carnero: salen de las sienes, se enroscan hacia atrás y abajo
    for (const side of [-1, 1]) {
      const ram = new THREE.CatmullRomCurve3([
        V(0, 0, 0), V(side * 0.1, 0.08, -0.03), V(side * 0.22, 0.06, -0.13),
        V(side * 0.27, -0.06, -0.09), V(side * 0.22, -0.13, 0.04), V(side * 0.16, -0.1, 0.1),
      ]);
      this.attach(head, new THREE.Mesh(hornGeometry(ram, 0.05, 28), m.horn), side * 0.07, 0.17, 0.0);
      // cuerno recto de la frente, torcido hacia adelante
      const spike = new THREE.CatmullRomCurve3([
        V(0, 0, 0), V(side * 0.03, 0.12, 0.04), V(side * 0.06, 0.26, 0.02), V(side * 0.04, 0.38, -0.08),
      ]);
      this.attach(head, new THREE.Mesh(hornGeometry(spike, 0.03), m.horn), side * 0.04, 0.2, 0.07);
    }

    // seis ojos sin párpado, de distinto tamaño
    for (const [x, y, r] of [[0.045, 0.11, 0.022], [0.075, 0.145, 0.014], [0.03, 0.155, 0.011]]) {
      for (const side of [-1, 1]) {
        const eye = new THREE.Group();
        const rim = new THREE.Mesh(new THREE.SphereGeometry(r * 1.45, 10, 10), m.eyeRim);
        rim.scale.set(1, 0.75, 0.55);
        eye.add(rim, new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), m.eye));
        this.attach(head, eye, side * x, y, 0.16 - Math.abs(x) * 0.25);
      }
    }
    this.eyeLight = new THREE.PointLight(0xff3a10, 0.35, 1.8, 2);
    this.attach(head, this.eyeLight, 0, 0.12, 0.45);

    // hocico abierto: garganta roja, mandíbula colgando y colmillos
    const fangGeo = new THREE.ConeGeometry(0.011, 0.07, 6).translate(0, -0.035, 0);
    const maw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 12), m.maw);
    maw.scale.set(1.1, 0.7, 0.8);
    this.attach(head, maw, 0, 0.03, 0.12);
    const upper = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2;
      const f = new THREE.Mesh(fangGeo, m.teeth);
      f.position.set(Math.sin(a) * 0.085, 0, Math.cos(a) * 0.075);
      f.scale.setScalar(i === 1 || i === 7 ? 1.8 : 0.8 + Math.random() * 0.5);
      upper.add(f);
    }
    this.attach(head, upper, 0, 0.055, 0.1);
    const jaw = new THREE.Group();
    const jawBone = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.19).translate(0, 0, 0.08), m.flesh);
    jaw.add(jawBone);
    for (let i = 0; i < 8; i++) {
      const a = (i / 7 - 0.5) * 2.0;
      const f = new THREE.Mesh(fangGeo, m.teeth);
      f.rotation.x = Math.PI;
      f.position.set(Math.sin(a) * 0.075, 0.015, 0.06 + Math.cos(a) * 0.1);
      f.scale.setScalar(i === 0 || i === 7 ? 1.6 : 0.7 + Math.random() * 0.5);
      jaw.add(f);
    }
    jaw.rotation.x = 0.55;  // abierta
    this.jaw = this.attach(head, jaw, 0, 0.0, 0.05);

    // costillas expuestas sobre el pecho
    const ribGeo = (r) => new THREE.TorusGeometry(r, 0.012, 6, 20, 1.15)
      .rotateZ(Math.PI / 2 - 1.15 - 0.08).rotateX(Math.PI / 2).scale(1.25, 1, 1);
    const ribs = (bone, list) => list.forEach(([y, r, z]) => {
      for (const side of [-1, 1]) {
        const rib = new THREE.Mesh(ribGeo(r), m.bone);
        rib.scale.x = side;
        this.attach(bone, rib, 0, y, z);
      }
    });
    ribs(B.Spine2, [[0.04, 0.175, 0.01], [0.11, 0.18, 0.01]]);
    ribs(B.Spine1, [[0.04, 0.165, 0.0], [0.11, 0.17, 0.0]]);
    this.attach(B.Spine2, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.02), m.bone), 0, 0.02, 0.16);

    // púas de hueso a lo largo de la columna y en los hombros
    const spikeGeo = new THREE.ConeGeometry(0.05, 0.34, 7).translate(0, 0.17, 0);
    for (const [bone, list] of [
      [B.Neck, [[0.02, -0.08, 0.6]]],
      [B.Spine2, [[0.18, -0.16, 1], [0.08, -0.17, 1.15]]],
      [B.Spine1, [[0.12, -0.16, 0.95], [0.02, -0.15, 0.8]]],
      [B.Spine, [[0.06, -0.14, 0.65]]],
    ]) list.forEach(([y, z, k]) => {
      const sp = new THREE.Mesh(spikeGeo, m.bone);
      sp.rotation.x = -Math.PI / 2 - 0.65;
      sp.scale.setScalar(k);
      this.attach(bone, sp, 0, y, z);
    });
    for (const side of [-1, 1]) {
      [[0.16, 0.24, 0.9, 0.35], [0.21, 0.2, 0.7, 0.7], [0.12, 0.27, 0.6, 0.1]].forEach(([x, y, k, tilt]) => {
        const sp = new THREE.Mesh(spikeGeo, m.bone);
        sp.rotation.set(-0.3, 0, -side * tilt);
        sp.scale.setScalar(k);
        this.attach(B.Spine2, sp, side * x, y, -0.04);
      });
    }

    // garras largas y curvas: cuatro por mano, siguiendo los dedos
    for (const [hand, dir] of [[B.LeftHand, 1], [B.RightHand, -1]]) {
      [-0.03, -0.01, 0.01, 0.03].forEach((z, i) => {
        const len = i === 0 ? 0.16 : 0.24;
        const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(dir * len * 0.5, -0.02, 0), V(dir * len, -0.08, 0)]);
        const c = new THREE.Mesh(hornGeometry(curve, 0.014, 10, 6), m.horn);
        c.rotation.y = z * 5;
        this.attach(hand, c, dir * 0.12, -0.01, z);
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
    // joroba encima de la pose del clip
    for (const [b, q] of this.hunch) b.quaternion.multiply(q);
    if (this.kind === "monster") {
      // las venas laten, los ojos titilan y la mandíbula tiembla
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.2);
      monsterMaterials().flesh.emissiveIntensity = 0.35 + pulse * 0.5;
      if (this.eyeLight) this.eyeLight.intensity = 0.25 + pulse * 0.2 + Math.random() * 0.08;
      if (this.jaw) this.jaw.rotation.x = 0.5 + Math.sin(this.time * 9) * 0.04 + pulse * 0.12;
    }
  }

  dispose() { this.root.removeFromParent(); this.mixer.stopAllAction(); }
}

export const CharacterDefs = DEFS;
