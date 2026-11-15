/* =========================================================
   PENUMBRA — Controles táctiles (celular / tablet)
   - Mitad izquierda: joystick que aparece donde pones el pulgar.
     Empujarlo hasta el borde = correr.
   - Mitad derecha: deslizar para mirar.
   - Botones: acción (recoger / escapar / atacar), linterna o rugido
     y pausa. Las casillas del inventario se tocan para usar el ítem.
   El modo táctil se activa solo en pantallas táctiles y se apaga en
   cuanto se usa un ratón, así que en la computadora nada cambia.
   js/scene3d.js lee Touch.move cada cuadro y recibe Touch → look/press.
   ========================================================= */

const Touch = (() => {
  const root = document.documentElement;
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  let enabled = false;

  // estado del joystick (lo lee scene3d.js en cada cuadro)
  const move = { x: 0, y: 0, mag: 0, active: false };

  const RUN_AT = 0.9;      // empuje a partir del cual se corre
  const DEAD = 0.12;       // zona muerta del joystick
  let radius = 56;         // radio del joystick en px (se ajusta a la pantalla)

  let ui = null, els = {};
  let joyId = null, joyX = 0, joyY = 0;
  let lookId = null, lookX = 0, lookY = 0;
  let triedFullscreen = false;
  let tutorialShown = false, tutorialTimer = 0;

  const scene = () => window.Scene3D || window.GameCanvas;

  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    root.classList.toggle("touch", on);
    if (!on) resetSticks();
    else if (document.body && document.body.classList.contains("in-game")) { build(); scene()?.refresh?.(); }
    window.dispatchEvent(new CustomEvent("penumbra:inputmode", { detail: { touch: on } }));
  }

  /* ---------------- Construcción de la interfaz ---------------- */
  const ICONS = {
    hand: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13'/><path d='M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.2 16a1.6 1.6 0 0 1 2.4-2.1L8 16'/></svg>",
    claw: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'><path d='M5 20C7 14 8 8 7 3M10 21c1.5-6 2-12 1-18M15 21c1-5 1.5-10 .5-16M19.5 19c.5-4 .5-8-.5-12'/></svg>",
    light: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M9 2h6l-1 6h-4zM10 8h4v13a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z'/><path d='M12 12v2M4 3l2.5 2M20 3l-2.5 2'/></svg>",
    roar: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round'><path d='M3 12h3M7 8l2 2M7 16l2-2M12 6v12M16 4v16M20 8v8'/></svg>",
    pause: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='6' y='5' width='4' height='14' rx='1'/><rect x='14' y='5' width='4' height='14' rx='1'/></svg>",
  };

  function build() {
    const host = document.getElementById("screen-game");
    if (!host || ui) return;
    ui = document.createElement("div");
    ui.className = "touch-ui";
    ui.innerHTML = `
      <div class="tz tz-move" data-zone="move"><span class="tz-label">Moverse</span></div>
      <div class="tz tz-look" data-zone="look"><span class="tz-label">Mirar</span></div>
      <div class="joy" aria-hidden="true"><div class="joy-knob"></div></div>
      <button class="tb tb-pause" type="button" data-press="pause" aria-label="Pausa">${ICONS.pause}</button>
      <button class="tb tb-light" type="button" data-press="KeyF" aria-label="Linterna">${ICONS.light}<span>Linterna</span></button>
      <button class="tb tb-action" type="button" data-press="KeyE" aria-label="Acción">${ICONS.hand}<span>Acción</span></button>`;
    host.appendChild(ui);
    els = {
      joy: ui.querySelector(".joy"),
      knob: ui.querySelector(".joy-knob"),
      move: ui.querySelector(".tz-move"),
      look: ui.querySelector(".tz-look"),
      action: ui.querySelector(".tb-action"),
      light: ui.querySelector(".tb-light"),
    };

    els.move.addEventListener("pointerdown", joyDown);
    els.look.addEventListener("pointerdown", lookDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // botones: responden al tocar (no al soltar) para que se sientan inmediatos
    ui.querySelectorAll("[data-press]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add("down");
        buzz(12);
        firstGesture();
        const code = b.dataset.press;
        if (code === "pause") window.dispatchEvent(new CustomEvent("penumbra:unlock"));
        else scene()?.press?.(code);
      });
      const up = () => b.classList.remove("down");
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("pointerleave", up);
    });

    // inventario: tocar una casilla usa el ítem
    document.querySelectorAll("#inventory .slot").forEach((slot) => {
      slot.addEventListener("pointerdown", (e) => {
        if (!enabled) return;
        e.preventDefault();
        e.stopPropagation();
        slot.classList.add("down");
        setTimeout(() => slot.classList.remove("down"), 160);
        buzz(12);
        const code = { battery: "Digit1", medkit: "Digit2", holywater: "Digit3" }[slot.dataset.item];
        if (code) scene()?.press?.(code);
      });
    });

    // sin menú de mantener presionado ni selección dentro del juego
    host.addEventListener("contextmenu", (e) => { if (enabled) e.preventDefault(); });
    sizeStick();
    window.addEventListener("resize", sizeStick);
  }

  function sizeStick() {
    const s = Math.min(window.innerWidth, window.innerHeight);
    radius = Math.round(Math.max(44, Math.min(70, s * 0.16)));
    if (els.joy) els.joy.style.setProperty("--r", radius + "px");
  }

  /* ---------------- Joystick ---------------- */
  function joyDown(e) {
    if (!enabled || joyId !== null) return;
    e.preventDefault();
    firstGesture();
    joyId = e.pointerId;
    joyX = e.clientX; joyY = e.clientY;
    els.joy.style.left = joyX + "px";
    els.joy.style.top = joyY + "px";
    els.joy.classList.add("on");
    usedZone("move");
    setKnob(0, 0);
  }

  function setKnob(dx, dy) {
    let d = Math.hypot(dx, dy);
    const k = d > radius ? radius / d : 1;
    dx *= k; dy *= k; d = Math.min(d, radius);
    els.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let mag = d / radius;
    mag = mag < DEAD ? 0 : (mag - DEAD) / (1 - DEAD);
    move.mag = mag;
    move.x = d ? (dx / d) * mag : 0;
    move.y = d ? (dy / d) * mag : 0;
    move.active = mag > 0;
    move.run = mag >= RUN_AT;
    els.joy.classList.toggle("run", move.run);
  }

  /* ---------------- Mirar ---------------- */
  function lookDown(e) {
    if (!enabled || lookId !== null) return;
    e.preventDefault();
    firstGesture();
    lookId = e.pointerId;
    lookX = e.clientX; lookY = e.clientY;
    usedZone("look");
  }

  function onMove(e) {
    if (e.pointerId === joyId) {
      e.preventDefault();
      setKnob(e.clientX - joyX, e.clientY - joyY);
    } else if (e.pointerId === lookId) {
      e.preventDefault();
      const dx = e.clientX - lookX, dy = e.clientY - lookY;
      lookX = e.clientX; lookY = e.clientY;
      scene()?.look?.(dx, dy);
    }
  }

  function onUp(e) {
    if (e.pointerId === joyId) {
      joyId = null;
      setKnob(0, 0);
      els.joy.classList.remove("on", "run");
    } else if (e.pointerId === lookId) {
      lookId = null;
    }
  }

  function resetSticks() {
    joyId = lookId = null;
    move.x = move.y = move.mag = 0;
    move.active = move.run = false;
    if (els.joy) { els.joy.classList.remove("on", "run"); setKnob(0, 0); }
  }

  /* ---------------- Pantalla completa y orientación ---------------- */
  function goFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return Promise.resolve();
    return el.requestFullscreen({ navigationUI: "hide" })
      .then(() => screen.orientation && screen.orientation.lock ? screen.orientation.lock("landscape") : null)
      .catch(() => { /* el navegador no lo permite (p. ej. iPhone): se juega igual */ });
  }
  // la primera vez que se toca dentro del juego (si al entrar no se pudo)
  function firstGesture() {
    if (triedFullscreen) return;
    triedFullscreen = true;
    goFullscreen();
  }

  /* ---------------- API para el juego ---------------- */
  // al entrar a la pantalla de juego (desde un toque: ahí sí se permite)
  function enterGame() {
    if (!enabled) return;
    build();
    resetSticks();
    triedFullscreen = true;
    goFullscreen();
  }
  function leaveGame() {
    resetSticks();
    hideTutorial();
    triedFullscreen = false;
    tutorialShown = false;
  }

  // texto del botón de acción según lo que tengas enfrente
  function setAction(verb, ready) {
    if (!els.action) return;
    const span = els.action.querySelector("span");
    const text = verb || (els.action.dataset.role === "monster" ? "Atacar" : "Acción");
    if (span.textContent !== text) span.textContent = text;
    els.action.classList.toggle("ready", !!ready);
  }
  function setRole(role) {
    build();
    if (!els.action) return;
    const surv = role !== "monster";
    els.action.dataset.role = role;
    els.action.innerHTML = (surv ? ICONS.hand : ICONS.claw) + `<span>${surv ? "Acción" : "Atacar"}</span>`;
    els.light.innerHTML = (surv ? ICONS.light : ICONS.roar) + `<span>${surv ? "Linterna" : "Rugir"}</span>`;
    els.light.setAttribute("aria-label", surv ? "Linterna" : "Rugir");
  }
  function setFlash(on) {
    if (els.light) els.light.classList.toggle("lit", !!on);
  }

  // guía de las zonas al empezar las primeras partidas (lo llama scene3d.js)
  function showTutorial() {
    if (!enabled || !ui || tutorialShown) return;
    let seen = 0;
    try { seen = +localStorage.getItem("penumbra.touchTutorial") || 0; } catch (e) { /* sin almacenamiento */ }
    if (seen >= 3) return;
    try { localStorage.setItem("penumbra.touchTutorial", String(seen + 1)); } catch (e) { /* sin almacenamiento */ }
    tutorialShown = true;
    ui.classList.add("tutorial");
    ui.querySelectorAll(".tz").forEach((z) => z.classList.remove("used"));
    clearTimeout(tutorialTimer);
    tutorialTimer = setTimeout(hideTutorial, 12000);
  }
  // cada etiqueta se apaga en cuanto se usa su zona; la guía termina al usar ambas
  function usedZone(zone) {
    if (!ui || !ui.classList.contains("tutorial")) return;
    ui.querySelector(".tz-" + zone).classList.add("used");
    if (ui.querySelectorAll(".tz.used").length >= 2) hideTutorial();
  }
  function hideTutorial() { clearTimeout(tutorialTimer); if (ui) ui.classList.remove("tutorial"); }

  function buzz(ms) {
    if (enabled && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* sin vibración */ } }
  }

  /* ---------------- Detección del tipo de entrada ---------------- */
  // táctil al tocar, ratón al usar el ratón (laptops con pantalla táctil)
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") setEnabled(true);
    else if (e.pointerType === "mouse") setEnabled(false);
  }, true);
  setEnabled(!!coarse);

  // en vertical no se puede jugar bien: se muestra el aviso y se pausa
  const portrait = window.matchMedia && matchMedia("(orientation: portrait)");
  if (portrait) {
    const onOrient = () => {
      resetSticks();
      if (enabled && portrait.matches && document.body.classList.contains("in-game")) {
        window.dispatchEvent(new CustomEvent("penumbra:unlock"));
      }
    };
    portrait.addEventListener ? portrait.addEventListener("change", onOrient) : portrait.addListener(onOrient);
  }

  return {
    get enabled() { return enabled; },
    move, enterGame, leaveGame, setAction, setRole, setFlash, buzz, tutorial: showTutorial,
  };
})();

window.Touch = Touch;
