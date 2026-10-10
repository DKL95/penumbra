/* =========================================================
   PENUMBRA — Controlador de interfaz
   Navegación entre pantallas, menú de pausa, overlays,
   salas de multijugador (js/net.js) y puntajes (maqueta).
   ========================================================= */

(() => {
  const screens = {
    menu: document.getElementById("screen-menu"),
    game: document.getElementById("screen-game"),
    multiplayer: document.getElementById("screen-multiplayer"),
    scores: document.getElementById("screen-scores"),
    settings: document.getElementById("screen-settings"),
  };
  const pauseOverlay = document.getElementById("overlay-pause");
  const quitOverlay = document.getElementById("overlay-quit");

  let currentId = "screen-menu";
  let history = [];
  let paused = false;
  let settingsOpenedFromPause = false;

  /* ---------------- Escenario 3D (a prueba de fallos) ----------------
     GameCanvas viene de js/scene3d.js, cargado como <script type="module">.
     Si el proyecto se abre sin servidor HTTP (doble clic al HTML), el
     navegador bloquea ese módulo por CORS y GameCanvas nunca se define.
     Esta función evita que eso rompa la navegación / pausa del resto
     de la interfaz. */
  function safeCanvas(action, arg) {
    try {
      if (window.GameCanvas && typeof GameCanvas[action] === "function") {
        GameCanvas[action](arg);
      } else {
        console.warn(
          "[PENUMBRA] Escenario 3D no disponible: sirve el proyecto con un " +
          "servidor HTTP (ver README), no lo abras con doble clic."
        );
      }
    } catch (err) {
      console.error("[PENUMBRA] Error en el escenario 3D:", err);
    }
  }

  /* ---------------- Navegación ---------------- */
  function showScreen(id, { push = true } = {}) {
    const next = document.getElementById(id);
    if (!next || id === currentId) return;

    if (push) history.push(currentId);

    document.getElementById(currentId)?.classList.remove("active");
    next.classList.add("active");
    currentId = id;

    const inGame = id === "screen-game";
    document.body.classList.toggle("in-game", inGame);

    if (inGame) {
      safeCanvas("start");
      Sound.stopAmbient();
    } else {
      safeCanvas("stop");
      if (id === "screen-menu") Sound.startAmbient();
    }

    if (id === "screen-scores") renderScores();
    if (id === "screen-settings") fillSettingsForm();
  }

  function goBack() {
    Sound.back();
    // salir de la pantalla de multijugador sin jugar = abandonar la sala
    if (currentId === "screen-multiplayer" && Net.inRoom) {
      Net.leave();
      resetMultiplayerScreen();
    }
    // Config abierta desde pausa: volver a la pausa
    if (currentId === "screen-settings" && settingsOpenedFromPause) {
      settingsOpenedFromPause = false;
      showScreen("screen-game", { push: false });
      openPause();
      return;
    }
    const prev = history.pop() || "screen-menu";
    showScreen(prev, { push: false });
  }

  /* ---------------- Pausa ---------------- */
  let pausedAt = 0;
  function openPause() {
    if (currentId !== "screen-game" || paused) return;
    paused = true;
    pausedAt = performance.now();
    pauseOverlay.hidden = false;
    safeCanvas("pause");
  }
  function closePause() {
    paused = false;
    pauseOverlay.hidden = true;
    if (currentId === "screen-game") safeCanvas("resume");
  }
  function exitToMenu() {
    paused = false;
    pauseOverlay.hidden = true;
    safeCanvas("end");
    if (window.Net) Net.leave();
    resetMultiplayerScreen();
    history = [];
    showScreen("screen-menu", { push: false });
  }

  // Con el ratón bloqueado, el navegador usa ESC para soltarlo: eso abre la pausa.
  window.addEventListener("penumbra:unlock", openPause);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (currentId === "screen-game") {
      // el mismo ESC que soltó el ratón no debe cerrar la pausa recién abierta
      if (paused && performance.now() - pausedAt < 400) return;
      paused ? closePause() : openPause();
    } else if (!quitOverlay.hidden) {
      quitOverlay.hidden = true;
    } else if (currentId !== "screen-menu") {
      goBack();
    }
  });

  /* ---------------- Multijugador (WebSocket, js/net.js) ---------------- */
  const hostStatus = document.getElementById("mp-host-status");
  const joinStatus = document.getElementById("mp-join-status");
  const codeBox = document.getElementById("mp-code");

  function setStatus(el, html, kind = "") {
    el.innerHTML = html;
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  }
  function resetMultiplayerScreen() {
    codeBox.textContent = "— — — —";
    setStatus(hostStatus, "Serás el <b>superviviente</b>.");
    setStatus(joinStatus, "Serás el <b>monstruo</b>.");
  }

  function enterMultiplayerGame(role) {
    safeCanvas("configure", { mode: "mp", role });
    history = ["screen-menu"];
    showScreen("screen-game");
  }

  async function generateCode() {
    Sound.confirm();
    setStatus(hostStatus, "Conectando con el servidor…");
    try {
      await Net.create();
    } catch (err) {
      Sound.error();
      setStatus(hostStatus, err.message, "err");
    }
  }
  async function joinGame() {
    const input = document.getElementById("mp-join");
    const val = input.value.trim().toUpperCase();
    if (val.length !== 4) {
      Sound.error();
      input.focus();
      return;
    }
    Sound.confirm();
    setStatus(joinStatus, `Conectando a la partida <b>${val}</b>…`);
    try {
      await Net.join(val);
    } catch (err) {
      Sound.error();
      setStatus(joinStatus, err.message, "err");
    }
  }

  Net.on("created", (m) => {
    codeBox.textContent = m.code.split("").join(" ");
    setStatus(hostStatus, "Sala creada. Esperando a que se una el monstruo…", "ok");
  });
  Net.on("peer-join", (m) => {
    if (currentId !== "screen-multiplayer") return;   // ya en juego: lo maneja la escena
    Sound.confirm();
    setStatus(hostStatus, m.role === "monster" ? "¡El monstruo se unió!" : "¡Se unió un jugador!", "ok");
    setTimeout(() => enterMultiplayerGame(Net.info.role), 700);
  });
  Net.on("joined", (m) => {
    setStatus(joinStatus, `Dentro de la partida <b>${m.code}</b>.`, "ok");
    setTimeout(() => enterMultiplayerGame(m.role), 500);
  });
  Net.on("error", (m) => {
    Sound.error();
    setStatus(joinStatus, m.msg, "err");
  });
  Net.on("close", () => {
    if (currentId === "screen-multiplayer") {
      resetMultiplayerScreen();
      setStatus(hostStatus, "Se perdió la conexión con el servidor.", "err");
    }
  });

  /* ---------------- Puntajes (datos de ejemplo) ---------------- */
  const SAMPLE_SCORES = [
    ["V1LL4Nuev4", "Mansión Ravenwood", "Oscuro", "04:12"],
    ["kr3nz", "Hospital San Judas", "Normal", "05:03"],
    ["la_bruja_07", "Mansión Ravenwood", "Apagón", "06:44"],
    ["DZ", "Bosque de Ceniza", "Oscuro", "07:20"],
    ["invitado", "Hospital San Judas", "Normal", "08:57"],
  ];
  function renderScores() {
    const body = document.getElementById("scores-body");
    body.innerHTML = SAMPLE_SCORES
      .map(([name, scene, diff, time], i) =>
        `<tr><td>${i + 1}</td><td>${name}</td><td>${scene}</td><td>${diff}</td><td>${time}</td></tr>`)
      .join("");
  }

  /* ---------------- Configuración ---------------- */
  const form = document.getElementById("settings-form");

  function fillSettingsForm() {
    const s = Settings.get();
    form.volume.value = s.volume;
    form.music.value = s.music;
    form.difficulty.value = s.difficulty;
    form.quality.value = s.quality;
    form.sensitivity.value = s.sensitivity;
    syncOutputs();
    document.getElementById("settings-status").textContent = "";
  }
  function syncOutputs() {
    form.querySelectorAll("output[data-for]").forEach((o) => {
      const input = form[o.dataset.for];
      if (input) o.textContent = input.value;
    });
  }
  form.addEventListener("input", (e) => {
    syncOutputs();
    // vista previa en vivo del volumen
    if (e.target.name === "volume" || e.target.name === "music") {
      Sound.setVolumes(form.volume.value / 100, form.music.value / 100);
    }
  });
  function saveSettings() {
    Settings.save({
      volume: +form.volume.value,
      music: +form.music.value,
      difficulty: form.difficulty.value,
      quality: form.quality.value,
      sensitivity: +form.sensitivity.value,
    });
    Sound.confirm();
    const st = document.getElementById("settings-status");
    st.textContent = "Configuración guardada en este equipo.";
    st.classList.add("ok");
    setTimeout(() => st.classList.remove("ok"), 2000);
  }
  function resetSettings() {
    Settings.reset();
    fillSettingsForm();
    Sound.back();
    document.getElementById("settings-status").textContent = "Valores restablecidos.";
  }

  /* ---------------- Redes sociales (maqueta) ---------------- */
  function socialLogin(net) {
    Sound.confirm();
    const status = document.getElementById("social-status");
    status.textContent = `Sesión con ${net} pendiente de integrar (servicio web · 3ª entrega).`;
  }

  /* ---------------- Salir ---------------- */
  function askQuit() { Sound.back(); quitOverlay.hidden = false; }
  function confirmQuit() {
    quitOverlay.hidden = true;
    window.open("", "_self");
    window.close();
    // si el navegador no deja cerrar la pestaña:
    document.body.innerHTML =
      '<div style="height:100%;display:flex;align-items:center;justify-content:center;' +
      'font-family:var(--font-title,serif);letter-spacing:.3em;color:#8a1a12;text-transform:uppercase">' +
      'Fin — puedes cerrar la pestaña</div>';
  }

  /* ---------------- Delegación de eventos ---------------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;

    switch (action) {
      case "go":
        if (el.dataset.fromPause) {
          settingsOpenedFromPause = true;
          pauseOverlay.hidden = true;
        }
        Sound.click();
        // "Jugar" desde el menú = partida de un jugador contra el monstruo de la IA
        if (el.dataset.target === "screen-game" && !el.dataset.fromPause)
          safeCanvas("configure", { mode: "solo", role: "survivor" });
        showScreen(el.dataset.target);
        break;
      case "back": goBack(); break;
      case "resume": Sound.click(); closePause(); break;
      case "exit-to-menu": Sound.click(); exitToMenu(); break;
      case "generate-code": generateCode(); break;
      case "join-game": joinGame(); break;
      case "social": socialLogin(el.dataset.net); break;
      case "save-settings": saveSettings(); break;
      case "reset-settings": resetSettings(); break;
      case "quit": askQuit(); break;
      case "cancel-quit": Sound.click(); quitOverlay.hidden = true; break;
      case "confirm-quit": confirmQuit(); break;
    }
  });

  // Sonido de hover en botones
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(".btn")) Sound.hover();
  });

  // El audio necesita un gesto del usuario para arrancar (política del navegador)
  function primeAudio() {
    Sound.init();
    if (currentId === "screen-menu") Sound.startAmbient();
    window.removeEventListener("pointerdown", primeAudio);
    window.removeEventListener("keydown", primeAudio);
  }
  window.addEventListener("pointerdown", primeAudio);
  window.addEventListener("keydown", primeAudio);

  /* ---------------- Arranque ---------------- */
  Settings.load();
  fillSettingsForm();
  console.log("[PENUMBRA] Interfaz lista (2º avance).");
})();
