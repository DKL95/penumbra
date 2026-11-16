/* =========================================================
   PENUMBRA — Escenario 3: BOSQUE DE CENIZA
   Bosque quemado al aire libre, de noche: claro con fogata,
   cabaña del guardabosques, cementerio con mausoleo, pozo
   viejo y un estanque de agua negra. La salida es la reja del
   bosque (necesita 3 piedras rúnicas).

   - Árboles calcinados y pinos con InstancedMesh (una sola
     malla para cientos de troncos/ramas/copas).
   - Luz ambiental azulada + FOCAL: luna (direccional con
     sombra), fogata, farol de la cabaña y velas del mausoleo.
   - Partículas: ceniza que cae alrededor del jugador, brasas
     que suben de la fogata y estrellas.
   - Todo lo aleatorio usa una semilla fija: en multijugador los
     dos jugadores ven exactamente el mismo bosque.
   ========================================================= */

export function buildForest(k) {
  const { THREE, M, box, cyl, sph, wallBox, floorPlane, decal, tex, cvs, grain, writingCanvas, V } = k;
  const scene = k.scene;
  const ob = (x1, x2, z1, z2) => k.addObstacle({ x1, x2, z1, z2 });
  const B = 24;          // medio lado del área jugable

  // generador pseudoaleatorio con semilla (mulberry32)
  let seed = 1337;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rr = (a, b) => a + rnd() * (b - a);

  /* ---------------- texturas ---------------- */
  function ashCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#2a2622"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 40; i++) {
      const rg = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 2, Math.random() * 512, Math.random() * 512, 30 + Math.random() * 90);
      const light = Math.random() < 0.5;
      rg.addColorStop(0, light ? "rgba(120,112,100,.35)" : "rgba(8,6,4,.5)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    // pasto seco
    for (let i = 0; i < 900; i++) {
      x.strokeStyle = `hsla(${35 + Math.random() * 20}, 25%, ${18 + Math.random() * 18}%, .7)`;
      x.lineWidth = 1;
      const px = Math.random() * 512, py = Math.random() * 512;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 6, py - 4 - Math.random() * 8); x.stroke();
    }
    grain(x, 512, 512, 12000, 0.3);
    return c;
  }
  function stoneCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "#5b5a56"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i++) {
      x.fillStyle = `rgba(${Math.random() < 0.5 ? "20,22,18" : "140,140,130"},.18)`;
      x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 5 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < 25; i++) {     // musgo
      x.fillStyle = "rgba(50,70,40,.25)";
      x.beginPath(); x.arc(Math.random() * 256, 200 + Math.random() * 56, 6 + Math.random() * 14, 0, Math.PI * 2); x.fill();
    }
    grain(x, 256, 256, 5000, 0.3);
    return c;
  }

  /* ---------------- materiales ---------------- */
  const mat = {
    ground: new THREE.MeshStandardMaterial({ map: tex(ashCanvas(), 1, 1), roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x1c1813, roughness: 1, emissive: 0x0a0300 }),
    pine: new THREE.MeshStandardMaterial({ color: 0x1d2a22, roughness: 1, flatShading: true }),
    stone: new THREE.MeshStandardMaterial({ map: tex(stoneCanvas(), 1, 1), roughness: 0.95 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.8 }),
    plank: new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: 0x050b0e, roughness: 0.05, metalness: 0.9 }),
    reed: new THREE.MeshStandardMaterial({ color: 0x3a3a22, roughness: 1 }),
    sack: new THREE.MeshStandardMaterial({ color: 0x6b5a3c, roughness: 1 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffb35a }),
  };

  /* ---------------- suelo y cielo ---------------- */
  floorPlane(-36, 36, -36, 36, 0, mat.ground, 4);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0xe6e9dc, fog: false }));
  moon.position.set(-28, 30, 45);
  moon.lookAt(0, 0, 0);
  scene.add(moon);
  const starPos = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const a = rnd() * Math.PI * 2, e = 0.15 + rnd() * 1.3, r = 65;
    starPos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd6e8, size: 0.18, fog: false, transparent: true, opacity: 0.8 })));

  /* ============================================================
     CABAÑA DEL GUARDABOSQUES (x 8..14, z -14..-8), puerta al oeste
     ============================================================ */
  const CH = 2.6;
  wallBox(7.85, 8.15, -14.15, -11.6, CH, M.woodMid);
  wallBox(7.85, 8.15, -10.4, -7.85, CH, M.woodMid);
  wallBox(7.85, 8.15, -11.6, -10.4, CH - 2.1, M.woodMid, 2.1);
  wallBox(13.85, 14.15, -14.15, -7.85, CH, M.woodMid);
  wallBox(8.15, 13.85, -14.15, -13.85, CH, M.woodMid);
  wallBox(8.15, 13.85, -8.15, -7.85, CH, M.woodMid);
  floorPlane(8.15, 13.85, -13.85, -8.15, 0.02, M.floor, 2);
  floorPlane(8.15, 13.85, -13.85, -8.15, CH, M.woodDark, 2, true);
  for (const [sx, rz] of [[9.4, 0.412], [12.6, -0.412]]) {
    const r = box(3.6, 0.12, 6.8, M.woodDark, sx, 3.2, -11, null);
    r.rotation.z = rz;
  }
  // ventanas con luz cálida
  for (const z of [-12.8, -9.2]) {
    const w = box(0.02, 0.6, 0.7, mat.windowGlow, 14.17, 1.5, z); w.castShadow = false;
  }
  const win2 = box(0.7, 0.6, 0.02, mat.windowGlow, 11, 1.5, -7.83); win2.castShadow = false;
  // puerta entreabierta
  const door = new THREE.Group();
  door.position.set(8.0, 0, -11.6); door.rotation.y = -1.2;
  scene.add(door);
  box(0.06, 2.05, 1.15, M.woodMid, 0, 1.03, 0.58, door);
  // interior: mesa, silla, cama, farol
  box(1.0, 0.06, 1.0, M.woodMid, 10.5, 0.78, -9.3);
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.42, 0.42]) cyl(0.04, 0.04, 0.78, M.woodDark, 10.5 + sx, 0.39, -9.3 + sz);
  ob(9.95, 11.05, -9.85, -8.75);
  box(0.8, 0.4, 1.9, M.woodDark, 13.4, 0.2, -9.55);
  box(0.75, 0.12, 1.8, mat.sack, 13.4, 0.46, -9.55);
  ob(12.95, 13.85, -10.55, -8.55);
  cyl(0.08, 0.1, 0.25, M.brass, 10.5, 0.94, -9.3);
  k.flameMesh(0.9).position.set(10.5, 1.02, -9.3);
  const lantern = new THREE.PointLight(0xffb060, 1.1, 7, 2);
  lantern.position.set(10.5, 1.3, -9.3);
  scene.add(lantern);
  k.addFlicker({ light: lantern, base: 1.1, soft: true });
  // trofeo de cráneo con cuernos sobre la puerta (por dentro)
  sph(0.12, M.paper, 8.3, 2.3, -11);
  for (const s of [-1, 1]) { const h = cyl(0.01, 0.03, 0.35, M.paper, 8.3, 2.45, -11 + s * 0.15); h.rotation.x = s * 0.7; }

  /* ============================================================
     CEMENTERIO (x -16..-6, z 8..18) con reja baja y mausoleo
     ============================================================ */
  const fence = (x1, x2, z1, z2) => {
    const len = Math.max(x2 - x1, z2 - z1), alongX = x2 - x1 > z2 - z1;
    for (const y of [0.25, 0.85]) box(alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, mat.iron, (x1 + x2) / 2, y, (z1 + z2) / 2);
    const n = Math.round(len / 0.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = alongX ? x1 + (x2 - x1) * t : x1, pz = alongX ? z1 : z1 + (z2 - z1) * t;
      cyl(0.012, 0.012, 1.0, mat.iron, px, 0.5, pz, null, 5);
    }
    ob(Math.min(x1, x2) - 0.08, Math.max(x1, x2) + 0.08, Math.min(z1, z2) - 0.08, Math.max(z1, z2) + 0.08);
  };
  fence(-16, -16, 8, 18);
  fence(-16, -6, 18, 18);
  fence(-16, -6, 8, 8);
  fence(-6, -6, 8, 11.8);
  fence(-6, -6, 13.2, 18);
  for (const z of [11.8, 13.2]) { box(0.25, 1.4, 0.25, mat.stone, -6, 0.7, z); sph(0.14, mat.stone, -6, 1.48, z); }

  function grave(x, z) {
    const kind = Math.floor(rnd() * 3), tilt = rr(-0.25, 0.25), ry = rr(-0.2, 0.2);
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.set(0, ry, tilt);
    scene.add(g);
    if (kind === 0) box(0.6, 0.85, 0.14, mat.stone, 0, 0.42, 0, g);
    else if (kind === 1) {
      box(0.12, 1.0, 0.12, mat.stone, 0, 0.5, 0, g);
      box(0.55, 0.12, 0.12, mat.stone, 0, 0.72, 0, g);
    } else {
      box(0.55, 0.55, 0.14, mat.stone, 0, 0.28, 0, g);
      const top = cyl(0.275, 0.275, 0.14, mat.stone, 0, 0.55, 0, g, 16);
      top.rotation.x = Math.PI / 2;
    }
    box(0.7, 0.06, 1.3, new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 1 }), 0, 0.03, 0.75, g);   // tierra removida
    ob(x - 0.4, x + 0.4, z - 0.2, z + 0.2);
  }
  for (const z of [10, 15]) for (const x of [-14.5, -12.5, -10.5, -8.5]) grave(x, z);
  grave(-14.5, 12.5);

  // mausoleo (bloquea la vista)
  wallBox(-15, -12, 15.6, 17.8, 2.6, mat.stone);
  box(3.4, 0.25, 2.6, mat.stone, -13.5, 2.72, 16.7);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.9, 0.7, 3), mat.stone);
  ped.position.set(-13.5, 3.2, 16.7); ped.rotation.y = Math.PI / 2; ped.scale.z = 0.7;
  scene.add(ped);
  for (const x of [-14.6, -12.4]) cyl(0.14, 0.16, 2.6, mat.stone, x, 1.3, 15.35, null, 10);
  box(1.0, 1.9, 0.04, mat.iron, -13.5, 0.95, 15.58);
  box(0.08, 0.6, 0.08, mat.iron, -13.5, 3.75, 16.7);
  box(0.35, 0.08, 0.08, mat.iron, -13.5, 3.85, 16.7);
  for (const x of [-14.1, -12.9]) {
    cyl(0.03, 0.03, 0.18, M.wax, x, 0.09, 15.1);
    k.flameMesh(0.8).position.set(x, 0.24, 15.1);
  }
  const candles = new THREE.PointLight(0xffa850, 0.8, 5, 2);
  candles.position.set(-13.5, 0.6, 14.9);
  scene.add(candles);
  k.addFlicker({ light: candles, base: 0.8, soft: true });
  decal(writingCanvas("ELLOS VUELVEN"), 2.6, 0.65, -13.5, 2.0, 15.57, 0, 0);

  /* ============================================================
     POZO, ESTANQUE, FOGATA Y DETALLES
     ============================================================ */
  // pozo viejo
  const well = cyl(0.85, 0.9, 0.8, mat.stone, -10, 0.4, -8, null, 16);
  well.material = mat.stone;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(-10, 0.81, -8);
  scene.add(hole);
  for (const s of [-1, 1]) cyl(0.06, 0.06, 2.0, mat.plank, -10 + s * 0.85, 1.0, -8, null, 6);
  const beam = cyl(0.05, 0.05, 1.9, mat.plank, -10, 1.95, -8, null, 6); beam.rotation.z = Math.PI / 2;
  const roofW = box(2.1, 0.06, 1.3, mat.plank, -10, 2.2, -8); roofW.rotation.x = 0.0;
  cyl(0.004, 0.004, 1.2, M.cloth, -10, 1.35, -8, null, 4);
  ob(-10.9, -9.1, -8.9, -7.1);

  // estanque de agua negra
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.6, 40), mat.water);
  pond.rotation.x = -Math.PI / 2; pond.position.set(10, 0.03, 10);
  scene.add(pond);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = 3.5 + rnd() * 0.5;
    const reed = cyl(0.008, 0.012, rr(0.5, 1.1), mat.reed, 10 + Math.cos(a) * r, 0.35, 10 + Math.sin(a) * r, null, 4);
    reed.rotation.set(rr(-0.2, 0.2), 0, rr(-0.2, 0.2));
  }
  ob(7.2, 12.8, 7.2, 12.8);

  // fogata del claro
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    sph(0.13, mat.stone, Math.cos(a) * 0.55, 0.07, Math.sin(a) * 0.55);
  }
  for (let i = 0; i < 4; i++) {
    const l = cyl(0.06, 0.07, 0.8, mat.bark, 0, 0.15, 0); l.rotation.set(Math.PI / 2 - 0.3, i * Math.PI / 2, 0);
  }
  for (let i = 0; i < 7; i++) k.flameMesh(rr(4, 6)).position.set((rnd() - 0.5) * 0.35, 0.32, (rnd() - 0.5) * 0.35);
  // halo de la fogata (sprite aditivo con degradado radial)
  const gc = cvs(128), gx = gc.getContext("2d");
  const grd = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,190,110,1)"); grd.addColorStop(0.3, "rgba(255,120,40,.45)"); grd.addColorStop(1, "rgba(255,80,20,0)");
  gx.fillStyle = grd; gx.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.6, 2.6, 1);
  glow.position.set(0, 0.6, 0);
  scene.add(glow);
  const fire = new THREE.PointLight(0xff7a2a, 3.4, 13, 1.7);
  fire.position.set(0, 0.8, 0);
  scene.add(fire);
  ob(-0.7, 0.7, -0.7, 0.7);
  // troncos para sentarse
  const log1 = cyl(0.2, 0.22, 1.6, mat.bark, 0, 0.2, -1.8); log1.rotation.z = Math.PI / 2;
  ob(-0.8, 0.8, -2.0, -1.6);
  const log2 = cyl(0.2, 0.22, 1.6, mat.bark, -1.9, 0.2, 0.2); log2.rotation.x = Math.PI / 2;
  ob(-2.1, -1.7, -0.6, 1.0);

  // espantapájaros (junto al inicio, que queda 4 m dentro de la cerca sur)
  const S0 = -B + 4;
  cyl(0.04, 0.04, 2.3, mat.plank, 3, 1.15, S0 + 2, null, 6);
  const arm = cyl(0.03, 0.03, 1.4, mat.plank, 3, 1.7, S0 + 2, null, 6); arm.rotation.z = Math.PI / 2;
  box(0.45, 0.6, 0.25, mat.sack, 3, 1.45, S0 + 2);
  sph(0.18, mat.sack, 3, 2.05, S0 + 2);
  const hat = cyl(0.12, 0.24, 0.2, M.soot, 3, 2.25, S0 + 2); hat.rotation.z = 0.2;
  ob(2.8, 3.2, S0 + 1.8, S0 + 2.2);
  // letrero de madera junto al inicio
  cyl(0.04, 0.04, 1.3, mat.plank, 1.8, 0.65, S0 + 1.4, null, 6);
  box(1.0, 0.35, 0.04, mat.plank, 1.8, 1.25, S0 + 1.4);
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.25), new THREE.MeshBasicMaterial({ map: writingCanvas("NO MIRES ATRÁS"), transparent: true }));
  sgn.position.set(1.8, 1.25, S0 + 1.43);
  scene.add(sgn);
  ob(1.6, 2.0, S0 + 1.2, S0 + 1.6);

  /* ============================================================
     CAMPAMENTO ABANDONADO (noreste): tienda rasgada, bolsa de
     dormir, farol caído y una fogata apagada
     ============================================================ */
  const CX = 17.5, CZ = 13;
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.0, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0x3b4a2e, roughness: 1, side: THREE.DoubleSide }));
  tent.position.set(CX, 1.0, CZ); tent.rotation.y = Math.PI / 4 + 0.2;
  tent.castShadow = tent.receiveShadow = true;
  scene.add(tent);
  ob(CX - 1.2, CX + 1.2, CZ - 1.2, CZ + 1.2);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ color: 0x2e3a24, roughness: 1, side: THREE.DoubleSide }));
  flap.position.set(CX - 1.25, 0.6, CZ - 0.4); flap.rotation.set(-0.3, 1.1, 0.25);
  scene.add(flap);
  const bag = cyl(0.25, 0.25, 1.7, mat.sack, CX - 2.4, 0.15, CZ + 0.8);
  bag.rotation.set(Math.PI / 2, 0, 0.5); bag.scale.set(1, 1, 0.5);
  // fogata apagada: piedras en círculo y troncos quemados
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), mat.stone);
    st.position.set(CX - 1.0 + Math.cos(a) * 0.55, 0.08, CZ + 2.6 + Math.sin(a) * 0.55);
    scene.add(st);
  }
  for (const r of [0.4, -0.5]) { const l = cyl(0.07, 0.08, 0.8, M.soot, CX - 1.0, 0.1, CZ + 2.6); l.rotation.set(Math.PI / 2, r, 0); }
  ob(CX - 1.6, CX - 0.4, CZ + 2.0, CZ + 3.2);
  // farol caído que todavía alumbra
  const lamp = cyl(0.08, 0.1, 0.25, M.brass, CX - 1.6, 0.1, CZ - 1.6);
  lamp.rotation.z = Math.PI / 2;
  const lampL = new THREE.PointLight(0xffb060, 0.9, 6, 2);
  lampL.position.set(CX - 1.6, 0.35, CZ - 1.6);
  scene.add(lampL);
  k.addFlicker({ light: lampL, base: 0.9, phase: 1.7 });
  decal(k.bloodCanvas(2), 1.3, 1.3, CX - 1.0, 0.02, CZ - 2.4, -Math.PI / 2, 0, 0.6);

  /* ============================================================
     CERCA PERIMETRAL Y REJA DE SALIDA (norte)
     ============================================================ */
  const P = B + 0.2;
  const rails = (x1, x2, z1, z2) => {
    const len = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1)), alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    for (const y of [0.45, 1.0]) box(alongX ? len : 0.06, 0.08, alongX ? 0.06 : len, mat.plank, (x1 + x2) / 2, y, (z1 + z2) / 2);
    const n = Math.round(len / 2.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      cyl(0.06, 0.07, 1.3, mat.plank, alongX ? x1 + (x2 - x1) * t : x1, 0.65, alongX ? z1 : z1 + (z2 - z1) * t, null, 6);
    }
  };
  rails(-P, P, -P, -P);
  rails(-P, -P, -P, P);
  rails(P, P, -P, P);
  rails(-P, -1.9, P, P);
  rails(1.9, P, P, P);
  for (const sx of [-1.9, 1.9]) {
    box(0.5, 2.6, 0.5, mat.stone, sx, 1.3, P);
    sph(0.22, mat.stone, sx, 2.75, P);
  }
  box(3.8, 0.3, 0.3, mat.stone, 0, 3.0, P);
  for (let i = 0; i < 13; i++) cyl(0.02, 0.02, 2.4, mat.iron, -1.55 + i * 0.26, 1.2, P, null, 5);
  for (const y of [0.4, 2.2]) box(3.3, 0.06, 0.06, mat.iron, 0, y, P);

  /* ============================================================
     ÁRBOLES (InstancedMesh, colocados con semilla)
     ============================================================ */
  const PATH = [
    [0, -12], [0, -4], [4, -6], [6.5, -11], [10.5, -11], [6.5, -11], [4, 2], [4, 8],
    [4, 14.6], [13.5, 14.6], [14.6, 10.4], [13.5, 14.6],
    [-4, 12.5], [-7.2, 12.5], [-13, 12.5], [-7.2, 12.5], [-4, 12.5], [0, 16], [-3, 6],
    [-8, 0], [-8.2, -6.5], [-14, -4], [-16, -14], [-4, -9],
  ];
  const ITEMS = [
    { kind: "relic", x: 13.0, z: -13.0 },                       // dentro de la cabaña
    { kind: "relic", x: -12.5, z: 13.6 },                       // cementerio
    { kind: "relic", x: -8.6, z: -9.7 },                        // junto al pozo
    { kind: "battery", x: 1.5, z: 1.3 },
    { kind: "battery", x: 15, z: 4, skip: ["blackout"] },
    { kind: "medkit", x: 9.0, z: -13.0, skip: ["blackout"] },
    { kind: "medkit", x: 6, z: 13, skip: ["dark", "blackout"] },
    { kind: "holywater", x: -8, z: 16.6 },
  ];
  const SPOTS = [{ x: 14, z: 15 }, { x: -16, z: -14 }, { x: 15, z: -17 }, { x: -17, z: 3 }, { x: 5, z: 17 }, { x: 16, z: -3 },
    { x: 14.5, z: 11.2 }, { x: -21, z: -6 }, { x: 20, z: -20 }, { x: -20, z: 21 }];

  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  }
  function freeSpot(x, z) {
    for (let i = 0; i < PATH.length; i++) {
      const a = PATH[i], b = PATH[(i + 1) % PATH.length];
      if (segDist(x, z, a[0], a[1], b[0], b[1]) < 2.0) return false;
    }
    const rects = [[6.5, 15.5, -15.5, -6.5], [-17, -5, 7, 19], [6.2, 13.8, 6.2, 13.8], [13, 20.5, 9, 16]];
    for (const [x1, x2, z1, z2] of rects) if (x > x1 && x < x2 && z > z1 && z < z2) return false;
    const circles = [[0, 0, 4.5], [-10, -8, 2.6], [0, -B + 4, 3.5], [0, B - 1, 3.5], [3, -B + 6, 1.5], [1.8, -B + 5.4, 1.5]];
    for (const [cx, cz, r] of circles) if (Math.hypot(x - cx, z - cz) < r) return false;
    for (const it of ITEMS.concat(SPOTS)) if (Math.hypot(x - it.x, z - it.z) < 1.6) return false;
    return true;
  }

  const trees = [];
  for (let tries = 0; trees.length < 130 && tries < 6000; tries++) {
    const x = rr(-B + 0.8, B - 0.8), z = rr(-B + 0.8, B - 0.8);
    if (!freeSpot(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.6)) continue;
    trees.push({ x, z, solid: true });
  }
  // anillo denso por fuera de la cerca (solo decorado, tapa el horizonte)
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = rr(B + 1.5, B + 9);
    trees.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, solid: false });
  }

  const trunkGeo = new THREE.CylinderGeometry(0.45, 1, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const branchGeo = new THREE.CylinderGeometry(0.35, 1, 1, 5); branchGeo.translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
  const trunkM = [], branchM = [], coneM = [];
  const d = new THREE.Object3D();
  for (const t of trees) {
    const pine = rnd() < 0.3;
    const h = pine ? rr(5, 8) : rr(3.5, 7), r = rr(0.14, 0.26);
    d.position.set(t.x, 0, t.z); d.rotation.set(rr(-0.06, 0.06), rnd() * 6.28, rr(-0.06, 0.06)); d.scale.set(r, h, r);
    d.updateMatrix(); trunkM.push(d.matrix.clone());
    if (pine) {
      for (let j = 0; j < 3; j++) {
        const cr = (1.5 - j * 0.38) * rr(0.8, 1.1);
        d.position.set(t.x, h * (0.3 + j * 0.2), t.z); d.rotation.set(0, rnd() * 6.28, 0); d.scale.set(cr, h * 0.38, cr);
        d.updateMatrix(); coneM.push(d.matrix.clone());
      }
    } else {
      const nb = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < nb; j++) {
        const y = h * rr(0.45, 0.85), len = rr(0.9, 2.0);
        d.position.set(t.x, y, t.z);
        d.rotation.set(0, rnd() * 6.28, 0);
        d.rotateZ(rr(0.6, 1.15));
        d.scale.set(0.05, len, 0.05);
        d.updateMatrix(); branchM.push(d.matrix.clone());
      }
    }
    if (t.solid) ob(t.x - r - 0.05, t.x + r + 0.05, t.z - r - 0.05, t.z + r + 0.05);
  }
  const inst = (geo, material, list) => {
    const m = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  inst(trunkGeo, mat.bark, trunkM);
  inst(branchGeo, mat.bark, branchM);
  inst(coneGeo, mat.pine, coneM);
  // rocas sueltas
  for (let i = 0; i < 60; i++) {
    const x = rr(-B, B), z = rr(-B, B);
    if (!freeSpot(x, z)) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.1, 0.3), 0), mat.stone);
    rock.position.set(x, 0.05, z); rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }

  /* ---------------- luces ---------------- */
  scene.add(new THREE.AmbientLight(0x4a5a7a, 1.0));
  scene.add(new THREE.HemisphereLight(0x5a6e9a, 0x1a140e, 0.8));
  const moonLight = new THREE.DirectionalLight(0x9fb4e6, 1.1);
  moonLight.position.set(-14, 18, 22);
  moonLight.target.position.set(0, 0, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonLight.shadow.camera, { left: -B - 4, right: B + 4, top: B + 4, bottom: -B - 4, near: 1, far: 80 });
  moonLight.shadow.bias = -0.0008;
  scene.add(moonLight, moonLight.target);

  /* ---------------- partículas: ceniza y brasas ---------------- */
  const ASH = 900, ashPos = new Float32Array(ASH * 3), ashSeed = new Float32Array(ASH);
  for (let i = 0; i < ASH; i++) {
    ashPos.set([rr(-15, 15), rr(0, 9), rr(-15, 15)], i * 3);
    ashSeed[i] = rnd() * 100;
  }
  const ashGeo = new THREE.BufferGeometry();
  ashGeo.setAttribute("position", new THREE.BufferAttribute(ashPos, 3));
  const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({
    color: 0xb9b3a8, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false,
  }));
  ash.frustumCulled = false;
  scene.add(ash);

  const EMB = 60, embPos = new Float32Array(EMB * 3), embLife = new Float32Array(EMB);
  for (let i = 0; i < EMB; i++) { embLife[i] = rnd() * 3; embPos.set([0, -5, 0], i * 3); }
  const embGeo = new THREE.BufferGeometry();
  embGeo.setAttribute("position", new THREE.BufferAttribute(embPos, 3));
  scene.add(new THREE.Points(embGeo, new THREE.PointsMaterial({
    color: 0xff8a2a, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  const center = new THREE.Vector3();
  function update(dt, t, playerPos) {
    fire.intensity = 3.1 + Math.sin(t * 11) * 0.4 + Math.random() * 0.6;
    glow.material.opacity = 0.75 + Math.sin(t * 9) * 0.1 + Math.random() * 0.1;
    if (playerPos) center.copy(playerPos);
    // la ceniza cae alrededor del jugador y se recicla al salir del cubo
    const a = ashGeo.attributes.position;
    for (let i = 0; i < ASH; i++) {
      let x = a.getX(i) + Math.sin(t * 0.5 + ashSeed[i]) * dt * 0.3 + dt * 0.15;
      let y = a.getY(i) - dt * (0.25 + (ashSeed[i] % 1) * 0.3);
      let z = a.getZ(i) + Math.cos(t * 0.4 + ashSeed[i]) * dt * 0.3;
      if (y < 0) y += 9;
      if (x - center.x > 15) x -= 30; else if (x - center.x < -15) x += 30;
      if (z - center.z > 15) z -= 30; else if (z - center.z < -15) z += 30;
      a.setXYZ(i, x, y, z);
    }
    a.needsUpdate = true;
    // brasas que suben de la fogata
    const e = embGeo.attributes.position;
    for (let i = 0; i < EMB; i++) {
      embLife[i] -= dt;
      if (embLife[i] <= 0) {
        embLife[i] = 1.5 + Math.random() * 2;
        e.setXYZ(i, (Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5);
      } else {
        e.setXYZ(i, e.getX(i) + Math.sin(t * 3 + i) * dt * 0.3, e.getY(i) + dt * (0.8 + (i % 5) * 0.15), e.getZ(i) + Math.cos(t * 2 + i) * dt * 0.3);
      }
    }
    e.needsUpdate = true;
  }

  /* ---------------- datos del nivel ---------------- */
  return {
    name: "Bosque de Ceniza",
    background: 0x05070c, fogColor: 0x0a0d14, fog: 0.065, exposure: 1.7,
    surface: "grass",
    relicStyle: "rune",
    navStep: 2.0,          // rejilla de navegación más abierta al aire libre
    bounds: { x1: -B, x2: B, z1: -B, z2: B },
    camZones: [
      { x1: 8.4, x2: 13.6, z1: -13.6, z2: -8.4, h: CH - 0.2 },     // dentro de la cabaña
      { x1: 7.5, x2: 8.5, z1: -11.5, z2: -10.5, h: 2.0 },         // puerta de la cabaña
      // exterior en 4 franjas alrededor de la cabaña (sus muros quedan fuera de toda zona)
      { x1: -B + 0.25, x2: B - 0.25, z1: -B + 0.25, z2: -14.4, h: 25 },
      { x1: -B + 0.25, x2: B - 0.25, z1: -7.6, z2: B - 0.25, h: 25 },
      { x1: -B + 0.25, x2: 7.6, z1: -14.4, z2: -7.6, h: 25 },
      { x1: 14.4, x2: B - 0.25, z1: -14.4, z2: -7.6, h: 25 },
    ],
    spawn: {
      survivor: { pos: V(0, 0, -B + 4), heading: 0 },
      monster: { pos: V(-11, 0, 12.5), heading: Math.PI / 2 },    // en el cementerio
    },
    npcPath: PATH.map(([x, z]) => V(x, 0, z)),
    npcStart: 15,
    items: ITEMS,
    spots: SPOTS,
    exit: { x: 0, z: B - 1, r: 1.5, label: "la reja del bosque", beaconY: 3.4 },
    update,
  };
}
