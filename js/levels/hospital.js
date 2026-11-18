/* =========================================================
   PENUMBRA — Escenario 2: HOSPITAL SAN JUDAS
   Hospital abandonado: recepción → pasillo principal con
   sala de pacientes, farmacia, rayos X, archivo, quirófano y
   morgue → elevador de servicio (la salida, necesita 3 fusibles).
   Ala sur (desde la recepción): pabellón psiquiátrico con celdas
   acolchadas, lavandería y cuarto de calderas.

   Construido con figuras básicas (cajas, cilindros, esferas,
   toros, planos) y texturas procedurales en <canvas>:
   azulejo sucio, pintura verde de hospital, plafones.
   Luz ambiental fría + focal: tubos fluorescentes que fallan,
   lámpara quirúrgica (SpotLight con sombra), luz de la morgue.
   Partículas: polvo y chispas de un fluorescente roto.

   Recibe el "kit" del motor (js/scene3d.js) y devuelve los
   datos del nivel (colisiones, cámara, IA, ítems, salida).
   ========================================================= */

export function buildHospital(k) {
  const { THREE, M, tex, cvs, grain, bloodCanvas, writingCanvas, V } = k;
  const scene = k.scene;
  const H = 3.0, T = 0.15;

  /* ---------------- escala de la planta ----------------
     Todo el hospital original está escrito en coordenadas de una planta
     más chica. S agranda cuartos y pasillos (posiciones, muros, pisos y
     la ronda del monstruo) SIN agrandar los muebles: una cama sigue
     midiendo lo mismo, solo queda más espacio entre las cosas. Las piezas
     dentro de un grupo (parent) usan coordenadas locales y no se escalan.
     El ala sur nueva (más abajo) usa directamente las medidas finales. */
  const S = 1.5;
  const sc = (v) => v * S;
  const box = (w, h, d, mat, x, y, z, parent) =>
    parent ? k.box(w, h, d, mat, x, y, z, parent) : k.box(w, h, d, mat, sc(x), y, sc(z));
  const cyl = (rt, rb, h, mat, x, y, z, parent, seg) =>
    parent ? k.cyl(rt, rb, h, mat, x, y, z, parent, seg) : k.cyl(rt, rb, h, mat, sc(x), y, sc(z), null, seg);
  const sph = (r, mat, x, y, z, parent) => (parent ? k.sph(r, mat, x, y, z, parent) : k.sph(r, mat, sc(x), y, sc(z)));
  const wallBox = (x1, x2, z1, z2, h, mat, y0) => k.wallBox(sc(x1), sc(x2), sc(z1), sc(z2), h, mat, y0);
  const floorPlane = (x1, x2, z1, z2, y, mat, tileM, down) => k.floorPlane(sc(x1), sc(x2), sc(z1), sc(z2), y, mat, tileM, down);
  const decal = (t, w, h, x, y, z, rx, ry, rz) => k.decal(t, w, h, sc(x), y, sc(z), rx, ry, rz);
  // obstáculo de un mueble: se mueve con la escala pero conserva su tamaño
  const ob = (x1, x2, z1, z2) => {
    const cx = sc((x1 + x2) / 2), cz = sc((z1 + z2) / 2), hx = (x2 - x1) / 2, hz = (z2 - z1) / 2;
    k.addObstacle({ x1: cx - hx, x2: cx + hx, z1: cz - hz, z2: cz + hz });
  };
  // medidas finales (sin escala) para el ala nueva
  const R = { box: k.box, cyl: k.cyl, sph: k.sph, wallBox: k.wallBox, floorPlane: k.floorPlane, decal: k.decal,
    ob: (x1, x2, z1, z2) => k.addObstacle({ x1, x2, z1, z2 }) };

  /* ---------------- texturas ---------------- */
  function tileCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    const n = 4, s = 512 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const l = 70 + Math.random() * 8;
      x.fillStyle = `hsl(150, 6%, ${l}%)`;
      x.fillRect(i * s, j * s, s, s);
      x.strokeStyle = "rgba(40,45,40,.7)"; x.lineWidth = 4;
      x.strokeRect(i * s, j * s, s, s);
    }
    for (let i = 0; i < 14; i++) {        // mugre
      const rg = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 4, Math.random() * 512, Math.random() * 512, 40 + Math.random() * 110);
      rg.addColorStop(0, "rgba(50,42,25,.5)"); rg.addColorStop(1, "rgba(50,42,25,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    for (let i = 0; i < 6; i++) {         // grietas
      x.strokeStyle = "rgba(20,20,20,.6)"; x.lineWidth = 1;
      x.beginPath();
      let px = Math.random() * 512, py = Math.random() * 512;
      x.moveTo(px, py);
      for (let s2 = 0; s2 < 6; s2++) { px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
    grain(x, 512, 512, 9000, 0.2);
    return c;
  }
  function paintCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#6f8c7c"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 22; i++) {        // chorreones de humedad (se repiten sin costura)
      const px = Math.random() * 512, y0 = Math.random() * 512, len = 120 + Math.random() * 220;
      const w = 3 + Math.random() * 10;
      for (const oy of [0, -512]) {
        const g = x.createLinearGradient(0, y0 + oy, 0, y0 + oy + len);
        g.addColorStop(0, "rgba(45,38,22,.22)"); g.addColorStop(1, "rgba(45,38,22,0)");
        x.fillStyle = g;
        x.fillRect(px, y0 + oy, w, len);
      }
    }
    for (let i = 0; i < 8; i++) {         // manchas grandes de humedad
      const rg = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 6, Math.random() * 512, Math.random() * 512, 60 + Math.random() * 90);
      rg.addColorStop(0, "rgba(40,45,30,.28)"); rg.addColorStop(1, "rgba(40,45,30,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    for (let i = 0; i < 10; i++) {        // pintura descascarada
      x.fillStyle = `rgba(190,190,170,${0.15 + Math.random() * 0.2})`;
      x.beginPath();
      x.ellipse(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 30, 6 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
      x.fill();
    }
    grain(x, 512, 512, 9000, 0.25);
    return c;
  }
  function ceilCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "#8d8a80"; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "#3a3a36"; x.lineWidth = 6;
    x.strokeRect(0, 0, 128, 128); x.strokeRect(128, 0, 128, 128);
    x.strokeRect(0, 128, 128, 128); x.strokeRect(128, 128, 128, 128);
    x.fillStyle = "rgba(60,45,20,.45)";
    x.beginPath(); x.ellipse(180, 60, 40, 28, 0.4, 0, Math.PI * 2); x.fill();
    grain(x, 256, 256, 4000, 0.3);
    return c;
  }
  // letrero de hospital: letras blancas sobre placa verde oscuro
  function signTex(text) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#1d3b2e"; x.fillRect(0, 0, 512, 128);
    x.strokeStyle = "#d8dccf"; x.lineWidth = 6; x.strokeRect(8, 8, 496, 112);
    x.fillStyle = "#e4e6da"; x.font = "bold 62px Arial, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text, 256, 68);
    grain(x, 512, 128, 2500, 0.35);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function monitorTex() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#020a04"; x.fillRect(0, 0, 256, 128);
    x.strokeStyle = "#3dff6a"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, 70);
    for (let px = 0; px < 256; px += 4) {
      const beat = px % 96;
      const y = beat > 40 && beat < 52 ? (beat < 46 ? 20 : 110) : 70 + Math.sin(px) * 2;
      x.lineTo(px, y);
    }
    x.stroke();
    x.fillStyle = "#3dff6a"; x.font = "20px monospace"; x.fillText("BPM --", 170, 24);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---------------- materiales ---------------- */
  const mat = {
    tile: new THREE.MeshStandardMaterial({ map: tex(tileCanvas(), 1, 1), roughness: 0.45 }),
    wall: new THREE.MeshStandardMaterial({ map: tex(paintCanvas(), 1, 1), roughness: 0.9 }),
    ceil: new THREE.MeshStandardMaterial({ map: tex(ceilCanvas(), 1, 1), roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.2, metalness: 1 }),
    white: new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.7 }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xc8c4b6, roughness: 0.95 }),
    mattress: new THREE.MeshStandardMaterial({ color: 0x7d8f86, roughness: 0.9 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0x8fa79a, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f5444, roughness: 0.7 }),
    counter: new THREE.MeshStandardMaterial({ color: 0x9b8f78, roughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1e20, roughness: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    tubeOn: new THREE.MeshBasicMaterial({ color: 0xe8fff4 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd8b51e, roughness: 0.6 }),
  };

  /* ---------------- muros con huecos de puerta ---------------- */
  const keepWidth = (gaps) => gaps.map(([a, b]) => { const c = (a + b) / 2, w = (b - a) / (2 * S); return [c - w, c + w]; });
  function wallZ(x, z1, z2, gaps = []) {
    gaps = keepWidth(gaps);
    let z = z1;
    for (const [g1, g2] of gaps) {
      if (g1 > z) wallBox(x - T, x + T, z, g1, H, mat.wall);
      wallBox(x - T, x + T, g1, g2, H - 2.3, mat.wall, 2.3);      // dintel (no bloquea)
      box(0.34, 0.1, g2 - g1 + 0.2, mat.white, x, 2.3, (g1 + g2) / 2);
      for (const gz of [g1, g2]) box(0.34, 2.3, 0.1, mat.white, x, 1.15, gz);
      z = g2;
    }
    if (z < z2) wallBox(x - T, x + T, z, z2, H, mat.wall);
  }
  function wallX(z, x1, x2, gaps = []) {
    gaps = keepWidth(gaps);
    let x = x1;
    for (const [g1, g2] of gaps) {
      if (g1 > x) wallBox(x, g1, z - T, z + T, H, mat.wall);
      wallBox(g1, g2, z - T, z + T, H - 2.3, mat.wall, 2.3);
      x = g2;
    }
    if (x < x2) wallBox(x, x2, z - T, z + T, H, mat.wall);
  }
  function room(x1, x2, z1, z2) {
    floorPlane(x1, x2, z1, z2, 0, mat.tile, 2);
    floorPlane(x1, x2, z1, z2, H, mat.ceil, 1.2, true);
  }
  function sign(text, x, y, z, ry, w = 1.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: signTex(text), roughness: 0.6 }));
    m.position.set(sc(x), y, sc(z)); m.rotation.y = ry;
    scene.add(m);
    return m;
  }
  // tubo fluorescente en el techo + luz puntual (opcionalmente falla)
  function fluoro(x, z, axis = "z", color = 0xdff5ea, intensity = 1.1, mode = null, phase = 0) {
    const len = 1.2;
    box(axis === "z" ? 0.3 : len + 0.1, 0.06, axis === "z" ? len + 0.1 : 0.3, mat.steel, x, H - 0.04, z);
    const tube = box(axis === "z" ? 0.07 : len, 0.05, axis === "z" ? len : 0.07, mat.tubeOn, x, H - 0.1, z);
    tube.castShadow = false;
    const l = new THREE.PointLight(color, intensity, 9, 1.8);
    l.position.set(sc(x), H - 0.35, sc(z));
    scene.add(l);
    if (mode) k.addFlicker({ light: l, bulb: tube, base: intensity, soft: mode === "soft", phase });
    return l;
  }

  /* ============================================================
     ESTRUCTURA
     ============================================================ */
  // recepción (x -6..6, z -6..0) · pasillo (x -1.5..1.5, z 0..24)
  // sala B (x -9..-1.5, z 3..11) · farmacia (x 1.5..8, z 3..9)
  // quirófano (x -8..-1.5, z 14..21) · morgue (x 1.5..9, z 13..22)
  // archivo (x -8..-1.5, z 11..14) · rayos X (x 1.5..8, z 9..13)
  room(-6, 6, -6, 0);
  room(-1.5, 1.5, 0, 24);
  room(-9, -1.5, 3, 11);
  room(1.5, 8, 3, 9);
  room(-8, -1.5, 14, 21);
  room(1.5, 9, 13, 22);
  room(-8, -1.5, 11, 14);
  room(1.5, 8, 9, 13);

  wallX(-6, -6.15, 6.15, [[-5.2, -4.0]]);   // puerta al ala sur
  wallZ(-6, -6, 0);
  wallZ(6, -6, 0);
  wallX(0, -6.15, -1.5);
  wallX(0, 1.5, 6.15);
  wallZ(-1.5, 0, 24, [[6.0, 7.4], [11.8, 13.2], [16.5, 17.9]]);
  wallZ(1.5, 0, 24, [[5.0, 6.4], [10.6, 12.0], [17.0, 18.4]]);
  wallX(24, -1.65, 1.65);
  // sala B
  wallZ(-9, 3, 11); wallX(3, -9.15, -1.5); wallX(11, -9.15, -1.5);
  // farmacia
  wallZ(8, 3, 9); wallX(3, 1.5, 8.15); wallX(9, 1.5, 8.15, [[2.2, 3.4]]);
  // quirófano
  wallZ(-8, 14, 21); wallX(14, -8.15, -1.5, [[-4.0, -2.8]]); wallX(21, -8.15, -1.5);
  // archivo y rayos X (sus otros muros son los de los cuartos vecinos)
  wallZ(-8, 11, 14);
  wallZ(8, 9, 13);
  // morgue
  wallZ(9, 13, 22); wallX(13, 1.5, 9.15); wallX(22, 1.5, 9.15);

  // zócalo oscuro en el pasillo (lectura de profundidad)
  for (const sx of [-1, 1]) box(0.04, 0.25, 24, mat.green, sx * (1.5 - T - 0.02), 0.125, 12);

  /* ============================================================
     RECEPCIÓN
     ============================================================ */
  box(5.0, 1.1, 0.5, mat.counter, 0, 0.55, -4.05);
  box(5.2, 0.05, 0.62, mat.white, 0, 1.12, -4.05);
  for (const sx of [-1, 1]) box(0.5, 1.1, 1.7, mat.counter, sx * 2.25, 0.55, -4.85);
  box(0.5, 0.35, 0.05, mat.dark, -0.8, 1.35, -4.2);                  // monitor
  box(0.42, 0.28, 0.01, new THREE.MeshBasicMaterial({ color: 0x0a1a12 }), -0.8, 1.36, -4.17);
  box(0.12, 0.12, 0.12, mat.dark, -0.8, 1.17, -4.25);
  for (let i = 0; i < 5; i++) box(0.22, 0.004, 0.3, mat.white, 0.6 + Math.random() * 0.8, 1.15 + i * 0.004, -4.0).rotation.y = Math.random();
  sph(0.05, mat.chrome, 1.8, 1.17, -3.95);
  ob(-2.6, 2.6, -5.85, -3.7);
  for (let i = 0; i < 3; i++) box(1.6, 0.04, 0.35, mat.counter, 0, 0.9 + i * 0.5, -5.65);   // archivero
  sign("RECEPCIÓN", 0, 2.45, -5.83, 0, 1.6);

  // sillas de espera
  for (const z of [-1.5, -0.75]) for (let i = 0; i < 4; i++) {
    const x = 3.3 + i * 0.65;
    box(0.5, 0.06, 0.45, mat.green, x, 0.45, z);
    box(0.5, 0.5, 0.05, mat.green, x, 0.72, z + 0.22);
    for (const sx of [-0.2, 0.2]) cyl(0.015, 0.015, 0.45, mat.steel, x + sx, 0.22, z);
  }
  ob(3.0, 5.8, -1.8, -0.4);
  // máquina expendedora (brilla un poco)
  box(0.8, 1.9, 0.8, mat.dark, -5.55, 0.95, -2.5);
  const vend = box(0.02, 1.2, 0.55, new THREE.MeshBasicMaterial({ color: 0x5d7f9a }), -5.14, 1.2, -2.5);
  vend.castShadow = false;
  ob(-6, -5.1, -2.95, -2.05);
  // maceta seca
  cyl(0.25, 0.2, 0.45, mat.counter, -5.4, 0.22, -5.4);
  for (let i = 0; i < 6; i++) {
    const st = cyl(0.006, 0.01, 0.8, M.woodDark, -5.4, 0.8, -5.4);
    st.rotation.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9);
  }
  ob(-5.75, -5.05, -5.75, -5.05);
  // rincón de la capilla: altar con veladora
  box(0.6, 0.9, 0.6, M.woodDark, 5.5, 0.45, -5.5);
  box(0.06, 0.5, 0.06, M.brass, 5.5, 1.15, -5.6);
  box(0.3, 0.06, 0.06, M.brass, 5.5, 1.25, -5.6);
  cyl(0.03, 0.03, 0.1, M.wax, 5.35, 0.95, -5.35);
  k.flameMesh(0.8).position.set(sc(5.35), 1.04, sc(-5.35));
  const altar = new THREE.PointLight(0xffb060, 0.6, 3, 2);
  altar.position.set(sc(5.35), 1.2, sc(-5.35));
  scene.add(altar);
  ob(5.15, 5.85, -5.85, -5.15);
  decal(bloodCanvas(1), 1.3, 1.3, -1.6, 0.014, -2.6, -Math.PI / 2, 0, 0.3);

  fluoro(0, -2.4, "x", 0xdff5ea, 1.2, "soft");
  fluoro(-3.6, -4.2, "x", 0xdff5ea, 0.9, "hard", 1.3);

  /* ============================================================
     PASILLO PRINCIPAL
     ============================================================ */
  // silla de ruedas abandonada
  const wc = new THREE.Group();
  wc.position.set(sc(0.9), 0, sc(14.6)); wc.rotation.y = -0.5;
  scene.add(wc);
  box(0.45, 0.05, 0.45, mat.dark, 0, 0.5, 0, wc);
  box(0.45, 0.5, 0.05, mat.dark, 0, 0.78, -0.22, wc);
  for (const sx of [-0.27, 0.27]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 24), mat.chrome);
    w.position.set(sx, 0.3, 0); w.rotation.y = Math.PI / 2;
    wc.add(w);
  }
  ob(0.55, 1.25, 14.2, 15.0);
  // camilla junto a la pared
  gurney(-1.0, 9.6, Math.PI / 2, false);
  ob(-1.35, -0.65, 8.6, 10.6);
  // letrero de piso mojado
  const wf = new THREE.Group();
  wf.position.set(sc(0.9), 0, sc(3.0));
  scene.add(wf);
  for (const r of [0.25, -0.25]) { const p = box(0.32, 0.6, 0.02, mat.yellow, 0, 0.3, r * 0.4, wf); p.rotation.x = r; }
  ob(0.7, 1.1, 2.8, 3.2);
  // rastro de sangre que arrastra hacia el quirófano
  for (let i = 0; i < 7; i++) decal(bloodCanvas(0), 0.5, 0.7, -0.2 - i * 0.12, 0.014, 11.8 + i * 0.75, -Math.PI / 2, 0, 0.1 * i);
  decal(writingCanvas("AYÚDENME"), 2.6, 0.65, 1.5 - T - 0.01, 1.7, 21.0, 0, -Math.PI / 2);
  // papeles regados
  for (let i = 0; i < 10; i++) box(0.22, 0.004, 0.3, mat.white, (Math.random() - 0.5) * 2.2, 0.006, 1 + Math.random() * 22).rotation.y = Math.random() * 3;

  sign("SALA B", -1.5 + T + 0.01, 2.62, 6.7, Math.PI / 2, 1.0);
  sign("FARMACIA", 1.5 - T - 0.01, 2.62, 5.7, -Math.PI / 2, 1.0);
  sign("QUIRÓFANO", -1.5 + T + 0.01, 2.62, 17.2, Math.PI / 2, 1.0);
  sign("MORGUE", 1.5 - T - 0.01, 2.62, 17.7, -Math.PI / 2, 1.0);

  fluoro(0, 3.2, "z", 0xdff5ea, 1.0, "soft");
  fluoro(0, 9.5, "z", 0xdff5ea, 1.1, "hard", 2.1);
  fluoro(0, 15.0, "z", 0xcfe8ff, 0.9, "soft");

  // fluorescente roto colgando de un cable: se balancea y suelta chispas
  const hang = new THREE.Group();
  hang.position.set(sc(0.5), H - 0.05, sc(21.2));
  scene.add(hang);
  cyl(0.005, 0.005, 0.7, mat.dark, 0, -0.35, 0, hang);
  const broken = new THREE.Group();
  broken.position.y = -0.7; broken.rotation.z = 0.9;
  hang.add(broken);
  box(1.2, 0.06, 0.25, mat.steel, 0, 0, 0, broken);
  const brokenTube = box(1.1, 0.04, 0.06, mat.tubeOn, 0, -0.04, 0, broken);
  const brokenLight = new THREE.PointLight(0xcfe8ff, 0.9, 6, 1.8);
  brokenLight.position.set(0, -0.2, 0);
  broken.add(brokenLight);

  /* ---------------- Partículas: chispas y polvo ---------------- */
  const SPARKS = 50;
  const sparkPos = new Float32Array(SPARKS * 3), sparkVel = [];
  for (let i = 0; i < SPARKS; i++) { sparkPos.set([0, -10, 0], i * 3); sparkVel.push([0, 0, 0, 0]); }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xfff0a0, size: 0.035, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(sparks);
  let sparkTimer = 1;

  const DUST = 260, dustPos = new Float32Array(DUST * 3);
  const dustZones = [[-6, 6, -6, 0], [-1.5, 1.5, 0, 24], [-9, -1.5, 3, 11], [1.5, 8, 3, 9], [-8, -1.5, 14, 21], [1.5, 9, 13, 22]]
    .map((z) => z.map(sc)).concat([[-16, -2.25, -24, -10], [2.25, 14, -24, -9.5], [-2.25, 2.25, -24, -9]]);
  for (let i = 0; i < DUST; i++) {
    const [x1, x2, z1, z2] = dustZones[i % dustZones.length];
    dustPos.set([x1 + Math.random() * (x2 - x1), Math.random() * H, z1 + Math.random() * (z2 - z1)], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xb8c4bc, size: 0.012, transparent: true, opacity: 0.3, depthWrite: false,
  }));
  scene.add(dust);

  /* ============================================================
     SALA B (pacientes)
     ============================================================ */
  function bed(x, z, ry, tipped = false) {
    const g = new THREE.Group();
    g.position.set(sc(x), 0, sc(z)); g.rotation.y = ry;
    scene.add(g);
    box(0.9, 0.08, 1.95, mat.steel, 0, 0.55, 0, g);
    box(0.85, 0.14, 1.85, mat.mattress, 0, 0.66, 0, g);
    box(0.86, 0.03, 1.2, mat.sheet, 0, 0.745, 0.3, g);
    box(0.5, 0.1, 0.32, mat.white, 0, 0.78, -0.72, g);
    box(0.9, 0.55, 0.04, mat.steel, 0, 0.9, -0.97, g);
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.92, 0.92]) cyl(0.02, 0.02, 0.55, mat.steel, sx, 0.27, sz, g, 8);
    if (tipped) { g.rotation.z = 1.35; g.position.y = 0.45; }
    return g;
  }
  function ivStand(x, z) {
    cyl(0.012, 0.012, 1.8, mat.chrome, x, 0.9, z, null, 8);
    cyl(0.2, 0.2, 0.02, mat.chrome, x, 0.02, z, null, 12);
    box(0.12, 0.2, 0.04, new THREE.MeshStandardMaterial({ color: 0xc7d8c0, transparent: true, opacity: 0.6 }), x + 0.08, 1.65, z);
  }
  for (const x of [-7.8, -5.6, -3.4]) {
    bed(x, 4.15, 0);
    ob(x - 0.5, x + 0.5, 3, 5.25);
    ivStand(x + 0.65, 3.6);
  }
  for (const x of [-7.8, -5.6]) {
    bed(x, 9.85, Math.PI);
    ob(x - 0.5, x + 0.5, 8.75, 11);
  }
  bed(-3.4, 9.85, Math.PI + 0.3, true);
  ob(-4.1, -2.75, 8.9, 10.9);
  // cortinas entre camas
  for (const x of [-6.7, -4.5]) for (const [z, zz] of [[4.15, 3.2], [9.85, 10.8]]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), mat.curtain);
    c.position.set(sc(x), 1.3, sc(z)); c.rotation.y = Math.PI / 2;
    scene.add(c);
    box(0.03, 0.03, 2.2, mat.chrome, x, 2.35, zz + (z - zz));
  }
  decal(bloodCanvas(2), 1.2, 1.2, -5.6, 0.014, 7.2, -Math.PI / 2, 0, 1.2);
  fluoro(-5.2, 7.0, "x", 0xd5f0e2, 1.0, "soft");

  /* ============================================================
     FARMACIA
     ============================================================ */
  function shelf(x1, x2, z1, z2, levels = 4) {
    const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    for (let i = 0; i < levels; i++) {
      const y = 0.25 + i * 0.5;
      box(w, 0.03, d, mat.steel, cx, y, cz);
      const n = Math.floor(Math.max(w, d) / 0.18);
      for (let j = 0; j < n; j++) {
        if (Math.random() < 0.3) continue;      // huecos saqueados
        const along = -Math.max(w, d) / 2 + 0.1 + j * 0.18;
        const px = w > d ? cx + along : cx, pz = w > d ? cz : cz + along;
        if (Math.random() < 0.5) cyl(0.035, 0.035, 0.14, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.4, 0.4), roughness: 0.4 }), px, y + 0.085, pz, null, 8);
        else box(0.12, 0.16, 0.1, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.1 + Math.random() * 0.5, 0.25, 0.65), roughness: 0.8 }), px, y + 0.095, pz);
      }
    }
    for (const sx of [x1, x2]) for (const sz of [z1, z2]) cyl(0.015, 0.015, levels * 0.5, mat.steel, sx, levels * 0.25, sz, null, 6);
  }
  shelf(7.35, 7.85, 3.4, 8.6);
  ob(7.25, 8, 3.25, 8.75);
  shelf(3.0, 6.5, 3.2, 3.6);
  ob(2.9, 6.6, 3, 3.7);
  box(1.8, 0.95, 0.6, mat.counter, 4.5, 0.47, 7.7);
  box(1.9, 0.04, 0.68, mat.white, 4.5, 0.96, 7.7);
  ob(3.55, 5.45, 7.35, 8.05);
  for (let i = 0; i < 12; i++) sph(0.012, mat.white, 3 + Math.random() * 3, 0.012, 4 + Math.random() * 3);   // pastillas regadas
  fluoro(4.8, 6.0, "x", 0xe6f2ff, 1.0, "soft");

  /* ============================================================
     QUIRÓFANO
     ============================================================ */
  cyl(0.18, 0.28, 0.75, mat.steel, -5, 0.38, 18.6);
  box(2.0, 0.1, 0.72, mat.steel, -5, 0.8, 18.6);
  box(1.9, 0.06, 0.66, mat.mattress, -5, 0.88, 18.6);
  box(1.4, 0.02, 0.7, new THREE.MeshStandardMaterial({ color: 0x6a1010, roughness: 0.4 }), -5.1, 0.92, 18.6);
  ob(-6.1, -3.9, 18.15, 19.05);
  // lámpara quirúrgica: luz FOCAL con sombra
  cyl(0.02, 0.02, 0.8, mat.chrome, -5, H - 0.4, 18.6, null, 8);
  const lamp = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 10, 24), mat.white);
  lamp.position.set(sc(-5), H - 0.85, sc(18.6)); lamp.rotation.x = Math.PI / 2;
  scene.add(lamp);
  const lampGlass = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ color: 0xfffbea }));
  lampGlass.position.set(sc(-5), H - 0.9, sc(18.6)); lampGlass.rotation.x = Math.PI / 2;
  scene.add(lampGlass);
  const surg = new THREE.SpotLight(0xfff6e0, 6, 6, 0.6, 0.5, 1.5);
  surg.position.set(sc(-5), H - 0.95, sc(18.6));
  surg.target.position.set(sc(-5), 0, sc(18.6));
  surg.castShadow = true;
  surg.shadow.mapSize.set(512, 512);
  scene.add(surg, surg.target);
  k.addFlicker({ light: surg, bulb: lampGlass, base: 6, soft: false, phase: 4 });
  // carrito de instrumental
  box(0.6, 0.04, 0.4, mat.chrome, -3.2, 0.9, 19.6);
  box(0.6, 0.04, 0.4, mat.chrome, -3.2, 0.4, 19.6);
  for (const sx of [-0.28, 0.28]) for (const sz of [-0.18, 0.18]) cyl(0.01, 0.01, 0.9, mat.chrome, -3.2 + sx, 0.45, 19.6 + sz, null, 6);
  for (let i = 0; i < 5; i++) box(0.18, 0.01, 0.02, mat.chrome, -3.4 + i * 0.08, 0.93, 19.6).rotation.y = Math.random() * 0.4;
  ob(-3.55, -2.85, 19.35, 19.85);
  // monitor de signos vitales
  cyl(0.02, 0.02, 1.3, mat.steel, -6.8, 0.65, 19.8, null, 8);
  box(0.5, 0.35, 0.08, mat.dark, -6.8, 1.45, 19.8);
  const mon = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), new THREE.MeshBasicMaterial({ map: monitorTex() }));
  mon.position.set(sc(-6.8), 1.45, sc(19.75)); mon.rotation.y = Math.PI;
  scene.add(mon);
  ob(-7.1, -6.5, 19.5, 20.1);
  // tanques de gas
  for (const [x, z] of [[-7.6, 14.5], [-7.25, 14.5]]) { cyl(0.12, 0.12, 1.2, new THREE.MeshStandardMaterial({ color: 0x2e6b46, roughness: 0.4, metalness: 0.6 }), x, 0.6, z); sph(0.12, mat.chrome, x, 1.22, z); }
  ob(-7.85, -7.0, 14.2, 14.8);
  decal(bloodCanvas(3), 1.8, 1.8, -5, 0.014, 18.0, -Math.PI / 2, 0, 0);
  decal(bloodCanvas(1), 0.9, 0.9, -8 + T + 0.01, 1.4, 17.5, 0, Math.PI / 2, 0.6);

  /* ============================================================
     MORGUE
     ============================================================ */
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const z = 14.4 + c * 1.9, y = 0.45 + r * 0.8;
    box(0.1, 0.72, 1.75, mat.steel, 8.75, y, z);
    box(0.05, 0.05, 0.4, mat.chrome, 8.68, y, z);
  }
  box(0.7, 2.5, 8.2, mat.dark, 9.0, 1.25, 17.5);
  ob(8.1, 9, 13.3, 21.7);
  // cajón abierto con un cuerpo bajo la sábana
  box(1.6, 0.06, 0.66, mat.steel, 7.4, 0.85, 16.3);
  body(7.4, 0.88, 16.3, Math.PI / 2);
  ob(6.5, 8.2, 15.9, 16.7);
  gurney(4.0, 14.6, 0, true);
  ob(3.0, 5.0, 14.25, 14.95);
  gurney(4.5, 20.6, 0, true);
  ob(3.5, 5.5, 20.25, 20.95);
  // coladera
  cyl(0.18, 0.18, 0.01, mat.dark, 5, 0.006, 17.7, null, 16);
  fluoro(5.2, 17.6, "x", 0xa9d0ff, 1.0, "hard", 3.3);

  function body(x, y, z, ry) {
    const g = new THREE.Group();
    g.position.set(sc(x), y, sc(z)); g.rotation.y = ry;
    scene.add(g);
    box(0.5, 0.18, 1.6, mat.sheet, 0, 0.09, 0, g);
    sph(0.13, mat.sheet, 0, 0.12, -0.85, g);
    for (const sx of [-0.12, 0.12]) box(0.1, 0.12, 0.08, mat.sheet, sx, 0.15, 0.82, g);
    return g;
  }
  function gurney(x, z, ry, withBody) {
    const g = new THREE.Group();
    g.position.set(sc(x), 0, sc(z)); g.rotation.y = ry;
    scene.add(g);
    box(1.9, 0.05, 0.6, mat.steel, 0, 0.8, 0, g);
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.25, 0.25]) {
      cyl(0.015, 0.015, 0.75, mat.chrome, sx, 0.4, sz, g, 6);
      sph(0.04, mat.rubber, sx, 0.04, sz, g);
    }
    if (withBody) {
      const b = body(0, 0, 0, Math.PI / 2);
      b.removeFromParent();
      b.position.set(0, 0.83, 0);
      g.add(b);
    }
    return g;
  }

  /* ============================================================
     ARCHIVO CLÍNICO (x -8..-1.5, z 11..14): entre la sala B y el
     quirófano. Une el pasillo con el quirófano (circuito).
     ============================================================ */
  function cabinet(x, z, ry, drawersOpen = 0) {
    const g = new THREE.Group();
    g.position.set(sc(x), 0, sc(z)); g.rotation.y = ry;
    scene.add(g);
    box(0.5, 1.35, 0.45, mat.steel, 0, 0.675, 0, g);
    for (let i = 0; i < 4; i++) {
      const out = i === drawersOpen - 1 ? 0.3 : 0;
      box(0.44, 0.28, 0.04, mat.dark, 0, 0.2 + i * 0.32, 0.23 + out, g);
      box(0.12, 0.02, 0.03, mat.chrome, 0, 0.28 + i * 0.32, 0.26 + out, g);
      if (out) box(0.4, 0.22, 0.3, mat.white, 0, 0.2 + i * 0.32, 0.08 + out, g);   // carpetas asomando
    }
    return g;
  }
  // archiveros contra la pared oeste y la sur, y una fila exenta al centro
  for (const z of [11.5, 12.05, 12.6, 13.15]) cabinet(-7.6, z, Math.PI / 2, z === 12.05 ? 2 : 0);
  ob(-7.85, -7.3, 11.15, 13.45);
  for (const x of [-6.9, -6.35, -5.8, -5.25]) cabinet(x, 11.4, 0, x === -5.8 ? 3 : 0);
  ob(-7.15, -5.0, 11.15, 11.7);
  for (const x of [-6.4, -5.85, -5.3]) { cabinet(x, 13.075, 0); cabinet(x, 12.625, Math.PI); }
  ob(-6.7, -5.0, 12.4, 13.3);
  // un archivero volcado bloquea a medias el rincón
  const fallen = cabinet(-4.5, 13.45, 0);
  fallen.rotation.x = -Math.PI / 2; fallen.position.y = 0.25; fallen.position.z = sc(13.1);
  ob(-4.8, -4.2, 12.95, 13.85);
  // escritorio con máquina de escribir junto al pasillo
  box(0.9, 0.05, 0.6, mat.counter, -2.15, 0.76, 11.45);
  for (const sx of [-0.4, 0.4]) box(0.05, 0.76, 0.55, mat.counter, -2.15 + sx, 0.38, 11.45);
  box(0.36, 0.14, 0.28, mat.dark, -2.2, 0.85, 11.4);
  box(0.3, 0.12, 0.02, mat.white, -2.2, 0.95, 11.3).rotation.x = -0.3;
  ob(-2.65, -1.65, 11.15, 11.8);
  // expedientes regados por el piso
  for (let i = 0; i < 26; i++) {
    const p = box(0.22, 0.006, 0.3, Math.random() < 0.3 ? mat.yellow : mat.white,
      -7.0 + Math.random() * 5.0, 0.008, 11.8 + Math.random() * 1.9);
    p.rotation.y = Math.random() * 3;
  }
  decal(writingCanvas("NO LOS DESPIERTES"), 2.8, 0.6, -4.6, 1.85, 11 + T + 0.01, 0, 0);
  sign("ARCHIVO", -1.5 + T + 0.01, 2.62, 12.5, Math.PI / 2, 1.0);
  fluoro(-4.2, 12.6, "x", 0xd8eadf, 0.9, "hard", 0.7);
  fluoro(-6.8, 12.4, "z", 0xd8eadf, 0.5, "soft");

  /* ============================================================
     RAYOS X (x 1.5..8, z 9..13): entre la farmacia y la morgue.
     Une el pasillo con la farmacia (circuito).
     ============================================================ */
  function xrayCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "#0b1418"; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(220,240,255,.75)"; x.lineCap = "round";
    x.lineWidth = 10; x.beginPath(); x.moveTo(128, 30); x.lineTo(128, 230); x.stroke();     // columna
    x.lineWidth = 6;
    for (let i = 0; i < 7; i++) {                                                         // costillas
      const y = 60 + i * 22;
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128, y); x.quadraticCurveTo(128 + s * 95, y - 6, 128 + s * 80, y + 34); x.stroke(); }
    }
    x.lineWidth = 8;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(128 + s * 20, 46); x.lineTo(128 + s * 95, 40); x.stroke(); }   // clavículas
    grain(x, 256, 256, 3000, 0.25);
    return c;
  }
  const xrayMat = new THREE.MeshBasicMaterial({ map: tex(xrayCanvas(), 1, 1) });
  // negatoscopios encendidos en la pared este
  for (const z of [10.1, 11.0, 11.9]) {
    box(0.06, 0.75, 0.8, mat.steel, 8 - T - 0.03, 1.65, z);
    const film = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.62), xrayMat);
    film.position.set(sc(8 - T) - 0.07, 1.65, sc(z)); film.rotation.y = -Math.PI / 2;
    scene.add(film);
  }
  const glow = new THREE.PointLight(0xbfe4ff, 0.8, 5, 2);
  glow.position.set(sc(7.0), 1.7, sc(11.0));
  scene.add(glow);
  k.addFlicker({ light: glow, base: 0.8, phase: 5.2 });
  // mesa de rayos X con el brazo del tubo encima
  box(2.0, 0.08, 0.8, mat.white, 4.8, 0.85, 11.0);
  box(1.6, 0.8, 0.5, mat.steel, 4.8, 0.4, 11.0);
  box(0.35, 2.6, 0.35, mat.steel, 4.8, 1.3, 12.55);
  box(0.25, 0.2, 1.4, mat.steel, 4.8, 2.3, 11.85);
  cyl(0.18, 0.22, 0.35, mat.dark, 4.8, 2.05, 11.2);
  ob(3.8, 5.8, 10.6, 11.4);
  ob(4.6, 5.0, 12.35, 12.85);
  // consola de control detrás de un biombo de plomo
  box(1.0, 0.9, 0.55, mat.counter, 7.25, 0.45, 9.5);
  box(0.5, 0.35, 0.05, mat.dark, 7.25, 1.15, 9.4);
  const scr = box(0.42, 0.28, 0.01, new THREE.MeshBasicMaterial({ color: 0x103a2a }), 7.25, 1.15, 9.43);
  scr.castShadow = false;
  box(0.06, 1.9, 1.1, mat.green, 6.55, 0.95, 9.7);
  ob(6.5, 7.85, 9.15, 10.25);
  // mandiles de plomo colgados junto a la puerta del pasillo
  for (const z of [12.35, 12.65]) {
    box(0.04, 0.9, 0.42, mat.dark, 1.5 + T + 0.04, 1.3, z);
    box(0.06, 0.06, 0.06, mat.chrome, 1.5 + T + 0.03, 1.8, z);
  }
  // silla de ruedas volcada y una mancha
  const wc2 = new THREE.Group();
  wc2.position.set(sc(7.3), 0.3, sc(12.4)); wc2.rotation.set(0, 0.8, Math.PI / 2);
  scene.add(wc2);
  box(0.45, 0.05, 0.45, mat.dark, 0, 0, 0, wc2);
  box(0.45, 0.5, 0.05, mat.dark, 0, 0.28, -0.22, wc2);
  ob(6.95, 7.65, 12.05, 12.75);
  decal(bloodCanvas(2), 1.1, 1.1, 3.6, 0.014, 9.9, -Math.PI / 2, 0, 0.8);
  sign("RAYOS X", 1.5 - T - 0.01, 2.62, 11.3, -Math.PI / 2, 1.0);
  sign("PELIGRO · RADIACIÓN", 4.8, 2.4, 13 - T - 0.01, Math.PI, 1.6);
  fluoro(3.2, 10.4, "x", 0xe6f2ff, 0.8, "soft");

  /* ============================================================
     ELEVADOR DE SERVICIO (SALIDA)
     ============================================================ */
  const ez = 24 - T - 0.02;
  box(1.6, 2.4, 0.06, mat.steel, 0, 1.2, ez);
  box(0.02, 2.3, 0.07, mat.dark, 0, 1.15, ez);
  box(1.9, 0.18, 0.12, mat.chrome, 0, 2.48, ez);
  for (const sx of [-0.88, 0.88]) box(0.14, 2.5, 0.12, mat.chrome, sx, 1.25, ez);
  box(0.2, 0.32, 0.04, mat.dark, 1.15, 1.25, ez);
  const arrow = box(0.08, 0.08, 0.02, new THREE.MeshBasicMaterial({ color: 0xff3a2a }), 1.15, 1.3, ez - 0.03);
  arrow.castShadow = false;
  // caja de fusibles abierta junto al elevador
  box(0.4, 0.55, 0.1, mat.dark, -1.05, 1.5, ez);
  for (let i = 0; i < 3; i++) box(0.06, 0.12, 0.03, mat.yellow, -1.17 + i * 0.12, 1.5, ez - 0.07);
  sign("ELEVADOR", 0, 2.75, ez - 0.01, Math.PI, 1.1);

  /* ---------------- luz ambiental fría ---------------- */
  scene.add(new THREE.AmbientLight(0x6f8288, 0.62));
  scene.add(new THREE.HemisphereLight(0x8fa8a0, 0x1a1a14, 0.45));

  /* ---------------- animación del nivel ---------------- */
  function update(dt, t) {
    hang.rotation.z = Math.sin(t * 1.3) * 0.18;
    hang.rotation.x = Math.sin(t * 0.9) * 0.08;
    // el tubo roto falla y suelta chispas al reencender
    const on = Math.sin(t * 2.3) > -0.2 && Math.random() > 0.08;
    brokenLight.intensity = on ? 0.9 : 0;
    brokenTube.visible = on;
    sparkTimer -= dt;
    if (sparkTimer <= 0) {
      sparkTimer = 1.5 + Math.random() * 2.5;
      const p = new THREE.Vector3();
      brokenTube.getWorldPosition(p);
      for (let i = 0; i < SPARKS; i++) {
        sparkPos.set([p.x, p.y, p.z], i * 3);
        sparkVel[i] = [(Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.8];
      }
    }
    const sa = sparkGeo.attributes.position;
    for (let i = 0; i < SPARKS; i++) {
      const v = sparkVel[i];
      if (v[3] <= 0) continue;
      v[3] -= dt; v[1] -= 9.8 * dt;
      let y = sa.getY(i) + v[1] * dt;
      if (y < 0.02) { y = 0.02; v[1] *= -0.3; v[0] *= 0.5; v[2] *= 0.5; }
      sa.setXYZ(i, sa.getX(i) + v[0] * dt, v[3] > 0 ? y : -10, sa.getZ(i) + v[2] * dt);
    }
    sa.needsUpdate = true;
    const da = dustGeo.attributes.position;
    for (let i = 0; i < DUST; i++) {
      let y = da.getY(i) + dt * 0.04;
      if (y > H) y = 0;
      da.setY(i, y);
    }
    da.needsUpdate = true;
  }


  /* ============================================================
     ALA SUR (medidas finales, sin escala): pasillo, pabellón
     psiquiátrico, lavandería y cuarto de calderas
     ============================================================ */
  const WT = 0.2;
  function rWallZ(x, z1, z2, gaps = [], h = H) {
    let z = z1;
    for (const [g1, g2] of gaps) {
      if (g1 > z) R.wallBox(x - WT, x + WT, z, g1, h, mat.wall);
      R.wallBox(x - WT, x + WT, g1, g2, h - 2.3, mat.wall, 2.3);
      for (const gz of [g1, g2]) R.box(0.44, 2.3, 0.1, mat.white, x, 1.15, gz);
      z = g2;
    }
    if (z < z2) R.wallBox(x - WT, x + WT, z, z2, h, mat.wall);
  }
  function rWallX(z, x1, x2, gaps = [], h = H) {
    let x = x1;
    for (const [g1, g2] of gaps) {
      if (g1 > x) R.wallBox(x, g1, z - WT, z + WT, h, mat.wall);
      R.wallBox(g1, g2, z - WT, z + WT, h - 2.3, mat.wall, 2.3);
      for (const gx of [g1, g2]) R.box(0.1, 2.3, 0.44, mat.white, gx, 1.15, z);
      x = g2;
    }
    if (x < x2) R.wallBox(x, x2, z - WT, z + WT, h, mat.wall);
  }
  const rRoom = (x1, x2, z1, z2, floorMat = mat.tile) => {
    R.floorPlane(x1, x2, z1, z2, 0, floorMat, 2);
    R.floorPlane(x1, x2, z1, z2, H, mat.ceil, 1.2, true);
  };
  const fl = (x, z, ...rest) => fluoro(x / S, z / S, ...rest);         // fluoro() trabaja en la planta original
  const rSign = (text, x, y, z, ry, w) => sign(text, x / S, y, z / S, ry, w);

  // pasillo sur
  rRoom(-8.4, -5.4, -26, -9.2);
  rWallZ(-8.4, -26, -9.2, [[-18.6, -17.4]]);
  rWallZ(-5.4, -26, -9.2, [[-13.1, -11.9], [-21.6, -20.4]]);
  rWallX(-26, -8.6, -5.2);
  R.decal(bloodCanvas(4), 0.9, 3.2, -6.9, 0.013, -15, -Math.PI / 2, 0, 0.1);      // rastro arrastrado
  rSign("PABELLÓN PSIQUIÁTRICO", -8.4 + WT + 0.01, 2.62, -18, Math.PI / 2, 1.8);
  rSign("CALDERAS", -5.4 - WT - 0.01, 2.62, -21, -Math.PI / 2, 1.0);
  rSign("LAVANDERÍA", -5.4 - WT - 0.01, 2.62, -12.5, -Math.PI / 2, 1.1);
  fl(-6.9, -12, "z", 0xdff5ea, 0.9, "flicker", 0.4);
  fl(-6.9, -22, "z", 0xdff5ea, 0.8, "soft");

  // ---------- pabellón psiquiátrico: celdas acolchadas ----------
  function padCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "#cfcabb"; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const g = x.createRadialGradient(32 + i * 64, 32 + j * 64, 4, 32 + i * 64, 32 + j * 64, 40);
      g.addColorStop(0, "rgba(255,255,255,.35)"); g.addColorStop(1, "rgba(60,55,45,.35)");
      x.fillStyle = g; x.fillRect(i * 64, j * 64, 64, 64);
      x.fillStyle = "#6a6458"; x.beginPath(); x.arc(i * 64, j * 64, 3, 0, Math.PI * 2); x.fill();
    }
    grain(x, 256, 256, 4000, 0.3);
    return c;
  }
  const padMat = new THREE.MeshStandardMaterial({ map: tex(padCanvas(), 1, 1), roughness: 0.95 });
  rRoom(-20, -8.4, -26, -12, new THREE.MeshStandardMaterial({ color: 0x55534c, roughness: 1 }));
  rWallZ(-20, -26, -12);
  rWallX(-12, -20.2, -8.2);
  rWallX(-26, -20.2, -8.2);
  // cuatro celdas de 3.5 m en la pared oeste, con puerta de hierro entreabierta
  for (let i = 0; i < 4; i++) {
    const z1 = -26 + i * 3.5, z2 = z1 + 3.5, zc = (z1 + z2) / 2;
    if (i > 0) R.wallBox(-20, -15.5, z1 - 0.12, z1 + 0.12, H, padMat);
    R.wallBox(-15.62, -15.38, z1 + 0.12, zc - 0.6, H, padMat);
    R.wallBox(-15.62, -15.38, zc + 0.6, z2 - 0.12, H, padMat);
    R.wallBox(-15.62, -15.38, zc - 0.6, zc + 0.6, H - 2.2, padMat, 2.2);
    // acolchado por dentro
    R.box(0.03, H - 0.2, 3.2, padMat, -19.78, H / 2, zc).castShadow = false;
    const door = new THREE.Group();
    door.position.set(-15.4, 0, zc - 0.6); door.rotation.y = -0.9 - i * 0.25;
    scene.add(door);
    k.box(0.06, 2.1, 1.2, mat.steel, 0.0, 1.05, 0.6, door);
    k.box(0.07, 0.25, 0.35, mat.dark, 0.0, 1.6, 0.6, door);     // mirilla
    // colchón en el piso y camisa de fuerza
    R.box(0.9, 0.18, 1.9, padMat, -18.9, 0.09, zc + (i % 2 ? 0.4 : -0.4));
    R.ob(-19.4, -18.4, zc - 1.4, zc + 1.4);
    if (i % 2 === 0) R.box(0.5, 0.12, 0.7, mat.white, -17.6, 0.06, zc + 0.8).rotation.y = 0.6;
    R.decal(writingCanvas(["DÉJENME SALIR", "NO ESTOY LOCO", "ME VE", "1 2 3 4"][i]), 1.8, 0.45, -19.74, 1.7, zc, 0, Math.PI / 2);
  }
  R.decal(bloodCanvas(6), 1.2, 1.2, -17.2, 0.013, -16.3, -Math.PI / 2, 0, 1.2);
  // estación de enfermería y silla volcada en el pabellón
  R.box(2.6, 1.05, 0.7, mat.counter, -11.3, 0.52, -24.8);
  R.box(2.8, 0.05, 0.85, mat.white, -11.3, 1.07, -24.8);
  R.ob(-12.7, -9.9, -25.3, -24.3);
  for (let i = 0; i < 5; i++) R.box(0.22, 0.02, 0.3, mat.paper, -12.2 + i * 0.45, 1.1, -24.75).rotation.y = i * 0.7;
  const chair = new THREE.Group(); chair.position.set(-11.6, 0.25, -21.8); chair.rotation.set(0.2, 1.1, Math.PI / 2); scene.add(chair);
  k.box(0.45, 0.05, 0.45, mat.dark, 0, 0, 0, chair); k.box(0.45, 0.5, 0.05, mat.dark, 0, 0.28, -0.22, chair);
  R.ob(-12, -11.2, -22.2, -21.4);
  fl(-12, -15.5, "x", 0xdff5ea, 0.9, "flicker", 2.1);
  fl(-12, -22.5, "x", 0xdff5ea, 0.7, "soft");
  fl(-17.8, -19, "z", 0xffd8d0, 0.5, "flicker", 3.3);

  // ---------- lavandería ----------
  rRoom(-5.4, 6, -16, -9.2);
  rWallZ(6, -16, -9.2);
  rWallX(-16, -5.6, 6.2, [[0.6, 1.8]]);       // puerta a las calderas
  for (let i = 0; i < 5; i++) {                 // lavadoras industriales en la pared norte
    const x = -3.6 + i * 1.6;
    R.box(1.2, 1.3, 0.9, mat.white, x, 0.65, -9.95);
    const glass = R.cyl(0.36, 0.36, 0.05, mat.dark, x, 0.75, -9.48);
    glass.rotation.x = Math.PI / 2;
    R.cyl(0.4, 0.4, 0.03, mat.chrome, x, 0.75, -9.5).rotation.x = Math.PI / 2;
  }
  R.ob(-4.3, 3.3, -10.45, -9.4);
  R.box(3.2, 0.08, 1.1, mat.steel, 1.0, 0.9, -13.0);       // mesa para doblar
  R.box(3.0, 0.85, 0.9, mat.steel, 1.0, 0.43, -13.0);
  R.ob(-0.65, 2.65, -13.6, -12.4);
  for (const [cx, cz, r] of [[-3.6, -13.3, 0.3], [4.6, -14.6, -0.5]]) {    // carritos con ropa
    const cart = new THREE.Group(); cart.position.set(cx, 0, cz); cart.rotation.y = r; scene.add(cart);
    k.box(0.7, 0.7, 1.0, new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.8 }), 0, 0.55, 0, cart);
    k.box(0.6, 0.25, 0.9, mat.white, 0, 0.95, 0, cart);
    R.ob(cx - 0.6, cx + 0.6, cz - 0.6, cz + 0.6);
  }
  // sábanas colgadas de un mecate (una manchada)
  const sheet = new THREE.MeshStandardMaterial({ color: 0xdcdcd2, roughness: 1, side: THREE.DoubleSide });
  const bloodSheet = new THREE.MeshStandardMaterial({ map: bloodCanvas(7), color: 0xffffff, roughness: 1, side: THREE.DoubleSide, transparent: true });
  R.cyl(0.01, 0.01, 10.5, mat.dark, 0.3, 2.35, -14.8).rotation.z = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.5), sheet);
    m.position.set(-3.6 + i * 1.9, 1.6, -14.8); m.rotation.y = 0.05 * (i - 2);
    m.castShadow = true; scene.add(m);
    if (i === 3) {
      const st = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), bloodSheet);
      st.position.set(-3.6 + i * 1.9, 1.55, -14.79); scene.add(st);
    }
  }
  fl(0.3, -12.4, "x", 0xe8f4ff, 0.9, "soft");

  // ---------- cuarto de calderas ----------
  rRoom(-5.4, 8, -26, -16, new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 1 }));
  rWallZ(8, -26, -16);
  rWallX(-26, -5.6, 8.2);
  const rustM = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.8, metalness: 0.5 });
  for (const bz of [-19.2, -23.2]) {           // dos calderas horizontales
    const b = R.cyl(1.05, 1.05, 4.2, rustM, 3.6, 1.15, bz, null, 24);
    b.rotation.z = Math.PI / 2;
    for (const ex of [1.5, 5.7]) R.cyl(1.08, 1.08, 0.08, mat.dark, ex, 1.15, bz, null, 24).rotation.z = Math.PI / 2;
    R.cyl(0.12, 0.12, 1.9, mat.steel, 3.6, 2.5, bz, null, 10);   // chimenea al techo
    R.ob(1.4, 5.8, bz - 1.1, bz + 1.1);
  }
  // tuberías en el techo y válvulas
  for (const [z, r] of [[-17, 0.09], [-17.4, 0.06], [-24.9, 0.1]]) R.cyl(r, r, 13, mat.steel, 1.3, H - 0.3, z).rotation.z = Math.PI / 2;
  for (const vx of [-3.2, -1.5]) {
    R.cyl(0.05, 0.05, 1.6, mat.steel, vx, 1.6, -25.6);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 16), new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.6 }));
    wheel.position.set(vx, 1.5, -25.45); scene.add(wheel);
  }
  // horno con la boca encendida y montón de carbón
  R.box(1.8, 1.6, 1.4, mat.dark, -3.4, 0.8, -18.2);
  const mouth = R.box(0.8, 0.5, 0.02, new THREE.MeshBasicMaterial({ color: 0xff7a2a }), -3.4, 0.6, -17.49);
  mouth.castShadow = false;
  R.ob(-4.35, -2.45, -18.95, -17.45);
  const coal = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1, flatShading: true }));
  coal.position.set(-3.6, 0.3, -21.6); scene.add(coal);
  R.ob(-4.4, -2.8, -22.4, -20.8);
  const furnace = new THREE.PointLight(0xff6a24, 1.6, 9, 1.8);
  furnace.position.set(-3.4, 0.7, -17.0);
  scene.add(furnace);
  k.addFlicker({ light: furnace, base: 1.6, soft: true });
  R.decal(writingCanvas("ÉL VIVE ABAJO"), 2.4, 0.6, 7.78, 1.8, -21, 0, -Math.PI / 2);
  fl(1.3, -21, "x", 0xffe0c0, 0.6, "flicker", 1.2);

  /* ---------------- datos del nivel ----------------
     (escritos en la planta original; finishLevel() los escala y les
     agrega el ala sur) */
  const data = {
    name: "Hospital San Judas",
    background: 0x050707, fogColor: 0x0a0d0c, fog: 0.065, exposure: 1.45,
    surface: "tile",
    relicStyle: "fuse",
    bounds: { x1: -9, x2: 9, z1: -6, z2: 24 },
    camZones: [
      { x1: -5.75, x2: 5.75, z1: -5.75, z2: -0.25, h: H - 0.2 },
      { x1: -1.25, x2: 1.25, z1: -0.5, z2: 23.75, h: H - 0.2 },
      { x1: -8.75, x2: -1.75, z1: 3.25, z2: 10.75, h: H - 0.2 },
      { x1: 1.75, x2: 7.75, z1: 3.25, z2: 8.75, h: H - 0.2 },
      { x1: -7.75, x2: -1.75, z1: 14.25, z2: 20.75, h: H - 0.2 },
      { x1: 1.75, x2: 8.75, z1: 13.25, z2: 21.75, h: H - 0.2 },
      { x1: -7.75, x2: -1.75, z1: 11.25, z2: 13.75, h: H - 0.2 },     // archivo
      { x1: 1.75, x2: 7.75, z1: 9.25, z2: 12.75, h: H - 0.2 },        // rayos X
      // huecos de puerta
      { x1: -2.0, x2: -1.0, z1: 11.92, z2: 13.08, h: 2.1 },
      { x1: -3.88, x2: -2.92, z1: 13.5, z2: 14.5, h: 2.1 },
      { x1: 1.0, x2: 2.0, z1: 10.72, z2: 11.88, h: 2.1 },
      { x1: 2.32, x2: 3.28, z1: 8.5, z2: 9.5, h: 2.1 },
      { x1: -2.0, x2: -1.0, z1: 6.12, z2: 7.28, h: 2.1 },
      { x1: 1.0, x2: 2.0, z1: 5.12, z2: 6.28, h: 2.1 },
      { x1: -2.0, x2: -1.0, z1: 16.62, z2: 17.78, h: 2.1 },
      { x1: 1.0, x2: 2.0, z1: 17.12, z2: 18.28, h: 2.1 },
    ],
    spawn: {
      survivor: { pos: V(0, 0, -2.6), heading: 0 },
      monster: { pos: V(5.5, 0, 19.0), heading: -Math.PI / 2 },   // en la morgue
    },
    npcPath: [
      [0, -2], [-4, -3], [4, -3], [0, -1], [0, 6.7], [-3, 6.7], [-7.5, 7], [-2.2, 6.75], [-0.4, 6.7],
      [0, 5.7], [4.5, 5.7], [2.8, 6.4], [2.8, 8.4], [2.8, 9.9], [6.1, 10.0], [6.2, 11.95], [3.0, 11.95], [2.4, 11.3],
      [0, 11.3], [0, 17.2], [-3.5, 17.2], [-5, 15.6], [-3.4, 15.0], [-3.4, 12.05], [-6.0, 12.05],
      [-4.0, 12.05], [0, 12.5], [0, 17.7], [5, 17.7], [0, 17.7], [0, 22.5], [0, 11],
    ].map(([x, z]) => V(x, 0, z)),
    npcStart: 27,
    items: [
      { kind: "relic", x: -8.2, z: 7.3 },                      // fondo de la sala B
      { kind: "relic", x: -6.8, z: 15.2 },                     // quirófano
      { kind: "relic", x: 7.5, z: 21.2 },                      // morgue
      { kind: "battery", x: -4.5, z: -4.8 },
      { kind: "battery", x: 6.6, z: 4.4, skip: ["blackout"] },
      { kind: "medkit", x: 2.6, z: 8.3 },
      { kind: "medkit", x: -2.3, z: 10.3, skip: ["dark", "blackout"] },
      { kind: "holywater", x: 4.6, z: -4.6 },
      { kind: "battery", x: -6.95, z: 12.05, skip: ["blackout"] },   // archivo
      { kind: "medkit", x: 2.3, z: 12.45, skip: ["blackout"] },      // rayos X
    ],
    spots: [{ x: 0, z: 19.5 }, { x: -4.5, z: -1.5 }, { x: 6.0, z: 13.8 }, { x: -2.6, z: 20.2 },
      { x: -3.4, z: 12.9 }, { x: 6.2, z: 11.6 }, { x: 2.6, z: 10.0 }],
    exit: { x: 0, z: 23.0, r: 1.3, label: "el elevador", beaconY: 2.75 },
    update,
  };
  return finishLevel(data);

  function finishLevel(d) {
    const P = (v) => V(sc(v.x), 0, sc(v.z));
    const at = (o) => ({ ...o, x: sc(o.x), z: sc(o.z) });
    d.bounds = { x1: -20.4, x2: sc(9), z1: -26.4, z2: sc(24) };
    // zonas de cámara: los cuartos crecen; las de los huecos de puerta conservan su ancho
    d.camZones = d.camZones.map((z) => {
      if (z.h > 2.2) return { ...z, x1: sc(z.x1), x2: sc(z.x2), z1: sc(z.z1), z2: sc(z.z2) };
      const cx = sc((z.x1 + z.x2) / 2), cz = sc((z.z1 + z.z2) / 2), hx = (z.x2 - z.x1) / 2, hz = (z.z2 - z.z1) / 2;
      return { ...z, x1: cx - hx, x2: cx + hx, z1: cz - hz, z2: cz + hz };
    }).concat([
      { x1: -8.15, x2: -5.65, z1: -25.75, z2: -8.6, h: H - 0.2 },          // pasillo sur
      { x1: -19.75, x2: -8.65, z1: -25.75, z2: -12.25, h: H - 0.2 },       // pabellón
      { x1: -5.15, x2: 5.75, z1: -15.75, z2: -9.45, h: H - 0.2 },          // lavandería
      { x1: -5.15, x2: 7.75, z1: -25.75, z2: -16.25, h: H - 0.2 },         // calderas
      { x1: -7.4, x2: -6.4, z1: -9.7, z2: -8.6, h: 2.1 },                  // puerta recepción → pasillo sur
      { x1: -8.9, x2: -7.9, z1: -18.5, z2: -17.5, h: 2.1 },
      { x1: -5.9, x2: -4.9, z1: -13.0, z2: -12.0, h: 2.1 },
      { x1: -5.9, x2: -4.9, z1: -21.5, z2: -20.5, h: 2.1 },
      { x1: 0.7, x2: 1.7, z1: -16.5, z2: -15.5, h: 2.1 },
    ]);
    d.spawn.survivor.pos = P(d.spawn.survivor.pos);
    d.spawn.monster.pos = P(d.spawn.monster.pos);
    const path = d.npcPath.map(P);
    // vuelta por el ala sur, desde la recepción
    const south = [[-6.9, -7.2], [-6.9, -11], [-6.9, -18], [-12, -18], [-12, -14], [-17, -17.2], [-13.6, -22.6], [-6.9, -21],
      [-1.5, -21], [0, -23.8], [1.2, -17.5], [1.2, -15], [-1, -11.5], [4.5, -11.5], [-1, -12], [-6.9, -12.5], [-6.9, -8]]
      .map(([x, z]) => V(x, 0, z));
    path.splice(2, 0, ...south);
    d.npcPath = path;
    d.npcStart += south.length;
    d.items = d.items.map(at);
    // una reliquia se va al cuarto de calderas; la del quirófano queda para Supervivencia
    const qi = d.items.findIndex((i) => i.kind === "relic" && i.z > 20 && i.x < 0);
    const oldRelic = d.items.splice(qi, 1)[0];
    d.items.push(
      { kind: "relic", x: 6.9, z: -24.8 },                                  // detrás de las calderas
      { kind: "battery", x: -18.6, z: -13.6 },                              // celda
      { kind: "medkit", x: 5.2, z: -10.7, skip: ["blackout"] },             // lavandería
      { kind: "holywater", x: -10.4, z: -25.2, skip: ["blackout"] },        // enfermería
    );
    d.spots = d.spots.map(at).concat([{ x: oldRelic.x, z: oldRelic.z }, { x: -18.5, z: -21 }, { x: -6.9, z: -25 }, { x: 3, z: -14.6 }]);
    d.exit = at(d.exit);
    return d;
  }
}
