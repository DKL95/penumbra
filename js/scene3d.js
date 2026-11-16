/* =========================================================
   PENUMBRA — Motor 3D (WebGL / Three.js) y partida
   Tres escenarios totalmente distintos, cada uno en su propia
   THREE.Scene:
     · Mansión Ravenwood (este archivo): estudio, pasillo, biblioteca,
       cocina y gran salón.
     · Hospital San Judas (js/levels/hospital.js).
     · Bosque de Ceniza (js/levels/forest.js), al aire libre.
   Construidos con figuras básicas, texturas procedurales en
   <canvas> y modelos externos (OBJ/MTL, Collada, GLTF).

   - Iluminación AMBIENTAL + FOCAL en cada escenario (velas,
     focos, fluorescentes, luna y la linterna del superviviente).
   - Personajes animados (js/characters.js), control en 3ª
     persona, colisiones, IA del monstruo con visión y oído.
   - Partida: reliquias (objetivo), ítems (batería, botiquín,
     agua bendita), vidas, salida, victoria / derrota, puntaje.
   - Modos: Escape (campaña de 3 escenarios), Supervivencia y
     Multijugador en tiempo real (js/net.js).
   - Reglas y dificultad en js/rules.js (window.Rules).

   Expone window.Scene3D = { configure, start, stop, pause,
   resume, end } para js/app.js. Al terminar una partida lanza
   el evento "penumbra:result" con las estadísticas.
   ========================================================= */

import * as THREE from "three";
import { OBJLoader } from "./lib/addons/loaders/OBJLoader.js";
import { MTLLoader } from "./lib/addons/loaders/MTLLoader.js";
import { ColladaLoader } from "./lib/addons/loaders/ColladaLoader.js";
import { createCharacter, loadModels } from "./characters.js";
import { buildHospital } from "./levels/hospital.js";
import { buildForest } from "./levels/forest.js";

