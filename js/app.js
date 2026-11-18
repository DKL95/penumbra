/* =========================================================
   PENUMBRA — Controlador de interfaz
   Navegación entre pantallas, elección de modo / escenario /
   dificultad, menú de pausa, salas de multijugador (js/net.js),
   pantalla de resultado, puntajes y sesión (js/api.js →
   servicio web PHP + MySQL, Facebook Login) y compartir.
   ========================================================= */

(() => {
  const pauseOverlay = document.getElementById("overlay-pause");
  const quitOverlay = document.getElementById("overlay-quit");
  const resultOverlay = document.getElementById("overlay-result");
  const $ = (id) => document.getElementById(id);

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
        return GameCanvas[action](arg);
      }
      console.warn(
        "[PENUMBRA] Escenario 3D no disponible: sirve el proyecto con " +
        "npm start (ver README), no lo abras con doble clic."
      );
    } catch (err) {
      console.error("[PENUMBRA] Error en el escenario 3D:", err);
    }
  }

  /* ---------------- Navegación ---------------- */
  function showScreen(id, { push = true } = {}) {
    const next = $(id);
    if (!next || id === currentId) return;

    if (push) history.push(currentId);

    $(currentId)?.classList.remove("active");
    next.classList.add("active");
    currentId = id;

    const inGame = id === "screen-game";
    document.body.classList.toggle("in-game", inGame);

    if (inGame) {
      Sound.stopAmbient();
      safeCanvas("start");
      if (window.Touch) Touch.enterGame();     // controles táctiles + pantalla completa
    } else {
      if (window.Touch) Touch.leaveGame();
      safeCanvas("stop");
      if (id === "screen-menu") Sound.startAmbient();
    }

    if (id === "screen-customize") window.Customize?.open();
    else window.Customize?.close();
    if (id === "screen-scores") { renderAccount(); loadScores(); }
    if (id === "screen-settings") fillSettingsForm();
    if (id === "screen-play") fillPlayScreen();
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
      paused = false;            // openPause() vuelve a pausar el escenario al regresar
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
    if (currentId !== "screen-game" || paused || !resultOverlay.hidden) return;
    if (window.GameCanvas && GameCanvas.over) return;
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
    resultOverlay.hidden = true;
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
    if (!resultOverlay.hidden) return;
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

  /* ---------------- Jugar: modo, escenario y dificultad ---------------- */
  const play = { game: "escape", scenario: "mansion", difficulty: "normal" };

  function fillPlayScreen() {
    play.difficulty = Settings.get().difficulty;
    syncPicks();
  }
  function syncPicks() {
    document.querySelectorAll("#pick-mode .pick").forEach((b) => b.classList.toggle("selected", b.dataset.mode === play.game));
    document.querySelectorAll("#pick-difficulty .pick").forEach((b) => b.classList.toggle("selected", b.dataset.difficulty === play.difficulty));
    const scen = $("pick-scenario");
    const escape = play.game === "escape";
    scen.classList.toggle("all", escape);
    scen.querySelectorAll(".pick").forEach((b) => b.classList.toggle("selected", escape || b.dataset.scenario === play.scenario));
    $("pick-scenario-note").textContent = escape ? "(Escape recorre los tres en orden)" : "(elige uno)";
  }
  function startGame() {
    Sound.confirm();
    Settings.save({ difficulty: play.difficulty });
    safeCanvas("configure", { mode: "solo", game: play.game, scenario: play.scenario, role: "survivor", difficulty: play.difficulty });
    history = ["screen-menu"];
    showScreen("screen-game", { push: false });
  }

  /* ---------------- Multijugador (WebSocket, js/net.js) ---------------- */
  const hostStatus = $("mp-host-status");
  const joinStatus = $("mp-join-status");
  const codeBox = $("mp-code");

  function setStatus(el, html, kind = "") {
    el.innerHTML = html;
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  }
  function resetMultiplayerScreen() {
    codeBox.textContent = "— — — —";
    setStatus(hostStatus, "Serás <b>superviviente</b>. El primero en unirse es el monstruo; hasta 2 más entran como supervivientes.");
    setStatus(joinStatus, "Si la sala aún no tiene monstruo, lo serás tú; si ya lo tiene, entras como <b>superviviente</b>.");
    $("mp-scenario").disabled = $("mp-difficulty").disabled = false;
    $("mp-lobby").hidden = true;
  }

  // sala de espera: lista de jugadores y botón de comenzar (solo el anfitrión)
  const MAX_MP = 4;
  function renderLobby() {
    const i = Net.info;
    if (!i.code) { $("mp-lobby").hidden = true; return; }
    if ($("mp-lobby").hidden) {
      $("mp-lobby").hidden = false;
      $("mp-lobby").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    $("mp-lobby-code").textContent = i.code;
    $("mp-lobby-info").textContent = settingsLabel(i.settings);
    const all = [{ id: i.id, role: i.role, name: playerName() || "Tú" }].concat(i.peers)
      .sort((a, b) => (a.role === "monster") - (b.role === "monster") || a.id - b.id);
    const rows = all.map((p) => {
      const tag = p.role === "monster" ? '<span class="tag tag-monster">Monstruo</span>' : '<span class="tag tag-survivor">Superviviente</span>';
      const marks = [p.id === i.id ? "tú" : "", p.id === i.host ? "anfitrión" : ""].filter(Boolean).join(" · ");
      return `<li class="${p.id === i.id ? "me" : ""}">${tag}<span class="who">${esc(p.name || "Jugador")}</span><span class="badge">${marks}</span></li>`;
    });
    for (let k = all.length; k < MAX_MP; k++) {
      const hasMonster = all.some((p) => p.role === "monster");
      rows.push(`<li class="empty">${!hasMonster && k === all.length ? "Esperando al monstruo…" : "Lugar libre para un superviviente"}</li>`);
    }
    $("mp-players").innerHTML = rows.join("");
    const ready = all.some((p) => p.role === "monster") && all.some((p) => p.role === "survivor");
    const host = Net.isHost;
    $("mp-start").hidden = !host;
    $("mp-start").disabled = !ready;
    setStatus($("mp-lobby-status"), host
      ? (ready ? `Listos ${all.length} de ${MAX_MP}. Comienza cuando quieras (pueden entrar más hasta que comience).`
               : "Comparte el código. Hace falta que entre el monstruo para comenzar.")
      : "Esperando a que el anfitrión comience la partida…", ready || !host ? "ok" : "");
  }
  function startMultiplayer() {
    if (!Net.isHost) return;
    Sound.confirm();
    Net.start();
  }
  const settingsLabel = (s) => s
    ? `${Rules.SCENARIOS[s.scenario].label} · ${Rules.difficulty(s.difficulty).label}` : "";

  function enterMultiplayerGame(role) {
    const s = Net.info.settings || { scenario: "mansion", difficulty: "normal" };
    safeCanvas("configure", { mode: "mp", game: "versus", role, scenario: s.scenario, difficulty: s.difficulty });
    history = ["screen-menu"];
    showScreen("screen-game");
  }

  function playerName() {
    if (Api.user) return Api.user.name;
    try { return localStorage.getItem("penumbra.lastName") || undefined; } catch { return undefined; }
  }

  async function generateCode() {
    Sound.confirm();
    setStatus(hostStatus, "Conectando con el servidor…");
    try {
      await Net.create(playerName(), { scenario: $("mp-scenario").value, difficulty: $("mp-difficulty").value }, Look.get());
    } catch (err) {
      Sound.error();
      setStatus(hostStatus, err.message, "err");
    }
  }
  async function joinGame() {
    const input = $("mp-join");
    const val = input.value.trim().toUpperCase();
    if (val.length !== 4) {
      Sound.error();
      input.focus();
      return;
    }
    Sound.confirm();
    setStatus(joinStatus, `Conectando a la partida <b>${val}</b>…`);
    try {
      await Net.join(val, playerName(), Look.get());
    } catch (err) {
      Sound.error();
      setStatus(joinStatus, err.message, "err");
    }
  }

  Net.on("created", (m) => {
    codeBox.textContent = m.code.split("").join(" ");
    $("mp-scenario").disabled = $("mp-difficulty").disabled = true;
    setStatus(hostStatus, `Sala creada (${settingsLabel(m.settings)}). Comparte el código.`, "ok");
    renderLobby();
  });
  Net.on("peer-join", (m) => {
    if (currentId !== "screen-multiplayer") return;   // ya en juego: lo maneja la escena
    Sound.confirm();
    renderLobby();
  });
  Net.on("peer-leave", () => { if (currentId === "screen-multiplayer") renderLobby(); });
  Net.on("host", () => { if (currentId === "screen-multiplayer") renderLobby(); });
  Net.on("joined", (m) => {
    const role = m.role === "monster" ? "el <b>monstruo</b>" : "<b>superviviente</b>";
    setStatus(joinStatus, `Dentro de la sala <b>${m.code}</b>: eres ${role}.`, "ok");
    renderLobby();
  });
  Net.on("start", () => {
    if (currentId !== "screen-multiplayer") return;
    Sound.confirm();
    setTimeout(() => enterMultiplayerGame(Net.info.role), 400);
  });
  Net.on("error", (m) => {
    Sound.error();
    setStatus(Net.inRoom ? $("mp-lobby-status") : joinStatus, m.msg, "err");
  });
  Net.on("close", () => {
    if (currentId === "screen-multiplayer") {
      resetMultiplayerScreen();
      setStatus(hostStatus, "Se perdió la conexión con el servidor.", "err");
    }
  });

  /* ---------------- Resultado de la partida ---------------- */
  let lastResult = null;
  const TITLES = {
    escaped: ["Escapaste", "Saliste con vida… por ahora."],
    caught: ["Te atraparon", "La penumbra te reclamó."],
    won: ["Cacería completa", "No volverán a ver la luz."],
    lost: ["Se te escaparon", "Encontraron la salida."],
    abandon: ["Partida terminada", "Los demás jugadores abandonaron la partida."],
  };

  window.addEventListener("penumbra:result", (e) => {
    const s = e.detail;
    lastResult = s;
    const [title, sub] = TITLES[s.result] || TITLES.abandon;
    $("result-title").textContent = title;
    $("result-sub").textContent = s.mode === "survival"
      ? `Juntaste ${s.relics} ${s.relics === 1 ? "reliquia" : "reliquias"} en ${Rules.formatTime(s.seconds)}.`
      : s.detail ? `${s.detail} ${sub}` : sub;
    $("result-title").className = s.won ? "win" : "lose";
    $("result-points").textContent = s.points.toLocaleString("es-MX");
    const rows = [
      ["Modo", Rules.MODES[s.mode].label],
      ["Escenario", s.scenario !== "campaign" ? s.scenarioLabel
        : s.won && s.levels >= Rules.CAMPAIGN.length ? "Campaña completa · los 3 escenarios"
        : `Campaña · llegaste a ${s.reached}`],
      ["Dificultad", Rules.difficulty(s.difficulty).label],
      ["Tiempo", Rules.formatTime(s.seconds)],
      ["Reliquias", String(s.relics)],
    ];
    if (s.mode === "escape" && s.role === "survivor") rows.push(["Escenarios superados", `${s.levels}/${s.levelsPlayed}`]);
    $("result-stats").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    $("btn-play-again").textContent = s.mode === "versus" ? "Otra sala" : "Jugar de nuevo";
    paused = false;
    pauseOverlay.hidden = true;
    resultOverlay.hidden = false;
    if (s.mode === "versus" && window.Net) Net.leave();
    prepareSave();
  });

  function prepareSave() {
    const s = lastResult;
    const status = $("result-status");
    status.className = "micro";
    $("result-login").hidden = true;
    if (!s || s.result === "abandon" || s.points <= 0) {
      status.textContent = s && s.result === "abandon" ? "Sin puntaje: la partida no terminó." : "Sin puntos esta vez.";
      return;
    }
    if (Api.user) return saveScore();
    $("result-login").hidden = false;
    $("result-name").value = localStorage.getItem("penumbra.lastName") || "";
    status.textContent = "Escribe tu nombre para entrar a la tabla global (o inicia sesión con Facebook en Puntajes).";
  }

  async function saveScore() {
    const s = lastResult;
    const status = $("result-status");
    if (!s) return;
    try {
      if (!Api.user) {
        const name = $("result-name").value.trim();
        if (name.length < 2) { Sound.error(); status.textContent = "El nombre debe tener al menos 2 letras."; return; }
        try { localStorage.setItem("penumbra.lastName", name); } catch { /* sin almacenamiento */ }
        status.textContent = "Guardando…";
        await Api.loginGuest(name);
      }
      status.textContent = "Guardando…";
      const r = await Api.submit(s);
      $("result-login").hidden = true;
      status.textContent = `Guardado en la tabla global como ${Api.user.name}: lugar #${r.rank} en ${Rules.MODES[s.mode].label}` +
        (r.best > r.points ? ` (tu récord: ${r.best.toLocaleString("es-MX")}).` : ". ¡Nuevo récord personal!");
      status.classList.add("ok");
      Sound.confirm();
    } catch (err) {
      if (err.status === 401) {
        // la sesión venció: pedir el nombre otra vez para reintentar
        $("result-login").hidden = false;
        status.textContent = "Tu sesión expiró. Escribe tu nombre para guardar el puntaje.";
      } else {
        status.textContent = `${err.message} El puntaje quedó guardado en este equipo.`;
      }
      status.classList.add("err");
    }
  }

  function shareResult(net) {
    const s = lastResult;
    const url = location.origin + location.pathname;
    const text = s
      ? `${s.won ? "Sobreviví" : "No sobreviví"} en PENUMBRA (${Rules.MODES[s.mode].label}, ${Rules.difficulty(s.difficulty).label}): ${s.points.toLocaleString("es-MX")} puntos. ¿Te atreves?`
      : "Juega PENUMBRA, un escape room de terror.";
    const href = net === "facebook"
      ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&hashtag=${encodeURIComponent("#PENUMBRA")}`
      : `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=PENUMBRA`;
    window.open(href, "share", "width=620,height=520,noopener");
  }

  function playAgain() {
    resultOverlay.hidden = true;
    if (lastResult && lastResult.mode === "versus") {
      safeCanvas("end");
      resetMultiplayerScreen();
      history = ["screen-menu"];
      showScreen("screen-multiplayer", { push: false });
      return;
    }
    safeCanvas("restart");
  }

  /* ---------------- Puntajes (servicio web) ---------------- */
  const scoreFilter = { mode: "escape", difficulty: "" };
  let scoresReq = 0;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function loadScores() {
    const req = ++scoresReq;
    const body = $("scores-body");
    body.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;
    const r = await Api.list({ ...scoreFilter, limit: 10 });
    if (req !== scoresReq) return;
    $("scores-source").textContent = r.source === "remote"
      ? "Tabla global — servicio web PHP + MySQL."
      : `Sin conexión con el servicio web (${r.error}). Mostrando los puntajes de este equipo.`;
    if (!r.scores.length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">Todavía no hay puntajes en este modo. ¡Sé el primero!</td></tr>`;
      return;
    }
    body.innerHTML = r.scores.map((s) => {
      const scen = s.scenario === "campaign" ? "Campaña" : (Rules.SCENARIOS[s.scenario] || {}).label || s.scenario;
      const who = (s.photo ? `<img class="avatar" src="${esc(s.photo)}" alt="" referrerpolicy="no-referrer" />` : "") +
        esc(s.name) + (s.provider === "facebook" ? ' <span class="fb-dot" title="Facebook">f</span>' : "") +
        (s.role === "monster" ? ' <span class="tag tag-monster">monstruo</span>' : "");
      return `<tr><td>${s.rank}</td><td>${who}</td><td>${esc(scen)}</td><td>${esc(Rules.difficulty(s.difficulty).label)}</td>` +
        `<td>${Rules.formatTime(s.seconds)}</td><td>${Number(s.points).toLocaleString("es-MX")}</td></tr>`;
    }).join("");
  }

  /* ---------------- Sesión (invitado / Facebook) ---------------- */
  function renderAccount() {
    const u = Api.user;
    $("login-box").hidden = !!u;
    $("user-box").hidden = !u;
    if (u) {
      $("user-name").textContent = u.name;
      $("user-provider").textContent = u.provider === "facebook" ? "Sesión con Facebook" : "Invitado";
      const img = $("user-photo");
      img.hidden = !u.photo;
      if (u.photo) { img.src = u.photo; img.referrerPolicy = "no-referrer"; }
    }
    $("menu-user").textContent = u ? `Sesión: ${u.name}` : "";
  }
  Api.onChange(renderAccount);

  async function loginFacebook() {
    Sound.confirm();
    const st = $("social-status");
    st.className = "micro";
    st.textContent = "Abriendo Facebook…";
    try {
      const u = await Api.loginFacebook();
      st.textContent = `¡Hola, ${u.name}! Tus puntajes se guardarán en la tabla global.`;
      st.classList.add("ok");
    } catch (err) {
      Sound.error();
      st.textContent = err.message;
      st.classList.add("err");
    }
  }
  async function loginGuest() {
    const st = $("social-status");
    const name = $("guest-name").value.trim();
    st.className = "micro";
    if (name.length < 2) { Sound.error(); st.textContent = "Escribe un nombre de al menos 2 letras."; st.classList.add("err"); return; }
    Sound.confirm();
    try {
      const u = await Api.loginGuest(name);
      try { localStorage.setItem("penumbra.lastName", name); } catch { /* sin almacenamiento */ }
      st.textContent = `Entraste como ${u.name}.`;
      st.classList.add("ok");
    } catch (err) {
      Sound.error();
      st.textContent = err.message;
      st.classList.add("err");
    }
  }
  async function logout() {
    Sound.back();
    await Api.logout();
    $("social-status").textContent = "Sesión cerrada.";
  }

  // borrar la cuenta pide un segundo clic para confirmar (sin diálogos del navegador)
  let deleteArmed = 0;
  async function deleteAccount() {
    const btn = $("btn-delete-account"), st = $("social-status");
    if (Date.now() - deleteArmed > 4000) {
      deleteArmed = Date.now();
      Sound.error();
      btn.textContent = "¿Seguro? Clic otra vez";
      setTimeout(() => { btn.textContent = "Borrar mis datos"; }, 4000);
      return;
    }
    deleteArmed = 0;
    btn.textContent = "Borrar mis datos";
    try {
      await Api.deleteAccount();
      st.className = "micro ok";
      st.textContent = "Tu cuenta y tus puntajes se borraron del servidor.";
      loadScores();
    } catch (err) {
      st.className = "micro err";
      st.textContent = err.message;
    }
  }

  /* ---------------- Configuración ---------------- */
  const form = $("settings-form");

  function fillSettingsForm() {
    const s = Settings.get();
    form.volume.value = s.volume;
    form.music.value = s.music;
    form.difficulty.value = s.difficulty;
    form.quality.value = s.quality;
    form.sensitivity.value = s.sensitivity;
    syncOutputs();
    $("settings-status").textContent = "";
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
    safeCanvas("applyQuality");
    Sound.confirm();
    const st = $("settings-status");
    st.textContent = settingsOpenedFromPause
      ? "Guardado. La dificultad nueva aplica desde la siguiente partida."
      : "Configuración guardada en este equipo.";
    st.classList.add("ok");
    setTimeout(() => st.classList.remove("ok"), 2000);
  }
  function resetSettings() {
    Settings.reset();
    fillSettingsForm();
    Sound.back();
    $("settings-status").textContent = "Valores restablecidos.";
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
    const pick = e.target.closest(".pick");
    if (pick) {
      Sound.click();
      if (pick.dataset.mode) play.game = pick.dataset.mode;
      if (pick.dataset.scenario && play.game !== "escape") play.scenario = pick.dataset.scenario;
      if (pick.dataset.difficulty) play.difficulty = pick.dataset.difficulty;
      syncPicks();
      return;
    }
    const tab = e.target.closest("#scores-tabs .tab");
    if (tab) {
      Sound.click();
      scoreFilter.mode = tab.dataset.mode;
      document.querySelectorAll("#scores-tabs .tab").forEach((t) => t.classList.toggle("selected", t === tab));
      loadScores();
      return;
    }

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
        showScreen(el.dataset.target);
        break;
      case "back": goBack(); break;
      case "start-game": startGame(); break;
      case "resume": Sound.click(); closePause(); break;
      case "exit-to-menu": Sound.click(); exitToMenu(); break;
      case "generate-code": generateCode(); break;
      case "join-game": joinGame(); break;
      case "start-mp": startMultiplayer(); break;
      case "login-facebook": loginFacebook(); break;
      case "login-guest": loginGuest(); break;
      case "logout": logout(); break;
      case "delete-account": deleteAccount(); break;
      case "save-score": saveScore(); break;
      case "share": Sound.click(); shareResult(el.dataset.net); break;
      case "play-again": Sound.confirm(); playAgain(); break;
      case "result-menu": Sound.click(); exitToMenu(); break;
      case "save-settings": saveSettings(); break;
      case "reset-settings": resetSettings(); break;
      case "reset-look": Sound.back(); Look.reset(); break;
      case "quit": askQuit(); break;
      case "cancel-quit": Sound.click(); quitOverlay.hidden = true; break;
      case "confirm-quit": confirmQuit(); break;
    }
  });

  $("scores-difficulty").addEventListener("change", (e) => {
    scoreFilter.difficulty = e.target.value;
    loadScores();
  });
  for (const id of ["guest-name", "result-name"]) {
    $(id).addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      id === "guest-name" ? loginGuest() : saveScore();
    });
  }

  // Sonido de hover en botones
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest(".btn, .pick, .tab")) Sound.hover();
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
  renderAccount();
  Api.refresh();
  // precarga el SDK de Facebook si el servicio tiene App ID configurado
  Api.info().then((i) => { if (i.facebookAppId) Api.loadFacebook(); });
  console.log("[PENUMBRA] Interfaz lista (entrega final).");
})();
