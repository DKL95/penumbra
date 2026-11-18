/* =========================================================
   PENUMBRA — Servidor del juego
   - Sirve los archivos estáticos del juego por HTTP.
   - Multijugador en tiempo real por WebSocket (paquete "ws"):
     salas de 2 a 4 jugadores identificadas por un código de 4
     letras. El anfitrión elige escenario y dificultad; al
     comenzar, el servidor SORTEA los roles: un MONSTRUO al azar
     y el resto SUPERVIVIENTES (mínimo 2 jugadores). El servidor
     reenvía el estado (posición, rotación y animación) y los
     eventos de la partida (ítems, golpes, fin) al otro jugador.
   - Servicio web: las peticiones /api/* se reenvían al servicio
     PHP (carpeta api/, MySQL). Si hay PHP instalado (XAMPP o en
     el PATH) este servidor lo arranca solo con `php -S`; si se
     prefiere Apache, se define PHP_URL (p. ej.
     PHP_URL=http://localhost/penumbra/api).

   Uso:  npm install   (solo la primera vez)
         npm start     → http://localhost:8777
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const { randomInt } = require("crypto");
const { WebSocketServer } = require("ws");
const Rules = require("./js/rules.js");

const PORT = +process.env.PORT || 8777;
const ROOT = __dirname;
const SCENARIOS = ["mansion", "hospital", "forest"];
const DIFFICULTIES = ["normal", "dark", "blackout"];

/* ---------------- Servicio web PHP (api/) ---------------- */
const PHP_PORT = +process.env.PHP_PORT || PORT + 1;
let phpTarget = null;        // URL base a la que se reenvía /api
let phpProc = null;

function findPhp() {
  const candidates = [process.env.PHP_BIN, "php", "C:\\xampp\\php\\php.exe", "/opt/lampp/bin/php", "/usr/bin/php"]
    .filter(Boolean);
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ["-v"], { timeout: 4000 });
      if (r.status === 0) return c;
    } catch { /* siguiente */ }
  }
  return null;
}

function startPhp() {
  if (process.env.PHP_URL) {
    phpTarget = new URL(process.env.PHP_URL.replace(/\/?$/, "/"));
    return `PHP externo: ${phpTarget.href}`;
  }
  if (process.env.NO_PHP === "1") return "servicio PHP desactivado (NO_PHP=1)";
  const bin = findPhp();
  if (!bin) return "PHP no encontrado: los puntajes solo se guardarán en este equipo";
  phpProc = spawn(bin, ["-S", `127.0.0.1:${PHP_PORT}`, "-t", path.join(ROOT, "api")], {
    cwd: path.join(ROOT, "api"), env: process.env, stdio: ["ignore", "ignore", "pipe"],
  });
  phpProc.stderr.on("data", (d) => {
    // php -S escribe cada petición en stderr; solo mostramos errores de PHP
    for (const line of String(d).split(/\r?\n/))
      if (/PHP (Fatal|Warning|Parse|Notice)|Failed to listen/i.test(line)) log("[php]", line.trim());
  });
  phpProc.on("exit", (code) => { if (code) log(`[php] terminó con código ${code}`); phpProc = null; phpTarget = null; });
  phpTarget = new URL(`http://127.0.0.1:${PHP_PORT}/`);
  return `PHP ${bin} → http://127.0.0.1:${PHP_PORT}`;
}

function proxyApi(req, res) {
  const sendErr = (code, msg) => {
    if (res.headersSent) return res.end();
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: msg }));
  };
  if (!phpTarget) return sendErr(503, "El servicio web (PHP) no está disponible.");
  const rest = req.url.replace(/^\/api\/?/, "");
  const target = new URL(rest, phpTarget);
  const headers = { ...req.headers, host: target.host };
  const p = http.request({
    protocol: target.protocol, hostname: target.hostname, port: target.port,
    method: req.method, path: target.pathname + target.search, headers,
  }, (pr) => {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res);
  });
  p.on("error", () => sendErr(502, "No se pudo contactar al servicio web (PHP)."));
  req.pipe(p);
}

function stopPhp() {
  if (phpProc) { phpProc.kill(); phpProc = null; }
}
process.on("exit", stopPhp);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopPhp(); process.exit(0); });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".ico": "image/x-icon",
};

