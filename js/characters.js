/* =========================================================
   PENUMBRA — Personajes
   - Superviviente: assets/models/Rogue_Hooded.glb — personaje
     low-poly de KayKit (Kay Lousberg, CC0) con su textura y
     animaciones Idle / Walking_A / Running_A. Se le ocultan las
     armas y se le pone una linterna en la mano.
     Se carga con GLTFLoader y se anima con AnimationMixer.
   - Monstruo: js/monsters.js. Cuatro tipos a elegir (carnicero,
     slasher, demonio y llorona), armados con primitivas sobre una
     jerarquía de pivotes y animados por código.
   - Personalización (Rules.LOOK, js/look.js): color de la ropa
     del superviviente, tipo, color y ojos del monstruo y un accesorio
     en la cabeza hecho con primitivas. Cada personaje la aplica
     con setLook(look), también en vivo (vista previa).
   ========================================================= */

import * as THREE from "three";
import { GLTFLoader } from "./lib/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "./lib/addons/utils/SkeletonUtils.js";
import { MonsterCharacter } from "./monsters.js";

const DEFS = {
  survivor: {
    url: "assets/models/Rogue_Hooded.glb",
    height: 1.7,
    yaw: 0,
    clips: { idle: "Idle", walk: "Walking_A", run: "Running_A" },
    // el modelo trae armas que el superviviente no usa
    hide: /knife|crossbow|throwable/i,
    // mallas cuya tela verde cambia de color con la personalización (ver clothTint)
    tint: /^Rogue_/,
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

/* ---------------- Accesorios de cabeza (personalización) ----------------
   Hechos en metros para una cabeza de 0.25 m de ancho. El origen es la
   coronilla (centro de la parte de arriba de la cabeza), +Y arriba y +Z
   hacia el frente; la máscara usa como origen el frente de la cara. */
const HAT_W = 0.25;
function hatMesh(id) {
  if (!id || id === "ninguno") return null;
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (id === "copa") {
    const felt = new THREE.MeshStandardMaterial({ color: 0x18171a, roughness: 0.85 });
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 24), felt, 0, 0.008, 0);           // ala
    add(new THREE.CylinderGeometry(0.105, 0.112, 0.2, 24), felt, 0, 0.115, 0);           // copa
    add(new THREE.CylinderGeometry(0.114, 0.114, 0.032, 24),
      new THREE.MeshStandardMaterial({ color: 0x6b1510, roughness: 0.6 }), 0, 0.034, 0);  // listón
  } else if (id === "corona") {
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a13a, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
    add(new THREE.CylinderGeometry(0.115, 0.12, 0.06, 24, 1, true), gold, 0, 0.03, 0);   // aro
    const gem = new THREE.MeshStandardMaterial({ color: 0xb01818, emissive: 0x500808, roughness: 0.2 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.025, 0.07, 6), gold, Math.sin(a) * 0.115, 0.095, Math.cos(a) * 0.115);
      add(new THREE.SphereGeometry(0.012, 8, 6), gem, Math.sin(a) * 0.122, 0.03, Math.cos(a) * 0.122);
    }
  } else if (id === "cuernos") {
    const horn = new THREE.MeshStandardMaterial({ color: 0xd9cfb6, roughness: 0.55 });
    for (const side of [-1, 1]) {
      // base y punta en dos tramos para que se curven hacia afuera y atrás
      const base = new THREE.Group();
      base.position.set(side * 0.075, -0.02, -0.01);
      base.rotation.set(-0.35, 0, -side * 0.55);
      g.add(base);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.1, 10).translate(0, 0.05, 0), horn);
      b.castShadow = true;
      base.add(b);
      const tip = new THREE.Group();
      tip.position.y = 0.095;
      tip.rotation.set(-0.45, 0, -side * 0.6);
      base.add(tip);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.1, 10).translate(0, 0.05, 0), horn);
      t.castShadow = true;
      tip.add(t);
    }
  } else if (id === "mascara") {
    // máscara de porcelana con ojos huecos y una grieta
    const bone = new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.45, side: THREE.DoubleSide });
    const face = add(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), bone, 0, 0, -0.03);
    face.rotation.x = Math.PI / 2;
    face.scale.set(0.9, 0.5, 1.2);
    const dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
    for (const side of [-1, 1]) {
      const eye = add(new THREE.SphereGeometry(0.018, 10, 8), dark, side * 0.035, 0.02, 0.019);
      eye.scale.set(1.2, 0.8, 0.5);
    }
    add(new THREE.BoxGeometry(0.004, 0.06, 0.004), new THREE.MeshBasicMaterial({ color: 0x5a1010 }), 0.02, -0.04, 0.021)
      .rotation.z = 0.4;
  }
  return g;
}

