/* =========================================================
   PENUMBRA — Servidor del juego (2º avance)
   - Sirve los archivos estáticos del juego por HTTP.
   - Multijugador en tiempo real por WebSocket (paquete "ws"):
     salas de 2 jugadores identificadas por un código de 4
     letras. El anfitrión es el SUPERVIVIENTE y quien se une
     es el MONSTRUO. El servidor reenvía el estado (posición,
     rotación y animación) de cada jugador al otro.

   Uso:  npm install   (solo la primera vez)
         npm start     → http://localhost:8777
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8777;
const ROOT = __dirname;

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

/* ---------------- HTTP: archivos estáticos ---------------- */
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));

  // no salir de la carpeta del proyecto ni exponer node_modules
  if (!file.startsWith(ROOT) || file.includes("node_modules")) {
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
const rooms = new Map();          // code -> { players: Map<id, ws> }
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
  log(`[${ws.room}] sale jugador ${ws.id} (${ws.role}) · quedan ${room.players.size}`);
  ws.room = null;
}

wss.on("connection", (ws, req) => {
  ws.id = nextId++;
  ws.room = null;
  ws.role = null;
  ws.name = "Jugador " + ws.id;
  log(`conexión ${ws.id} desde ${req.socket.remoteAddress}`);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {
      case "create": {
        if (ws.room) leaveRoom(ws);
        const code = newCode();
        rooms.set(code, { players: new Map([[ws.id, ws]]) });
        ws.room = code;
        ws.role = "survivor";
        ws.name = String(msg.name || ws.name).slice(0, 16);
        send(ws, { t: "created", code, id: ws.id, role: ws.role });
        log(`[${code}] sala creada por ${ws.id}`);
        break;
      }
      case "join": {
        const code = String(msg.code || "").toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { t: "error", msg: `No existe la partida ${code}.` });
        if (ws.room === code) return send(ws, { t: "error", msg: "Ya estás en esta partida." });
        if (room.players.size >= 2) return send(ws, { t: "error", msg: "La partida ya está llena." });
        if (ws.room) leaveRoom(ws);

        // el rol libre: normalmente "monster"
        const taken = [...room.players.values()].map((p) => p.role);
        ws.role = taken.includes("survivor") ? "monster" : "survivor";
        ws.room = code;
        ws.name = String(msg.name || ws.name).slice(0, 16);
        room.players.set(ws.id, ws);

        const peers = [...room.players.values()]
          .filter((p) => p.id !== ws.id)
          .map((p) => ({ id: p.id, role: p.role, name: p.name }));
        send(ws, { t: "joined", code, id: ws.id, role: ws.role, peers });
        broadcast(room, { t: "peer-join", id: ws.id, role: ws.role, name: ws.name }, ws.id);
        log(`[${code}] entra ${ws.id} como ${ws.role}`);
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
  console.log("\n  PENUMBRA — servidor listo");
  console.log(`  Este equipo:   http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces()))
    for (const n of nets || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(`  Red local:     http://${n.address}:${PORT}`);
  console.log("\n  Ctrl+C para detener.\n");
});