/* ---------------- HTTP: archivos estáticos + /api ---------------- */
const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split("?")[0]); } catch { res.writeHead(400); return res.end(); }
  if (urlPath === "/api" || urlPath.startsWith("/api/")) return proxyApi(req, res);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));

  // no salir de la carpeta del proyecto ni exponer node_modules, archivos ocultos (.git) o pruebas
  const rel = path.relative(ROOT, file);
  if (!file.startsWith(ROOT) || rel.split(path.sep).some((p) => p.startsWith(".") || p === "node_modules" || p === "test")) {
    res.writeHead(403); return res.end("Prohibido");
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("No encontrado"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

/* ---------------- WebSocket: salas ---------------- */
const wss = new WebSocketServer({ server });
const rooms = new Map();          // code -> { players: Map<id, ws>, settings, host, started }
const MAX_PLAYERS = 4;            // 1 monstruo + hasta 3 supervivientes
let nextId = 1;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

// escenario y dificultad de la sala (los elige el anfitrión)
function roomSettings(s) {
  s = s || {};
  return {
    scenario: SCENARIOS.includes(s.scenario) ? s.scenario : "mansion",
    difficulty: DIFFICULTIES.includes(s.difficulty) ? s.difficulty : "normal",
  };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg, exceptId) {
  for (const [id, ws] of room.players) if (id !== exceptId) send(ws, msg);
}

function leaveRoom(ws) {
  const room = rooms.get(ws.room);
  if (!room) return;
  room.players.delete(ws.id);
  broadcast(room, { t: "peer-leave", id: ws.id, role: ws.role });
  if (room.players.size === 0) rooms.delete(ws.room);
  else if (room.host === ws.id) {
    // el anfitrión se fue: la sala pasa al jugador más antiguo
    room.host = room.players.keys().next().value;
    broadcast(room, { t: "host", id: room.host });
  }
  log(`[${ws.room}] sale jugador ${ws.id} (${ws.role}) · quedan ${room.players.size}`);
  ws.room = null;
}

wss.on("connection", (ws, req) => {
  ws.id = nextId++;
  ws.room = null;
  ws.role = null;
  ws.name = "Jugador " + ws.id;
  ws.look = Rules.defaultLook();
  log(`conexión ${ws.id} desde ${req.socket.remoteAddress}`);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {
      case "create": {
        if (ws.room) leaveRoom(ws);
        const code = newCode();
        const settings = roomSettings(msg.settings);
        rooms.set(code, { players: new Map([[ws.id, ws]]), settings, host: ws.id, started: false });
        ws.room = code;
        ws.role = null;                 // los roles se sortean al comenzar
        ws.name = String(msg.name || ws.name).slice(0, 16);
        ws.look = Rules.sanitizeLook(msg.look);   // apariencia personalizada (solo ids válidos)
        send(ws, { t: "created", code, id: ws.id, role: ws.role, settings, host: ws.id });
        log(`[${code}] sala creada por ${ws.id}`);
        break;
      }
      case "join": {
        const code = String(msg.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { t: "error", msg: `No existe la partida ${code}.` });
        if (ws.room === code) return send(ws, { t: "error", msg: "Ya estás en esta partida." });
        if (room.started) return send(ws, { t: "error", msg: `La partida ${code} ya empezó.` });
        if (room.players.size >= MAX_PLAYERS) return send(ws, { t: "error", msg: "La partida ya está llena." });
        if (ws.room) leaveRoom(ws);

        ws.role = null;                 // los roles se sortean al comenzar
        ws.room = code;
        ws.name = String(msg.name || ws.name).slice(0, 16);
        ws.look = Rules.sanitizeLook(msg.look);
        room.players.set(ws.id, ws);

        const peers = [...room.players.values()]
          .filter((p) => p.id !== ws.id)
          .map((p) => ({ id: p.id, role: p.role, name: p.name, look: p.look }));
        send(ws, { t: "joined", code, id: ws.id, role: ws.role, peers, settings: room.settings, host: room.host });
        broadcast(room, { t: "peer-join", id: ws.id, role: ws.role, name: ws.name, look: ws.look }, ws.id);
        log(`[${code}] entra ${ws.id} · ${room.players.size} en la sala`);
        break;
      }
      case "start": {
        // solo el anfitrión y con al menos 2 jugadores (1 monstruo + 1 superviviente)
        const room = rooms.get(ws.room);
        if (!room || room.started) return;
        if (room.host !== ws.id) return send(ws, { t: "error", msg: "Solo el anfitrión puede comenzar." });
        if (room.players.size < 2)
          return send(ws, { t: "error", msg: "Hacen falta al menos 2 jugadores: un monstruo y un superviviente." });
        // sorteo: uno al azar es el monstruo, los demás supervivientes
        const list = [...room.players.values()];
        const monster = randomInt(list.length);
        list.forEach((p, i) => { p.role = i === monster ? "monster" : "survivor"; });
        room.started = true;
        const players = [...room.players.values()].map((p) => ({ id: p.id, role: p.role, name: p.name, look: p.look }));
        broadcast(room, { t: "start", players });
        log(`[${ws.room}] comienza con ${players.length} jugadores · monstruo: ${list[monster].id}`);
        break;
      }
      case "state": {
        // posición / rotación / animación → al otro jugador
        const room = rooms.get(ws.room);
        if (!room) return;
        broadcast(room, { t: "state", id: ws.id, p: msg.p, r: msg.r, a: msg.a }, ws.id);
        break;
      }
      case "event": {
        // eventos sueltos (p. ej. abrir la puerta, gruñido del monstruo)
        const room = rooms.get(ws.room);
        if (!room) return;
        broadcast(room, { t: "event", id: ws.id, e: msg.e, d: msg.d }, ws.id);
        break;
      }
      case "leave":
        leaveRoom(ws);
        break;
      case "ping":
        send(ws, { t: "pong", ts: msg.ts });
        break;
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
    log(`desconexión ${ws.id}`);
  });
});

function log(...a) {
  console.log(new Date().toLocaleTimeString(), ...a);
}

server.listen(PORT, "0.0.0.0", () => {
  const phpInfo = startPhp();
  console.log("\n  PENUMBRA — servidor listo");
  console.log(`  Servicio web:  ${phpInfo}`);
  console.log(`  Este equipo:   http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces()))
    for (const n of nets || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(`  Red local:     http://${n.address}:${PORT}`);
  console.log("\n  Ctrl+C para detener.\n");
});
