/* =========================================================
   PENUMBRA — Monstruos (personalizables)
   Todos están armados con primitivas de Three.js sobre el mismo
   esqueleto de pivotes (cadera → rodilla, hombro → codo → mano,
   torso y cabeza), así que comparten la animación de caminar:
     · carnicero  altísimo y encorvado, boca de colmillos, costillas
                  expuestas, mandil manchado, garras y machete.
     · slasher    asesino corpulento con overol, máscara blanca sin
                  expresión y un cuchillo de cocina. Camina rígido.
     · demonio    piel rojo oscuro, cuernos enormes, alas de
                  murciélago, cola con punta, pezuñas y garras.
     · llorona    mujer fantasma con vestido blanco desgarrado y el
                  cabello negro sobre la cara. Flota sin hacer ruido
                  con los brazos estirados hacia ti.
   El tipo, el color, los ojos y el accesorio salen de Rules.LOOK;
   setLook() cambia todo en vivo (si cambia el tipo, se rearma).
   ========================================================= */

import * as THREE from "three";

const TYPE_SKIN = { carnicero: 0x050505, slasher: 0x222a36, demonio: 0x3a0806, llorona: 0xc9d2d6 };

/* ---------------- materiales compartidos (no cambian con la piel) ---------------- */
let matsCache = null;
function blotchTexture(base, stain, seed) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`;
    x.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  x.fillStyle = stain;
  for (let i = 0; i < 22; i++) {
    const px = rnd() * 256, py = 40 + rnd() * 216, r = 6 + rnd() * 26;
    x.beginPath(); x.ellipse(px, py, r, r * (0.6 + rnd()), rnd() * 3, 0, Math.PI * 2); x.fill();
    x.fillRect(px - 2, py, 4, 20 + rnd() * 60);         // chorreado hacia abajo
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mats() {
  if (matsCache) return matsCache;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  matsCache = {
    flesh:   std({ color: 0x5a0d0a, roughness: 0.35, emissive: 0x1a0000 }),
    gore:    std({ color: 0x1e0202, roughness: 0.3 }),
    blood:   std({ color: 0x5c0000, roughness: 0.18, metalness: 0.1 }),
    bone:    std({ color: 0xd6ccb4, roughness: 0.6 }),
    teeth:   std({ color: 0xe0d6b0, roughness: 0.35 }),
    blade:   std({ color: 0x9a9c9e, roughness: 0.25, metalness: 0.9 }),
    cleaver: std({ color: 0x6e645a, roughness: 0.55, metalness: 0.75 }),
    rust:    std({ color: 0x5a3018, roughness: 0.9, metalness: 0.4 }),
    wood:    std({ color: 0x2e1f14, roughness: 0.85 }),
    black:   std({ color: 0x0b0b0c, roughness: 0.8 }),
    leather: std({ color: 0x1c1410, roughness: 0.7 }),
    mask:    std({ color: 0xe8e4da, roughness: 0.55 }),
    hair:    std({ color: 0x050506, roughness: 0.6, side: THREE.DoubleSide }),
    horn:    std({ color: 0x1a1210, roughness: 0.45 }),
    wing:    std({ color: 0x2a0606, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    dress:   std({ color: 0xe9edf0, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.86,
                   emissive: 0x2a3540, emissiveIntensity: 0.6 }),
    apron:   std({ map: blotchTexture("#3b3128", "rgba(90,6,4,.85)", 7), roughness: 0.9, side: THREE.DoubleSide }),
    coverall: null,     // usa la piel personalizada (ver slasher)
  };
  return matsCache;
}

/* ---------------- herramientas para armar ---------------- */
function kit(skin) {
  const add = (m, parent, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const mesh = (geo, parent, x = 0, y = 0, z = 0) => add(new THREE.Mesh(geo, skin), parent, x, y, z);
  const part = (geo, material, parent, x = 0, y = 0, z = 0) => add(new THREE.Mesh(geo, material), parent, x, y, z);
  const pivot = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  // segmento que cuelga hacia abajo desde su pivote
  const limb = (parent, len, r0, r1, material = skin) =>
    part(new THREE.CylinderGeometry(r0, r1, len, 8).translate(0, -len / 2, 0), material, parent);
  return { mesh, part, pivot, limb };
}

// colmillos en arco: filas arriba (head) y abajo (jaw)
function fangs(k, M, head, jaw, cx, cy, cz, w, n = 9) {
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 2.1;
    const x = cx + Math.sin(a) * w, z = cz + Math.cos(a) * w * 0.64;
    const len = 0.03 + (i % 2) * 0.014 + (i === 2 || i === n - 3 ? 0.02 : 0);
    k.part(new THREE.ConeGeometry(0.0075, len, 5), M.teeth, head, x, cy + 0.035 - len / 2, z).rotation.x = Math.PI;
    k.part(new THREE.ConeGeometry(0.007, len * 0.85, 5), M.teeth, jaw, x * 0.95, -0.03 + len * 0.42, z - cz - 0.01);
  }
}

/* =========================================================
   Constructores: cada uno arma el cuerpo dentro de `body` y
   devuelve las piezas que anima MonsterCharacter.update().
   ========================================================= */
const BUILD = {
  /* ---------------- El Carnicero ---------------- */
  carnicero(body, skin) {
    const k = kit(skin), M = mats();
    const HIP = 1.25, LEG = 0.62, ARM = 0.56;
    const legs = [-1, 1].map((side) => {
      const hip = k.pivot(body, side * 0.1, HIP, 0);
      k.limb(hip, LEG, 0.055, 0.045);
      const knee = k.pivot(hip, 0, -LEG, 0);
      k.limb(knee, LEG, 0.045, 0.035);
      k.mesh(new THREE.BoxGeometry(0.08, 0.05, 0.24), knee, 0, -LEG + 0.02, 0.06);
      return { hip, knee };
    });
    const upper = k.pivot(body, 0, HIP, 0);
    const torso = k.mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.78, 10), upper, 0, 0.39, 0);
    torso.scale.z = 0.55;
    k.mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 8), upper, 0, 0.84, 0);
    // pecho abierto con las costillas por fuera
    const wound = k.part(new THREE.SphereGeometry(0.13, 14, 10), M.flesh, upper, 0, 0.52, 0.06);
    wound.scale.set(0.95, 1.25, 0.45);
    for (let i = 0; i < 5; i++) {
      const rib = k.part(new THREE.TorusGeometry(0.135 - i * 0.008, 0.009, 5, 14, Math.PI), M.bone, upper, 0, 0.66 - i * 0.065, 0.075);
      rib.rotation.set(Math.PI / 2 + 0.25, 0, 0);
      rib.scale.set(1, 0.55, 1);
    }
    k.part(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), M.bone, upper, 0, 0.52, 0.085);
    // mandil de carnicero roto y empapado
    const apron = k.part(new THREE.PlaneGeometry(0.36, 0.95, 1, 6), M.apron, upper, 0, -0.05, 0.085);
    apron.rotation.x = -0.06;
    const ap = apron.geometry.attributes.position;
    for (let i = 0; i < ap.count; i++) if (ap.getY(i) < -0.4) ap.setY(i, ap.getY(i) - Math.abs(Math.sin(ap.getX(i) * 40)) * 0.08);
    for (const x of [-0.12, 0.15]) k.part(new THREE.BoxGeometry(0.03, 0.42, 0.01), M.apron, upper, x, 0.6, 0.07);

    const head = k.pivot(upper, 0, 0.9, 0.04);
    k.mesh(new THREE.SphereGeometry(0.12, 16, 12), head, 0, 0.13, 0.01).scale.set(0.85, 1.25, 0.95);
    k.part(new THREE.SphereGeometry(0.07, 16, 10), M.gore, head, 0, 0.07, 0.085).scale.set(1.25, 0.62, 0.5);
    const jaw = k.pivot(head, 0, 0.07, 0.07);
    fangs(k, M, head, jaw, 0, 0.07, 0.108, 0.075);
    for (const [x, len] of [[-0.03, 0.09], [0.012, 0.14], [0.045, 0.07]])
      k.part(new THREE.CylinderGeometry(0.0045, 0.002, len, 5), M.blood, jaw, x, -0.035 - len / 2, 0.035);
    // clavos oxidados atravesando el cráneo
    for (const [x, y, rz, rx] of [[0.06, 0.25, -0.5, -0.2], [-0.07, 0.21, 0.7, 0.1], [0.01, 0.29, 0.05, -0.5]]) {
      const n = k.part(new THREE.CylinderGeometry(0.006, 0.004, 0.13, 6).translate(0, 0.05, 0), M.rust, head, x, y, 0);
      n.rotation.set(rx, 0, rz);
      k.part(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 8), M.rust, n, 0, 0.115, 0);
    }

    const arms = [-1, 1].map((side) => {
      const shoulder = k.pivot(upper, side * 0.23, 0.74, 0);
      shoulder.rotation.z = side * 0.06;
      k.limb(shoulder, ARM, 0.035, 0.03);
      const elbow = k.pivot(shoulder, 0, -ARM, 0);
      k.limb(elbow, ARM, 0.03, 0.022);
      const hand = k.pivot(elbow, 0, -ARM, 0);
      k.mesh(new THREE.BoxGeometry(0.03, 0.08, 0.06), hand, 0, -0.04, 0);
      for (let i = 0; i < 4; i++)
        k.part(new THREE.SphereGeometry(0.014 + (i % 2) * 0.006, 6, 5), M.blood, elbow, (i % 2 ? 0.02 : -0.018) * side, -0.15 - i * 0.1, 0.018).scale.set(1, 1.8, 0.4);
      if (side < 0) {
        for (let i = 0; i < 4; i++) {
          const f = k.part(new THREE.ConeGeometry(0.009, 0.3, 4).translate(0, -0.15, 0), M.blade, hand, 0, -0.075, -0.024 + i * 0.016);
          f.rotation.set((i - 1.5) * 0.1, 0, side * 0.15);
          k.part(new THREE.ConeGeometry(0.0095, 0.07, 4).translate(0, -0.035, 0), M.blood, f, 0, -0.23, 0);
        }
      } else {
        for (let i = 0; i < 4; i++)
          k.mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.06, 5).translate(0, -0.03, 0), hand, 0.012, -0.075, -0.024 + i * 0.016).rotation.z = 0.9;
        const cl = k.pivot(hand, 0.02, -0.1, 0);
        cl.rotation.z = -0.15;
        k.part(new THREE.CylinderGeometry(0.014, 0.016, 0.13, 8), M.wood, cl).rotation.x = Math.PI / 2;
        const blade = k.part(new THREE.BoxGeometry(0.008, 0.17, 0.3), M.cleaver, cl, 0, -0.07, 0.2);
        blade.rotation.x = 0.08;
        k.part(new THREE.BoxGeometry(0.0095, 0.09, 0.16), M.blood, blade, 0, -0.035, 0.05);
      }
      return { shoulder, elbow };
    });
    return {
      legs, arms, upper, head, jaw, hipY: HIP, hunch: 0.2, headTilt: -0.12, raiseRight: true,
      eyes: { y: 0.15, z: 0.112, dx: 0.034 }, hatTop: [0, 0.27, 0.01], hatFace: [0, 0.155, 0.118], hatScale: 0.8,
      stride: 1.9,
    };
  },

  /* ---------------- Slasher ---------------- */
  slasher(body, skin) {
    const k = kit(skin), M = mats();
    const HIP = 1.0, LEG = 0.5, ARM = 0.4;
    const legs = [-1, 1].map((side) => {
      const hip = k.pivot(body, side * 0.12, HIP, 0);
      k.limb(hip, LEG, 0.085, 0.07);
      const knee = k.pivot(hip, 0, -LEG, 0);
      k.limb(knee, LEG, 0.07, 0.06);
      k.part(new THREE.BoxGeometry(0.13, 0.09, 0.28), M.leather, knee, 0, -LEG + 0.03, 0.05);   // botas
      return { hip, knee };
    });
    const upper = k.pivot(body, 0, HIP, 0);
    // overol de trabajo (la "piel" personalizable) con cinturón y manchas
    const torso = k.mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.72, 12), upper, 0, 0.38, 0);
    torso.scale.z = 0.62;
    k.part(new THREE.CylinderGeometry(0.205, 0.205, 0.06, 12), M.leather, upper, 0, 0.04, 0).scale.z = 0.66;
    k.part(new THREE.BoxGeometry(0.05, 0.04, 0.02), M.cleaver, upper, 0, 0.04, 0.13);
    for (const [x, y, r] of [[0.08, 0.3, 0.05], [-0.1, 0.55, 0.035], [0.12, 0.6, 0.03]])
      k.part(new THREE.SphereGeometry(r, 8, 6), M.blood, upper, x, y, 0.15).scale.set(1, 1.6, 0.25);
    k.mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), upper, 0, 0.76, 0);    // cuello grueso
    const head = k.pivot(upper, 0, 0.82, 0);
    k.part(new THREE.SphereGeometry(0.12, 16, 12), M.black, head, 0, 0.12, -0.01).scale.set(1, 1.1, 1.05);   // cabello
    // máscara blanca, lisa, sin boca: solo dos huecos negros
    const mask = k.part(new THREE.SphereGeometry(0.118, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), M.mask, head, 0, 0.11, 0.012);
    mask.rotation.x = Math.PI / 2 - 0.05;
    mask.scale.set(0.92, 1.12, 1.15);
    for (const s of [-1, 1]) {
      const hole = k.part(new THREE.SphereGeometry(0.016, 10, 8), M.black, head, s * 0.038, 0.14, 0.112);
      hole.scale.set(1.3, 0.7, 0.4);
    }
    const arms = [-1, 1].map((side) => {
      const shoulder = k.pivot(upper, side * 0.3, 0.66, 0);
      shoulder.rotation.z = side * 0.12;
      k.limb(shoulder, ARM, 0.065, 0.055);
      const elbow = k.pivot(shoulder, 0, -ARM, 0);
      k.limb(elbow, ARM, 0.055, 0.045);
      const hand = k.pivot(elbow, 0, -ARM, 0);
      k.part(new THREE.SphereGeometry(0.05, 10, 8), M.leather, hand, 0, -0.03, 0).scale.set(0.8, 1.1, 1);   // guante
      if (side > 0) {
        // cuchillo de cocina con el filo hacia abajo
        const kn = k.pivot(hand, 0, -0.05, 0.02);
        k.part(new THREE.CylinderGeometry(0.016, 0.016, 0.11, 8), M.wood, kn, 0, 0.02, 0);
        const blade = k.part(new THREE.CylinderGeometry(0.0, 0.032, 0.34, 3).translate(0, -0.17, 0), M.blade, kn, 0, -0.04, 0);
        blade.scale.z = 0.18;
        k.part(new THREE.CylinderGeometry(0.0, 0.02, 0.16, 3).translate(0, -0.08, 0), M.blood, kn, 0, -0.2, 0.001).scale.z = 0.22;
      }
      return { shoulder, elbow };
    });
    return {
      legs, arms, upper, head, hipY: HIP, hunch: 0.04, headTilt: 0.05, stiff: true,
      eyes: { y: 0.14, z: 0.108, dx: 0.038 }, hatTop: [0, 0.245, 0], hatFace: [0, 0.12, 0.125], hatScale: 1.0,
      stride: 1.5,
    };
  },

  /* ---------------- Demonio ---------------- */
  demonio(body, skin) {
    const k = kit(skin), M = mats();
    const HIP = 1.15, LEG = 0.58, ARM = 0.48;
    // piernas de cabra: muslo hacia adelante, canilla hacia atrás y pezuña
    const legs = [-1, 1].map((side) => {
      const hip = k.pivot(body, side * 0.13, HIP, 0);
      const thigh = k.limb(hip, LEG, 0.085, 0.06);
      thigh.rotation.x = -0.35;
      const knee = k.pivot(hip, 0, -LEG * 0.94, LEG * 0.2);
      const shin = k.limb(knee, LEG, 0.055, 0.04);
      shin.rotation.x = 0.4;
      k.part(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 8), M.horn, knee, 0, -LEG * 0.95, -0.2);  // pezuña
      return { hip, knee };
    });
    const upper = k.pivot(body, 0, HIP, 0);
    const torso = k.mesh(new THREE.CylinderGeometry(0.26, 0.15, 0.8, 12), upper, 0, 0.4, 0);
    torso.scale.z = 0.6;
    // púas en la espalda
    for (let i = 0; i < 6; i++) {
      const sp = k.part(new THREE.ConeGeometry(0.02, 0.09, 5), M.horn, upper, 0, 0.15 + i * 0.12, -0.15);
      sp.rotation.x = -0.6;
    }
    k.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 8), upper, 0, 0.84, 0.02);
    const head = k.pivot(upper, 0, 0.9, 0.06);
    k.mesh(new THREE.SphereGeometry(0.13, 16, 12), head, 0, 0.12, 0).scale.set(0.95, 1.05, 1.05);
    k.mesh(new THREE.BoxGeometry(0.16, 0.035, 0.05), head, 0, 0.17, 0.1);    // ceja marcada
    k.part(new THREE.SphereGeometry(0.06, 14, 10), M.gore, head, 0, 0.05, 0.1).scale.set(1.3, 0.55, 0.5);
    const jaw = k.pivot(head, 0, 0.05, 0.08);
    fangs(k, M, head, jaw, 0, 0.05, 0.115, 0.065, 7);
    // cuernos enormes curvados hacia atrás
    for (const side of [-1, 1]) {
      let parent = k.pivot(head, side * 0.08, 0.2, 0.02);
      parent.rotation.set(-0.3, 0, -side * 0.5);
      for (let i = 0; i < 4; i++) {
        const r0 = 0.04 - i * 0.009, len = 0.11;
        k.part(new THREE.CylinderGeometry(Math.max(0.004, r0 - 0.009), r0, len, 8).translate(0, len / 2, 0), M.horn, parent);
        parent = k.pivot(parent, 0, len * 0.95, 0);
        parent.rotation.set(-0.45, 0, -side * 0.15);
      }
      k.part(new THREE.ConeGeometry(0.008, 0.07, 6).translate(0, 0.035, 0), M.horn, parent);
    }
    // alas de murciélago (forma dibujada con THREE.Shape) que aletean
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(0.15, 0.35); wingShape.lineTo(0.65, 0.42); wingShape.lineTo(0.95, 0.15);
    wingShape.quadraticCurveTo(0.78, 0.0, 0.72, -0.18);
    wingShape.quadraticCurveTo(0.55, -0.1, 0.48, -0.32);
    wingShape.quadraticCurveTo(0.33, -0.15, 0.22, -0.36);
    wingShape.quadraticCurveTo(0.12, -0.15, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape, 6);
    const wings = [-1, 1].map((side) => {
      const w = k.pivot(upper, side * 0.1, 0.62, -0.14);
      const m = k.part(wingGeo, M.wing, w);
      m.scale.set(side, 1, 1);
      m.rotation.y = side * 0.3;
      // huesos del ala
      for (const [x, y] of [[0.65, 0.42], [0.95, 0.15], [0.72, -0.18]]) {
        const len = Math.hypot(x - 0.15, y - 0.35);
        const b = k.part(new THREE.CylinderGeometry(0.006, 0.01, len, 5).translate(0, len / 2, 0), M.horn, w, side * 0.15, 0.35, 0);
        b.rotation.z = -Math.atan2(x - 0.15, y - 0.35) * side;
      }
      return w;
    });
    // cola con punta de flecha, en eslabones que se mecen
    const tail = [];
    let tp = k.pivot(upper, 0, 0.02, -0.12);
    tp.rotation.x = 2.3;
    for (let i = 0; i < 7; i++) {
      const len = 0.12;
      k.mesh(new THREE.CylinderGeometry(0.022 - i * 0.0025, 0.026 - i * 0.0025, len, 6).translate(0, len / 2, 0), tp);
      tail.push(tp);
      tp = k.pivot(tp, 0, len * 0.95, 0);
    }
    const tip = k.part(new THREE.ConeGeometry(0.05, 0.12, 4).translate(0, 0.06, 0), M.horn, tp);
    tip.scale.z = 0.25;

    const arms = [-1, 1].map((side) => {
      const shoulder = k.pivot(upper, side * 0.29, 0.72, 0);
      shoulder.rotation.z = side * 0.1;
      k.limb(shoulder, ARM, 0.06, 0.045);
      const elbow = k.pivot(shoulder, 0, -ARM, 0);
      k.limb(elbow, ARM, 0.045, 0.035);
      const hand = k.pivot(elbow, 0, -ARM, 0);
      k.mesh(new THREE.SphereGeometry(0.045, 10, 8), hand, 0, -0.03, 0).scale.set(0.8, 1, 1);
      for (let i = 0; i < 4; i++) {
        const f = k.part(new THREE.ConeGeometry(0.01, 0.13, 5).translate(0, -0.065, 0), M.horn, hand, 0, -0.06, -0.03 + i * 0.02);
        f.rotation.set((i - 1.5) * 0.15, 0, side * 0.2);
      }
      return { shoulder, elbow };
    });
    return {
      legs, arms, upper, head, jaw, hipY: HIP, hunch: 0.26, headTilt: -0.2, wings, tail,
      eyes: { y: 0.15, z: 0.118, dx: 0.045 }, hatTop: [0, 0.25, 0.0], hatFace: [0, 0.14, 0.13], hatScale: 1.0,
      stride: 1.7,
    };
  },

  /* ---------------- La Llorona ---------------- */
  llorona(body, skin) {
    const k = kit(skin), M = mats();
    const WAIST = 1.0, ARM = 0.42;
    // flota: todo cuelga de `float`, que sube y baja
    const float = k.pivot(body, 0, 0.12, 0);
    // vestido largo con el borde desgarrado (sin piernas: se desliza)
    const dressGeo = new THREE.CylinderGeometry(0.13, 0.5, WAIST + 0.05, 24, 8, true);
    const dp = dressGeo.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const y = dp.getY(i), a = Math.atan2(dp.getZ(i), dp.getX(i));
      if (y < -0.3) dp.setY(i, y - Math.abs(Math.sin(a * 7)) * 0.12 - Math.abs(Math.sin(a * 17)) * 0.05);
      const r = 1 + Math.sin(a * 5 + y * 6) * 0.06;            // pliegues
      dp.setX(i, dp.getX(i) * r); dp.setZ(i, dp.getZ(i) * r);
    }
    dressGeo.computeVertexNormals();
    const dress = k.part(dressGeo, M.dress, float, 0, WAIST / 2, 0);
    const upper = k.pivot(float, 0, WAIST, 0);
    k.part(new THREE.CylinderGeometry(0.15, 0.13, 0.5, 14), M.dress, upper, 0, 0.25, 0).scale.z = 0.7;   // corpiño
    k.mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.12, 8), upper, 0, 0.56, 0);
    const head = k.pivot(upper, 0, 0.6, 0.02);
    k.mesh(new THREE.SphereGeometry(0.095, 16, 12), head, 0, 0.1, 0).scale.set(0.9, 1.15, 0.95);
    k.part(new THREE.SphereGeometry(0.03, 10, 8), M.gore, head, 0, 0.05, 0.08).scale.set(0.8, 1.4, 0.5);   // boca que llora
    // cabello negro larguísimo: mechones que caen sobre la cara y la espalda
    k.part(new THREE.SphereGeometry(0.105, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hair, head, 0, 0.11, -0.005);
    const strands = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const front = Math.cos(a) > 0.2;
      const len = front ? 0.45 + Math.random() * 0.1 : 0.7 + Math.random() * 0.25;
      const s = k.pivot(head, Math.sin(a) * 0.085, 0.17, Math.cos(a) * 0.08);
      k.part(new THREE.PlaneGeometry(0.035, len).translate(0, -len / 2, 0), M.hair, s).rotation.y = a;
      s.rotation.x = Math.cos(a) * 0.12;
      s.rotation.z = -Math.sin(a) * 0.12;
      strands.push(s);
    }
    // velo roto encima del cabello
    // (media manga de cilindro abierta por delante: cae por detrás de la cabeza hasta la espalda)
    const veil = k.part(new THREE.CylinderGeometry(0.115, 0.26, 0.85, 18, 1, true, Math.PI / 2, Math.PI)
      .translate(0, -0.4, 0), M.dress, head, 0, 0.21, -0.01);
    veil.rotation.x = 0.12;

    const arms = [-1, 1].map((side) => {
      const shoulder = k.pivot(upper, side * 0.16, 0.46, 0);
      k.limb(shoulder, ARM, 0.025, 0.02);
      const elbow = k.pivot(shoulder, 0, -ARM, 0);
      k.limb(elbow, ARM, 0.02, 0.016);
      const hand = k.pivot(elbow, 0, -ARM, 0);
      k.mesh(new THREE.BoxGeometry(0.025, 0.06, 0.045), hand, 0, -0.03, 0);
      for (let i = 0; i < 4; i++) {   // dedos largos con uñas negras
        const f = k.mesh(new THREE.CylinderGeometry(0.005, 0.003, 0.12, 5).translate(0, -0.06, 0), hand, 0, -0.055, -0.018 + i * 0.012);
        f.rotation.x = (i - 1.5) * 0.08;
        k.part(new THREE.ConeGeometry(0.004, 0.035, 4).translate(0, -0.017, 0), M.black, f, 0, -0.12, 0);
      }
      // manga desgarrada
      k.part(new THREE.CylinderGeometry(0.03, 0.08, 0.3, 10, 1, true).translate(0, -0.15, 0), M.dress, elbow, 0, 0, 0);
      return { shoulder, elbow };
    });
    return {
      legs: [], arms, upper, head, float, strands, dress, hipY: WAIST, hunch: 0.12, headTilt: 0.25,
      reach: true, silent: true,
      eyes: { y: 0.12, z: 0.09, dx: 0.03 }, hatTop: [0, 0.21, 0], hatFace: [0, 0.1, 0.1], hatScale: 0.78,
      stride: 2.2,
    };
  },
};

/* =========================================================
   El personaje
   ========================================================= */
export class MonsterCharacter {
  constructor(look, hatMesh) {
    this.kind = "monster";
    this.def = { procedural: true, walkSpeed: 1.5, runSpeed: 4.3 };
    this.time = 0;
    this.phase = 0;    // fase del ciclo de pasos
    this.amp = 0;      // amplitud del balanceo (0 quieto, 1 corriendo)
    this.speed = 0;
    this.twitch = 0; this.twitchNow = 0; this.twitchT = 2;   // tirones de cabeza
    this.hatMesh = hatMesh;
    this.root = new THREE.Group();
    this.skin = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.75, metalness: 0.0 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    this.type = null;
    this.setLook(look);
  }

  build(type) {
    if (this.body) this.body.removeFromParent();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.type = type;
    this.rig = BUILD[type](this.body, this.skin);
    this.silentSteps = !!this.rig.silent;     // scene3d.js no reproduce pasos (la llorona flota)
    // ojos: solo se ven si se personalizan
    const e = this.rig.eyes;
    this.eyes = [-1, 1].map((side) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), this.eyeMat);
      m.position.set(side * e.dx, e.y, e.z);
      m.scale.set(1.25, 0.7, 0.6);
      this.rig.head.add(m);
      return m;
    });
    this.hat = null;
  }

  setLook(look) {
    const L = Rules.sanitizeLook(look);
    if (L.monsterType !== this.type) this.build(L.monsterType);
    const skin = Rules.lookColor(L, "monsterSkin");
    this.skin.color.set(skin == null ? TYPE_SKIN[this.type] : skin);
    const eyes = Rules.lookColor(L, "monsterEyes");
    this.eyes.forEach((m) => { m.visible = eyes != null; });
    if (eyes != null) this.eyeMat.color.set(eyes);
    if (this.hat) { this.hat.removeFromParent(); this.hat = null; }
    const hat = this.hatMesh(L.hat);
    if (hat) {
      hat.scale.setScalar(this.rig.hatScale);
      hat.position.fromArray(L.hat === "mascara" ? this.rig.hatFace : this.rig.hatTop);
      this.rig.head.add(hat);
      this.hat = hat;
    }
  }

  setMotion(speed) { this.speed = speed; }

  update(dt) {
    const R = this.rig;
    this.time += dt;
    const t = this.time;
    const target = THREE.MathUtils.clamp(this.speed / this.def.runSpeed, 0, 1);
    this.amp += (target - this.amp) * Math.min(1, dt * 6);
    this.phase += dt * this.speed * (Math.PI * 2 / R.stride);
    const a = this.amp, s = Math.sin(this.phase), c = Math.cos(this.phase);
    const moving = Math.min(1, this.speed / 0.4);
    const idle = 1 - moving;
    const stiff = R.stiff ? 0.55 : 1;
    const legSwing = (0.25 + a * 0.45) * stiff, armSwing = (0.15 + a * 0.55) * stiff;

    // piernas: rotación negativa en X = hacia adelante; la rodilla se dobla al adelantar
    R.legs.forEach(({ hip, knee }, i) => {
      const k = i === 0 ? 1 : -1;
      hip.rotation.x = -s * k * legSwing * moving;
      knee.rotation.x = Math.max(0, c * k) * (0.5 + a * 0.6) * moving;
    });
    // brazos opuestos a las piernas (la llorona los lleva estirados hacia ti)
    R.arms.forEach(({ shoulder, elbow }, i) => {
      const k = i === 0 ? -1 : 1;
      if (R.reach) {
        shoulder.rotation.x = -1.25 - a * 0.25 + Math.sin(t * 1.1 + i) * 0.06;
        elbow.rotation.x = -0.15 + Math.sin(t * 0.7 + i * 2) * 0.05;
      } else {
        shoulder.rotation.x = -s * k * armSwing * moving + Math.sin(t * 0.8 + i) * 0.03;
        elbow.rotation.x = -0.12 - a * 0.5;
      }
    });
    if (R.raiseRight) R.arms[1].elbow.rotation.x = -0.55 - a * 0.6;   // machete listo para golpear

    // torso: rebote al pisar y encorvado
    R.upper.position.y = R.float ? R.hipY : R.hipY - Math.abs(c) * 0.035 * moving;
    R.upper.rotation.x = R.hunch + a * 0.2;
    R.upper.scale.y = 1 + Math.sin(t * 1.3) * 0.006;

    // cabeza: ladeo lento y, quieto, tirones secos de vez en cuando
    this.twitchT -= dt;
    if (this.twitchT <= 0) { this.twitchT = 1.5 + Math.random() * 3.5; this.twitch = (Math.random() - 0.5) * 1.1; }
    this.twitchNow += (this.twitch - this.twitchNow) * Math.min(1, dt * 22);
    this.twitch *= Math.exp(-dt * 2.5);
    R.head.rotation.z = Math.sin(t * 0.35) * 0.32 * idle + Math.sin(t * 0.9) * 0.03 + this.twitchNow * idle;
    R.head.rotation.x = R.headTilt - a * 0.1;
    if (R.jaw) R.jaw.rotation.x = 0.25 + a * 0.45 + Math.sin(t * 9) * 0.04 * (0.3 + a);

    // extras de cada monstruo
    if (R.wings) R.wings.forEach((w, i) => {
      const side = i === 0 ? -1 : 1;
      w.rotation.y = side * (0.35 + Math.sin(t * (1.6 + a * 5)) * (0.12 + a * 0.35));
    });
    if (R.tail) R.tail.forEach((seg, i) => {
      seg.rotation.z = Math.sin(t * 2.2 - i * 0.6) * 0.18;
      if (i > 0) seg.rotation.x = -0.12 + Math.sin(t * 1.4 - i * 0.5) * 0.05;
    });
    if (R.float) {
      R.float.position.y = 0.12 + Math.sin(t * 1.6) * 0.05;     // flota
      R.float.rotation.x = a * 0.25;                             // se inclina al deslizarse rápido
      R.dress.rotation.y = Math.sin(t * 0.9) * 0.08;
    }
    if (R.strands) R.strands.forEach((st, i) => {
      st.rotation.x = Math.cos((i / R.strands.length) * Math.PI * 2) * 0.12 - a * 0.35 + Math.sin(t * 1.3 + i) * 0.04;
    });
  }

  dispose() { this.root.removeFromParent(); }
}
