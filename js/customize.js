/* =========================================================
   PENUMBRA — Pantalla "Personalizar"
   - Arma los grupos de opciones a partir de Rules.LOOK.
   - Vista previa 3D con Three.js: el mismo personaje del juego
     (js/characters.js) girando en un pedestal, con su linterna
     encendida para ver el color de la luz. Se arrastra para girar.
   - Cada clic guarda al momento con Look.set() (LocalStorage y,
     con sesión, la cuenta del jugador en MySQL).
   El render solo corre mientras la pantalla está abierta.
   Expone window.Customize = { open, close } para js/app.js.
   ========================================================= */

import * as THREE from "three";
import { createCharacter, loadModels } from "./characters.js";

const Customize = (() => {
  // grupos que se muestran y a qué personaje pertenecen
  const GROUPS = [
    { key: "survivorColor", role: "survivor" },
    { key: "flashColor", role: "survivor" },
    { key: "monsterType", role: "monster" },
    { key: "monsterSkin", role: "monster" },
    { key: "monsterEyes", role: "monster" },
    { key: "hat", role: null, note: "lo llevan los dos" },
  ];
  const ROLE_LABEL = { survivor: "superviviente", monster: "monstruo" };

  let renderer = null, scene, camera, clock, raf = null, open_ = false;
  let role = "survivor", char = null, flash = null, building = null;
  let yaw = 0.5, dragging = false, lastX = 0, idleSpin = true;
  const $ = (id) => document.getElementById(id);
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");

  /* ---------------- Opciones ---------------- */
  function buildOptions() {
    const box = $("look-options");
    if (!box || box.childElementCount) return;
    for (const g of GROUPS) {
      const def = Rules.LOOK[g.key];
      const sec = document.createElement("section");
      sec.className = "look-group";
      const note = g.role ? ROLE_LABEL[g.role] : g.note;
      sec.innerHTML = `<h3>${def.label} <small>· ${note}</small></h3><div class="look-choices" role="radiogroup" aria-label="${def.label}"></div>`;
      const row = sec.querySelector(".look-choices");
      for (const [id, opt] of Object.entries(def.options)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "look-chip";
        b.dataset.key = g.key;
        b.dataset.val = id;
        b.dataset.role = g.role || "";
        b.setAttribute("role", "radio");
        const swatch = g.key === "hat" || g.key === "monsterType" ? "" : `<i class="${opt.color == null ? "none" : ""}" style="${opt.color == null ? "" : "background:" + hex(opt.color)}"></i>`;
        b.innerHTML = `${swatch}<span>${opt.label}</span>`;
        row.appendChild(b);
      }
      box.appendChild(sec);
    }
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".look-chip");
      if (!b) return;
      if (window.Sound) Sound.click();
      if (b.dataset.role && b.dataset.role !== role) setRole(b.dataset.role);
      Look.set({ [b.dataset.key]: b.dataset.val });
    });
    document.querySelectorAll("[data-look-role]").forEach((t) =>
      t.addEventListener("click", () => { if (window.Sound) Sound.click(); setRole(t.dataset.lookRole); }));
    syncOptions(Look.get());
  }

  function syncOptions(look) {
    document.querySelectorAll(".look-chip").forEach((b) => {
      const on = look[b.dataset.key] === b.dataset.val;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  /* ---------------- Vista previa 3D ---------------- */
  function initRenderer() {
    if (renderer) return;
    const canvas = $("look-canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060608);
    scene.fog = new THREE.Fog(0x060608, 6, 14);
    camera = new THREE.PerspectiveCamera(32, 4 / 5, 0.1, 40);
    clock = new THREE.Clock();

    // pedestal y piso
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x17161a, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7 }));
    disc.position.y = 0.03;
    disc.receiveShadow = true;
    scene.add(disc);

    // luces: ambiental tenue + luz principal fría + contraluz rojo
    scene.add(new THREE.AmbientLight(0x6a7090, 0.9));
    scene.add(new THREE.HemisphereLight(0x8090c0, 0x1a1410, 0.7));
    const key = new THREE.DirectionalLight(0xcfd8ff, 1.6);
    key.position.set(2.2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 });
    scene.add(key);
    const rim = new THREE.PointLight(0xc23a2c, 1.4, 6, 2);
    rim.position.set(-1.5, 2.4, -1.6);
    scene.add(rim);

    // arrastrar para girar
    canvas.addEventListener("pointerdown", (e) => { dragging = true; idleSpin = false; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => { if (!dragging) return; yaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; });
    const up = () => { dragging = false; };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    // doble clic: de frente y quieto
    canvas.addEventListener("dblclick", () => { yaw = 0; idleSpin = false; });
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!renderer) return;
    const c = renderer.domElement;
    const w = c.clientWidth || 300, h = c.clientHeight || 375;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frameCamera() {
    // el monstruo mide ~2.2 m y el superviviente 1.7 m
    const tall = role === "monster" ? 2.25 : 1.75;
    // con espacio arriba para el sombrero de copa o los cuernos
    camera.position.set(0, tall * 0.66, tall * 2.75);
    camera.lookAt(0, tall * 0.58, 0);
  }

  async function showRole() {
    const want = role;
    const look = Look.get();
    if (char) { char.dispose(); char = null; flash = null; }
    try {
      await (building ||= loadModels());
    } catch (e) {
      setStatus(`No se pudieron cargar los modelos (${e.message}).`, "err");
      return;
    }
    if (want !== role || !open_) return;      // cambió de opinión mientras cargaba
    char = createCharacter(role, look);
    char.root.position.y = 0.06;
    scene.add(char.root);
    if (role === "survivor") {
      // misma linterna que en el juego (scene3d.js → makeFlashlight)
      flash = new THREE.SpotLight(0xfff1d6, 9, 12, 0.42, 0.45, 1.6);
      flash.position.set(0.18, 1.35, 0.25);
      flash.target.position.set(0.1, 0.4, 4);
      char.root.add(flash, flash.target);
    }
    applyLook(look);
    frameCamera();
  }

  function applyLook(look) {
    syncOptions(look);
    if (!char) return;
    char.setLook(look);
    if (flash) flash.color.setHex(Rules.lookColor(look, "flashColor") ?? 0xfff1d6);
  }

  function setRole(r) {
    if (r === role && char) return;
    role = r;
    document.querySelectorAll("[data-look-role]").forEach((t) => t.classList.toggle("selected", t.dataset.lookRole === r));
    if (renderer) showRole();
  }

  function loop() {
    if (!open_) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (idleSpin && !dragging) yaw += dt * 0.35;
    if (char) {
      char.root.rotation.y = yaw;
      char.setMotion(0);
      char.update(dt);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  /* ---------------- Estado ---------------- */
  function setStatus(text, kind = "") {
    const el = $("look-status");
    if (!el) return;
    el.textContent = text;
    el.className = "micro" + (kind ? " " + kind : "");
  }

  /* ---------------- API para app.js ---------------- */
  function open() {
    buildOptions();
    initRenderer();
    if (open_) return;
    open_ = true;
    idleSpin = true;
    resize();
    showRole();
    clock.start();
    loop();
  }
  function close() {
    if (!open_) return;
    open_ = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  Look.onChange(applyLook);
  Look.onStatus((s) => setStatus(s.msg, s.state === "saved" ? "ok" : s.state === "error" ? "err" : ""));

  return { open, close };
})();

window.Customize = Customize;
