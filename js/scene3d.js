/* =========================================================
   PENUMBRA — Escenario 3D (WebGL / Three.js)
   El estudio de la Mansión Ravenwood construido SOLO con
   figuras básicas (cajas, cilindros, planos, esferas, conos,
   toros) y texturas procedurales dibujadas en <canvas>.

   - Iluminación AMBIENTAL (tenue, fría) + FOCAL (chimenea,
     lámpara, velas, linterna del superviviente) + luz de luna.
   - 2º avance: personajes GLTF animados (js/characters.js),
     control en 3ª persona (WASD + ratón), colisiones con el
     mobiliario y multijugador en tiempo real (js/net.js).

   Expone window.Scene3D = { configure, start, stop, pause,
   resume, end } para js/app.js.
   ========================================================= */

import * as THREE from "three";
import { Character, loadModels } from "./characters.js";

const Scene3D = (() => {
  let renderer, scene, camera, clock;
  let raf = null, running = false, built = false;
  let fireLight, flashSweep;
  const flames = [];
  let pendulum = null, chandelier = null, dust = null;

  const ROOM = { w: 9, d: 7, h: 3.4 };

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

    box(w, h, 0.3, M.wall, 0, h / 2, -d / 2);
    box(w, h, 0.3, M.wall, 0, h / 2, d / 2);
    box(0.3, h, d, M.wall, -w / 2, h / 2, 0);
    box(0.3, h, d, M.wall, w / 2, h / 2, 0);

    // zócalos y molduras
    for (const z of [-d / 2 + 0.17, d / 2 - 0.17]) {
      box(w, 0.22, 0.06, M.trim, 0, 0.11, z);
      box(w, 0.12, 0.08, M.trim, 0, h - 0.14, z);
    }
    for (const x of [-w / 2 + 0.17, w / 2 - 0.17]) {
      box(0.06, 0.22, d, M.trim, x, 0.11, 0);
      box(0.08, 0.12, d, M.trim, x, h - 0.14, 0);
    }
    // panelado bajo
    box(0.04, 1.0, d - 0.4, M.woodDark, -w / 2 + 0.19, 0.55, 0);
    box(w - 0.4, 1.0, 0.04, M.woodDark, 0, 0.55, d / 2 - 0.19);

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

    const leaf = box(1.24, 2.28, 0.1, M.woodMid, 0, 1.16, z - 0.02);
    for (let iy = 0; iy < 3; iy++)
      box(0.9, 0.58, 0.04, M.woodDark, 0, 0.5 + iy * 0.72, z - 0.09);
    const knob = sph(0.06, M.brass, 0.5, 1.12, z - 0.11);
    cyl(0.02, 0.02, 0.08, M.brass, 0.5, 1.12, z - 0.06).rotation.x = Math.PI / 2;
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
    const N = 130;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * ROOM.w;
      pos[i * 3 + 1] = Math.random() * ROOM.h;
      pos[i * 3 + 2] = (Math.random() - 0.5) * ROOM.d;
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
     COLISIONES (círculo del personaje vs. cajas XZ del mobiliario)
     ============================================================ */
  const PLAYER_R = 0.3;
  const WALL = { x: ROOM.w / 2 - 0.15 - PLAYER_R, z: ROOM.d / 2 - 0.15 - PLAYER_R };
  const OBSTACLES = [
    { x1: 3.85, x2: 4.5, z1: -1.5, z2: 1.5 },     // chimenea
    { x1: 3.7, x2: 4.5, z1: -3.2, z2: -1.3 },     // librero
    { x1: -2.45, x2: -0.55, z1: -1.6, z2: -0.6 }, // escritorio
    { x1: -1.75, x2: -1.25, z1: -0.4, z2: 0.1 },  // silla
    { x1: -4.5, x2: -3.75, z1: 2.55, z2: 2.95 },  // reloj de pie
    { x1: -4.5, x2: -3.1, z1: -3.5, z2: -1.0 },   // cajas y barril
    { x1: 1.74, x2: 2.16, z1: 2.64, z2: 3.06 },   // mesita con vela
  ];

  function collide(pos, r = PLAYER_R) {
    for (const b of OBSTACLES) {
      const cx = THREE.MathUtils.clamp(pos.x, b.x1, b.x2);
      const cz = THREE.MathUtils.clamp(pos.z, b.z1, b.z2);
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
    pos.x = THREE.MathUtils.clamp(pos.x, -WALL.x, WALL.x);
    pos.z = THREE.MathUtils.clamp(pos.z, -WALL.z, WALL.z);
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
     PARTIDA: personajes, entrada, cámara en 3ª persona y red
     ============================================================ */
  const SPAWN = {
    survivor: { pos: new THREE.Vector3(0.2, 0, 1.3), heading: Math.PI },
    monster: { pos: new THREE.Vector3(1.6, 0, -2.6), heading: 0 },
  };
  const NPC_PATH = [
    new THREE.Vector3(-0.5, 0, 0.4), new THREE.Vector3(2.6, 0, -2.4),
    new THREE.Vector3(2.8, 0, 2.3), new THREE.Vector3(-2.8, 0, 1.6),
    new THREE.Vector3(0.4, 0, -2.7), new THREE.Vector3(-0.3, 0, 2.6),
  ];

  let config = { mode: "solo", role: "survivor" };
  let modelsReady = false, loadingModels = null;
  let paused = false;

  // jugador local
  const player = {
    char: null, role: "survivor",
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    heading: 0, speed: 0,
  };
  let flashlight = null, flashOn = true, battery = 1;
  // personaje remoto (otro jugador) o NPC (modo un jugador)
  let other = null;        // { char, pos, target, heading, targetHeading, speed, flash, npc? }

  // cámara orbital
  const cam = { yaw: Math.PI, pitch: -0.22, dist: 2.5, shake: 0 };
  const keys = new Set();
  let locked = false;
  let netTimer = 0;

  const hud = {};
  function $(id) { return document.getElementById(id); }

  function setHud(id, text) { const el = $(id); if (el) el.textContent = text; }
  let toastTimer = null;
  function toast(text, ms = 3200) {
    const el = $("hud-toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
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
    const ch = new Character(role);
    scene.add(ch.root);
    return ch;
  }

  function clearMatch() {
    if (player.char) { player.char.dispose(); player.char = null; }
    if (other) { other.char.dispose(); other = null; }
    flashlight = null;
  }

  function setupMatch() {
    clearMatch();
    player.role = config.role;
    player.char = spawnCharacter(player.role);
    player.pos.copy(SPAWN[player.role].pos);
    player.heading = SPAWN[player.role].heading;
    player.vel.set(0, 0, 0);
    player.speed = 0;
    cam.yaw = player.heading + Math.PI;  // detrás del personaje
    cam.pitch = -0.22;

    flashOn = true; battery = 1;
    if (player.role === "survivor") {
      const q = window.Settings ? Settings.get().quality : "medium";
      flashlight = makeFlashlight(player.char.root, q !== "low");
    }

    if (config.mode === "solo") {
      // monstruo controlado por la computadora (paseo + acecho)
      addOther("monster", true);
    } else {
      // el otro jugador aparece cuando llegue su primer estado
      const peer = window.Net && Net.info.peers[0];
      if (peer) addOther(peer.role, false);
    }
    refreshHud();
  }

  function addOther(role, npc) {
    if (other) other.char.dispose();
    const ch = spawnCharacter(role);
    const s = SPAWN[role];
    other = {
      role, npc, char: ch,
      pos: s.pos.clone(), target: s.pos.clone(),
      heading: s.heading, targetHeading: s.heading,
      speed: 0, flash: null,
      wp: 0, wait: 1.5,
    };
    if (role === "survivor") other.flash = makeFlashlight(ch.root, false);
    ch.root.position.copy(other.pos);
    ch.root.rotation.y = other.heading;
  }

  function removeOther() {
    if (other) { other.char.dispose(); other = null; }
  }

  function refreshHud() {
    const surv = player.role === "survivor";
    setHud("objective-text", surv
      ? "Explora el estudio. Que no te atrape."
      : "Caza al superviviente. Sigue la luz de su linterna.");
    setHud("hud-role", surv ? "Superviviente" : "Monstruo");
    const role = $("hud-role");
    if (role) role.className = surv ? "tag tag-survivor" : "tag tag-monster";
    const d = window.Settings ? Settings.get().difficulty : "normal";
    setHud("hud-difficulty", { normal: "Normal", dark: "Oscuro", blackout: "Apagón" }[d] || d);
    setHud("hud-action", surv ? "Linterna" : "Rugir");
    const bat = $("battery");
    if (bat) bat.style.visibility = surv ? "visible" : "hidden";
    updateNetHud();
  }

  function updateNetHud() {
    if (config.mode === "solo") return setHud("hud-net", "Un jugador");
    if (!window.Net || !Net.inRoom) return setHud("hud-net", "Sin conexión");
    const peer = Net.info.peers[0];
    const who = peer ? (peer.role === "monster" ? "monstruo conectado" : "superviviente conectado")
                     : "esperando rival…";
    setHud("hud-net", `Sala ${Net.info.code} · ${who} · ${Net.info.ping} ms`);
  }

  /* ---------------- Entrada ---------------- */
  function onKeyDown(e) {
    if (!running || paused) return;
    keys.add(e.code);
    if (e.code === "KeyF" && !e.repeat) doAction();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!locked || paused) return;
    const sens = (window.Settings ? Settings.get().sensitivity : 8) * 0.00028;
    cam.yaw -= e.movementX * sens;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - e.movementY * sens, -0.9, 0.35);
  }
  function onCanvasClick() {
    if (!running || paused || locked) return;
    requestLock();
  }
  function requestLock() {
    const c = renderer && renderer.domElement;
    if (!c) return;
    try {
      const p = c.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* el navegador aún no permite volver a bloquear */ }
  }
  function onLockChange() {
    locked = document.pointerLockElement === renderer.domElement;
    const hint = $("hud-lock");
    if (hint) hint.hidden = locked || !running || paused;
    // salir del puntero con ESC = pausa
    if (!locked && running && !paused) window.dispatchEvent(new CustomEvent("penumbra:unlock"));
  }

  function doAction() {
    if (player.role === "survivor") {
      if (battery <= 0.02 && !flashOn) return;
      flashOn = !flashOn;
      Sound.flashlight();
      if (window.Net) Net.sendEvent("flash", flashOn);
    } else {
      Sound.roar(1);
      cam.shake = 0.6;
      if (window.Net) Net.sendEvent("roar");
    }
  }

  function onNetEvent(msg) {
    if (!other) return;
    if (msg.e === "flash" && other.flash) other.flash.visible = !!msg.d;
    if (msg.e === "roar") {
      const d = other.pos.distanceTo(player.pos);
      Sound.roar(THREE.MathUtils.clamp(1.4 - d / 8, 0.3, 1));
      cam.shake = Math.max(cam.shake, THREE.MathUtils.clamp(0.7 - d / 10, 0.15, 0.7));
      toast(player.role === "survivor" ? "Algo ruge muy cerca…" : "El monstruo ruge");
    }
  }
  function onNetState(msg) {
    if (config.mode !== "mp") return;
    if (!other) {
      const peer = Net.info.peers.find((p) => p.id === msg.id);
      addOther(peer ? peer.role : (player.role === "survivor" ? "monster" : "survivor"), false);
      other.pos.fromArray(msg.p);
      other.heading = msg.r;
    }
    other.target.fromArray(msg.p);
    other.targetHeading = msg.r;
    other.speed = msg.a;
  }
  function onPeerJoin(msg) {
    if (config.mode !== "mp") return;
    toast(msg.role === "monster" ? "El monstruo entró a la mansión." : "Un superviviente entró a la mansión.");
    addOther(msg.role, false);
    updateNetHud();
  }
  function onPeerLeave(msg) {
    if (config.mode !== "mp") return;
    toast(msg.role === "monster" ? "El monstruo abandonó la partida." : "El superviviente abandonó la partida.", 4500);
    removeOther();
    updateNetHud();
  }
  function onNetClose(info) {
    if (config.mode !== "mp" || !info.wasInRoom) return;
    toast("Se perdió la conexión con el servidor.", 6000);
    removeOther();
    updateNetHud();
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

  function angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  }

  function updatePlayer(dt) {
    if (!player.char) return;
    const def = player.char.def;

    _fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    _wish.set(0, 0, 0);
    if (!paused) {
      if (keys.has("KeyW") || keys.has("ArrowUp")) _wish.add(_fwd);
      if (keys.has("KeyS") || keys.has("ArrowDown")) _wish.sub(_fwd);
      if (keys.has("KeyD") || keys.has("ArrowRight")) _wish.add(_right);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) _wish.sub(_right);
    }
    const moving = _wish.lengthSq() > 0;
    const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const maxSpeed = moving ? (run ? def.runSpeed : def.walkSpeed) : 0;
    if (moving) _wish.normalize().multiplyScalar(maxSpeed);

    // aceleración suave
    player.vel.lerp(_wish, 1 - Math.exp(-10 * dt));
    player.pos.addScaledVector(player.vel, dt);
    collide(player.pos);
    if (other) {
      separate(player.pos, other.pos);
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

    // linterna y batería
    if (flashlight) {
      battery = THREE.MathUtils.clamp(battery + (flashOn ? -dt / 150 : dt / 60), 0, 1);
      if (battery <= 0 && flashOn) { flashOn = false; toast("La linterna se quedó sin batería."); }
      const flicker = battery < 0.15 ? (Math.random() < 0.1 ? 0.2 : 1) : 1;
      flashlight.visible = flashOn;
      flashlight.intensity = 9 * flicker * (0.5 + battery * 0.5);
      const bar = document.querySelector("#battery .battery-bar i");
      if (bar) bar.style.width = Math.round(battery * 100) + "%";
    }
  }

  function updateOther(dt) {
    if (!other) return;
    if (other.npc) updateNpc(dt);
    else {
      const k = 1 - Math.exp(-12 * dt);
      other.pos.lerp(other.target, k);
      other.heading = angleLerp(other.heading, other.targetHeading, k);
    }
    other.char.root.position.copy(other.pos);
    other.char.root.rotation.y = other.heading;
    other.char.setMotion(other.speed);
    other.char.update(dt);
  }

  // IA sencilla del monstruo en modo un jugador: ronda entre puntos y,
  // si ve al superviviente cerca, se acerca despacio hasta quedarse mirándolo.
  function updateNpc(dt) {
    const toPlayer = player.pos.clone().sub(other.pos);
    const dist = toPlayer.length();
    let goal = null, speed = 0;

    if (dist < 4.2) {
      if (dist > 1.1) { goal = player.pos; speed = 1.4; }
      other.targetHeading = Math.atan2(toPlayer.x, toPlayer.z);
    } else if (other.wait > 0) {
      other.wait -= dt;
    } else {
      goal = NPC_PATH[other.wp];
      speed = 1.25;
      if (other.pos.distanceTo(goal) < 0.35) {
        other.wp = (other.wp + 1 + Math.floor(Math.random() * 2)) % NPC_PATH.length;
        other.wait = 1 + Math.random() * 2.5;
        goal = null; speed = 0;
      }
    }
    if (goal) {
      const dir = goal.clone().sub(other.pos).setY(0);
      if (dir.lengthSq() > 1e-4) {
        dir.normalize();
        other.pos.addScaledVector(dir, speed * dt);
        other.targetHeading = Math.atan2(dir.x, dir.z);
      }
    }
    collide(other.pos);
    other.speed = THREE.MathUtils.lerp(other.speed, speed, 1 - Math.exp(-8 * dt));
    other.heading = angleLerp(other.heading, other.targetHeading, 1 - Math.exp(-6 * dt));
  }

  function updateCamera(dt) {
    _target.copy(player.pos).y += player.role === "monster" ? 1.85 : 1.5;
    const cp = Math.cos(cam.pitch);
    _fwd.set(-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp);
    _right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    _camPos.copy(_target).addScaledVector(_fwd, -cam.dist).addScaledVector(_right, 0.4);
    // la cámara no atraviesa paredes, techo ni piso
    _camPos.x = THREE.MathUtils.clamp(_camPos.x, -ROOM.w / 2 + 0.25, ROOM.w / 2 - 0.25);
    _camPos.z = THREE.MathUtils.clamp(_camPos.z, -ROOM.d / 2 + 0.25, ROOM.d / 2 - 0.25);
    _camPos.y = THREE.MathUtils.clamp(_camPos.y, 0.35, ROOM.h - 0.2);
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

    if (modelsReady && player.char) {
      updatePlayer(dt);
      updateOther(dt);
      updateCamera(dt);
      sendNet(dt);
    }

    if (fireLight)
      fireLight.intensity = 1.7 + Math.sin(t * 12) * 0.3 + Math.random() * 0.4;

    for (const f of flames) {
      f.scale.y = 0.75 + Math.sin(t * 15 + f.position.x * 3) * 0.25;
      f.material.color.setHSL(0.09, 1, 0.55 + Math.random() * 0.12);
      f.rotation.z = Math.sin(t * 8 + f.position.z) * 0.15;
    }
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

    renderer.render(scene, camera);
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

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.FogExp2(0x070810, 0.055);
    camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 60);
    camera.position.set(0, 1.6, 3);

    buildMaterials();
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
    buildCobwebs();
    buildDust();
    buildLights();
    built = true;
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
    if (el) { el.hidden = false; el.textContent = "Cargando modelos 0/2…"; }
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
  // modo de la siguiente partida: { mode: "solo" | "mp", role: "survivor" | "monster" }
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
      clock = new THREE.Clock();
      build();
      applyQuality();
      canvas.addEventListener("click", onCanvasClick);
      document.addEventListener("pointerlockchange", onLockChange);
      document.addEventListener("mousemove", onMouseMove);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", () => keys.clear());
      bindNet();
    }
    paused = false;
    resize();
    window.addEventListener("resize", resize);
    const ip = $("interact-prompt");
    if (ip) ip.style.display = "none";
    const hint = $("hud-lock");
    if (hint) hint.hidden = locked;

    ensureModels().then(() => {
      if (matchPending) { setupMatch(); matchPending = false; }
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
    matchPending = true;
  }

  return {
    start, stop, pause, resume, end, configure, applyQuality,
    get mode() { return config.mode; },
    // acceso para depurar desde la consola: Scene3D.debug.player.pos, etc.
    get debug() { return { player, other, cam, camera, scene }; },
  };
})();

window.Scene3D = Scene3D;
window.GameCanvas = Scene3D; // compatibilidad con js/app.js