/* ---------------- Color de la tela del superviviente ----------------
   El modelo usa una sola textura (atlas) para tela, piel y cuero.
   Multiplicar todo por un color oscurecería también la cara, así que
   un pequeño cambio al shader detecta los texeles verdes (la tela) y
   los pinta del color elegido conservando sus luces y sombras. */
function clothTint(material) {
  const u = { uTint: { value: new THREE.Color(1, 1, 1) }, uTintOn: { value: 0 } };
  material.userData.tint = u;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uTint;\nuniform float uTintOn;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float green = c.g - max(c.r, c.b);                 // cuánto domina el verde
          float mask = smoothstep(0.015, 0.06, green) * uTintOn;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          float tl = max(dot(uTint, vec3(0.299, 0.587, 0.114)), 0.04);
          vec3 dyed = clamp(uTint * (lum / tl) * 1.15, 0.0, 1.0);
          diffuseColor.rgb = mix(c, dyed, mask);
        }`);
  };
  material.customProgramCacheKey = () => "penumbra-cloth-tint";
  return u;
}

/* ---------------- Superviviente (GLTF) ---------------- */
class GltfCharacter {
  constructor(kind, look) {
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

    // cabeza en reposo (antes de animar): caja y pose del hueso, para colocar accesorios
    this.headBone = this.bone(/^head$/i);
    const headMesh = this.model.getObjectByName("Rogue_Head_Hooded");
    this.headBox = headMesh ? new THREE.Box3().expandByObject(headMesh) : null;
    if (this.headBone) {
      const rel = new THREE.Matrix4().copy(this.root.matrixWorld).invert().multiply(this.headBone.matrixWorld);
      this.headRest = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
      rel.decompose(this.headRest.p, this.headRest.q, this.headRest.s);
    }

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
    this.setLook(look);
  }

  // aplica la personalización (se puede llamar otra vez para cambiarla en vivo)
  setLook(look) {
    const L = Rules.sanitizeLook(look);
    if (this.def.tint) {
      const c = Rules.lookColor(L, "survivorColor");
      this.model.traverse((o) => {
        if (!o.isMesh || !this.def.tint.test(o.name)) return;
        // material propio: los clones de SkeletonUtils comparten el del modelo original
        if (!o.userData.ownMat) { o.material = o.material.clone(); clothTint(o.material); o.userData.ownMat = true; }
        const u = o.material.userData.tint;
        u.uTintOn.value = c == null ? 0 : 1;
        if (c != null) u.uTint.value.set(c);
      });
    }
    this.setHat(L.hat);
  }

  setHat(id) {
    if (this.hat) { this.hat.removeFromParent(); this.hat = null; }
    const mesh = hatMesh(id);
    if (!mesh || !this.headBone || !this.headRest || !this.headBox) return;
    // punto objetivo en el espacio del personaje (metros): coronilla o frente de la cara
    const b = this.headBox, size = new THREE.Vector3();
    b.getSize(size);
    const k = (size.x * 0.82) / HAT_W;          // la capucha es más ancha que la cabeza
    const target = id === "mascara"
      ? new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + size.y * 0.42, b.max.z - size.z * 0.12)
      : new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - size.y * 0.08, (b.min.z + b.max.z) / 2);
    // de espacio del personaje a espacio local del hueso (derecho en la pose de reposo)
    const { p, q, s } = this.headRest;
    const qi = q.clone().invert();
    mesh.position.copy(target.sub(p).applyQuaternion(qi)).divide(s);
    mesh.quaternion.copy(qi);
    mesh.scale.set(k / s.x, k / s.y, k / s.z);
    this.headBone.add(mesh);
    this.hat = mesh;
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

/* ---------------- Monstruo: ver js/monsters.js ----------------
   modelo en metros, pies en y = 0, mirando hacia +Z (igual que los GLTF) */

// look: personalización del jugador dueño del personaje (Rules.LOOK)
export function createCharacter(kind, look) {
  return DEFS[kind].procedural ? new MonsterCharacter(look, hatMesh) : new GltfCharacter(kind, look);
}

export const CharacterDefs = DEFS;