const Scene3D = (() => {
  let renderer, scene, camera, clock;
  let raf = null, running = false;
  let fireLight;
  let pendulum = null, chandelier = null, dust = null;
  let spider = null;         // araña Collada que trepa en el pasillo

  const ROOM = { w: 9, d: 7, h: 3.4 };                          // estudio (centro en el origen)
  const DOOR_HALF = 0.67;                                        // medio ancho del hueco de la puerta
  const CORR = { x1: -1.1, x2: 1.1, z1: ROOM.d / 2, z2: 11.5, h: 3.0 };   // pasillo
  const HALL = { x1: -6, x2: 6, z1: 11.5, z2: 21.5, h: 4.6 };             // gran salón
  // alas a los lados del pasillo, entre el estudio y el gran salón
  const LIB = { x1: -6, x2: CORR.x1, z1: ROOM.d / 2, z2: HALL.z1, h: 3.0 };   // biblioteca (oeste)
  const KIT = { x1: CORR.x2, x2: 6, z1: ROOM.d / 2, z2: HALL.z1, h: 3.0 };    // cocina (este)
  // pasos (huecos de 1.2 m en los muros)
  const LIB_DOOR = { x1: -3.0, x2: -1.8 };        // estudio → biblioteca (pared norte del estudio)
  const LIB_SIDE = { z1: 8.6, z2: 9.8 };          // pasillo → biblioteca (pared oeste del pasillo)
  const KIT_SIDE = { z1: 9.0, z2: 10.2 };         // pasillo → cocina (pared este del pasillo)
  const KIT_HALL = { x1: 2.5, x2: 3.5 };          // cocina → gran salón (pared sur del salón)
  const MANSION_EXIT_Z = 18.7;                    // puerta principal, en la pared oeste del salón

  // Datos del escenario activo. Cada escenario tiene sus propias listas;
  // al cambiar de nivel se reasignan (ver activateLevel).
  let LV = null;             // { id, scene, bounds, camZones, spawn, npcPath, items, exit, update… }
  let WALLS = [];            // cajas XZ de los muros (colisión y línea de visión)
  let OBSTACLES = [];        // cajas XZ del mobiliario (solo colisión)
  let flames = [];           // llamas animadas
  let flickers = [];         // luces que parpadean

  /* ============================================================
     TEXTURAS PROCEDURALES (canvas 2D)
     ============================================================ */
  function cvs(size = 512) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }
  function grain(ctx, w, h, amount, alpha) {
    for (let i = 0; i < amount; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * alpha * 0.6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }
  function tex(canvas, rx = 1, ry = 1) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function woodCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#3b2a1c"; x.fillRect(0, 0, 512, 512);
    const planks = 6, pw = 512 / planks;
    for (let p = 0; p < planks; p++) {
      const base = 26 + Math.random() * 20;
      x.fillStyle = `hsl(28, 42%, ${base}%)`;
      x.fillRect(p * pw, 0, pw - 2, 512);
      for (let g = 0; g < 44; g++) {
        x.strokeStyle = `hsla(26, 45%, ${base + (Math.random() * 16 - 8)}%, .5)`;
        x.lineWidth = Math.random() * 1.6;
        x.beginPath();
        const gx = p * pw + Math.random() * pw;
        x.moveTo(gx, 0);
        x.bezierCurveTo(gx + 12, 170, gx - 12, 340, gx + 6, 512);
        x.stroke();
      }
      x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(p * pw, 0, 2, 512);
    }
    for (let j = 1; j < 4; j++) {
      x.fillStyle = "rgba(0,0,0,.5)";
      x.fillRect(0, j * 128 + (Math.random() * 20 - 10), 512, 2);
    }
    grain(x, 512, 512, 9000, 0.25);
    return c;
  }

  function wallpaperCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#2f4239"); g.addColorStop(1, "#1e2c26");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 32) {
      x.fillStyle = "rgba(255,255,255,.03)";
      x.fillRect(i, 0, 16, 512);
    }
    x.strokeStyle = "rgba(150,130,90,.13)"; x.lineWidth = 2;
    for (let gy = 0; gy < 512; gy += 128)
      for (let gx = 0; gx < 512; gx += 128) {
        const cx = gx + 64, cy = gy + 64;
        x.beginPath();
        x.ellipse(cx, cy, 22, 40, 0, 0, Math.PI * 2);
        x.moveTo(cx - 30, cy); x.quadraticCurveTo(cx, cy - 46, cx + 30, cy);
        x.moveTo(cx - 30, cy); x.quadraticCurveTo(cx, cy + 46, cx + 30, cy);
        x.stroke();
      }
    for (let i = 0; i < 6; i++) {
      const rg = x.createRadialGradient(
        Math.random() * 512, Math.random() * 512, 4,
        Math.random() * 512, Math.random() * 512, 60 + Math.random() * 90);
      rg.addColorStop(0, "rgba(18,12,5,.45)");
      rg.addColorStop(1, "rgba(18,12,5,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    grain(x, 512, 512, 6000, 0.18);
    return c;
  }

  function brickCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#2b2622"; x.fillRect(0, 0, 512, 512);
    const bh = 42, bw = 96;
    for (let row = 0, y = 0; y < 512; row++, y += bh) {
      const off = row % 2 ? bw / 2 : 0;
      for (let bx = -bw; bx < 512; bx += bw) {
        const l = 12 + Math.random() * 12;
        x.fillStyle = `hsl(18, 20%, ${l}%)`;
        x.fillRect(bx + off + 3, y + 3, bw - 6, bh - 6);
        x.strokeStyle = "rgba(0,0,0,.5)";
        x.strokeRect(bx + off + 3, y + 3, bw - 6, bh - 6);
      }
    }
    const g = x.createLinearGradient(0, 512, 0, 0);
    g.addColorStop(0, "rgba(0,0,0,.72)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    grain(x, 512, 512, 8000, 0.3);
    return c;
  }

  function rugCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#5a1f22"; x.fillRect(0, 0, 512, 512);
    x.fillStyle = "#3a1417"; x.fillRect(24, 24, 464, 464);
    x.strokeStyle = "#8a6a2e"; x.lineWidth = 6; x.strokeRect(40, 40, 432, 432);
    x.strokeStyle = "#7a2a2e"; x.lineWidth = 3; x.strokeRect(60, 60, 392, 392);
    x.strokeStyle = "rgba(180,150,90,.55)"; x.lineWidth = 4;
    x.beginPath(); x.ellipse(256, 256, 120, 90, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.ellipse(256, 256, 70, 50, 0, 0, Math.PI * 2); x.stroke();
    for (let a = 0; a < 8; a++) {
      const an = (a / 8) * Math.PI * 2;
      x.beginPath(); x.moveTo(256, 256);
      x.lineTo(256 + Math.cos(an) * 118, 256 + Math.sin(an) * 88); x.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const rg = x.createRadialGradient(
        Math.random() * 512, Math.random() * 512, 2,
        Math.random() * 512, Math.random() * 512, 50 + Math.random() * 70);
      rg.addColorStop(0, "rgba(90,70,45,.35)");
      rg.addColorStop(1, "rgba(90,70,45,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    grain(x, 512, 512, 12000, 0.22);
    return c;
  }

  function paintingCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, "#2a2416"); g.addColorStop(1, "#0c0a06");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "rgba(60,50,35,.7)";
    x.beginPath(); x.ellipse(128, 118, 44, 56, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(72, 256); x.quadraticCurveTo(128, 150, 184, 256); x.fill();
    x.strokeStyle = "rgba(0,0,0,.4)"; x.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const sx = Math.random() * 256, sy = Math.random() * 256;
      x.beginPath(); x.moveTo(sx, sy);
      x.lineTo(sx + (Math.random() * 30 - 15), sy + (Math.random() * 30 - 15));
      x.stroke();
    }
    grain(x, 256, 256, 4000, 0.3);
    return c;
  }

  function bookRowCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    x.fillStyle = "#0a0806"; x.fillRect(0, 0, 512, 512);
    let bx = 4;
    while (bx < 512) {
      const bw = 12 + Math.random() * 26;
      const hue = Math.random() < 0.5 ? 15 + Math.random() * 30 : 200 + Math.random() * 30;
      const l = 10 + Math.random() * 18;
      const top = Math.random() * 40;
      x.fillStyle = `hsl(${hue}, 30%, ${l}%)`;
      x.fillRect(bx, top, bw - 2, 512 - top);
      x.fillStyle = "rgba(255,255,255,.06)"; x.fillRect(bx, top, 2, 512 - top);
      x.fillStyle = "rgba(0,0,0,.4)"; x.fillRect(bx + bw - 3, top, 2, 512 - top);
      if (Math.random() < 0.5) {
        x.fillStyle = "rgba(190,160,90,.5)";
        x.fillRect(bx + 2, 150 + Math.random() * 120, bw - 6, 24);
      }
      bx += bw;
    }
    grain(x, 512, 512, 5000, 0.25);
    return c;
  }

  // piso del gran salón: mármol en damero, sucio y agrietado
  function marbleCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    const t = 128;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const dark = (i + j) % 2;
      x.fillStyle = dark ? "#16151a" : "#8d877a";
      x.fillRect(i * t, j * t, t, t);
      for (let k = 0; k < 5; k++) {           // vetas
        x.strokeStyle = dark ? "rgba(120,110,100,.18)" : "rgba(40,35,30,.25)";
        x.lineWidth = 0.5 + Math.random() * 1.5;
        x.beginPath();
        let px = i * t + Math.random() * t, py = j * t;
        x.moveTo(px, py);
        for (let s = 0; s < 6; s++) { px += (Math.random() - 0.5) * 40; py += t / 6; x.lineTo(px, py); }
        x.stroke();
      }
      x.strokeStyle = "rgba(0,0,0,.6)"; x.lineWidth = 2;
      x.strokeRect(i * t + 1, j * t + 1, t - 2, t - 2);
    }
    for (let i = 0; i < 10; i++) {
      const rg = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 4, Math.random() * 512, Math.random() * 512, 50 + Math.random() * 90);
      rg.addColorStop(0, "rgba(20,14,8,.45)"); rg.addColorStop(1, "rgba(20,14,8,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    grain(x, 512, 512, 9000, 0.22);
    return c;
  }

  // tapiz rojo oscuro con damasco dorado gastado
  function damaskCanvas() {
    const c = cvs(512), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#3d1214"); g.addColorStop(1, "#24090b");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(170,130,70,.16)"; x.lineWidth = 2;
    for (let gy = 0; gy < 512; gy += 128)
      for (let gx = (gy / 128) % 2 ? 64 : 0; gx < 512 + 64; gx += 128) {
        const cx = gx, cy = gy + 64;
        x.beginPath();
        x.moveTo(cx, cy - 48); x.bezierCurveTo(cx + 40, cy - 20, cx + 30, cy + 30, cx, cy + 48);
        x.bezierCurveTo(cx - 30, cy + 30, cx - 40, cy - 20, cx, cy - 48);
        x.moveTo(cx, cy - 20); x.lineTo(cx, cy + 20);
        x.moveTo(cx - 14, cy); x.lineTo(cx + 14, cy);
        x.stroke();
      }
    for (let i = 0; i < 8; i++) {                // humedad y manchas
      const rg = x.createRadialGradient(Math.random() * 512, Math.random() * 512, 4, Math.random() * 512, Math.random() * 512, 60 + Math.random() * 100);
      rg.addColorStop(0, "rgba(10,4,2,.5)"); rg.addColorStop(1, "rgba(10,4,2,0)");
      x.fillStyle = rg; x.fillRect(0, 0, 512, 512);
    }
    grain(x, 512, 512, 7000, 0.2);
    return c;
  }

  // alfombra larga del pasillo
  function runnerCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "#3b1013"; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#6b5226"; x.fillRect(14, 0, 8, 256); x.fillRect(234, 0, 8, 256);
    x.fillStyle = "#24090b"; x.fillRect(30, 0, 196, 256);
    x.strokeStyle = "rgba(160,120,60,.45)"; x.lineWidth = 3;
    for (let y = 0; y < 256; y += 64) {
      x.beginPath(); x.moveTo(128, y + 6); x.lineTo(196, y + 32); x.lineTo(128, y + 58); x.lineTo(60, y + 32); x.closePath(); x.stroke();
    }
    grain(x, 256, 256, 5000, 0.3);
    return c;
  }

  // baldosas de la cocina: ajedrez blanco sucio y negro, con juntas y manchas
  function tileCanvas() {
    const c = cvs(256), x = c.getContext("2d");
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = (i + j) % 2 ? 20 + Math.random() * 10 : 120 + Math.random() * 25;
      x.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      x.fillRect(i * 64, j * 64, 64, 64);
    }
    x.strokeStyle = "rgba(10,8,6,.8)"; x.lineWidth = 3;
    for (let k = 0; k <= 256; k += 64) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, 256); x.moveTo(0, k); x.lineTo(256, k); x.stroke(); }
    for (let n = 0; n < 6; n++) {
      x.fillStyle = `rgba(40,25,10,${0.08 + Math.random() * 0.12})`;
      x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 0, Math.PI * 2); x.fill();
    }
    grain(x, 256, 256, 6000, 0.25);
    return c;
  }

  // salpicadura de sangre (con transparencia, para calcomanías)
  function bloodCanvas(seed = 1) {
    const c = cvs(256), x = c.getContext("2d");
    x.fillStyle = "rgba(70,4,4,.92)";
    const blob = (px, py, r) => { x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); };
    blob(128, 128, 38 + seed * 6);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + Math.random() * 9);
    }
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      x.strokeStyle = "rgba(70,4,4,.85)"; x.lineWidth = 5 + Math.random() * 6; x.lineCap = "round";
      x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * (60 + Math.random() * 40), 128 + Math.sin(a) * (60 + Math.random() * 40)); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // mensaje escrito con sangre en la pared
  function writingCanvas(text) {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 256;
    const x = c.getContext("2d");
    x.font = "bold 130px Georgia, serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = "rgba(110,6,6,.95)";
    x.fillText(text, 512, 110);
    // chorreones
    for (let i = 0; i < 40; i++) {
      const px = 90 + Math.random() * 844, py = 120 + Math.random() * 40;
      x.fillRect(px, py, 3 + Math.random() * 4, 30 + Math.random() * 90);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ============================================================
     HELPERS DE MALLA
     ============================================================ */
  const M = {};

  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  function sph(r, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 18), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  function flameMesh(scale, parent) {
    const f = new THREE.Mesh(
      new THREE.ConeGeometry(0.03 * scale, 0.09 * scale, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb457 }));
    (parent || scene).add(f);
    flames.push(f);
    return f;
  }

  // material con la textura repetida a la medida de la superficie
  const tiledCache = {};
  function tiled(base, rx, ry) {
    const key = `${base.uuid}:${rx.toFixed(2)}:${ry.toFixed(2)}`;
    if (tiledCache[key]) return tiledCache[key];
    const m = base.clone();
    if (base.map) { m.map = base.map.clone(); m.map.repeat.set(rx, ry); m.map.needsUpdate = true; }
    return (tiledCache[key] = m);
  }

  // muro de (x1..x2, z1..z2) que también es colisión si llega al piso
  function wallBox(x1, x2, z1, z2, h, mat, y0 = 0) {
    const len = Math.max(x2 - x1, z2 - z1);
    const m = box(x2 - x1, h, z2 - z1, mat.map ? tiled(mat, len / 3, h / 2.125) : mat,
      (x1 + x2) / 2, y0 + h / 2, (z1 + z2) / 2);
    if (y0 < 1.5) WALLS.push({ x1, x2, z1, z2 });
    return m;
  }

  // marco de madera alrededor de un hueco de 2.3 m de alto en un muro;
  // axis "x": el muro corre a lo largo de x (está en z = c), "z": corre a lo largo de z (en x = c)
  function doorFrame(a, b, c, axis) {
    const w = b - a, m = (a + b) / 2;
    if (axis === "x") {
      for (const x of [a - 0.06, b + 0.06]) box(0.12, 2.3, 0.38, M.trim, x, 1.15, c);
      box(w + 0.24, 0.14, 0.38, M.trim, m, 2.37, c);
    } else {
      for (const z of [a - 0.06, b + 0.06]) box(0.38, 2.3, 0.12, M.trim, c, 1.15, z);
      box(0.38, 0.14, w + 0.24, M.trim, c, 2.37, m);
    }
  }

  // revestimiento sin colisión pegado a la cara de un muro (otro material en el cuarto de al lado)
  function facing(x1, x2, z1, z2, y0, y1, mat) {
    const len = Math.max(x2 - x1, z2 - z1), hh = y1 - y0;
    const m = box(x2 - x1, hh, z2 - z1, mat.map ? tiled(mat, len / 3, hh / 2.125) : mat, (x1 + x2) / 2, y0 + hh / 2, (z1 + z2) / 2);
    m.castShadow = false;
    return m;
  }

  function floorPlane(x1, x2, z1, z2, y, mat, tileM, down = false) {
    const w = x2 - x1, d = z2 - z1;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat.map ? tiled(mat, w / tileM, d / tileM) : mat);
    p.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
    p.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    p.receiveShadow = true;
    scene.add(p);
    return p;
  }

  // plano con textura transparente pegado a una superficie (sangre, pintadas)
  function decal(texture, w, h, x, y, z, rx, ry, rz = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: texture, transparent: true, roughness: 0.35, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  /* ============================================================
     MATERIALES
     ============================================================ */
  function buildMaterials() {
    M.floor = new THREE.MeshStandardMaterial({ map: tex(woodCanvas(), 3, 3), roughness: 0.82, metalness: 0.05 });
    M.wall = new THREE.MeshStandardMaterial({ map: tex(wallpaperCanvas(), 3, 1.6), roughness: 0.96 });
    M.ceiling = new THREE.MeshStandardMaterial({ color: 0x171410, roughness: 1 });
    M.trim = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.6 });
    M.woodDark = new THREE.MeshStandardMaterial({ color: 0x221913, roughness: 0.55, metalness: 0.1 });
    M.woodMid = new THREE.MeshStandardMaterial({ map: tex(woodCanvas(), 1, 1), roughness: 0.6 });
    M.brick = new THREE.MeshStandardMaterial({ map: tex(brickCanvas(), 2, 1), roughness: 1 });
    M.soot = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 });
    M.metal = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.42, metalness: 0.8 });
    M.brass = new THREE.MeshStandardMaterial({ color: 0x6b5320, roughness: 0.35, metalness: 0.9 });
    M.glass = new THREE.MeshStandardMaterial({ color: 0x20303a, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 });
    M.rug = new THREE.MeshStandardMaterial({ map: tex(rugCanvas(), 1, 1), roughness: 1 });
    M.cloth = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 1, side: THREE.DoubleSide });
    M.wax = new THREE.MeshStandardMaterial({ color: 0xd8cba0, roughness: 0.5, emissive: 0x120a00 });
    M.paper = new THREE.MeshStandardMaterial({ color: 0xb7ad93, roughness: 0.9 });
    M.emberMat = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
    // pasillo y gran salón
    M.wallRed = new THREE.MeshStandardMaterial({ map: tex(damaskCanvas(), 1, 1), roughness: 0.95 });
    M.marble = new THREE.MeshStandardMaterial({ map: tex(marbleCanvas(), 1, 1), roughness: 0.35, metalness: 0.05 });
    M.runner = new THREE.MeshStandardMaterial({ map: tex(runnerCanvas(), 1, 4), roughness: 1 });
    M.linen = new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 0.95 });
    M.stone = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.85 });
    M.steel = new THREE.MeshStandardMaterial({ color: 0x5c6068, roughness: 0.3, metalness: 0.9 });
    M.ivory = new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.4 });
    M.night = new THREE.MeshBasicMaterial({ color: 0x0d1526 });
    M.mirror = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.08, metalness: 1 });
    // biblioteca y cocina
    M.tile = new THREE.MeshStandardMaterial({ map: tex(tileCanvas(), 1, 1), roughness: 0.45 });
    M.copper = new THREE.MeshStandardMaterial({ color: 0x7a4426, roughness: 0.35, metalness: 0.85 });
    M.meat = new THREE.MeshStandardMaterial({ color: 0x5a1012, roughness: 0.5 });
    M.green = new THREE.MeshStandardMaterial({ color: 0x1d3a24, roughness: 0.6, emissive: 0x041208 });
  }

  /* ============================================================
     CONSTRUCCIÓN DEL ESCENARIO
     ============================================================ */
  function buildShell() {
    const { w, d, h } = ROOM;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceiling);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = h;
    scene.add(ceil);

    const D = DOOR_HALF;
    wallBox(-w / 2 - 0.15, w / 2 + 0.15, -d / 2 - 0.15, -d / 2 + 0.15, h, M.wall);
    wallBox(-w / 2 - 0.15, -w / 2 + 0.15, -d / 2, d / 2, h, M.wall);
    wallBox(w / 2 - 0.15, w / 2 + 0.15, -d / 2, d / 2, h, M.wall);
    // pared sur con el hueco de la puerta que lleva al pasillo
    // y, al oeste, el paso a la biblioteca (x de LIB_DOOR.x1 a LIB_DOOR.x2)
    wallBox(-w / 2 - 0.15, LIB_DOOR.x1, d / 2 - 0.15, d / 2 + 0.15, h, M.wall);
    wallBox(LIB_DOOR.x2, -D, d / 2 - 0.15, d / 2 + 0.15, h, M.wall);
    wallBox(LIB_DOOR.x1, LIB_DOOR.x2, d / 2 - 0.15, d / 2 + 0.15, h - 2.3, M.wall, 2.3);
    wallBox(D, w / 2 + 0.15, d / 2 - 0.15, d / 2 + 0.15, h, M.wall);
    wallBox(-D, D, d / 2 - 0.15, d / 2 + 0.15, h - 2.35, M.wall, 2.35);

    // zócalos y molduras
    box(w, 0.22, 0.06, M.trim, 0, 0.11, -d / 2 + 0.17);
    const runX = (x1, x2, y, hh, dd, mat, z) => box(x2 - x1, hh, dd, mat, (x1 + x2) / 2, y, z);
    runX(-w / 2, LIB_DOOR.x1, 0.11, 0.22, 0.06, M.trim, d / 2 - 0.17);
    runX(LIB_DOOR.x2, -0.75, 0.11, 0.22, 0.06, M.trim, d / 2 - 0.17);
    runX(0.75, w / 2, 0.11, 0.22, 0.06, M.trim, d / 2 - 0.17);
    for (const z of [-d / 2 + 0.17, d / 2 - 0.17]) box(w, 0.12, 0.08, M.trim, 0, h - 0.14, z);
    for (const x of [-w / 2 + 0.17, w / 2 - 0.17]) {
      box(0.06, 0.22, d, M.trim, x, 0.11, 0);
      box(0.08, 0.12, d, M.trim, x, h - 0.14, 0);
    }
    // panelado bajo
    box(0.04, 1.0, d - 0.4, M.woodDark, -w / 2 + 0.19, 0.55, 0);
    runX(-w / 2 + 0.05, LIB_DOOR.x1 - 0.06, 0.55, 1.0, 0.04, M.woodDark, d / 2 - 0.19);
    runX(LIB_DOOR.x2 + 0.06, -0.9, 0.55, 1.0, 0.04, M.woodDark, d / 2 - 0.19);
    runX(0.9, w / 2 - 0.05, 0.55, 1.0, 0.04, M.woodDark, d / 2 - 0.19);
    doorFrame(LIB_DOOR.x1, LIB_DOOR.x2, d / 2, "x");

    // vigas del techo
    for (let i = -1; i <= 1; i++)
      box(w - 0.4, 0.16, 0.2, M.woodDark, 0, h - 0.2, i * 1.9);

    // rosetón central
    const rose = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 10, 32), M.ceiling);
    rose.rotation.x = Math.PI / 2;
    rose.position.set(-0.5, h - 0.05, 0);
    scene.add(rose);
  }

  function buildDoor() {
    const { d } = ROOM;
    const z = d / 2 - 0.16;
    box(1.5, 0.16, 0.24, M.trim, 0, 2.35, z);
    box(0.16, 2.35, 0.24, M.trim, -0.75, 1.17, z);
    box(0.16, 2.35, 0.24, M.trim, 0.75, 1.17, z);

    // hoja abierta hacia el pasillo, girada sobre la bisagra izquierda
    const leaf = new THREE.Group();
    leaf.position.set(-0.62, 0, z + 0.08);
    leaf.rotation.y = -1.75;
    scene.add(leaf);
    box(1.24, 2.28, 0.08, M.woodMid, 0.62, 1.16, 0, leaf);
    for (let iy = 0; iy < 3; iy++)
      for (const side of [-1, 1]) box(0.9, 0.58, 0.03, M.woodDark, 0.62, 0.5 + iy * 0.72, side * 0.05, leaf);
    sph(0.05, M.brass, 1.12, 1.12, -0.08, leaf);
    sph(0.05, M.brass, 1.12, 1.12, 0.08, leaf);
    OBSTACLES.push({ x1: -0.9, x2: -0.55, z1: 3.5, z2: 4.8 });
  }

  function buildWindow() {
    const { d } = ROOM;
    const z = -d / 2 + 0.16;
    box(2.2, 0.18, 0.26, M.trim, 0, 2.6, z);
    box(2.2, 0.3, 0.34, M.trim, 0, 1.0, z);
    box(0.16, 1.7, 0.26, M.trim, -1.1, 1.75, z);
    box(0.16, 1.7, 0.26, M.trim, 1.1, 1.75, z);
    box(2.0, 0.08, 0.16, M.trim, 0, 1.75, z);
    box(0.08, 1.7, 0.16, M.trim, 0, 1.75, z);

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.6), M.glass);
    glass.position.set(0, 1.78, z + 0.02);
    scene.add(glass);

    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.9),
      new THREE.MeshBasicMaterial({ color: 0x0b1120 }));
    sky.position.set(0, 1.9, z - 0.25);
    scene.add(sky);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24),
      new THREE.MeshBasicMaterial({ color: 0xdfe3d8 }));
    moon.position.set(0.55, 2.25, z - 0.24);
    scene.add(moon);

    for (let i = -1; i <= 1; i++)
      cyl(0.018, 0.018, 1.6, M.metal, i * 0.55, 1.78, z + 0.06);

    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.95), M.cloth);
    curtain.position.set(-1.05, 1.72, z + 0.14);
    curtain.rotation.y = 0.12;
    scene.add(curtain);
  }

  function buildFireplace() {
    const { w } = ROOM;
    const x = w / 2 - 0.2;
    box(0.5, 2.4, 2.6, M.brick, x, 1.2, 0);
    box(0.42, 1.2, 1.5, M.soot, x - 0.06, 0.75, 0);
    box(0.72, 0.16, 3.0, M.woodDark, x - 0.06, 1.55, 0);     // repisa
    box(0.56, 1.5, 0.18, M.brick, x, 0.9, 0.86);
    box(0.56, 1.5, 0.18, M.brick, x, 0.9, -0.86);
    box(0.56, 0.34, 2.0, M.brick, x, 1.5, 0);

    for (let i = 0; i < 4; i++) {
      const log = cyl(0.07, 0.08, 0.9, M.woodDark, x - 0.12, 0.28 + (i % 2) * 0.09, -0.33 + i * 0.22);
      log.rotation.z = Math.PI / 2;
      log.rotation.x = (Math.random() - 0.5) * 0.4;
    }
    const embers = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), M.emberMat);
    embers.rotation.x = -Math.PI / 2;
    embers.position.set(x - 0.14, 0.22, 0);
    scene.add(embers);
    for (let i = 0; i < 3; i++) flameMesh(1.4).position.set(x - 0.16, 0.32, -0.25 + i * 0.25);

    box(0.03, 0.32, 0.03, M.metal, x - 0.52, 0.16, 0.5);
    box(0.03, 0.32, 0.03, M.metal, x - 0.52, 0.16, -0.5);

    // sobre la repisa
    cyl(0.05, 0.07, 0.28, M.brass, x - 0.06, 1.77, 0.7);
    flameMesh(0.8).position.set(x - 0.06, 1.98, 0.7);
    box(0.26, 0.3, 0.16, M.woodDark, x - 0.06, 1.78, -0.6);
    cyl(0.05, 0.05, 0.02, M.brass, x - 0.06, 1.66, 0.0).rotation.z = Math.PI / 2;

    fireLight = new THREE.PointLight(0xff6a24, 2.0, 9, 2);
    fireLight.position.set(x - 0.5, 0.7, 0);
    fireLight.castShadow = true;
    fireLight.shadow.mapSize.set(512, 512);
    scene.add(fireLight);
  }

  function buildBookshelf() {
    const { w, d } = ROOM;
    const x = w / 2 - 0.55, z = -d / 2 + 1.25;
    const H = 2.7, W = 1.9;
    box(0.06, H, 0.42, M.woodDark, x, H / 2, z - W / 2);
    box(0.06, H, 0.42, M.woodDark, x, H / 2, z + W / 2);
    box(0.34, 0.06, W, M.woodDark, x, H - 0.03, z);
    box(0.34, 0.06, W, M.woodDark, x, 0.03, z);
    box(0.1, H, W, M.woodDark, x - 0.16, H / 2, z);            // fondo
    box(0.5, 0.1, W + 0.1, M.trim, x, H + 0.06, z);            // cornisa

    const shelves = 5;
    for (let s = 0; s < shelves; s++) {
      const sy = 0.3 + s * ((H - 0.55) / (shelves - 1));
      box(0.32, 0.04, W - 0.05, M.woodDark, x, sy, z);
      const row = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, W - 0.14),
        new THREE.MeshStandardMaterial({ map: tex(bookRowCanvas(), 1, 1), roughness: 0.9 }));
      row.position.set(x, sy + 0.19, z);
      row.castShadow = row.receiveShadow = true;
      scene.add(row);
      for (let k = 0; k < 3; k++) {
        const bw = 0.03 + Math.random() * 0.03;
        const bk = box(0.2, 0.3, bw,
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(`hsl(${Math.random() * 360},22%,16%)`), roughness: 0.9,
          }),
          x, sy + 0.17, z - W / 2 + 0.25 + Math.random() * (W - 0.5));
        bk.rotation.x = (Math.random() - 0.5) * 0.55;
      }
    }
    // cráneo decorativo (esfera + caja mandíbula) sobre una balda
    sph(0.09, M.paper, x, 1.86, z + 0.5);
    box(0.12, 0.05, 0.1, M.paper, x, 1.79, z + 0.53);
  }

  function buildDesk() {
    const x = -1.5, z = -1.1;
    box(1.9, 0.1, 1.0, M.woodMid, x, 0.78, z);
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.42, 0.42])
      cyl(0.05, 0.06, 0.78, M.woodDark, x + sx, 0.39, z + sz);
    box(0.7, 0.55, 0.9, M.woodDark, x + 0.55, 0.5, z);
    for (let i = 0; i < 2; i++) box(0.62, 0.02, 0.02, M.brass, x + 0.55, 0.4 + i * 0.22, z + 0.46);

    box(0.3, 0.012, 0.4, M.paper, x - 0.4, 0.845, z + 0.1).rotation.y = 0.2;
    box(0.34, 0.06, 0.26, M.woodDark, x - 0.05, 0.86, z - 0.2).rotation.y = -0.3;
    cyl(0.05, 0.06, 0.08, M.metal, x + 0.35, 0.86, z - 0.28);

    // lámpara de banquero (luz FOCAL cálida)
    cyl(0.1, 0.12, 0.03, M.brass, x - 0.72, 0.8, z - 0.3);
    cyl(0.012, 0.012, 0.34, M.brass, x - 0.72, 0.98, z - 0.3);
    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.15, 0.16, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1f3d2a, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x0e2013 }));
    shade.position.set(x - 0.72, 1.14, z - 0.3);
    scene.add(shade);
    const glow = new THREE.PointLight(0xffd9a0, 0.7, 3.4, 2);
    glow.position.set(x - 0.72, 1.05, z - 0.3);
    scene.add(glow);

    // silla
    const cx = x, cz = z + 0.95;
    box(0.5, 0.08, 0.5, M.woodDark, cx, 0.5, cz);
    box(0.5, 0.72, 0.08, M.woodDark, cx, 0.86, cz - 0.21);
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.2, 0.2])
      cyl(0.03, 0.03, 0.5, M.woodDark, cx + sx, 0.25, cz + sz);
  }

  /* ============================================================
     MODELOS EXTERNOS: OBJ + MTL y Collada (assets/models/*)
     ============================================================ */
  const MODELS = "assets/models/";

  function loadObj(dir, name) {
    const target = scene;    // la escena que lo pidió (la carga termina después)
    return new MTLLoader().setPath(MODELS + dir).loadAsync(name + ".mtl").then((mtl) => {
      mtl.preload();
      return new OBJLoader().setMaterials(mtl).setPath(MODELS + dir).loadAsync(name + ".obj");
    }).then((obj) => {
      obj.traverse((o) => {
        if (!o.isMesh) return;
        [].concat(o.material).forEach((m) => {
          // los MTL de Resident Evil usan la misma textura como map_d: se recorta por alfa
          if (m.alphaMap) Object.assign(m, { alphaMap: null, transparent: false, alphaTest: 0.5 });
        });
        o.castShadow = o.receiveShadow = true;
      });
      obj.userData.scene = target;
      return obj;
    });
  }

  // centra el modelo sobre su base, lo escala a `size` m en su eje más largo y lo coloca
  function placeModel(obj, size, x, y, z, ry = 0) {
    const bb = new THREE.Box3().setFromObject(obj);
    const dim = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -bb.min.y, -c.z);
    const pivot = new THREE.Group();
    pivot.add(obj);
    pivot.scale.setScalar(size / Math.max(dim.x, dim.y, dim.z));
    pivot.position.set(x, y, z);
    pivot.rotation.y = ry;
    (obj.userData.scene || scene).add(pivot);
    return pivot;
  }

  const loadFail = (what) => (err) => console.error(`[PENUMBRA] No se pudo cargar ${what}:`, err);

  function buildBallLamp() {
    // lámpara de bola apoyada sobre la caja de arriba de la esquina (ver buildClutter)
    const x = -ROOM.w / 2 + 1.1, z = -ROOM.d / 2 + 0.85, y = 1.175, H = 0.5;
    const light = new THREE.PointLight(0xffc88a, 0.9, 5, 2);
    light.position.set(x, y + H * 0.3, z);
    scene.add(light);
    flickers.push({ light, base: 0.9, soft: true });

    loadObj("lampara/", "lamparabolita").then((obj) => {
      obj.traverse((o) => {
        if (!o.isMesh) return;
        [].concat(o.material).forEach((m) => {
          if (m.name === "Cam") {
            // el cristal de la bola brilla con la luz de dentro
            Object.assign(m, { transparent: true, opacity: 0.85 });
            m.emissive.set(0xffb874); m.emissiveIntensity = 0.9;
          } else {
            m.color.set(0x8a6a3a); m.specular.set(0x332211); m.shininess = 40;  // latón envejecido
          }
        });
      });
      placeModel(obj, H, x, y, z, -0.4);   // alineada con la caja
    }).catch(loadFail("la lámpara"));
  }

  function buildProps() {
    // escritorio del estudio (ver buildDesk): álbum sobre los papeles y un racimo de plátanos
    const dx = -1.5, dz = -1.1, top = 0.83;
    loadObj("album/", "REDS_scrapbook")
      .then((o) => placeModel(o, 0.3, dx - 0.4, top + 0.022, dz + 0.1, 0.2)).catch(loadFail("el álbum"));
    loadObj("banana/", "io_food_banana_big")
      .then((o) => placeModel(o, 0.2, dx + 0.35, top, dz + 0.22, -0.6)).catch(loadFail("los plátanos"));
    // libro tirado en el piso, entre el librero y la chimenea
    loadObj("libros/", "REDS_book3p")
      .then((o) => placeModel(o, 0.32, 3.75, 0, -0.9, 0.5)).catch(loadFail("el libro"));
    // libro rojo de pie en la mesita de la vela, con el lomo hacia el cuarto
    const tx = 1.95, tz = ROOM.d / 2 - 0.65;
    loadObj("libro-rojo/", "REDS_redbookv")
      .then((o) => placeModel(o, 0.25, tx + 0.06, 0.75, tz - 0.12, -Math.PI / 2)).catch(loadFail("el libro rojo"));
  }

  function buildSpider() {
    // araña (Collada con esqueleto): trepa por la pared oeste del pasillo
    // subiendo y bajando; las patas se animan por código rotando sus huesos
    const target = scene;
    new ColladaLoader().loadAsync(MODELS + "arana/SP_HOME.dae").then((dae) => {
      dae.scene.userData.scene = target;
      const model = placeModel(dae.scene, 0.35, 0, 0, 0);
      const crawler = new THREE.Group();
      crawler.add(model);
      target.add(crawler);
      // cada pata cuelga de bone002 con 5 huesos: bone007, bone012 … bone042
      const legs = [];
      for (let k = 0; k < 8; k++) {
        const bone = dae.scene.getObjectByName("bone0" + String(7 + 5 * k).padStart(2, "0"));
        if (bone) legs.push({ bone, rz: bone.rotation.z, ph: (k % 2) * Math.PI });
      }
      spider = { crawler, legs, y: 1.2, dir: 1, wait: 0, x: CORR.x1 + 0.2, z: 7.25 };
      orientSpider();
    }).catch(loadFail("la araña"));
  }

  function orientSpider() {
    // la panza pega a la pared (+x) y la cabeza (+z del modelo) mira hacia donde avanza
    const d = spider.dir;
    spider.crawler.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, d), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, d, 0)));
  }

  function updateSpider(dt, t) {
    const s = spider;
    if (s.wait > 0) {
      s.wait -= dt;
      if (s.wait <= 0) { s.dir = -s.dir; orientSpider(); }
    } else {
      s.y += s.dir * dt * 0.3;
      if (s.y > 2.4 || s.y < 0.5) { s.y = THREE.MathUtils.clamp(s.y, 0.5, 2.4); s.wait = 1.5 + Math.random() * 2; }
    }
    s.crawler.position.set(s.x, s.y, s.z);
    const moving = s.wait <= 0;
    for (const l of s.legs) l.bone.rotation.z = l.rz + (moving ? Math.sin(t * 14 + l.ph) * 0.25 : 0);
  }

  function buildClock() {
    const { w, d } = ROOM;
    const x = -w / 2 + 0.45, z = d / 2 - 0.75;
    box(0.6, 2.6, 0.4, M.woodDark, x, 1.3, z);
    box(0.46, 1.3, 0.05, M.glass, x + 0.18, 1.45, z);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24),
      new THREE.MeshStandardMaterial({ color: 0xcfc3a0, roughness: 0.6 }));
    face.position.set(x + 0.2, 2.12, z);
    face.rotation.y = -Math.PI / 2;
    scene.add(face);
    box(0.018, 0.14, 0.008, M.metal, x + 0.21, 2.12, z).rotation.z = 1;
    box(0.018, 0.09, 0.008, M.metal, x + 0.21, 2.12, z).rotation.z = -0.4;

    pendulum = new THREE.Group();
    pendulum.position.set(x + 0.18, 1.85, z);
    scene.add(pendulum);
    cyl(0.006, 0.006, 0.85, M.brass, 0, -0.42, 0, pendulum);
    const bob = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), M.brass);
    bob.position.y = -0.85; bob.rotation.y = -Math.PI / 2;
    pendulum.add(bob);
  }

  function buildPaintings() {
    const { w, d } = ROOM;
    const mk = (pw, ph, x, y, z, ry) => {
      const g = new THREE.Group();
      g.position.set(x, y, z); g.rotation.y = ry;
      g.rotation.z = (Math.random() - 0.5) * 0.06;
      const frame = box(pw + 0.12, ph + 0.12, 0.08, M.brass, 0, 0, 0, g);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshStandardMaterial({ map: tex(paintingCanvas(), 1, 1), roughness: 0.9 }));
      art.position.z = 0.05;
      g.add(art);
      scene.add(g);
    };
    mk(0.8, 1.0, -w / 2 + 0.22, 2.0, -1.2, Math.PI / 2);
    mk(1.1, 0.8, -w / 2 + 0.22, 1.85, 1.5, Math.PI / 2);
    mk(0.9, 1.1, 1.9, 2.0, d / 2 - 0.22, Math.PI);
  }

  function buildChandelier() {
    const { h } = ROOM;
    chandelier = new THREE.Group();
    chandelier.position.set(-0.5, h - 0.05, 0);
    scene.add(chandelier);
    cyl(0.014, 0.014, 0.6, M.metal, 0, -0.3, 0, chandelier);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 8, 24), M.metal);
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.62;
    chandelier.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = Math.cos(a) * 0.34, cz = Math.sin(a) * 0.34;
      cyl(0.03, 0.02, 0.03, M.brass, cx, -0.6, cz, chandelier);
      cyl(0.018, 0.018, 0.12, M.wax, cx, -0.52, cz, chandelier);
      const arm = cyl(0.01, 0.01, 0.4, M.metal, cx * 0.5, -0.62, cz * 0.5, chandelier);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -a;
      flameMesh(0.7).position.set(chandelier.position.x + cx, chandelier.position.y - 0.43, chandelier.position.z + cz);
    }
    const cl = new THREE.PointLight(0xffcf9a, 0.4, 5.5, 2);
    cl.position.y = -0.5;
    chandelier.add(cl);
  }

  function buildClutter() {
    const { w, d } = ROOM;
    const bx = -w / 2 + 0.95, bz = -d / 2 + 0.95;
    box(0.7, 0.7, 0.7, M.woodMid, bx, 0.35, bz).rotation.y = 0.3;
    box(0.55, 0.55, 0.55, M.woodMid, bx + 0.15, 0.9, bz - 0.1).rotation.y = -0.4;
    box(0.4, 0.4, 0.6, M.woodMid, bx - 0.5, 0.2, bz + 0.45).rotation.y = 0.9;
    cyl(0.32, 0.36, 0.9, M.woodDark, bx - 0.15, 0.45, bz + 1.15, null, 18);
    for (const yy of [0.25, 0.62]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.015, 6, 20), M.metal);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(bx - 0.15, yy, bz + 1.15);
      scene.add(hoop);
    }

    // alfombra
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), M.rug);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-0.4, 0.012, 0.25);
    rug.receiveShadow = true;
    scene.add(rug);

    // mesita junto a la puerta con vela
    const tx = 1.95, tz = d / 2 - 0.65;
    box(0.42, 0.06, 0.42, M.woodDark, tx, 0.72, tz);
    for (const sx of [-0.16, 0.16]) for (const sz of [-0.16, 0.16])
      cyl(0.02, 0.02, 0.72, M.woodDark, tx + sx, 0.36, tz + sz);
    cyl(0.03, 0.04, 0.16, M.wax, tx, 0.83, tz);
    flameMesh(1).position.set(tx, 0.96, tz);
    const cndl = new THREE.PointLight(0xffb060, 0.7, 3.2, 2);
    cndl.position.set(tx, 1.0, tz);
    scene.add(cndl);
  }

  function buildCobwebs() {
    const { w, d, h } = ROOM;
    const corners = [
      [-w / 2 + 0.3, h - 0.3, -d / 2 + 0.3],
      [w / 2 - 0.3, h - 0.3, -d / 2 + 0.3],
      [-w / 2 + 0.3, h - 0.3, d / 2 - 0.3],
      [w / 2 - 0.3, h - 0.3, d / 2 - 0.3],
    ];
    const mat = new THREE.LineBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.16 });
    corners.forEach(([x, y, z]) => {
      const pts = [];
      const rings = 5, spokes = 7;
      for (let s = 0; s < spokes; s++) {
        const a = (s / spokes) * (Math.PI * 0.5);
        pts.push(0, 0, 0, Math.cos(a) * 0.45, -Math.sin(a) * 0.45, 0);
      }
      for (let r = 1; r <= rings; r++) {
        const rad = r * 0.09;
        for (let s = 0; s < spokes; s++) {
          const a1 = (s / spokes) * (Math.PI * 0.5);
          const a2 = ((s + 1) / spokes) * (Math.PI * 0.5);
          pts.push(Math.cos(a1) * rad, -Math.sin(a1) * rad, 0,
            Math.cos(a2) * rad, -Math.sin(a2) * rad, 0);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const web = new THREE.LineSegments(g, mat);
      web.position.set(x, y, z);
      web.lookAt(-x, y - 1, -z);
      scene.add(web);
    });
  }

  function buildDust() {
    const N = 380;
    const pos = new Float32Array(N * 3);
    const zones = [
      [-ROOM.w / 2, ROOM.w / 2, -ROOM.d / 2, ROOM.d / 2],
      [CORR.x1, CORR.x2, CORR.z1, CORR.z2],
      [HALL.x1, HALL.x2, HALL.z1, HALL.z2],
      [LIB.x1, LIB.x2, LIB.z1, LIB.z2],
      [KIT.x1, KIT.x2, KIT.z1, KIT.z2],
    ];
    for (let i = 0; i < N; i++) {
      const [x1, x2, z1, z2] = zones[i < 100 ? 0 : i < 130 ? 1 : i < 230 ? 2 : i < 305 ? 3 : 4];
      pos[i * 3] = x1 + Math.random() * (x2 - x1);
      pos[i * 3 + 1] = Math.random() * ROOM.h;
      pos[i * 3 + 2] = z1 + Math.random() * (z2 - z1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    dust = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9a9484, size: 0.011,
      transparent: true, opacity: 0.25, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(dust);
  }

  function buildLights() {
    // AMBIENTAL — deja leer los muebles y las texturas sin matar el ambiente
    scene.add(new THREE.AmbientLight(0x5a688a, 1.15));
    scene.add(new THREE.HemisphereLight(0x6678ac, 0x241a10, 0.85));

    // relleno suave desde el centro de la sala
    const fill = new THREE.PointLight(0x8f9bcb, 0.7, 15, 2);
    fill.position.set(-0.5, 2.1, 0.2);
    scene.add(fill);
    const fill2 = new THREE.PointLight(0xffdcae, 0.45, 11, 2);
    fill2.position.set(-2.0, 1.6, 1.5);
    scene.add(fill2);
    // realce cálido de la chimenea (repisa y ladrillo)
    const mantel = new THREE.PointLight(0xffa060, 0.6, 6, 2);
    mantel.position.set(ROOM.w / 2 - 1.0, 1.7, 0);
    scene.add(mantel);

    // LUNA por la ventana
    const moon = new THREE.DirectionalLight(0x9cb4e0, 1.0);
    moon.position.set(1.5, 4, -6);
    moon.target.position.set(0, 1, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 20 });
    scene.add(moon, moon.target);
  }

  /* ============================================================
     PASILLO: une el estudio con el gran salón
     ============================================================ */
  function sconce(x, z, side) {
    // candelabro de pared: placa, brazo, vela, llama y luz
    box(0.04, 0.3, 0.16, M.brass, x, 1.95, z);
    const arm = cyl(0.012, 0.012, 0.2, M.brass, x - side * 0.1, 1.9, z);
    arm.rotation.z = Math.PI / 2;
    cyl(0.04, 0.03, 0.04, M.brass, x - side * 0.2, 1.92, z);
    cyl(0.022, 0.022, 0.14, M.wax, x - side * 0.2, 2.01, z);
    flameMesh(0.9).position.set(x - side * 0.2, 2.13, z);
    const l = new THREE.PointLight(0xffb060, 0.8, 4.5, 2);
    l.position.set(x - side * 0.3, 2.1, z);
    scene.add(l);
    return l;
  }

  function portrait(pw, ph, x, y, z, ry, tilt = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.set(0, ry, tilt);
    box(pw + 0.12, ph + 0.12, 0.07, M.brass, 0, 0, 0, g);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ map: tex(paintingCanvas(), 1, 1), roughness: 0.9 }));
    art.position.z = 0.04;
    g.add(art);
    scene.add(g);
    return g;
  }

  function buildCorridor() {
    const { x1, x2, z1, z2, h } = CORR;
    floorPlane(x1, x2, z1, z2, 0, M.floor, 3);
    floorPlane(x1, x2, z1, z2, h, M.ceiling, 3, true);
    // muros con un paso a la biblioteca (oeste) y otro a la cocina (este)
    const gaps = { [x1]: LIB_SIDE, [x2]: KIT_SIDE };
    for (const x of [x1, x2]) {
      const g = gaps[x];
      wallBox(x - 0.15, x + 0.15, z1, g.z1, h, M.wall);
      wallBox(x - 0.15, x + 0.15, g.z2, z2, h, M.wall);
      wallBox(x - 0.15, x + 0.15, g.z1, g.z2, h - 2.3, M.wall, 2.3);
      doorFrame(g.z1, g.z2, x, "z");
    }
    const len = z2 - z1, mid = (z1 + z2) / 2;
    const runZ = (za, zb, x, y, ww, hh, mat) => box(ww, hh, zb - za, mat, x, y, (za + zb) / 2);
    for (const x of [x1 + 0.17, x2 - 0.17]) {
      const g = x < 0 ? LIB_SIDE : KIT_SIDE;
      for (const [za, zb] of [[z1, g.z1 - 0.06], [g.z2 + 0.06, z2]]) {
        runZ(za, zb, x, 0.11, 0.06, 0.22, M.trim);
        runZ(za, zb, x + (x < 0 ? 0.02 : -0.02), 0.52, 0.04, 0.95, M.woodDark);
      }
      box(0.08, 0.12, len, M.trim, x, h - 0.14, mid);
    }
    for (let z = z1 + 1.5; z < z2; z += 2) box(x2 - x1, 0.14, 0.18, M.woodDark, 0, h - 0.08, z);

    // alfombra larga
    const run = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len - 0.8), M.runner);
    run.rotation.x = -Math.PI / 2;
    run.position.set(0.05, 0.012, mid);
    run.receiveShadow = true;
    scene.add(run);

    portrait(0.6, 0.8, x1 + 0.19, 1.8, 6.6, Math.PI / 2, 0.05);
    portrait(0.7, 0.9, x2 - 0.19, 1.85, 5.0, -Math.PI / 2, -0.04);
    // un retrato caído, apoyado contra la pared
    const fallen = portrait(0.7, 0.9, x2 - 0.32, 0.45, 7.9, -Math.PI / 2, 0);
    fallen.rotation.x = -0.25;

    // espejo roto
    box(0.05, 1.1, 0.75, M.woodDark, x1 + 0.17, 1.6, 10.4);
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.95), M.mirror);
    mirror.position.set(x1 + 0.2, 1.6, 10.4); mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);
    const cracks = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.25;
      cracks.push(0, 0.1, 0.05, Math.cos(a) * r * 0.6, 0.1 + Math.sin(a) * r, 0.05);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(cracks, 3));
    const cl = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x111111 }));
    cl.position.set(x1 + 0.17, 1.55, 10.4); cl.rotation.y = Math.PI / 2;
    scene.add(cl);

    // consola con jarrón y flores secas
    const cx = x2 - 0.33, cz = 7.0;
    box(0.36, 0.05, 1.0, M.woodDark, cx, 0.82, cz);
    for (const sz of [-0.44, 0.44]) for (const sx of [-0.14, 0.14]) cyl(0.02, 0.02, 0.82, M.woodDark, cx + sx, 0.41, cz + sz);
    cyl(0.05, 0.08, 0.26, M.ivory, cx, 0.98, cz - 0.2);
    for (let i = 0; i < 5; i++) {
      const st = cyl(0.004, 0.004, 0.35, M.woodDark, cx + (Math.random() - 0.5) * 0.06, 1.25, cz - 0.2 + (Math.random() - 0.5) * 0.06);
      st.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    }
    OBSTACLES.push({ x1: cx - 0.2, x2: x2, z1: cz - 0.52, z2: cz + 0.52 });

    sconce(x1 + 0.17, 4.9, -1);
    sconce(x2 - 0.17, 8.4, 1);

    // foco del techo que parpadea
    cyl(0.006, 0.006, 0.5, M.metal, 0, h - 0.25, 10.2);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.set(0, h - 0.55, 10.2);
    scene.add(bulb);
    const bl = new THREE.PointLight(0xffd8a0, 0.9, 5, 2);
    bl.position.set(0, h - 0.65, 10.2);
    scene.add(bl);
    flickers.push({ light: bl, bulb, base: 0.9 });

    // manos ensangrentadas en la pared antes del salón
    const hand = bloodCanvas(0);
    decal(hand, 0.5, 0.5, x2 - 0.155, 1.3, 11.0, 0, -Math.PI / 2, 0.4);
    decal(hand, 0.4, 0.4, x2 - 0.155, 1.0, 10.6, 0, -Math.PI / 2, -0.3);
  }

  /* ============================================================
     GRAN SALÓN: comedor, piano, armaduras y escalera
     ============================================================ */
  function chair(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    box(0.46, 0.06, 0.46, M.woodDark, 0, 0.48, 0, g);
    box(0.46, 0.95, 0.06, M.woodDark, 0, 0.98, -0.2, g);
    box(0.36, 0.5, 0.03, M.wallRed, 0, 1.05, -0.165, g);
    for (const sx of [-0.19, 0.19]) for (const sz of [-0.19, 0.19]) cyl(0.025, 0.025, 0.48, M.woodDark, sx, 0.24, sz, g);
    scene.add(g);
    return g;
  }

  function armor(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    box(0.6, 0.18, 0.6, M.stone, 0, 0.09, 0, g);
    for (const sx of [-0.1, 0.1]) cyl(0.07, 0.06, 0.8, M.steel, sx, 0.6, 0, g);
    cyl(0.17, 0.13, 0.55, M.steel, 0, 1.28, 0, g);
    box(0.5, 0.1, 0.2, M.steel, 0, 1.52, 0, g);
    for (const sx of [-0.26, 0.26]) { const a = cyl(0.05, 0.045, 0.6, M.steel, sx, 1.2, 0.02, g); a.rotation.z = sx * 0.3; }
    sph(0.13, M.steel, 0, 1.72, 0, g);
    box(0.2, 0.04, 0.05, M.soot, 0, 1.72, 0.12, g);
    const plume = cyl(0.02, 0.05, 0.25, M.wallRed, 0, 1.92, -0.02, g);
    plume.rotation.x = -0.4;
    cyl(0.015, 0.015, 2.3, M.woodDark, 0.32, 1.15, 0.05, g);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), M.steel);
    tip.position.set(0.32, 2.4, 0.05); g.add(tip);
    scene.add(g);
    OBSTACLES.push({ x1: x - 0.35, x2: x + 0.35, z1: z - 0.35, z2: z + 0.35 });
  }

  function hallWindow(x, z, side, moon) {
    // ventanal alto en la pared este (side = 1) u oeste (-1)
    const fx = x - side * 0.17;
    const night = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), M.night);
    night.position.set(fx - side * 0.01, 2.4, z); night.rotation.y = -side * Math.PI / 2;
    scene.add(night);
    if (moon) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: 0xdfe3d8 }));
      m.position.set(fx - side * 0.02, 3.15, z + 0.3); m.rotation.y = -side * Math.PI / 2;
      scene.add(m);
    }
    box(0.12, 0.12, 1.5, M.trim, fx - side * 0.04, 3.65, z);
    box(0.2, 0.16, 1.6, M.trim, fx - side * 0.06, 1.15, z);
    for (const dz of [-0.7, 0, 0.7]) box(0.08, 2.5, 0.08, M.trim, fx - side * 0.03, 2.4, z + dz);
    for (const y of [1.8, 2.5, 3.2]) box(0.06, 0.05, 1.4, M.trim, fx - side * 0.03, y, z);
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.2), M.cloth);
    curtain.position.set(fx - side * 0.12, 2.3, z - 0.85); curtain.rotation.y = -side * Math.PI / 2;
    scene.add(curtain);
  }

  function buildHall() {
    const { x1, x2, z1, z2, h } = HALL;
    const D = CORR.x2 - 0.15;                            // medio ancho de la entrada
    floorPlane(x1, x2, z1, z2, 0, M.marble, 3);
    floorPlane(x1, x2, z1, z2, h, M.ceiling, 3, true);
    wallBox(x1 - 0.15, -D, z1 - 0.15, z1 + 0.15, h, M.wallRed);
    // ala este del muro sur: paso a la cocina
    wallBox(D, KIT_HALL.x1, z1 - 0.15, z1 + 0.15, h, M.wallRed);
    wallBox(KIT_HALL.x2, x2 + 0.15, z1 - 0.15, z1 + 0.15, h, M.wallRed);
    wallBox(KIT_HALL.x1, KIT_HALL.x2, z1 - 0.15, z1 + 0.15, h - 2.3, M.wallRed, 2.3);
    doorFrame(KIT_HALL.x1, KIT_HALL.x2, z1, "x");
    wallBox(-D, D, z1 - 0.15, z1 + 0.15, h - CORR.h, M.wallRed, CORR.h);
    wallBox(x1 - 0.15, x2 + 0.15, z2 - 0.15, z2 + 0.15, h, M.wallRed);
    wallBox(x1 - 0.15, x1 + 0.15, z1, z2, h, M.wallRed);
    wallBox(x2 - 0.15, x2 + 0.15, z1, z2, h, M.wallRed);

    // panelado bajo y cornisa
    const W = x2 - x1, L = z2 - z1, mz = (z1 + z2) / 2;
    for (const x of [x1 + 0.17, x2 - 0.17]) {
      box(0.05, 1.15, L, M.woodDark, x, 0.58, mz);
      box(0.1, 0.18, L, M.trim, x, h - 0.12, mz);
    }
    box(W, 1.15, 0.05, M.woodDark, 0, 0.58, z2 - 0.17);
    box(W, 0.18, 0.1, M.trim, 0, h - 0.12, z2 - 0.17);
    box(x2 - D - 0.05, 1.15, 0.05, M.woodDark, -(D + (x2 - D) / 2), 0.58, z1 + 0.17);
    box(KIT_HALL.x1 - 0.06 - D, 1.15, 0.05, M.woodDark, (D + KIT_HALL.x1 - 0.06) / 2, 0.58, z1 + 0.17);
    box(x2 - KIT_HALL.x2 - 0.06, 1.15, 0.05, M.woodDark, (x2 + KIT_HALL.x2 + 0.06) / 2, 0.58, z1 + 0.17);
    box(W, 0.18, 0.1, M.trim, 0, h - 0.12, z1 + 0.17);
    for (let x = x1 + 2; x < x2; x += 2) box(0.22, 0.2, L, M.woodDark, x, h - 0.1, mz);

    // columnas a los lados de la entrada
    for (const sx of [-1.9, 1.9]) {
      const cz = z1 + 1.1;
      box(0.55, 0.25, 0.55, M.stone, sx, 0.125, cz);
      cyl(0.2, 0.22, h - 0.5, M.stone, sx, h / 2, cz, null, 16);
      box(0.55, 0.25, 0.55, M.stone, sx, h - 0.33, cz);
      OBSTACLES.push({ x1: sx - 0.28, x2: sx + 0.28, z1: cz - 0.28, z2: cz + 0.28 });
    }

    // --- comedor (ala oeste) ---
    // la mesa termina en z = 17 para dejar paso (~1 m) entre ella y la escalera
    // hacia el rincón noroeste del salón, donde está un fragmento de la llave
    const tx = -3.6, tz1 = 13.0, tz2 = 17.0, tzm = (tz1 + tz2) / 2;
    box(1.1, 0.08, tz2 - tz1, M.woodMid, tx, 0.78, tzm);
    box(1.22, 0.02, tz2 - tz1 + 0.12, M.linen, tx, 0.83, tzm);
    for (const sx of [-1, 1]) {
      box(0.02, 0.3, tz2 - tz1 + 0.12, M.linen, tx + sx * 0.61, 0.68, tzm);
      for (const z of [tz1 + 0.3, tzm, tz2 - 0.3]) cyl(0.06, 0.07, 0.76, M.woodDark, tx + sx * 0.45, 0.38, z);
    }
    [13.6, 14.6, 15.6, 16.5].forEach((z, i) => {
      chair(tx - 0.95, z, Math.PI / 2);
      if (i !== 2) chair(tx + 0.95, z, -Math.PI / 2);
      // platos y copas
      cyl(0.13, 0.11, 0.015, M.ivory, tx - 0.32, 0.845, z);
      cyl(0.13, 0.11, 0.015, M.ivory, tx + 0.32, 0.845, z);
      cyl(0.03, 0.01, 0.1, M.brass, tx - 0.32, 0.9, z + 0.2);
    });
    // una silla volcada y un plato roto en el piso
    const fallenChair = chair(-2.3, 16.3, -0.6);
    fallenChair.rotation.x = -Math.PI / 2;
    fallenChair.position.y = 0.23;
    for (let i = 0; i < 4; i++) {
      const sh = box(0.08 + Math.random() * 0.06, 0.01, 0.05 + Math.random() * 0.05, M.ivory, -2.0 + Math.random() * 0.5, 0.01, 15.6 + Math.random() * 0.5);
      sh.rotation.y = Math.random() * 3;
    }
    // candelabro de mesa
    cyl(0.1, 0.12, 0.04, M.brass, tx, 0.86, tzm);
    cyl(0.02, 0.02, 0.4, M.brass, tx, 1.06, tzm);
    box(0.03, 0.03, 0.44, M.brass, tx, 1.24, tzm);
    for (const dz of [-0.2, 0, 0.2]) {
      cyl(0.02, 0.02, 0.12, M.wax, tx, 1.3 + (dz ? 0 : 0.06), tzm + dz);
      flameMesh(0.8).position.set(tx, 1.42 + (dz ? 0 : 0.06), tzm + dz);
    }
    const tl = new THREE.PointLight(0xffb060, 1.1, 6, 2);
    tl.position.set(tx, 1.6, tzm);
    scene.add(tl);
    OBSTACLES.push({ x1: tx - 1.25, x2: tx + 1.25, z1: tz1, z2: tz2 });
    OBSTACLES.push({ x1: -2.75, x2: -1.85, z1: 15.9, z2: 16.7 });     // silla volcada

    // --- piano de cola (ala este) ---
    const px = 4.3, pz = 13.6;
    const piano = new THREE.Group();
    piano.position.set(px, 0, pz); piano.rotation.y = -0.35;
    scene.add(piano);
    box(1.4, 0.32, 1.9, M.soot, 0, 0.85, 0, piano);
    box(1.36, 0.03, 1.86, M.woodDark, 0, 1.02, 0, piano);
    const lid = box(1.36, 0.03, 1.7, M.soot, -0.1, 1.45, 0.05, piano);
    lid.rotation.z = 0.55;
    cyl(0.012, 0.012, 0.75, M.brass, 0.45, 1.27, 0.2, piano);
    box(1.3, 0.06, 0.3, M.ivory, 0, 0.98, -1.05, piano);
    for (let k = 0; k < 14; k++) box(0.03, 0.02, 0.16, M.soot, -0.6 + k * 0.095, 1.015, -1.1, piano);
    for (const [sx, sz] of [[-0.6, -0.8], [0.6, -0.8], [0, 0.85]]) cyl(0.06, 0.05, 0.7, M.soot, sx, 0.35, sz, piano);
    box(0.9, 0.06, 0.35, M.woodDark, 0, 0.5, -1.6, piano);
    for (const sx of [-0.38, 0.38]) cyl(0.03, 0.03, 0.5, M.woodDark, sx, 0.25, -1.6, piano);
    OBSTACLES.push({ x1: px - 1.0, x2: px + 1.0, z1: pz - 1.3, z2: pz + 1.1 });
    OBSTACLES.push({ x1: px - 0.7, x2: px + 0.3, z1: pz - 1.95, z2: pz - 1.3 });   // banco

    // --- sillones junto a los ventanales ---
    for (const [ax, az, ry] of [[4.9, 16.6, -Math.PI / 2 - 0.3], [4.9, 18.2, -Math.PI / 2 + 0.2]]) {
      const g = new THREE.Group();
      g.position.set(ax, 0, az); g.rotation.y = ry;
      box(0.8, 0.4, 0.75, M.wallRed, 0, 0.3, 0, g);
      box(0.8, 0.7, 0.18, M.wallRed, 0, 0.75, -0.3, g);
      for (const sx of [-0.36, 0.36]) box(0.12, 0.35, 0.7, M.wallRed, sx, 0.62, 0, g);
      scene.add(g);
      OBSTACLES.push({ x1: ax - 0.48, x2: ax + 0.48, z1: az - 0.48, z2: az + 0.48 });
    }
    hallWindow(x2, 15.2, 1, false);
    hallWindow(x2, 19.8, 1, true);
    const moonFill = new THREE.PointLight(0x8fa6d8, 1.2, 10, 2);
    moonFill.position.set(x2 - 1.2, 2.6, 17.6);
    scene.add(moonFill);
    // relleno frío para que el salón se lea completo sin perder la penumbra
    const hallFill = new THREE.PointLight(0x8f9bcb, 1.1, 16, 1.6);
    hallFill.position.set(0, 3.2, 16.0);
    scene.add(hallFill);

    // --- escalera al fondo ---
    const steps = 10, sw = 3.0, sz0 = 18.0, rise = 0.27, run = (z2 - 0.15 - sz0) / steps;
    for (let i = 0; i < steps; i++) {
      box(sw, rise * (i + 1), run, i % 2 ? M.woodDark : M.woodMid, 0, rise * (i + 1) / 2, sz0 + run * (i + 0.5));
      box(sw - 0.6, 0.012, run, M.runner, 0, rise * (i + 1) + 0.006, sz0 + run * (i + 0.5));
    }
    const top = rise * steps, slope = Math.atan2(top, z2 - 0.15 - sz0);
    for (const sx of [-sw / 2 - 0.05, sw / 2 + 0.05]) {
      for (let i = 0; i < steps; i += 2) cyl(0.025, 0.025, 0.9, M.woodDark, sx, rise * (i + 1) + 0.45, sz0 + run * (i + 0.5));
      box(0.3, 1.3, 0.3, M.woodDark, sx, 0.65, sz0 - 0.1);
      sph(0.12, M.woodDark, sx, 1.4, sz0 - 0.1);
      const rail = box(0.08, 0.06, Math.hypot(top, z2 - sz0) + 0.2, M.woodDark, sx, top / 2 + 0.95, (sz0 + z2) / 2);
      rail.rotation.x = -slope;
    }
    portrait(1.3, 1.6, 0, top + 1.2, z2 - 0.19, Math.PI, 0.03);
    OBSTACLES.push({ x1: -sw / 2 - 0.2, x2: sw / 2 + 0.2, z1: sz0 - 0.25, z2: z2 });

    // armaduras contra la pared del fondo, a los lados de la escalera
    // (antes estaban en z = 17.4 y tapaban el paso al rincón noroeste)
    armor(-2.3, 20.95, 0.15);
    armor(2.3, 20.95, -0.15);

    // --- lámpara de araña grande ---
    const ch = new THREE.Group();
    ch.position.set(0, h - 0.05, 15.2);
    scene.add(ch);
    cyl(0.015, 0.015, 0.9, M.metal, 0, -0.45, 0, ch);
    for (const [r, y, n] of [[0.75, -1.0, 10], [0.4, -0.85, 6]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 32), M.brass);
      ring.rotation.x = Math.PI / 2; ring.position.y = y;
      ch.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        cyl(0.018, 0.018, 0.12, M.wax, cx, y + 0.08, cz, ch);
        // algunas velas están apagadas
        if (Math.random() < 0.75) flameMesh(0.7).position.set(cx, h - 0.05 + y + 0.19, 15.2 + cz);
      }
    }
    const cl = new THREE.PointLight(0xffc890, 1.4, 11, 2);
    cl.position.set(0, h - 1.4, 15.2);
    scene.add(cl);
    flickers.push({ light: cl, base: 1.4, soft: true });

    // --- sangre y el mensaje en la pared ---
    decal(writingCanvas("NO ESTÁS SOLO"), 3.4, 0.85, x1 + 0.16, 2.75, tzm, 0, Math.PI / 2);
    decal(bloodCanvas(2), 1.6, 1.6, 2.6, 0.014, 15.6, -Math.PI / 2, 0, 0.5);
    [[2.0, 16.3], [1.5, 16.8], [1.0, 17.3], [0.6, 17.7], [-0.2, 12.2], [0.3, 11.9]].forEach(([dx, dz], i) =>
      decal(bloodCanvas(0), 0.35 + (i % 2) * 0.15, 0.35 + (i % 2) * 0.15, dx, 0.014, dz, -Math.PI / 2, 0, i));
    const redLight = new THREE.PointLight(0xff2a1a, 0.5, 4, 2);
    redLight.position.set(x1 + 0.8, 2.5, tzm);
    scene.add(redLight);

    // retrato grande donde antes estaba la salida (detrás está la biblioteca)
    portrait(1.0, 1.3, -4.6, 2.3, z1 + 0.19, 0, -0.02);

    // --- puerta principal (SALIDA): doble hoja en el muro oeste, la fachada de la casa ---
    const door = new THREE.Group();
    door.position.set(x1 + 0.17, 0, MANSION_EXIT_Z);
    door.rotation.y = Math.PI / 2;            // su +z local apunta hacia el salón (+x)
    scene.add(door);
    box(2.0, 0.22, 0.2, M.trim, 0, 2.75, 0, door);
    for (const sx of [-0.95, 0.95]) box(0.2, 2.75, 0.2, M.trim, sx, 1.37, 0, door);
    for (const sx of [-0.43, 0.43]) {
      box(0.84, 2.6, 0.08, M.woodMid, sx, 1.3, 0.04, door);
      for (let iy = 0; iy < 3; iy++) box(0.6, 0.62, 0.03, M.woodDark, sx, 0.5 + iy * 0.8, 0.1, door);
    }
    // cadenas y candado: el superviviente necesita los 3 fragmentos de la llave
    for (const r of [0.5, -0.5]) {
      const chain = box(1.5, 0.04, 0.04, M.steel, 0, 1.25, 0.14, door);
      chain.rotation.z = r;
    }
    box(0.18, 0.2, 0.08, M.brass, 0, 1.25, 0.18, door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28),
      new THREE.MeshBasicMaterial({ map: writingCanvas("SALIDA"), transparent: true }));
    sign.position.set(0, 3.1, 0.12);
    door.add(sign);
  }


  /* ============================================================
     ALAS NUEVAS: BIBLIOTECA (oeste) Y COCINA (este)
     Ocupan el espacio entre el estudio y el gran salón, a los lados
     del pasillo. Cada una tiene dos entradas, así que forman circuitos:
       estudio ↔ biblioteca ↔ pasillo   y   pasillo ↔ cocina ↔ gran salón
     ============================================================ */

  // librero de pie con baldas y lomos; mira hacia +x local (ry gira el conjunto)
  const bookMats = [];
  function bookcase(x, z, W, ry, H = 2.5) {
    if (!bookMats.length) for (let i = 0; i < 3; i++)
      bookMats.push(new THREE.MeshStandardMaterial({ map: tex(bookRowCanvas(), 1, 1), roughness: 0.9 }));
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    scene.add(g);
    box(0.38, H, 0.06, M.woodDark, 0, H / 2, -W / 2, g);
    box(0.38, H, 0.06, M.woodDark, 0, H / 2, W / 2, g);
    box(0.08, H, W, M.woodDark, -0.16, H / 2, 0, g);           // fondo
    box(0.46, 0.08, W + 0.08, M.trim, 0.02, H + 0.04, 0, g);   // cornisa
    const shelves = H > 2 ? 5 : 3;
    for (let s = 0; s < shelves; s++) {
      const sy = 0.12 + s * ((H - 0.4) / (shelves - 1));
      box(0.36, 0.04, W - 0.06, M.woodDark, 0, sy, 0, g);
      if (s === shelves - 1) continue;
      const row = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, W - 0.16), bookMats[(s + bookMats.length) % 3]);
      row.position.set(0.02, sy + 0.2, (Math.random() - 0.5) * 0.06);
      row.castShadow = row.receiveShadow = true;
      g.add(row);
      // algún libro suelto, inclinado
      if (Math.random() < 0.6) {
        const bk = box(0.22, 0.3, 0.05, new THREE.MeshStandardMaterial({
          color: new THREE.Color(`hsl(${Math.random() * 360},25%,18%)`), roughness: 0.9,
        }), 0.04, sy + 0.17, -W / 2 + 0.2 + Math.random() * (W - 0.4), g);
        bk.rotation.x = (Math.random() - 0.5) * 0.7;
      }
    }
    return g;
  }

  function buildLibrary() {
    const { x1, x2, z1, z2, h } = LIB;
    const ix1 = x1 + 0.15, ix2 = x2 - 0.15, iz1 = z1 + 0.15, iz2 = z2 - 0.15;   // caras interiores
    floorPlane(x1, x2, z1, z2, 0, M.floor, 3);
    floorPlane(x1, x2, z1, z2, h, M.ceiling, 3, true);
    // muros propios: fachada oeste y el tramo sur que el estudio no cubre
    wallBox(x1 - 0.15, x1 + 0.15, z1 - 0.15, z2, h, M.wall);
    wallBox(x1 - 0.15, -ROOM.w / 2 - 0.15, z1 - 0.15, z1 + 0.15, h, M.wall);
    // el muro del salón es de damasco rojo por el otro lado: aquí, papel tapiz
    facing(ix1, ix2, iz2 - 0.02, iz2, 0, h, M.wall);
    // zócalo, cornisa y vigas
    box(ix2 - ix1, 0.12, 0.08, M.trim, (ix1 + ix2) / 2, h - 0.14, iz2 - 0.06);
    box(0.08, 0.12, iz2 - iz1, M.trim, ix1 + 0.06, h - 0.14, (iz1 + iz2) / 2);
    box(0.06, 0.22, iz2 - iz1, M.trim, ix1 + 0.05, 0.11, (iz1 + iz2) / 2);
    for (let z = iz1 + 1.4; z < iz2; z += 2) box(ix2 - ix1, 0.14, 0.18, M.woodDark, (ix1 + ix2) / 2, h - 0.08, z);

    // libreros contra la fachada oeste (con un hueco donde se apoya la escalera)
    for (const [za, zb] of [[4.2, 6.0], [6.6, 8.4]]) {
      bookcase(ix1 + 0.2, (za + zb) / 2, zb - za, 0);
      OBSTACLES.push({ x1: ix1, x2: ix1 + 0.42, z1: za, z2: zb });
    }
    // librero doble exento: separa el rincón noroeste (pasillos para esconderse)
    const sx1 = -5.1, sx2 = -2.7, sz = 9.6, sw = sx2 - sx1;
    bookcase((sx1 + sx2) / 2, sz + 0.2, sw, -Math.PI / 2);
    bookcase((sx1 + sx2) / 2, sz - 0.2, sw, Math.PI / 2);
    OBSTACLES.push({ x1: sx1, x2: sx2, z1: sz - 0.42, z2: sz + 0.42 });
    // librero bajo contra la pared del estudio, junto al paso
    bookcase(-4.1, iz1 + 0.2, 1.4, -Math.PI / 2, 1.3);
    OBSTACLES.push({ x1: -4.8, x2: -3.4, z1: iz1, z2: iz1 + 0.42 });

    // escalera de mano apoyada entre los dos libreros
    const lad = new THREE.Group();
    lad.position.set(ix1 + 0.32, 0, 6.3); lad.rotation.z = 0.18;
    scene.add(lad);
    for (const dz of [-0.2, 0.2]) box(0.05, 2.6, 0.05, M.woodMid, 0, 1.3, dz, lad);
    for (let y = 0.3; y < 2.5; y += 0.32) box(0.04, 0.04, 0.4, M.woodMid, 0, y, 0, lad);

    // mesa de lectura con lámpara verde y una vela
    const tx = -3.7, tz = 6.4;
    box(1.0, 0.07, 1.8, M.woodMid, tx, 0.78, tz);
    for (const ax of [-0.42, 0.42]) for (const az of [-0.8, 0.8]) cyl(0.04, 0.05, 0.76, M.woodDark, tx + ax, 0.38, tz + az);
    cyl(0.07, 0.09, 0.03, M.brass, tx - 0.2, 0.83, tz - 0.5);
    cyl(0.012, 0.012, 0.3, M.brass, tx - 0.2, 0.98, tz - 0.5);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.12, 16, 1, true), M.green);
    shade.position.set(tx - 0.2, 1.13, tz - 0.5);
    scene.add(shade);
    const lamp = new THREE.PointLight(0xc8ffb0, 0.9, 5, 2);
    lamp.position.set(tx - 0.2, 1.0, tz - 0.5);
    scene.add(lamp);
    flickers.push({ light: lamp, base: 0.9, phase: 2.1 });
    for (let i = 0; i < 4; i++) {
      const pg = box(0.22, 0.01, 0.3, M.paper, tx + (Math.random() - 0.5) * 0.6, 0.825, tz + 0.1 + Math.random() * 0.6);
      pg.rotation.y = Math.random() * 3;
    }
    cyl(0.03, 0.04, 0.14, M.wax, tx + 0.25, 0.89, tz + 0.55);
    flameMesh(0.9).position.set(tx + 0.25, 1.01, tz + 0.55);
    // sillas del lado este (una apartada, como si alguien se hubiera levantado deprisa)
    chair(tx + 0.85, tz - 0.4, -Math.PI / 2);
    chair(tx + 1.1, tz + 0.6, -Math.PI / 2 + 0.7);
    OBSTACLES.push({ x1: tx - 0.5, x2: tx + 0.5, z1: tz - 0.9, z2: tz + 0.9 });
    OBSTACLES.push({ x1: tx + 0.6, x2: tx + 1.1, z1: tz - 0.65, z2: tz - 0.15 });
    OBSTACLES.push({ x1: tx + 0.85, x2: tx + 1.35, z1: tz + 0.35, z2: tz + 0.85 });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), M.rug);
    rug.rotation.x = -Math.PI / 2; rug.position.set(tx + 0.2, 0.012, tz);
    rug.receiveShadow = true;
    scene.add(rug);

    // globo terráqueo
    const gx = -1.95, gz = 7.4;
    cyl(0.18, 0.22, 0.05, M.woodDark, gx, 0.03, gz);
    cyl(0.03, 0.03, 0.8, M.woodDark, gx, 0.42, gz);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 28), M.brass);
    ring.position.set(gx, 1.05, gz); ring.rotation.y = 0.6;
    scene.add(ring);
    const globe = sph(0.26, new THREE.MeshStandardMaterial({ map: tex(paintingCanvas(), 1, 1), roughness: 0.7 }), gx, 1.05, gz);
    globe.rotation.z = 0.4;
    OBSTACLES.push({ x1: gx - 0.3, x2: gx + 0.3, z1: gz - 0.3, z2: gz + 0.3 });

    // libros tirados y un rastro de sangre hacia el rincón noroeste
    for (let i = 0; i < 9; i++) {
      const bk = box(0.16, 0.04, 0.22, new THREE.MeshStandardMaterial({
        color: new THREE.Color(`hsl(${Math.random() * 360},25%,16%)`), roughness: 0.9,
      }), -4.8 + Math.random() * 2.6, 0.02, 8.55 + Math.random() * 0.4);
      bk.rotation.y = Math.random() * 3;
    }
    [[-2.3, 10.4], [-3.0, 10.7], [-3.8, 10.9], [-4.6, 10.8]].forEach(([dx, dz], i) =>
      decal(bloodCanvas(0), 0.4, 0.4, dx, 0.014, dz, -Math.PI / 2, 0, i * 1.3));
    decal(writingCanvas("SHHH..."), 1.6, 0.5, -3.9, 1.9, iz2 - 0.03, 0, Math.PI);

    portrait(0.8, 1.0, -2.4, 1.9, iz1 + 0.04, 0, 0.04);
    sconce(ix2, 5.2, 1);
    // relleno frío para leer los pasillos entre libreros
    const fill = new THREE.PointLight(0x8f9bcb, 0.7, 9, 2);
    fill.position.set(-3.6, 2.5, 8.8);
    scene.add(fill);
  }

  function buildKitchen() {
    const { x1, x2, z1, z2, h } = KIT;
    const ix1 = x1 + 0.15, ix2 = x2 - 0.15, iz1 = z1 + 0.15, iz2 = z2 - 0.15;
    floorPlane(x1, x2, z1, z2, 0, M.tile, 1.2);
    floorPlane(x1, x2, z1, z2, h, M.ceiling, 3, true);
    wallBox(x2 - 0.15, x2 + 0.15, z1 - 0.15, z2, h, M.brick);
    wallBox(ROOM.w / 2 + 0.15, x2 + 0.15, z1 - 0.15, z1 + 0.15, h, M.brick);
    // ladrillo sobre los muros que comparte con el estudio, el pasillo y el salón
    facing(ix1, ix2, iz1, iz1 + 0.02, 0, h, M.brick);
    facing(ix1, ix1 + 0.02, iz1, KIT_SIDE.z1 - 0.12, 0, h, M.brick);
    facing(ix1, ix1 + 0.02, KIT_SIDE.z2 + 0.12, iz2, 0, h, M.brick);
    facing(ix1, ix1 + 0.02, KIT_SIDE.z1 - 0.12, KIT_SIDE.z2 + 0.12, 2.44, h, M.brick);
    facing(ix1, KIT_HALL.x1 - 0.12, iz2 - 0.02, iz2, 0, h, M.brick);
    facing(KIT_HALL.x2 + 0.12, ix2, iz2 - 0.02, iz2, 0, h, M.brick);
    facing(KIT_HALL.x1 - 0.12, KIT_HALL.x2 + 0.12, iz2 - 0.02, iz2, 2.44, h, M.brick);
    for (let z = iz1 + 1.4; z < iz2; z += 2) box(ix2 - ix1, 0.14, 0.18, M.woodDark, (ix1 + ix2) / 2, h - 0.08, z);

    // encimera corrida contra la pared este, con alacenas, fregadero y frascos
    const cz1 = 4.4, cz2 = 9.6, cm = (cz1 + cz2) / 2, cx = ix2 - 0.3;
    box(0.6, 0.86, cz2 - cz1, M.woodDark, cx, 0.43, cm);
    box(0.66, 0.06, cz2 - cz1 + 0.04, M.stone, cx - 0.02, 0.89, cm);
    for (let z = cz1 + 0.45; z < cz2; z += 0.9) {
      box(0.02, 0.62, 0.78, M.woodMid, cx - 0.31, 0.45, z);
      sph(0.025, M.brass, cx - 0.33, 0.62, z + 0.3);
    }
    box(0.46, 0.04, 0.8, M.steel, cx - 0.02, 0.93, 8.6);
    const tap = cyl(0.015, 0.015, 0.3, M.steel, cx + 0.18, 1.08, 8.6);
    tap.rotation.z = 0.5;
    box(0.3, 0.04, cz2 - cz1, M.woodDark, ix2 - 0.15, 1.75, cm);
    for (let z = cz1 + 0.2; z < cz2 - 0.1; z += 0.28 + Math.random() * 0.2) {
      const jar = cyl(0.06, 0.06, 0.16 + Math.random() * 0.1, M.glass.clone(), ix2 - 0.15, 1.86, z);
      jar.material.color.setHSL(Math.random() * 0.15, 0.4, 0.2);
    }
    OBSTACLES.push({ x1: cx - 0.34, x2: ix2, z1: cz1, z2: cz2 });

    // estufa de hierro con su chimenea y brasas encendidas
    const sx = ix2 - 0.42, sz = 10.4;
    box(0.8, 0.85, 1.0, M.soot, sx, 0.43, sz);
    box(0.84, 0.05, 1.04, M.metal, sx, 0.88, sz);
    box(0.02, 0.22, 0.4, M.emberMat, sx - 0.41, 0.4, sz);
    cyl(0.1, 0.1, h - 0.9, M.soot, sx + 0.2, 0.9 + (h - 0.9) / 2, sz);
    cyl(0.16, 0.14, 0.12, M.copper, sx - 0.12, 0.96, sz - 0.25);
    const ember = new THREE.PointLight(0xff6a2a, 1.0, 4.5, 2);
    ember.position.set(sx - 0.6, 0.5, sz);
    scene.add(ember);
    flickers.push({ light: ember, base: 1.0, soft: true });
    OBSTACLES.push({ x1: sx - 0.42, x2: ix2, z1: sz - 0.52, z2: sz + 0.52 });

    // mesa de carnicero al centro: cuchilla, carne y sangre
    const tx = 3.4, tz = 7.0;
    box(1.0, 0.12, 2.2, M.woodMid, tx, 0.84, tz);
    for (const ax of [-0.42, 0.42]) for (const az of [-0.98, 0.98]) box(0.1, 0.78, 0.1, M.woodDark, tx + ax, 0.39, tz + az);
    box(0.84, 0.04, 2.0, M.woodDark, tx, 0.2, tz);
    const meat = sph(0.2, M.meat, tx - 0.1, 1.0, tz + 0.4);
    meat.scale.set(1.3, 0.6, 1);
    const blade = box(0.02, 0.16, 0.26, M.steel, tx + 0.2, 1.0, tz - 0.3);
    blade.rotation.x = 0.3;
    box(0.03, 0.03, 0.14, M.woodDark, tx + 0.2, 1.06, tz - 0.48).rotation.x = 0.3;
    decal(bloodCanvas(3), 0.9, 0.9, tx, 0.905, tz + 0.2, -Math.PI / 2, 0, 0.4);
    decal(bloodCanvas(1), 1.4, 1.4, tx - 0.9, 0.014, tz + 0.4, -Math.PI / 2, 0, 1.2);
    OBSTACLES.push({ x1: tx - 0.52, x2: tx + 0.52, z1: tz - 1.12, z2: tz + 1.12 });
    // colgador de ollas sobre la mesa
    box(0.05, 0.05, 1.8, M.metal, tx, 2.25, tz);
    for (const dz of [-0.8, 0.8]) cyl(0.01, 0.01, h - 2.25, M.metal, tx, 2.25 + (h - 2.25) / 2, tz + dz);
    for (let i = 0; i < 5; i++) {
      const pz = tz - 0.7 + i * 0.35, r = 0.09 + (i % 3) * 0.03;
      cyl(0.006, 0.006, 0.18, M.metal, tx, 2.14, pz);
      cyl(r, r * 0.85, r * 1.2, M.copper, tx, 2.0 - r * 0.6, pz);
    }
    // foco desnudo que falla
    cyl(0.006, 0.006, 0.45, M.metal, 2.4, h - 0.22, 8.4);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.set(2.4, h - 0.5, 8.4);
    scene.add(bulb);
    const bl = new THREE.PointLight(0xffd8a0, 1.0, 7, 2);
    bl.position.set(2.4, h - 0.6, 8.4);
    scene.add(bl);
    flickers.push({ light: bl, bulb, base: 1.0, phase: 4.0 });

    // despensa contra la pared del estudio
    const px1 = 1.6, px2 = 3.7, pz = iz1 + 0.2;
    for (const y of [0.3, 0.9, 1.5, 2.1]) box(px2 - px1, 0.04, 0.38, M.woodDark, (px1 + px2) / 2, y, pz);
    for (const x of [px1, px2]) box(0.05, 2.2, 0.38, M.woodDark, x, 1.1, pz);
    for (const y of [0.3, 0.9, 1.5]) for (let x = px1 + 0.15; x < px2 - 0.1; x += 0.22 + Math.random() * 0.15) {
      const c = cyl(0.06, 0.06, 0.18, Math.random() < 0.5 ? M.copper : M.glass, x, y + 0.11, pz);
      if (Math.random() < 0.15) { c.rotation.z = Math.PI / 2; c.position.y = y + 0.08; }
    }
    OBSTACLES.push({ x1: px1 - 0.05, x2: px2 + 0.05, z1: iz1, z2: iz1 + 0.42 });
    // barril y costal junto a la pared del pasillo
    cyl(0.28, 0.3, 0.8, M.woodDark, 1.68, 0.4, 4.7, null, 16);
    const sack = sph(0.26, M.linen, 1.75, 0.2, 5.4);
    sack.scale.set(1, 0.75, 1.1);
    OBSTACLES.push({ x1: ix1, x2: 2.0, z1: 4.4, z2: 5.7 });

    // ganchos con cadenas que cuelgan del techo
    for (const [hx, hz] of [[4.4, 5.2], [4.7, 5.6], [2.2, 6.2]]) {
      cyl(0.008, 0.008, 1.0, M.steel, hx, h - 0.5, hz);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI * 1.3), M.steel);
      hook.position.set(hx, h - 1.05, hz);
      scene.add(hook);
    }
    decal(writingCanvas("HAMBRE"), 1.4, 0.45, ix1 + 0.04, 1.9, 6.6, 0, Math.PI / 2);
    const fill = new THREE.PointLight(0x8f9bcb, 0.6, 9, 2);
    fill.position.set(3.4, 2.6, 5.0);
    scene.add(fill);
  }

  /* ============================================================
     COLISIONES (círculo del personaje vs. cajas XZ)
     ============================================================ */
  const PLAYER_R = 0.3;
  const clamp = THREE.MathUtils.clamp;
  // mobiliario del estudio de la mansión (los muros se registran al construirlos)
  const MANSION_OBSTACLES = [
    { x1: 3.85, x2: 4.5, z1: -1.5, z2: 1.5 },     // chimenea
    { x1: 3.7, x2: 4.5, z1: -3.2, z2: -1.3 },     // librero
    { x1: -2.45, x2: -0.55, z1: -1.6, z2: -0.6 }, // escritorio
    { x1: -1.75, x2: -1.25, z1: -0.4, z2: 0.1 },  // silla
    { x1: -4.5, x2: -3.75, z1: 2.55, z2: 2.95 },  // reloj de pie
    { x1: -4.5, x2: -3.1, z1: -3.5, z2: -1.0 },   // cajas y barril
    { x1: 1.74, x2: 2.16, z1: 2.64, z2: 3.06 },   // mesita con vela
  ];

  function collide(pos, r = PLAYER_R) {
    for (const b of WALLS) pushOut(pos, b, r);
    for (const b of OBSTACLES) pushOut(pos, b, r);
    // red de seguridad: nunca fuera del escenario
    const B = LV.bounds;
    pos.x = clamp(pos.x, B.x1 + r, B.x2 - r);
    pos.z = clamp(pos.z, B.z1 + r, B.z2 - r);
  }

  function pushOut(pos, b, r) {
    const cx = clamp(pos.x, b.x1, b.x2);
    const cz = clamp(pos.z, b.z1, b.z2);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // el centro quedó dentro de la caja: sacarlo por el lado más cercano
        const opts = [
          [b.x1 - r - pos.x, 0], [b.x2 + r - pos.x, 0],
          [0, b.z1 - r - pos.z], [0, b.z2 + r - pos.z],
        ].sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        pos.x += opts[0][0]; pos.z += opts[0][1];
      }
    }
  }

  // ¿el segmento a-b corta la caja w agrandada r metros? (Liang–Barsky en el plano XZ)
  function segHitsBox(a, b, w, r = 0) {
    const dx = b.x - a.x, dz = b.z - a.z;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a.x - (w.x1 - r)], [dx, (w.x2 + r) - a.x], [-dz, a.z - (w.z1 - r)], [dz, (w.z2 + r) - a.z]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }

  // ¿un muro corta la línea de visión a-b? (los muebles no tapan la vista)
  function wallBetween(a, b) {
    for (const w of WALLS) if (segHitsBox(a, b, w)) return true;
    return false;
  }

  // ¿un personaje de radio r puede ir en línea recta de a a b sin chocar?
  function clearPath(a, b, r = PLAYER_R - 0.04) {
    for (const w of WALLS) if (segHitsBox(a, b, w, r)) return false;
    for (const o of OBSTACLES) if (segHitsBox(a, b, o, r)) return false;
    return true;
  }

  /* ---------------- Navegación del monstruo ----------------
     Grafo de visibilidad: los puntos de ronda del escenario más una
     rejilla automática de puntos libres que cubre todo el mapa. Dos
     puntos se unen si se puede caminar en línea recta entre ellos.
     Para llegar a un destino que no se ve, Dijkstra elige la ruta más
     corta y el monstruo camina hacia el primer punto de esa ruta. */
  function pointFree(x, z, r) {
    const B = LV.bounds;
    if (x < B.x1 + r || x > B.x2 - r || z < B.z1 + r || z > B.z2 - r) return false;
    for (const b of WALLS.concat(OBSTACLES)) {
      const cx = clamp(x, b.x1, b.x2), cz = clamp(z, b.z1, b.z2);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }

  function navGraph() {
    if (LV.nav) return LV.nav;
    const nodes = LV.npcPath.slice(), P = nodes.length;
    const step = LV.navStep || 1.25, B = LV.bounds;
    for (let x = B.x1 + step / 2; x < B.x2; x += step)
      for (let z = B.z1 + step / 2; z < B.z2; z += step)
        if (pointFree(x, z, PLAYER_R + 0.08)) nodes.push(V3(x, 0, z));
    const n = nodes.length, link = step * 2.3;
    const adj = nodes.map(() => []);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = nodes[i].distanceTo(nodes[j]);
      if (!(i < P && j < P) && d > link) continue;     // la rejilla solo se une con vecinos
      if (!clearPath(nodes[i], nodes[j])) continue;
      adj[i].push([j, d]); adj[j].push([i, d]);
    }
    return (LV.nav = { nodes, adj });
  }

  // siguiente punto al que caminar para ir de `from` a `to` (null si no hay ruta)
  function routeNext(from, to) {
    const { nodes, adj } = navGraph();
    const n = nodes.length;
    const dist = new Array(n).fill(Infinity), first = new Array(n).fill(-1), done = new Array(n).fill(false);
    const AT = -2;      // "ya estoy parado en este punto": el primer paso es el siguiente
    const NEAR = 9;     // solo se prueban los puntos cercanos al origen y al destino
    for (let i = 0; i < n; i++) {
      const d = from.distanceTo(nodes[i]);
      if (d < 0.45) { dist[i] = d; first[i] = AT; }
      else if (d < NEAR && clearPath(from, nodes[i])) { dist[i] = d; first[i] = i; }
    }
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; first[v] = first[u] === AT ? v : first[u]; }
    }
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < n; i++) {
      if (dist[i] === Infinity) continue;
      const dt = nodes[i].distanceTo(to), c = dist[i] + dt;
      if (dt < NEAR && c < bestCost && clearPath(nodes[i], to)) { bestCost = c; best = i; }
    }
    if (best < 0) {     // el destino no se ve desde ningún punto: acercarse al más próximo
      for (let i = 0; i < n; i++) {
        if (dist[i] === Infinity) continue;
        const c = nodes[i].distanceTo(to);
        if (c < bestCost) { bestCost = c; best = i; }
      }
    }
    if (best < 0) return null;
    return first[best] === AT ? to : nodes[first[best]];
  }

  // zonas donde puede estar la cámara (con margen a los muros) y su techo
  function camZone(p) {
    for (const z of LV.camZones) if (p.x >= z.x1 && p.x <= z.x2 && p.z >= z.z1 && p.z <= z.z2) return z;
    return null;
  }

  // dos personajes no se atraviesan
  function separate(a, b, r = PLAYER_R) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz), min = r * 2;
    if (d > 0 && d < min) {
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.z -= (dz / d) * push;
      b.x += (dx / d) * push; b.z += (dz / d) * push;
    }
  }

  /* ============================================================
     ESCENARIO 1: MANSIÓN RAVENWOOD
     ============================================================ */
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function buildMansion() {
    buildShell();
    buildDoor();
    buildWindow();
    buildFireplace();
    buildBookshelf();
    buildDesk();
    buildClock();
    buildPaintings();
    buildChandelier();
    buildClutter();
    buildBallLamp();
    buildProps();
    buildCorridor();
    buildSpider();
    buildHall();
    buildLibrary();
    buildKitchen();
    buildCobwebs();
    buildDust();
    buildLights();
    return {
      name: "Mansión Ravenwood",
      background: 0x05060a, fogColor: 0x070810, fog: 0.055, exposure: 1.75,
      surface: "wood",
      relicStyle: "key",
      bounds: { x1: HALL.x1, x2: HALL.x2, z1: -ROOM.d / 2, z2: HALL.z2 },
      camZones: [
        { x1: -ROOM.w / 2 + 0.25, x2: ROOM.w / 2 - 0.25, z1: -ROOM.d / 2 + 0.25, z2: ROOM.d / 2 - 0.25, h: ROOM.h - 0.2 },
        { x1: -DOOR_HALF + 0.12, x2: DOOR_HALF - 0.12, z1: ROOM.d / 2 - 0.5, z2: ROOM.d / 2 + 0.5, h: 2.2 },
        { x1: CORR.x1 + 0.25, x2: CORR.x2 - 0.25, z1: CORR.z1 + 0.25, z2: CORR.z2 + 0.25, h: CORR.h - 0.2 },
        { x1: HALL.x1 + 0.25, x2: HALL.x2 - 0.25, z1: HALL.z1 + 0.25, z2: HALL.z2 - 0.25, h: HALL.h - 0.2 },
        { x1: LIB.x1 + 0.3, x2: LIB.x2 - 0.3, z1: LIB.z1 + 0.3, z2: LIB.z2 - 0.3, h: LIB.h - 0.2 },
        { x1: KIT.x1 + 0.3, x2: KIT.x2 - 0.3, z1: KIT.z1 + 0.3, z2: KIT.z2 - 0.3, h: KIT.h - 0.2 },
        // los pasos entre cuartos, para que la cámara pueda cruzarlos detrás del personaje
        { x1: LIB_DOOR.x1 + 0.12, x2: LIB_DOOR.x2 - 0.12, z1: ROOM.d / 2 - 0.5, z2: ROOM.d / 2 + 0.5, h: 2.1 },
        { x1: CORR.x1 - 0.5, x2: CORR.x1 + 0.5, z1: LIB_SIDE.z1 + 0.12, z2: LIB_SIDE.z2 - 0.12, h: 2.1 },
        { x1: CORR.x2 - 0.5, x2: CORR.x2 + 0.5, z1: KIT_SIDE.z1 + 0.12, z2: KIT_SIDE.z2 - 0.12, h: 2.1 },
        { x1: KIT_HALL.x1 + 0.12, x2: KIT_HALL.x2 - 0.12, z1: HALL.z1 - 0.5, z2: HALL.z1 + 0.5, h: 2.1 },
      ],
      spawn: {
        survivor: { pos: V3(0.2, 0, 1.3), heading: Math.PI },
        monster: { pos: V3(0, 0, 9.0), heading: Math.PI },      // en el pasillo
      },
      // ronda del monstruo: estudio → pasillo → cocina → gran salón → pasillo →
      // biblioteca → de regreso al estudio (si un tramo no es recto, rodea por el grafo)
      npcPath: [
        [-0.5, 0.8], [2.6, -2.4], [2.6, 1.9], [0, 2.7], [0, 5.5], [0, 9.6],
        [2.2, 9.6], [2.4, 5.2], [4.6, 5.0], [4.5, 8.8], [3.0, 10.6], [3.0, 12.2], [2.5, 13.5],
        [0, 13.0], [-1.2, 15.0], [0, 17.4], [2.4, 16.0], [0.8, 12.8], [0, 10.4],
        [0, 9.2], [-2.0, 9.2], [-2.0, 10.8], [-4.5, 10.8], [-5.45, 10.5], [-5.45, 8.9], [-4.9, 8.6],
        [-4.9, 4.6], [-2.4, 4.4], [-2.4, 2.6], [-2.8, 1.6],
      ].map(([x, z]) => V3(x, 0, z)),
      npcStart: 20,
      items: [
        { kind: "relic", x: -5.25, z: 10.85 },                 // biblioteca, rincón tras el librero
        { kind: "relic", x: 5.0, z: 4.1 },                     // cocina, junto a la despensa
        { kind: "relic", x: -5.2, z: 20.6 },                   // rincón del salón, tras el comedor
        { kind: "battery", x: -3.0, z: 0.8 },
        { kind: "battery", x: -1.6, z: 13.4, skip: ["dark", "blackout"] },
        { kind: "battery", x: 3.6, z: 20.4, skip: ["blackout"] },
        { kind: "battery", x: -2.0, z: 4.4, skip: ["blackout"] },
        { kind: "medkit", x: 0.6, z: 4.4, skip: ["blackout"] },
        { kind: "medkit", x: 2.0, z: 10.8, skip: ["dark", "blackout"] },
        { kind: "holywater", x: 5.2, z: 20.6 },
      ],
      // más lugares donde reaparecen reliquias en Supervivencia
      spots: [[3.1, -2.9], [-0.6, 10.9], [-4.9, 7.4], [-2.0, 6.2], [4.4, 7.4], [2.0, 8.0], [4.6, 18.2]]
        .map(([x, z]) => ({ x, z })),
      exit: { x: HALL.x1 + 0.6, z: MANSION_EXIT_Z, r: 1.25, label: "la puerta principal", beaconY: 3.4 },
      update: updateMansion,
    };
  }

  function updateMansion(dt, t) {
    if (fireLight) fireLight.intensity = 1.7 + Math.sin(t * 12) * 0.3 + Math.random() * 0.4;
    if (spider) updateSpider(dt, t);
    if (pendulum) pendulum.rotation.z = Math.sin(t * 1.6) * 0.12;
    if (chandelier) chandelier.rotation.z = Math.sin(t * 0.6) * 0.012;
    if (dust) {
      const arr = dust.geometry.attributes.position;
      for (let i = 0; i < arr.count; i++) {
        let y = arr.getY(i) + dt * 0.05;
        if (y > ROOM.h) y = 0;
        arr.setY(i, y);
        arr.setX(i, arr.getX(i) + Math.sin(t * 0.3 + i) * 0.0005);
      }
      arr.needsUpdate = true;
    }
  }

  /* ============================================================
     NIVELES: cada escenario vive en su propia THREE.Scene
     ============================================================ */
  const LEVEL_BUILDERS = { mansion: buildMansion, hospital: buildHospital, forest: buildForest };
  const levelCache = {};

  // herramientas que reciben los escenarios de js/levels/*.js
  const kit = {
    THREE, M, V: V3,
    box, cyl, sph, flameMesh, wallBox, floorPlane, decal, tiled,
    tex, cvs, grain, bloodCanvas, writingCanvas, woodCanvas, brickCanvas, paintingCanvas,
    loadObj, placeModel, loadFail,
    get scene() { return scene; },
    addObstacle: (b) => OBSTACLES.push(b),
    addWall: (b) => WALLS.push(b),
    addFlicker: (f) => flickers.push(f),
  };

  function activateLevel(id) {
    if (!LEVEL_BUILDERS[id]) id = "mansion";
    let L = levelCache[id];
    if (!L) {
      scene = new THREE.Scene();
      WALLS = [];
      OBSTACLES = id === "mansion" ? MANSION_OBSTACLES.map((o) => ({ ...o })) : [];
      flames = [];
      flickers = [];
      const data = LEVEL_BUILDERS[id](kit);
      L = levelCache[id] = { ...data, id, scene, walls: WALLS, obstacles: OBSTACLES, flames, flickers };
      scene.background = new THREE.Color(L.background);
      scene.fog = new THREE.FogExp2(L.fogColor, L.fog);
      buildExitBeacon(L);
    }
    LV = L;
    scene = L.scene;
    WALLS = L.walls;
    OBSTACLES = L.obstacles;
    flames = L.flames;
    flickers = L.flickers;
    if (renderer) renderer.toneMappingExposure = L.exposure || 1.75;
    return L;
  }

  /* ============================================================
     ÍTEMS (mallas con brillo) Y BALIZA DE LA SALIDA
     ============================================================ */
  let glowTex = null;
  function getGlowTex() {
    if (glowTex) return glowTex;
    const c = cvs(128), x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  }
  const RELIC_COLOR = { key: 0xffc95a, fuse: 0xff9a3a, rune: 0x5affd8 };
  const ITEM_COLOR = { battery: 0xc8ff6a, medkit: 0xff6a6a, holywater: 0x7fc8ff };

  function itemMesh(kind, style) {
    const g = new THREE.Group();
    const em = (color, e = 0.6, extra = {}) => new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: e, roughness: 0.4, metalness: 0.3, ...extra });
    let color;
    if (kind === "relic") {
      color = RELIC_COLOR[style] || RELIC_COLOR.key;
      if (style === "fuse") {
        // fusible de cerámica con casquillos de latón y filamento encendido
        cyl(0.04, 0.04, 0.16, em(0xeae2d0, 0.15), 0, 0, 0, g, 12).rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) cyl(0.045, 0.045, 0.04, M.brass, s * 0.1, 0, 0, g, 12).rotation.z = Math.PI / 2;
        box(0.12, 0.012, 0.012, em(color, 1.4), 0, 0, 0.042, g);
      } else if (style === "rune") {
        // piedra rúnica: roca facetada con un anillo de símbolos que brilla
        const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0),
          new THREE.MeshStandardMaterial({ color: 0x4b4f52, roughness: 0.9, flatShading: true }));
        g.add(stone);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 24), em(color, 1.3));
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      } else {
        // fragmento de llave antigua (ojo + caña + dientes)
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 20), em(color, 0.5, { metalness: 0.9 }));
        bow.position.x = -0.09;
        g.add(bow);
        box(0.14, 0.022, 0.022, em(color, 0.5, { metalness: 0.9 }), 0.02, 0, 0, g);
        box(0.022, 0.05, 0.02, em(color, 0.5, { metalness: 0.9 }), 0.07, -0.03, 0, g);
      }
    } else if (kind === "battery") {
      color = ITEM_COLOR.battery;
      cyl(0.04, 0.04, 0.15, new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.5 }), 0, 0, 0, g, 14);
      cyl(0.041, 0.041, 0.06, em(0xb9e04a, 0.5), 0, 0.045, 0, g, 14);
      cyl(0.014, 0.014, 0.02, M.steel, 0, 0.085, 0, g, 8);
    } else if (kind === "medkit") {
      color = ITEM_COLOR.medkit;
      box(0.24, 0.16, 0.09, new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 }), 0, 0, 0, g);
      box(0.11, 0.035, 0.095, em(0xd01818, 0.6), 0, 0, 0.003, g);
      box(0.035, 0.11, 0.095, em(0xd01818, 0.6), 0, 0, 0.003, g);
      box(0.08, 0.02, 0.02, M.metal, 0, 0.09, 0, g);
    } else {
      color = ITEM_COLOR.holywater;
      const glass = em(0x9fd6ff, 0.5, { transparent: true, opacity: 0.75, metalness: 0.1, roughness: 0.1 });
      sph(0.06, glass, 0, 0, 0, g);
      cyl(0.022, 0.03, 0.08, glass, 0, 0.07, 0, g, 10);
      cyl(0.026, 0.026, 0.02, M.brass, 0, 0.115, 0, g, 10);
      box(0.012, 0.06, 0.012, M.brass, 0, 0.15, 0, g);
      box(0.04, 0.012, 0.012, M.brass, 0, 0.16, 0, g);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTex(), color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(kind === "relic" ? 1.0 : 0.65);
    g.add(halo);
    g.userData.halo = halo;
    return g;
  }

  // baliza sobre la salida: roja cerrada, verde abierta (la luz se crea una sola vez por nivel)
  function buildExitBeacon(L) {
    if (!L.exit) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTex(), color: 0xff3020, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.9);
    s.position.set(L.exit.x, L.exit.beaconY || 2.6, L.exit.z);
    const light = new THREE.PointLight(0xff3020, 0.8, 4, 2);
    light.position.copy(s.position);
    L.scene.add(s, light);
    L.exitBeacon = { sprite: s, light };
  }

  /* ============================================================
     PARTIDA: estado, personajes, entrada, cámara y red
     ============================================================ */
  const Rules = window.Rules;

  // configuración de la siguiente partida (la pone js/app.js)
  //   mode: "solo" | "mp" · game: "escape" | "survival" | "versus"
  //   scenario: "mansion" | "hospital" | "forest" · role · difficulty
  let config = { mode: "solo", game: "escape", scenario: "mansion", role: "survivor", difficulty: null };
  let modelsReady = false, loadingModels = null;
  let paused = false;

  // estado de la partida
  const G = {
    game: "escape", diffId: "normal", diff: Rules.difficulty("normal"),
    scenario: "mansion", campaignIdx: 0,
    hp: 3, maxHp: 3, inv: Rules.emptyInventory(),
    relics: 0, totalRelics: 0, levelsCleared: 0,
    time: 0, over: false, transition: 0, invuln: 0, attackCd: 0, stunned: 0,
    items: [], exitOpen: false, boost: 1, spawnCount: 0,
    versus: null,                          // resumen del monstruo-jugador al terminar (atrapados / escaparon)
  };
  const NEED = Rules.RELICS_PER_LEVEL;

  // jugador local
  const player = {
    char: null, role: "survivor",
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    heading: 0, speed: 0, stepAcc: 0,
  };
  let flashlight = null, flashOn = true, battery = 1;
  // monstruo de la computadora (modo un jugador)
  let other = null;
  // multijugador: los demás jugadores de la sala (id → actor). Salas de hasta
  // 4: un monstruo y hasta 3 supervivientes. Un actor con `out` ya no juega
  // ("escaped", "caught" o "left") y no se dibuja.
  const peers = new Map();
  const activePeers = (role) => [...peers.values()].filter((a) => !a.out && (!role || a.role === role));
  const teamRelics = () => G.items.filter((i) => i.kind === "relic" && i.taken).length;

  // cámara orbital
  const cam = { yaw: Math.PI, pitch: -0.22, dist: 2.5, shake: 0 };
  const keys = new Set();
  let locked = false;
  let netTimer = 0;

  function $(id) { return document.getElementById(id); }
  const hudCache = {};
  function setHud(id, text) {
    if (hudCache[id] === text) return;
    hudCache[id] = text;
    const el = $(id);
    if (el) el.textContent = text;
  }
  function setHtml(id, html) {
    if (hudCache[id] === html) return;
    hudCache[id] = html;
    const el = $(id);
    if (el) el.innerHTML = html;
  }
  let toastTimer = null;
  function toast(text, ms = 3200) {
    const el = $("hud-toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }
  let bannerTimer = null;
  function banner(title, sub = "", ms = 3400) {
    const el = $("hud-banner");
    if (!el) return;
    el.innerHTML = `<h3>${title}</h3>${sub ? `<p>${sub}</p>` : ""}`;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove("show"), ms);
  }
  function hurtFlash() {
    const el = $("hud-hurt");
    if (!el) return;
    el.classList.remove("hit");
    void el.offsetWidth;            // reinicia la animación CSS
    el.classList.add("hit");
  }

  function makeFlashlight(parent, withShadow) {
    const spot = new THREE.SpotLight(0xfff1d6, 9, 12, 0.42, 0.45, 1.6);
    spot.position.set(0.18, 1.35, 0.25);
    spot.target.position.set(0.1, 0.9, 4);
    spot.castShadow = withShadow;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.2;
    parent.add(spot, spot.target);
    return spot;
  }

  function spawnCharacter(role) {
    const ch = createCharacter(role);
    scene.add(ch.root);
    return ch;
  }

  function clearMatch() {
    if (player.char) { player.char.dispose(); player.char = null; }
    if (other) { other.char.dispose(); other = null; }
    for (const a of peers.values()) a.char.dispose();
    peers.clear();
    for (const it of G.items) it.mesh.removeFromParent();
    G.items = [];
    flashlight = null;
  }

  /* ---------------- Inicio de partida y de nivel ---------------- */
  function newGame() {
    G.game = config.game || (config.mode === "mp" ? "versus" : "escape");
    G.diffId = config.difficulty || (window.Settings ? Settings.get().difficulty : "normal");
    if (!Rules.DIFFICULTY[G.diffId]) G.diffId = "normal";
    G.diff = Rules.difficulty(G.diffId);
    G.campaignIdx = 0;
    G.scenario = G.game === "escape" ? Rules.CAMPAIGN[0] : (config.scenario || "mansion");
    G.maxHp = G.hp = G.diff.hp;
    G.inv = Rules.emptyInventory();
    G.totalRelics = 0;
    G.levelsCleared = 0;
    G.time = 0;
    G.over = false;
    G.boost = 1;
    G.versus = null;
    battery = G.diffId === "blackout" ? 0.7 : 1;
    flashOn = true;
    startLevel();
  }

  function startLevel() {
    activateLevel(G.scenario);
    G.relics = 0;
    G.exitOpen = false;
    G.invuln = 0;
    G.attackCd = 0;
    G.stunned = 0;
    G.transition = 0;
    scene.fog.density = LV.fog * (G.diff.fog / Rules.DIFFICULTY.normal.fog);
    navGraph();             // grafo de navegación del monstruo (una vez por escenario)
    setupMatch();
    spawnItems();
    updateExitBeacon();
    if (window.Sound) Sound.startMusic(G.scenario);
    const sc = Rules.SCENARIOS[G.scenario];
    const sub = player.role === "monster"
      ? "Atrapa al superviviente antes de que escape"
      : G.game === "survival"
        ? `Junta ${sc.relics} sin parar. No hay salida.`
        : `Encuentra ${NEED} ${sc.relics} y escapa`;
    const step = G.game === "escape" && config.mode === "solo"
      ? `Escenario ${G.campaignIdx + 1} de ${Rules.CAMPAIGN.length} · ` : "";
    banner(LV.name, step + sub);
  }

  function setupMatch() {
    clearMatch();
    player.role = config.role;
    player.char = spawnCharacter(player.role);
    const sp = LV.spawn[player.role];
    player.pos.copy(sp.pos).add(spawnOffset(player.role, window.Net ? Net.info.id : 0));
    player.heading = sp.heading;
    player.vel.set(0, 0, 0);
    player.speed = 0;
    cam.yaw = player.heading + Math.PI;  // detrás del personaje
    cam.pitch = -0.22;
    cam.dist = player.role === "monster" ? 2.5 : 2.9;
    camera.position.copy(player.pos).add(V3(Math.sin(player.heading) * -3, 2, Math.cos(player.heading) * -3));

    if (player.role === "survivor") {
      const q = window.Settings ? Settings.get().quality : "medium";
      flashlight = makeFlashlight(player.char.root, q !== "low");
    }

    if (config.mode === "solo") {
      // monstruo controlado por la computadora (ronda + acecho)
      addOther("monster", true);
    } else if (window.Net) {
      // los demás jugadores de la sala (la lista llegó con el mensaje "start")
      for (const p of Net.info.peers) addPeer(p);
    }
    refreshHud();
  }

  // los supervivientes salen uno junto a otro (orden por id, igual en todos los equipos)
  function spawnOffset(role, id) {
    if (config.mode !== "mp" || role !== "survivor" || !window.Net) return V3(0, 0, 0);
    const ids = Net.info.peers.filter((p) => p.role === "survivor").map((p) => p.id);
    if (Net.info.role === "survivor") ids.push(Net.info.id);
    ids.sort((a, b) => a - b);
    return V3([0, 0.9, -0.9][Math.max(0, ids.indexOf(id))] || 0, 0, 0);
  }

  // otro jugador de la sala
  function addPeer(p) {
    if (peers.has(p.id)) peers.get(p.id).char.dispose();
    const ch = spawnCharacter(p.role);
    const s = LV.spawn[p.role];
    const pos = s.pos.clone().add(spawnOffset(p.role, p.id));
    const a = {
      id: p.id, name: p.name || "Jugador", role: p.role, npc: false, char: ch,
      pos, target: pos.clone(), heading: s.heading, targetHeading: s.heading,
      speed: 0, flash: null, stepAcc: 0, hp: G.diff.hp, maxHp: G.diff.hp, out: null,
    };
    if (p.role === "survivor") {
      a.flash = makeFlashlight(ch.root, false);
      // los supervivientes ven el nombre de sus compañeros (el monstruo no)
      if (player.role === "survivor") ch.root.add(nameTag(a.name));
    }
    ch.root.position.copy(pos);
    ch.root.rotation.y = a.heading;
    peers.set(p.id, a);
    return a;
  }

  function nameTag(text) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const x = c.getContext("2d");
    x.font = "600 30px Georgia, serif";
    const w = Math.min(244, x.measureText(text).width + 28);
    x.fillStyle = "rgba(6,10,8,.6)";
    x.fillRect(128 - w / 2, 12, w, 40);
    x.fillStyle = "#cfe8d8"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(text.slice(0, 16), 128, 33);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    tag.scale.set(0.8, 0.2, 1);
    tag.position.y = 2.05;
    return tag;
  }

  function nearestSurvivor(range) {
    let best = null, bd = range;
    for (const a of activePeers("survivor")) {
      const d = a.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function addOther(role, npc) {
    if (other) other.char.dispose();
    const ch = spawnCharacter(role);
    const s = LV.spawn[role];
    other = {
      role, npc, char: ch,
      pos: s.pos.clone(), target: s.pos.clone(),
      heading: s.heading, targetHeading: s.heading,
      speed: 0, flash: null, stepAcc: 0,
      wp: LV.npcStart || 0, wait: 2.5, chasing: false, stuck: 0,
      lastSeen: s.pos.clone(), searchT: 0, stun: 0, recover: 0, attackCd: 0,
      navGoal: null, navT: 0, navTarget: s.pos.clone(), stuckCount: 0,
    };
    if (role === "survivor") other.flash = makeFlashlight(ch.root, false);
    ch.root.position.copy(other.pos);
    ch.root.rotation.y = other.heading;
  }

  function removeOther() {
    if (other) { other.char.dispose(); other = null; }
    for (const a of peers.values()) a.char.dispose();
    peers.clear();
  }

  function spawnItems() {
    for (const it of G.items) it.mesh.removeFromParent();
    G.items = Rules.itemsFor(LV.items, G.diffId)
      .map((d, i) => makeItem(d.kind, d.x, d.z, `${G.scenario}-${i}`, d.y || 0));
  }
  function makeItem(kind, x, z, id, y = 0) {
    const mesh = itemMesh(kind, LV.relicStyle);
    mesh.position.set(x, y + 0.45, z);
    scene.add(mesh);
    return { id, kind, x, z, y, mesh, taken: false, respawn: 0 };
  }

  function updateExitBeacon() {
    const b = LV.exitBeacon;
    if (!b) return;
    const show = G.game !== "survival";
    b.sprite.visible = b.light.visible = show;
    const c = G.exitOpen ? 0x40ff70 : 0xff3020;
    b.sprite.material.color.setHex(c);
    b.light.color.setHex(c);
  }

  /* ---------------- HUD ---------------- */
  function refreshHud() {
    const surv = player.role === "survivor";
    const sc = Rules.SCENARIOS[G.scenario];
    setHud("objective-text", objectiveText());
    setHud("hud-role", surv ? "Superviviente" : "Monstruo");
    const role = $("hud-role");
    if (role) role.className = surv ? "tag tag-survivor" : "tag tag-monster";
    setHud("hud-scenario", sc ? sc.label : LV.name);
    setHud("hud-difficulty", G.diff.label);
    setHud("hud-action", surv ? "Linterna" : "Rugir");
    setHud("hud-interact", surv ? "Recoger / usar" : "Atacar");
    const bat = $("battery");
    if (bat) bat.style.visibility = surv ? "visible" : "hidden";
    const inv = $("inventory");
    if (inv) inv.style.visibility = surv ? "visible" : "hidden";
    const items = $("hud-items-hint");
    if (items) items.hidden = !surv;
    if (window.Touch) Touch.setRole(player.role);
    updateNetHud();
    updateLiveHud(true);
  }

  function objectiveText() {
    const sc = Rules.SCENARIOS[G.scenario];
    if (player.role === "monster") {
      const alive = activePeers("survivor").length;
      const who = alive === 1 ? "queda 1" : `quedan ${alive}`;
      return G.relics >= NEED
        ? `¡Tienen las ${NEED} ${sc.relics}! Vigila ${LV.exit.label} (${who}).`
        : `Caza a los supervivientes (${who}) · llevan ${G.relics}/${NEED} ${sc.relics}.`;
    }
    if (G.game === "survival") return `Junta ${sc.relics}. El monstruo se vuelve más rápido con cada reliquia.`;
    if (G.exitOpen) return `Escapa por ${LV.exit.label}.`;
    const team = G.game === "versus" && activePeers("survivor").length > 0;
    return team ? `Encuentren ${NEED} ${sc.relics} entre todos (${G.relics}/${NEED}).`
                : `Encuentra ${NEED} ${sc.relics} (${G.relics}/${NEED}).`;
  }

  function hearts(hp, max) {
    let s = "";
    for (let i = 0; i < max; i++) s += `<i class="${i < hp ? "on" : ""}"></i>`;
    return s;
  }

  function updateLiveHud(force) {
    const surv = player.role === "survivor";
    setHud("objective-text", objectiveText());
    const prey = [...peers.values()].filter((a) => a.role === "survivor");
    setHtml("hud-hp", surv ? hearts(G.hp, G.maxHp) : hearts(prey.filter((a) => !a.out).length, Math.max(1, prey.length)));
    setHud("hud-hp-label", surv ? "Vida" : "Supervivientes");
    const sc = Rules.SCENARIOS[G.scenario];
    const relics = G.relics;
    setHud("hud-relics", G.game === "survival"
      ? `${sc.short}: ${G.totalRelics}`
      : `${sc.short}: ${relics}/${NEED}`);
    setHud("hud-time", Rules.formatTime(G.time));
    for (const k of Rules.INVENTORY) {
      const slot = document.querySelector(`#inventory [data-item="${k}"]`);
      if (!slot) continue;
      const n = G.inv[k] || 0;
      if (force || hudCache["inv-" + k] !== n) {
        hudCache["inv-" + k] = n;
        slot.classList.toggle("filled", n > 0);
        const b = slot.querySelector("b");
        if (b) b.textContent = n > 1 ? "×" + n : "";
      }
    }
    const low = $("hud-hurt");
    if (low) low.classList.toggle("low", surv && G.hp === 1 && !G.over);
    const stun = $("hud-stun");
    if (stun) stun.hidden = !(player.role === "monster" && G.stunned > 0);
  }

  function updateNetHud() {
    if (config.mode === "solo") return setHud("hud-net", G.game === "survival" ? "Supervivencia" : "Escape");
    if (!window.Net || !Net.inRoom) return setHud("hud-net", "Sin conexión");
    const n = 1 + activePeers().length;
    setHud("hud-net", `Sala ${Net.info.code} · ${n} ${n === 1 ? "jugador" : "jugadores"} · ${Net.info.ping} ms`);
  }

  function updatePrompt() {
    let html = "", verb = "", ready = false;
    if (!G.over && G.transition <= 0) {
      if (player.role === "survivor") {
        const it = nearestItem();
        if (it) {
          const label = it.kind === "relic" ? Rules.SCENARIOS[G.scenario].relic : Rules.ITEMS[it.kind].label;
          html = `<kbd>E</kbd> Recoger ${label}`;
          verb = "Recoger"; ready = true;
        } else if (nearExit()) {
          html = G.exitOpen ? `<kbd>E</kbd> Escapar por ${LV.exit.label}`
                            : `<kbd>E</kbd> Cerrada — faltan ${NEED - G.relics} ${Rules.SCENARIOS[G.scenario].relics}`;
          verb = G.exitOpen ? "Escapar" : "Cerrada"; ready = G.exitOpen;
        }
      } else if (config.mode === "mp" && nearestSurvivor(Rules.ATTACK_RANGE + 0.4)) {
        html = `<kbd>E</kbd> Atacar`;
        verb = "Atacar"; ready = true;
      }
    }
    if (window.Touch && Touch.enabled) {
      Touch.setAction(verb, ready);
      Touch.setFlash(player.role === "survivor" && flashOn);
    }
    const el = $("interact-prompt");
    if (!el) return;
    if (hudCache.prompt !== html) {
      hudCache.prompt = html;
      el.innerHTML = html;
      el.style.display = html ? "" : "none";
    }
  }

  /* ---------------- Entrada ---------------- */
  function canControl() {
    return !paused && !G.over && G.transition <= 0;
  }
  const touchMode = () => !!(window.Touch && Touch.enabled);
  // nombre de la tecla en los mensajes (en el celular no hay teclas)
  const keyTip = (k) => (touchMode() ? "" : ` (${k})`);

  function onKeyDown(e) {
    if (!running || paused) return;
    keys.add(e.code);
    if (e.repeat) return;
    press(e.code);
  }
  // una acción puntual: tecla o botón táctil (js/touch.js)
  function press(code) {
    if (!running || paused || !canControl()) return;
    if (code === "KeyF") doAction();
    else if (code === "KeyE") interact();
    else if (code === "Digit1" || code === "Numpad1") useItem("battery");
    else if (code === "Digit2" || code === "Numpad2") useItem("medkit");
    else if (code === "Digit3" || code === "Numpad3") useItem("holywater");
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function turnCamera(dx, dy, sens) {
    cam.yaw -= dx * sens;
    cam.pitch = clamp(cam.pitch - dy * sens, -0.9, 0.35);
  }
  function onMouseMove(e) {
    if (!locked || paused) return;
    turnCamera(e.movementX, e.movementY, (window.Settings ? Settings.get().sensitivity : 8) * 0.00028);
  }
  // deslizar el dedo en la mitad derecha de la pantalla
  function look(dx, dy) {
    if (!running || paused || G.over) return;
    turnCamera(dx, dy, (window.Settings ? Settings.get().sensitivity : 8) * 0.0009);
  }
  function onCanvasClick() {
    if (!running || paused || G.over || touchMode()) return;
    if (!locked) return requestLock();
    if (player.role === "monster" && canControl()) monsterAttack();
  }
  function requestLock() {
    const c = renderer && renderer.domElement;
    if (!c || touchMode()) return;
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* el navegador aún no permite volver a bloquear */ }
  }
  function onLockChange() {
    locked = document.pointerLockElement === renderer.domElement;
    const hint = $("hud-lock");
    if (hint) hint.hidden = locked || !running || paused || G.over || touchMode();
    // salir del puntero con ESC = pausa (pero no al terminar la partida)
    if (!locked && running && !paused && !G.over) window.dispatchEvent(new CustomEvent("penumbra:unlock"));
  }

  function doAction() {
    if (player.role === "survivor") {
      if (battery <= 0.02 && !flashOn) { toast(`Sin batería. Usa una batería${keyTip(1)}.`); return; }
      flashOn = !flashOn;
      Sound.flashlight();
      if (window.Net) Net.sendEvent("flash", flashOn);
    } else {
      Sound.roar(1);
      cam.shake = 0.6;
      if (window.Net) Net.sendEvent("roar");
    }
  }

  /* ---------------- Ítems, salida y daño ---------------- */
  function nearestItem() {
    let best = null, bd = 1.25;
    for (const it of G.items) {
      if (it.taken) continue;
      const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function nearExit() {
    if (G.game === "survival" || !LV.exit) return false;
    return Math.hypot(player.pos.x - LV.exit.x, player.pos.z - LV.exit.z) < LV.exit.r;
  }

  function interact() {
    if (player.role === "monster") return monsterAttack();
    const it = nearestItem();
    if (it) return pickItem(it);
    if (nearExit()) {
      if (G.exitOpen) return levelComplete();
      Sound.denied();
      toast(`Está cerrada. Faltan ${NEED - G.relics} ${Rules.SCENARIOS[G.scenario].relics}.`);
    }
  }

  function pickItem(it) {
    const sc = Rules.SCENARIOS[G.scenario];
    if (it.kind === "relic") {
      G.totalRelics++;
      // en multijugador las reliquias son del equipo: cuenta las que ya recogió cualquiera
      if (G.game === "versus") { it.taken = true; G.relics = teamRelics(); } else G.relics++;
      Sound.pickup(true);
      if (G.game === "survival") {
        G.boost += 0.06;
        toast(`${sc.relic} (${G.totalRelics}). El monstruo se enfurece…`);
        spawnSurvivalRelic();
      } else if (G.relics >= NEED) {
        G.exitOpen = true;
        updateExitBeacon();
        toast(G.game === "versus" && activePeers("survivor").length
          ? `¡Ya tienen los ${NEED}! Escapa por ${LV.exit.label}.` : `¡Tienes los ${NEED}! Escapa por ${LV.exit.label}.`, 4500);
      } else {
        toast(`${sc.relic} ${G.relics}/${NEED}`);
      }
    } else {
      if (!Rules.addItem(G.inv, it.kind)) { Sound.denied(); toast(`No puedes cargar más (${Rules.ITEMS[it.kind].label}).`); return; }
      Sound.pickup(false);
      toast(touchMode() ? `${Rules.ITEMS[it.kind].label} — tócala en el inventario para usarla`
                        : `${Rules.ITEMS[it.kind].label} — úsala con la tecla ${Rules.ITEMS[it.kind].key}`);
    }
    it.taken = true;
    it.mesh.visible = false;
    if (G.game === "survival" && it.kind !== "relic") it.respawn = 60;
    if (config.mode === "mp" && window.Net) Net.sendEvent("pick", { id: it.id, kind: it.kind });
    updateLiveHud();
  }

  // Supervivencia: cada reliquia recogida aparece otra en un punto lejano
  function spawnSurvivalRelic() {
    const spots = LV.items.concat(LV.spots || []);
    const free = spots.filter((s) => Math.hypot(s.x - player.pos.x, s.z - player.pos.z) > 6 &&
      !G.items.some((it) => !it.taken && Math.hypot(it.x - s.x, it.z - s.z) < 0.5));
    const pool = free.length ? free : spots;
    const s = pool[Math.floor(Math.random() * pool.length)];
    G.items.push(makeItem("relic", s.x, s.z, `${G.scenario}-r${++G.spawnCount}`, s.y || 0));
  }

  function useItem(kind) {
    if (player.role !== "survivor") return;
    if (!G.inv[kind]) { Sound.denied(); toast(`No tienes ${Rules.ITEMS[kind].label.toLowerCase()}.`); return; }
    if (kind === "battery") {
      if (battery > 0.97) { toast("La linterna ya está cargada."); return; }
      battery = Math.min(1, battery + Rules.BATTERY_CHARGE);
      flashOn = true;
      toast("Linterna recargada.");
    } else if (kind === "medkit") {
      if (G.hp >= G.maxHp) { toast("Tienes la vida completa."); return; }
      G.hp++;
      toast("Te curaste las heridas.");
      sendHp();
    } else if (kind === "holywater") {
      cam.shake = 0.3;
      holyBurst(player.pos);
      if (config.mode === "solo") {
        if (other && other.pos.distanceTo(player.pos) < Rules.STUN_RADIUS) {
          other.stun = Rules.STUN_TIME;
          other.chasing = false;
          toast("¡El agua bendita paraliza al monstruo!");
        } else toast("El agua bendita se evapora… el monstruo no estaba cerca.");
      } else if (window.Net) {
        Net.sendEvent("holy", { x: player.pos.x, z: player.pos.z });
        toast("Lanzaste agua bendita.");
      }
    }
    G.inv[kind]--;
    Sound.useItem(kind);
    updateLiveHud();
  }

  // destello azul del agua bendita (partículas que se expanden)
  const bursts = [];
  function holyBurst(at) {
    const N = 60, pos = new Float32Array(N * 3), vel = [];
    for (let i = 0; i < N; i++) {
      pos.set([at.x, 1.0, at.z], i * 3);
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
      vel.push([Math.cos(a) * s, (Math.random() - 0.3) * 2, Math.sin(a) * s]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x8fd0ff, size: 0.16, map: getGlowTex(), transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(p);
    bursts.push({ p, vel, life: 1 });
  }
  function updateBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      const arr = b.p.geometry.attributes.position;
      for (let k = 0; k < arr.count; k++) {
        arr.setXYZ(k, arr.getX(k) + b.vel[k][0] * dt, arr.getY(k) + b.vel[k][1] * dt, arr.getZ(k) + b.vel[k][2] * dt);
      }
      arr.needsUpdate = true;
      b.p.material.opacity = Math.max(0, b.life);
      if (b.life <= 0) { b.p.removeFromParent(); b.p.geometry.dispose(); bursts.splice(i, 1); }
    }
  }

  function sendHp() {
    if (config.mode === "mp" && window.Net) Net.sendEvent("hp", { hp: G.hp, max: G.maxHp });
  }

  // golpe del monstruo al superviviente local
  function hurtPlayer(from) {
    if (G.invuln > 0 || G.over || player.role !== "survivor") return false;
    G.hp--;
    G.invuln = Rules.INVULNERABLE;
    Sound.hurt();
    hurtFlash();
    if (window.Touch) Touch.buzz(160);   // vibración en el celular
    cam.shake = 0.8;
    const push = player.pos.clone().sub(from).setY(0);
    if (push.lengthSq() > 1e-4) player.vel.addScaledVector(push.normalize(), 5);
    sendHp();
    if (G.hp <= 0) endMatch("caught");
    else toast(G.hp === 1 ? `¡Te queda una vida! Usa un botiquín${keyTip(2)}.` : "¡El monstruo te alcanzó!");
    updateLiveHud();
    return true;
  }

  // el monstruo-jugador ataca (multijugador)
  function monsterAttack() {
    if (player.role !== "monster" || G.attackCd > 0 || G.stunned > 0) return;
    G.attackCd = Rules.ATTACK_COOLDOWN;
    Sound.swipe();
    cam.shake = 0.35;
    // embestida corta hacia donde mira
    player.vel.add(V3(Math.sin(player.heading) * 4, 0, Math.cos(player.heading) * 4));
    const target = nearestSurvivor(Rules.ATTACK_RANGE + 0.4);
    if (target && !wallBetween(player.pos, target.pos)) {
      Net.sendEvent("hit", { x: player.pos.x, z: player.pos.z, target: target.id });
    }
  }

  /* ---------------- Fin de nivel y de partida ---------------- */
  function levelComplete() {
    G.levelsCleared++;
    Sound.unlock();
    const last = G.game !== "escape" || config.mode === "mp" || G.campaignIdx >= Rules.CAMPAIGN.length - 1;
    if (last) return endMatch("escaped");
    // campaña: pasar al siguiente escenario (se conservan vida, inventario y batería)
    const next = Rules.SCENARIOS[Rules.CAMPAIGN[G.campaignIdx + 1]];
    banner(`Escapaste de ${LV.name}`, `Siguiente: ${next.label}`, 3000);
    G.transition = 3;
    keys.clear();
  }

  function nextLevel() {
    G.campaignIdx++;
    G.scenario = Rules.CAMPAIGN[G.campaignIdx];
    startLevel();
  }

  function endMatch(result, remote = false) {
    if (G.over) return;
    G.over = true;
    keys.clear();
    const surv = player.role === "survivor";
    const campaign = G.game === "escape" && config.mode === "solo";
    const stats = {
      result,                             // escaped | caught | won | lost | abandon
      role: player.role,
      mode: G.game,
      difficulty: G.diffId,
      scenario: campaign ? "campaign" : G.scenario,
      scenarioLabel: campaign ? "Campaña (3 escenarios)" : Rules.SCENARIOS[G.scenario].label,
      reached: Rules.SCENARIOS[G.scenario].label,
      seconds: Math.round(G.time),
      relics: surv ? G.totalRelics : G.relics,
      levels: G.levelsCleared,
      levelsPlayed: campaign ? Rules.CAMPAIGN.length : 1,
      hp: Math.max(0, G.hp),
      escaped: result === "escaped",
      won: result === "escaped" || result === "won",
    };
    if (config.mode === "mp" && !surv && G.versus) {
      const v = G.versus;
      stats.detail = `Atrapaste a ${v.caught} de ${v.total} ${v.total === 1 ? "superviviente" : "supervivientes"}.`;
    }
    stats.points = result === "abandon" ? 0 : Rules.score(stats);
    // avisar a la sala: este superviviente ya salió (o cayó); la partida sigue para los demás
    if (config.mode === "mp" && surv && !remote && result !== "abandon" && window.Net) Net.sendEvent("out", { result });
    if (window.Sound) {
      Sound.stopMusic();
      Sound.setTension(0);
      stats.won ? Sound.win() : (result === "abandon" ? Sound.denied() : Sound.lose());
    }
    if (result === "caught" && surv) { cam.shake = 1.2; hurtFlash(); }
    updateLiveHud();
    updatePrompt();
    setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock();
      window.dispatchEvent(new CustomEvent("penumbra:result", { detail: stats }));
    }, result === "caught" ? 1700 : 900);
  }

  // el monstruo-jugador: ¿ya terminaron todos los supervivientes?
  function checkVersusEnd() {
    if (config.mode !== "mp" || player.role !== "monster" || G.over) return;
    const prey = [...peers.values()].filter((a) => a.role === "survivor");
    if (prey.some((a) => !a.out)) return;
    const caught = prey.filter((a) => a.out === "caught").length;
    const escaped = prey.filter((a) => a.out === "escaped").length;
    G.versus = { caught, escaped, total: caught + escaped };
    if (!caught && !escaped) return endMatch("abandon");
    endMatch(caught >= Math.ceil((caught + escaped) / 2) ? "won" : "lost");
  }

  /* ---------------- Red ---------------- */
  function onNetEvent(msg) {
    const d = msg.d || {};
    const a = peers.get(msg.id);
    switch (msg.e) {
      case "flash":
        if (a && a.flash) a.flash.visible = !!msg.d && !a.out;
        break;
      case "roar": {
        if (!a) break;
        const dist = a.pos.distanceTo(player.pos);
        Sound.roar(clamp(1.4 - dist / 8, 0.3, 1));
        cam.shake = Math.max(cam.shake, clamp(0.7 - dist / 10, 0.15, 0.7));
        toast(player.role === "survivor" ? "Algo ruge muy cerca…" : "El monstruo ruge");
        break;
      }
      case "pick": {            // un superviviente recogió algo: desaparece para todos
        const it = G.items.find((i) => i.id === d.id);
        if (!it || it.taken) break;
        it.taken = true; it.mesh.visible = false;
        if (it.kind !== "relic") break;
        G.relics = teamRelics();
        const sc = Rules.SCENARIOS[G.scenario];
        if (G.relics >= NEED && !G.exitOpen) {
          G.exitOpen = true;
          updateExitBeacon();
          if (player.role === "monster") { toast(`¡Tienen las ${NEED} ${sc.relics}! Vigila ${LV.exit.label}.`, 4500); Sound.denied(); }
          else { toast(`¡${a ? a.name : "Tu equipo"} encontró la última! Escapa por ${LV.exit.label}.`, 4500); Sound.unlock(); }
        } else if (player.role === "survivor") {
          toast(`${a ? a.name : "Tu equipo"} encontró ${sc.relic.toLowerCase()} (${G.relics}/${NEED}).`);
        }
        updateLiveHud();
        break;
      }
      case "hp":
        if (!a) break;
        if (player.role === "monster" && d.hp < a.hp && d.hp > 0)
          toast(`¡Golpe! A ${a.name} ${d.hp === 1 ? "le queda 1 vida" : `le quedan ${d.hp} vidas`}.`);
        a.hp = d.hp; a.maxHp = d.max;
        break;
      case "hit":
        // solo el superviviente al que apuntó el golpe
        if (player.role === "survivor" && (d.target == null || d.target === Net.info.id)) hurtPlayer(V3(d.x || 0, 0, d.z || 0));
        break;
      case "holy":
        holyBurst(V3(d.x, 0, d.z));
        if (player.role === "monster" && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < Rules.STUN_RADIUS) {
          G.stunned = Rules.STUN_TIME;
          Sound.stun();
          toast("¡Agua bendita! Quedaste paralizado.", 3000);
        }
        break;
      case "out":             // un superviviente escapó o cayó
        if (!a || a.out) break;
        a.out = d.result === "escaped" ? "escaped" : "caught";
        a.char.root.visible = false;
        toast(a.out === "escaped" ? `${a.name} escapó.` : `${a.name} cayó en la penumbra.`, 3500);
        if (player.role === "monster" && a.out === "caught") Sound.growl(0.6);
        updateLiveHud();
        updateNetHud();
        checkVersusEnd();
        break;
    }
  }
  function onNetState(msg) {
    if (config.mode !== "mp") return;
    // si los modelos aún cargan, setupMatch() agregará a los demás al terminar
    if (!modelsReady || !LV || !player.char) return;
    let a = peers.get(msg.id);
    if (!a) {
      const p = Net.info.peers.find((q) => q.id === msg.id);
      if (!p) return;
      a = addPeer(p);
      a.pos.fromArray(msg.p);
      a.heading = msg.r;
    }
    if (a.out) return;
    a.target.fromArray(msg.p);
    a.targetHeading = msg.r;
    a.speed = msg.a;
  }
  function onPeerJoin(msg) {
    if (config.mode !== "mp" || !running) return;
    if (modelsReady && player.char && !peers.has(msg.id)) addPeer(msg);
    updateNetHud();
  }
  function onPeerLeave(msg) {
    if (config.mode !== "mp") return;
    const a = peers.get(msg.id);
    if (a) a.char.root.visible = false;
    if (!running || !player.char || G.over) { updateNetHud(); return; }
    if (msg.role === "monster") {
      toast("El monstruo abandonó la partida.", 4500);
      updateNetHud();
      return endMatch("abandon");
    }
    if (a && !a.out) {
      a.out = "left";
      toast(`${a.name} abandonó la partida.`, 4000);
    }
    updateNetHud();
    updateLiveHud();
    checkVersusEnd();
  }
  function onNetClose(info) {
    if (config.mode !== "mp" || !info.wasInRoom) return;
    toast("Se perdió la conexión con el servidor.", 6000);
    removeOther();
    updateNetHud();
    if (running && player.char && !G.over) endMatch("abandon");
  }
  let netBound = false;
  function bindNet() {
    if (netBound || !window.Net) return;
    netBound = true;
    Net.on("state", onNetState);
    Net.on("event", onNetEvent);
    Net.on("peer-join", onPeerJoin);
    Net.on("peer-leave", onPeerLeave);
    Net.on("close", onNetClose);
    Net.on("ping", () => { if (running) updateNetHud(); });
  }

  /* ---------------- Actualización por cuadro ---------------- */
  const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();
  const _target = new THREE.Vector3(), _camPos = new THREE.Vector3();
  const _camStep = new THREE.Vector3(), _camTry = new THREE.Vector3();

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  function updatePlayer(dt) {
    if (!player.char) return;
    const def = player.char.def;
    const monster = player.role === "monster";

    _fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    _wish.set(0, 0, 0);
    const stick = window.Touch && Touch.enabled && Touch.move.active ? Touch.move : null;
    const free = canControl() && !(monster && G.stunned > 0);
    if (free) {
      if (keys.has("KeyW") || keys.has("ArrowUp")) _wish.add(_fwd);
      if (keys.has("KeyS") || keys.has("ArrowDown")) _wish.sub(_fwd);
      if (keys.has("KeyD") || keys.has("ArrowRight")) _wish.add(_right);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) _wish.sub(_right);
      // joystick táctil: arriba = adelante
      if (stick) _wish.addScaledVector(_fwd, -stick.y).addScaledVector(_right, stick.x);
    }
    const moving = _wish.lengthSq() > 1e-6;
    const run = keys.has("ShiftLeft") || keys.has("ShiftRight") || !!(free && stick && stick.run);
    const mul = monster ? G.diff.monsterPlayerSpeed : 1;
    // con el joystick se camina más lento si apenas se empuja (control fino)
    const analog = free && stick && !run ? 0.4 + 0.6 * Math.min(1, stick.mag / 0.9) : 1;
    const maxSpeed = moving ? (run ? def.runSpeed : def.walkSpeed * analog) * mul : 0;
    if (moving) _wish.normalize().multiplyScalar(maxSpeed);

    // aceleración suave
    player.vel.lerp(_wish, 1 - Math.exp(-10 * dt));
    player.pos.addScaledVector(player.vel, dt);
    collide(player.pos);
    const near = config.mode === "mp" ? activePeers() : (other ? [other] : []);
    for (const a of near) {
      separate(player.pos, a.pos);
      collide(player.pos);
    }
    player.speed = Math.hypot(player.vel.x, player.vel.z);

    if (player.speed > 0.2) {
      const h = Math.atan2(player.vel.x, player.vel.z);
      player.heading = angleLerp(player.heading, h, 1 - Math.exp(-12 * dt));
    }
    player.char.root.position.copy(player.pos);
    player.char.root.rotation.y = player.heading;
    player.char.setMotion(player.speed);
    player.char.update(dt);

    // pasos
    player.stepAcc += player.speed * dt;
    const stride = player.speed > 3 ? 0.9 : 0.62;
    if (player.speed > 0.4 && player.stepAcc > stride) {
      player.stepAcc = 0;
      Sound.step(monster ? "heavy" : LV.surface, player.speed > 3 ? 0.9 : 0.55);
    }

    // linterna y batería
    if (flashlight) {
      const d = G.diff;
      battery = clamp(battery + (flashOn ? -d.drain : d.recharge) * dt, 0, 1);
      if (battery <= 0 && flashOn) { flashOn = false; toast(`La linterna se quedó sin batería. Usa una batería${keyTip(1)}.`); }
      const flicker = battery < 0.15 ? (Math.random() < 0.1 ? 0.2 : 1) : 1;
      flashlight.visible = flashOn;
      flashlight.intensity = 9 * flicker * (0.5 + battery * 0.5);
      const bar = document.querySelector("#battery .battery-bar i");
      if (bar) bar.style.width = Math.round(battery * 100) + "%";
    }
  }

  function updateOther(dt) {
    if (config.mode === "mp") {
      for (const a of peers.values()) if (!a.out) animateActor(a, dt);
      return;
    }
    if (!other) return;
    if (other.npc) updateNpc(dt);
    animateActor(other, dt);
  }

  function animateActor(a, dt) {
    if (!a.npc) {
      const k = 1 - Math.exp(-12 * dt);
      a.pos.lerp(a.target, k);
      a.heading = angleLerp(a.heading, a.targetHeading, k);
    }
    a.char.root.position.copy(a.pos);
    a.char.root.rotation.y = a.heading;
    a.char.setMotion(a.speed);
    a.char.update(dt);

    // pasos del otro, más fuertes cuanto más cerca
    a.stepAcc += a.speed * dt;
    if (a.speed > 0.4 && a.stepAcc > (a.speed > 3 ? 0.9 : 0.7)) {
      a.stepAcc = 0;
      const v = clamp(1 - a.pos.distanceTo(player.pos) / 12, 0, 1);
      if (v > 0.05) Sound.step(a.role === "monster" ? "heavy" : LV.surface, v * 0.8);
    }
  }

  // punto de ronda más cercano al que se pueda caminar en línea recta
  function nearestVisibleWp(pos) {
    let best = -1, bestD = Infinity;
    LV.npcPath.forEach((p, i) => {
      const d = p.distanceTo(pos);
      if (d < bestD && clearPath(pos, p)) { best = i; bestD = d; }
    });
    if (best >= 0) return best;
    LV.npcPath.forEach((p, i) => { const d = p.distanceTo(pos); if (d < bestD) { best = i; bestD = d; } });
    return best;
  }

  // a dónde caminar para llegar a `target`: directo si se puede, si no por la ruta
  function steer(o, target, dt) {
    if (clearPath(o.pos, target)) { o.navGoal = null; return target; }
    o.navT -= dt;
    if (!o.navGoal || o.navT <= 0 || o.pos.distanceTo(o.navGoal) < 0.4 || o.navTarget.distanceTo(target) > 1) {
      o.navGoal = routeNext(o.pos, target);
      o.navTarget.copy(target);
      o.navT = 0.5;
    }
    return o.navGoal || target;
  }

  // IA del monstruo (modo un jugador): ronda por el escenario; si VE al
  // superviviente (distancia + sin muros) u OYE sus pasos (según la
  // dificultad) lo persigue, lo golpea, y al perderlo busca donde lo vio.
  function updateNpc(dt) {
    const o = other, d = G.diff;
    o.attackCd = Math.max(0, o.attackCd - dt);
    const toPlayer = player.pos.clone().sub(o.pos);
    const dist = toPlayer.length();
    let goal = null, speed = 0;

    if (o.stun > 0 || o.recover > 0 || G.over || G.transition > 0) {
      o.stun = Math.max(0, o.stun - dt);
      o.recover = Math.max(0, o.recover - dt);
    } else {
      // la linterna encendida lo delata; a oscuras cuesta más verte
      const lit = flashOn && battery > 0;
      const visionR = d.vision * (lit ? 1.2 : 0.75);
      const sees = dist < visionR && !wallBetween(o.pos, player.pos);
      const hears = (player.speed > 3 && dist < d.hearRun) || (player.speed > 0.5 && dist < d.hearWalk);
      if (sees || hears) {
        if (!o.chasing) Sound.growl(clamp(1.2 - dist / 8, 0.3, 1));
        o.chasing = true;
        o.lastSeen.copy(player.pos);
        o.searchT = 5;
      }

      if (sees) {
        if (dist > 0.85) { goal = steer(o, player.pos, dt); speed = d.monsterChase * G.boost; }
        o.targetHeading = Math.atan2(toPlayer.x, toPlayer.z);
        if (dist < Rules.ATTACK_RANGE && o.attackCd <= 0) {
          o.attackCd = Rules.ATTACK_COOLDOWN;
          o.recover = 1.3;
          Sound.swipe();
          hurtPlayer(o.pos);
        }
      } else if (o.chasing) {
        // fue a donde lo vio u oyó por última vez (rodeando muros si hace falta)
        o.searchT -= dt;
        goal = steer(o, o.lastSeen, dt);
        speed = d.monsterChase * 0.85 * G.boost;
        if (o.pos.distanceTo(o.lastSeen) < 0.6 || o.searchT <= 0) {
          o.chasing = false;
          o.navGoal = null;
          o.wp = nearestVisibleWp(o.pos);
          o.wait = 1.2;
          goal = null; speed = 0;
        }
      } else if (o.wait > 0) {
        o.wait -= dt;
      } else {
        const wp = LV.npcPath[o.wp];
        goal = steer(o, wp, dt);
        speed = d.monsterWalk * G.boost;
        if (o.pos.distanceTo(wp) < 0.35) {
          o.wp = (o.wp + 1) % LV.npcPath.length;
          o.wait = Math.random() < 0.4 ? 1 + Math.random() * 2 : 0;
          goal = null; speed = 0;
        }
      }
    }
    const before = o.pos.clone();
    if (goal) {
      const dir = goal.clone().sub(o.pos).setY(0);
      if (dir.lengthSq() > 1e-4) {
        dir.normalize();
        o.pos.addScaledVector(dir, speed * dt);
        o.targetHeading = Math.atan2(dir.x, dir.z);
      }
    }
    collide(o.pos);
    // red de seguridad: si aun así se atora, recalcula la ruta y, si sigue, vuelve a su ronda
    if (goal && speed > 0) {
      o.stuck = before.distanceTo(o.pos) < speed * dt * 0.3 ? o.stuck + dt : 0;
      if (o.stuck > 0.8) {
        o.navGoal = null;
        o.navT = 0;
        o.stuckCount = (o.stuckCount || 0) + 1;
        o.stuck = 0;
        if (o.stuckCount >= 3) {
          o.stuckCount = 0;
          o.chasing = false;
          o.wp = nearestVisibleWp(o.pos);
        }
      }
    } else o.stuckCount = 0;
    o.speed = THREE.MathUtils.lerp(o.speed, speed, 1 - Math.exp(-8 * dt));
    o.heading = angleLerp(o.heading, o.targetHeading, 1 - Math.exp(-6 * dt));
  }

  function updateGame(dt, t) {
    if (G.transition > 0) {
      G.transition -= dt;
      if (G.transition <= 0) nextLevel();
      return;
    }
    if (G.over) return;
    G.time += dt;
    G.invuln = Math.max(0, G.invuln - dt);
    G.attackCd = Math.max(0, G.attackCd - dt);
    if (G.stunned > 0) G.stunned = Math.max(0, G.stunned - dt);

    // Supervivencia: los ítems de ayuda vuelven a aparecer
    for (const it of G.items) {
      if (it.taken && it.respawn > 0) {
        it.respawn -= dt;
        if (it.respawn <= 0) { it.taken = false; it.mesh.visible = true; }
      }
    }
    // tensión (latido y música) según la distancia al rival
    const rivals = config.mode === "mp"
      ? activePeers(player.role === "monster" ? "survivor" : "monster") : (other ? [other] : []);
    if (rivals.length) {
      const dist = Math.min(...rivals.map((a) => a.pos.distanceTo(player.pos)));
      Sound.setTension(clamp(1 - (dist - 1.5) / 8, 0, 1));
    }
    updateLiveHud();
    updatePrompt();
  }

  function updateItems(dt, t) {
    for (const it of G.items) {
      if (it.taken) continue;
      it.mesh.position.y = it.y + 0.45 + Math.sin(t * 2 + it.x) * 0.06;
      it.mesh.rotation.y += dt * 1.3;
      it.mesh.userData.halo.material.opacity = 0.4 + Math.sin(t * 3 + it.z) * 0.15;
    }
    const b = LV.exitBeacon;
    if (b && b.sprite.visible) {
      const k = G.exitOpen ? 1 : 0.6 + Math.sin(t * 4) * 0.3;
      b.sprite.material.opacity = 0.8 * k;
      b.light.intensity = 0.9 * k;
    }
  }

  function updateCamera(dt) {
    _target.copy(player.pos).y += player.role === "monster" ? 1.85 : 1.35;
    const cp = Math.cos(cam.pitch);
    _fwd.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    _camPos.copy(_target).addScaledVector(_fwd, -cam.dist).addScaledVector(_right, 0.4);
    // la cámara no atraviesa paredes, techo ni piso: avanza desde la cabeza
    // del personaje hacia su posición ideal y se detiene antes de salir de la zona
    _camStep.copy(_target);
    for (let i = 1; i <= 16; i++) {
      _camTry.lerpVectors(_target, _camPos, i / 16);
      const z = camZone(_camTry);
      if (!z) break;
      _camTry.y = Math.min(_camTry.y, z.h);
      _camStep.copy(_camTry);
    }
    _camPos.copy(_camStep);
    _camPos.y = Math.max(_camPos.y, 0.35);
    camera.position.lerp(_camPos, 1 - Math.exp(-18 * dt));

    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt);
      const s = cam.shake * 0.06;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    camera.lookAt(_target.addScaledVector(_fwd, 2).addScaledVector(_right, 0.4));
  }

  function sendNet(dt) {
    if (config.mode !== "mp" || !window.Net || !Net.inRoom) return;
    netTimer += dt;
    if (netTimer < 1 / 15) return;   // 15 envíos por segundo
    netTimer = 0;
    Net.sendState(player.pos, player.heading, Math.round(player.speed * 100) / 100);
  }

  /* ============================================================
     BUCLE
     ============================================================ */
  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (LV) {
      if (modelsReady && player.char) {
        updateGame(dt, t);
        if (LV && player.char) {
          updatePlayer(dt);
          updateOther(dt);
          updateCamera(dt);
          sendNet(dt);
        }
      }
      for (const f of flames) {
        f.scale.y = 0.75 + Math.sin(t * 15 + f.position.x * 3) * 0.25;
        f.material.color.setHSL(0.09, 1, 0.55 + Math.random() * 0.12);
        f.rotation.z = Math.sin(t * 8 + f.position.z) * 0.15;
      }
      for (const f of flickers) {
        // "soft" tiembla suave; los demás fallan de vez en cuando
        const k = f.soft ? 0.9 + Math.sin(t * 7) * 0.05 + Math.random() * 0.08
                         : (Math.sin(t * 0.7 + (f.phase || 0)) > 0.6 && Math.random() < 0.35 ? 0.05 : 1);
        f.light.intensity = f.base * k;
        if (f.bulb) f.bulb.visible = k > 0.5;
      }
      updateItems(dt, t);
      updateBursts(dt);
      if (LV.update) LV.update(dt, t, player.pos);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }

  /* ============================================================
     API
     ============================================================ */
  function applyQuality() {
    if (!renderer) return;
    const q = window.Settings ? Settings.get().quality : "medium";
    const dpr = window.devicePixelRatio || 1;
    if (q === "low") { renderer.shadowMap.enabled = false; renderer.setPixelRatio(1); }
    else if (q === "high") { renderer.shadowMap.enabled = true; renderer.setPixelRatio(Math.min(dpr, 2)); }
    else { renderer.shadowMap.enabled = true; renderer.setPixelRatio(Math.min(dpr, 1.5)); }
  }

  function resize() {
    if (!renderer) return;
    const el = renderer.domElement;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function ensureModels() {
    if (modelsReady) return Promise.resolve();
    if (loadingModels) return loadingModels;
    const el = $("hud-loading");
    if (el) { el.hidden = false; el.textContent = "Cargando modelos 0/1…"; }
    loadingModels = loadModels((done, total) => {
      if (el) el.textContent = `Cargando modelos ${done}/${total}…`;
    }).then(() => {
      modelsReady = true;
      if (el) el.hidden = true;
    }).catch((err) => {
      console.error("[PENUMBRA] No se pudieron cargar los modelos:", err);
      if (el) el.textContent = "No se pudieron cargar los modelos (revisa la consola).";
      loadingModels = null;
      throw err;
    });
    return loadingModels;
  }

  let matchPending = true;
  // configuración de la siguiente partida (ver `config` arriba)
  function configure(opts) {
    config = { ...config, ...opts };
    matchPending = true;
  }

  function start() {
    const canvas = document.getElementById("game-canvas");
    if (!canvas) return;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.75;
      camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 80);
      camera.position.set(0, 1.6, 3);
      clock = new THREE.Clock();
      buildMaterials();
      applyQuality();
      canvas.addEventListener("click", onCanvasClick);
      document.addEventListener("pointerlockchange", onLockChange);
      document.addEventListener("mousemove", onMouseMove);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", () => keys.clear());
      // al cambiar a ratón/táctil a media partida, mostrar u ocultar el aviso del ratón
      window.addEventListener("penumbra:inputmode", () => {
        const h = $("hud-lock");
        if (h) h.hidden = locked || !running || paused || G.over || touchMode();
      });
      // cambiar de app / pestaña o apagar la pantalla del celular = pausa
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && running && !paused && !G.over) window.dispatchEvent(new CustomEvent("penumbra:unlock"));
      });
      bindNet();
    }
    paused = false;
    resize();
    window.addEventListener("resize", resize);
    const hint = $("hud-lock");
    if (hint) hint.hidden = locked || touchMode();

    if (matchPending) {
      // mientras cargan los modelos ya se ve el escenario de destino
      const first = (config.game || "escape") === "escape" && config.mode === "solo"
        ? Rules.CAMPAIGN[0] : (config.scenario || "mansion");
      activateLevel(first);
      const sp = LV.spawn.survivor;
      camera.position.copy(sp.pos).add(V3(0, 1.8, 2.5));
      camera.lookAt(sp.pos.x, 1.2, sp.pos.z);
      const ip = $("interact-prompt");
      if (ip) ip.style.display = "none";
      hudCache.prompt = "";
    }

    ensureModels().then(() => {
      if (matchPending) { matchPending = false; newGame(); if (window.Touch) Touch.tutorial(); }
      else refreshHud();
    }).catch(() => {});

    if (!running) {
      clock.start();
      running = true;
      frame();
    }
  }

  function stop() {
    running = false;
    keys.clear();
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    if (document.pointerLockElement) document.exitPointerLock();
    if (window.Sound) Sound.setTension(0);
  }

  // Pausa: en un jugador se congela todo; en multijugador el mundo sigue
  // (el otro jugador se sigue viendo) pero no se aceptan controles.
  function pause() {
    paused = true;
    keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    const hint = $("hud-lock");
    if (hint) hint.hidden = true;
    if (config.mode === "solo") stop();
  }
  function resume() {
    paused = false;
    if (!running) start();
    requestLock();
  }

  // fin de la partida (volver al menú)
  function end() {
    stop();
    clearMatch();
    G.over = true;
    if (window.Sound) Sound.stopMusic();
    matchPending = true;
  }

  // otra partida con la misma configuración
  function restart() {
    end();
    start();
  }

  return {
    start, stop, pause, resume, end, restart, configure, applyQuality,
    press, look,                 // controles táctiles (js/touch.js)
    refresh() { if (player.char) refreshHud(); },
    get mode() { return config.mode; },
    get over() { return G.over; },
    // acceso para depurar desde la consola: Scene3D.debug.player.pos, etc.
    get debug() {
      return {
        player, other, peers, cam, camera, scene, G, LV, config, clearPath, routeNext, navGraph, wallBetween,
        activate: (id) => activateLevel(id),
        get battery() { return battery; }, set battery(v) { battery = v; },
        get flashOn() { return flashOn; },
        get running() { return running; },
        teleport(x, z) { player.pos.set(x, 0, z); },
        give(kind, n = 1) { for (let i = 0; i < n; i++) Rules.addItem(G.inv, kind); updateLiveHud(true); },
        relics() { G.relics = NEED; G.exitOpen = true; updateExitBeacon(); },
        level(id) { G.scenario = id; startLevel(); },
        win: () => levelComplete(),
        hurt: () => hurtPlayer(player.pos.clone().add(V3(0, 0, 1))),
      };
    },
  };
})();

window.Scene3D = Scene3D;
window.GameCanvas = Scene3D; // compatibilidad con js/app.js
