/* =========================================================
   PENUMBRA — Pruebas del multijugador (server.js)
   Levanta el servidor real en un puerto libre y simula
   jugadores con clientes WebSocket.

   Uso:  npm test
   ========================================================= */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const WebSocket = require("ws");
const Rules = require("../js/rules.js");
const DEFAULT_LOOK = Rules.defaultLook();

let serverProc;
let PORT;
const sockets = [];

/* ---------------- utilidades ---------------- */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// cliente de prueba: guarda los mensajes y permite esperar uno concreto
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.inbox = [];
    ws.waiters = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      const i = ws.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) ws.waiters.splice(i, 1)[0].resolve(msg);
      else ws.inbox.push(msg);
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
    sockets.push(ws);
  });
}

function sendMsg(ws, msg) { ws.send(JSON.stringify(msg)); }

function waitFor(ws, t, ms = 1500) {
  const match = (m) => m.t === t;
  const i = ws.inbox.findIndex(match);
  if (i >= 0) return Promise.resolve(ws.inbox.splice(i, 1)[0]);
  return new Promise((resolve, reject) => {
    const w = { match, resolve };
    ws.waiters.push(w);
    setTimeout(() => {
      const k = ws.waiters.indexOf(w);
      if (k >= 0) { ws.waiters.splice(k, 1); reject(new Error(`timeout esperando "${t}"`)); }
    }, ms);
  });
}

// comprueba que NO llega un mensaje de cierto tipo en "ms"
async function expectNone(ws, t, ms = 300) {
  await new Promise((r) => setTimeout(r, ms));
  assert.equal(ws.inbox.filter((m) => m.t === t).length, 0, `no debía llegar "${t}"`);
}

function close(ws) {
  return new Promise((r) => {
    if (ws.readyState === WebSocket.CLOSED) return r();
    ws.once("close", r);
    ws.close();
  });
}

async function createRoom(name = "Ana") {
  const ws = await connect();
  sendMsg(ws, { t: "create", name });
  const msg = await waitFor(ws, "created");
  return { ws, msg };
}

async function joinRoom(code, name = "Beto") {
  const ws = await connect();
  sendMsg(ws, { t: "join", code, name });
  return { ws, msg: await Promise.race([waitFor(ws, "joined"), waitFor(ws, "error")]) };
}

/* ---------------- arranque del servidor ---------------- */
before(async () => {
  PORT = await freePort();
  serverProc = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PORT), NO_PHP: "1" },   // el servicio PHP se prueba en api.test.js
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("el servidor no arrancó")), 5000);
    serverProc.stdout.on("data", (d) => {
      if (String(d).includes("servidor listo")) { clearTimeout(t); resolve(); }
    });
    serverProc.on("exit", (c) => reject(new Error("el servidor terminó con código " + c)));
  });
});

after(async () => {
  await Promise.all(sockets.map(close));
  serverProc.kill();
});

/* ---------------- HTTP ---------------- */
test("HTTP: sirve index.html y bloquea node_modules", async () => {
  const home = await fetch(`http://localhost:${PORT}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);

  const js = await fetch(`http://localhost:${PORT}/js/net.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);

  const nm = await fetch(`http://localhost:${PORT}/node_modules/ws/package.json`);
  assert.equal(nm.status, 403);

  const missing = await fetch(`http://localhost:${PORT}/no-existe.txt`);
  assert.equal(missing.status, 404);
});

test("HTTP: no expone archivos ocultos (.git) ni las pruebas", async () => {
  assert.equal((await fetch(`http://localhost:${PORT}/.git/config`)).status, 403);
  assert.equal((await fetch(`http://localhost:${PORT}/test/multiplayer.test.js`)).status, 403);
});

test("HTTP: /api sin servicio PHP responde 503 en JSON", async () => {
  const r = await fetch(`http://localhost:${PORT}/api/public.php`);
  assert.equal(r.status, 503);
  const d = await r.json();
  assert.equal(d.ok, false);
});

/* ---------------- creación de salas ---------------- */
test("la sala guarda el escenario y la dificultad del anfitrión y los pasa a quien se une", async () => {
  const ws = await connect();
  sendMsg(ws, { t: "create", name: "Ana", settings: { scenario: "forest", difficulty: "blackout" } });
  const created = await waitFor(ws, "created");
  assert.deepEqual(created.settings, { scenario: "forest", difficulty: "blackout" });
  const { msg } = await joinRoom(created.code);
  assert.equal(msg.t, "joined");
  assert.deepEqual(msg.settings, { scenario: "forest", difficulty: "blackout" });
});

test("configuración de sala inválida o ausente usa mansión / normal", async () => {
  const ws = await connect();
  sendMsg(ws, { t: "create", name: "Ana", settings: { scenario: "luna", difficulty: "imposible" } });
  assert.deepEqual((await waitFor(ws, "created")).settings, { scenario: "mansion", difficulty: "normal" });
  const { msg } = await createRoom();
  assert.deepEqual(msg.settings, { scenario: "mansion", difficulty: "normal" });
});

test("event: los eventos de partida (recoger, golpe, agua bendita, fin) llegan al otro", async () => {
  const { ws: host, msg } = await createRoom();
  const { ws: guest } = await joinRoom(msg.code);
  await waitFor(host, "peer-join");
  sendMsg(host, { t: "event", e: "pick", d: { id: "mansion-0", relics: 1 } });
  const pick = await waitFor(guest, "event");
  assert.equal(pick.e, "pick");
  assert.deepEqual(pick.d, { id: "mansion-0", relics: 1 });
  sendMsg(guest, { t: "event", e: "hit", d: { x: 1, z: 2 } });
  const hit = await waitFor(host, "event");
  assert.equal(hit.e, "hit");
  sendMsg(host, { t: "event", e: "end", d: { result: "escaped" } });
  assert.equal((await waitFor(guest, "event")).d.result, "escaped");
});

test("crear sala: código de 4 letras y rol por sortear", async () => {
  const { msg } = await createRoom();
  assert.match(msg.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(msg.role, null);
  assert.equal(typeof msg.id, "number");
});

test("cada sala recibe un código distinto", async () => {
  const codes = new Set();
  for (let i = 0; i < 20; i++) codes.add((await createRoom()).msg.code);
  assert.equal(codes.size, 20);
});

/* ---------------- unirse ---------------- */
test("unirse: en la sala de espera nadie tiene rol y ambos se ven", async () => {
  const host = await createRoom("Ana");
  const guest = await joinRoom(host.msg.code, "Beto");

  assert.equal(guest.msg.t, "joined");
  assert.equal(guest.msg.role, null);
  assert.equal(guest.msg.code, host.msg.code);
  assert.deepEqual(guest.msg.peers, [{ id: host.msg.id, role: null, name: "Ana", look: DEFAULT_LOOK }]);

  const pj = await waitFor(host.ws, "peer-join");
  assert.deepEqual(pj, { t: "peer-join", id: guest.msg.id, role: null, name: "Beto", look: DEFAULT_LOOK });
});

test("unirse con código en minúsculas funciona", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code.toLowerCase());
  assert.equal(guest.msg.t, "joined");
});

test("unirse a una sala inexistente da error", async () => {
  const guest = await joinRoom("ZZZZ");
  assert.equal(guest.msg.t, "error");
  assert.match(guest.msg.msg, /No existe/);
});

test("hasta 4 jugadores; el 5º no entra", async () => {
  const host = await createRoom();
  for (let i = 0; i < 3; i++) assert.equal((await joinRoom(host.msg.code, "J" + i)).msg.t, "joined");
  const fifth = await joinRoom(host.msg.code);
  assert.equal(fifth.msg.t, "error");
  assert.match(fifth.msg.msg, /llena/);
});

test("el 4º jugador ve a los otros 3 (aún sin rol)", async () => {
  const host = await createRoom("Ana");
  await joinRoom(host.msg.code, "Beto");
  await joinRoom(host.msg.code, "Ceci");
  const g3 = await joinRoom(host.msg.code, "Dani");
  assert.deepEqual(g3.msg.peers.map((p) => [p.name, p.role]), [["Ana", null], ["Beto", null], ["Ceci", null]]);
  assert.equal(g3.msg.host, host.msg.id);
});

test("start: solo el anfitrión y con 2+ jugadores; sortea 1 monstruo y avisa a todos", async () => {
  const host = await createRoom("Ana");
  sendMsg(host.ws, { t: "start" });
  assert.match((await waitFor(host.ws, "error")).msg, /al menos 2 jugadores/);
  const g1 = await joinRoom(host.msg.code, "Beto");
  const g2 = await joinRoom(host.msg.code, "Ceci");
  sendMsg(g1.ws, { t: "start" });           // un invitado no puede comenzar
  await expectNone(host.ws, "start");
  sendMsg(host.ws, { t: "start" });
  for (const ws of [host.ws, g1.ws, g2.ws]) {
    const st = await waitFor(ws, "start");
    assert.equal(st.players.length, 3);
    assert.deepEqual(st.players.map((p) => p.role).sort(), ["monster", "survivor", "survivor"]);
  }
});

test("el sorteo es al azar: a veces el anfitrión es el monstruo y a veces el invitado", async () => {
  const monsters = new Set();
  for (let i = 0; i < 24 && monsters.size < 2; i++) {
    const host = await createRoom("Ana");
    await joinRoom(host.msg.code, "Beto");
    sendMsg(host.ws, { t: "start" });
    const st = await waitFor(host.ws, "start");
    assert.equal(st.players.filter((p) => p.role === "monster").length, 1);
    assert.equal(st.players.filter((p) => p.role === "survivor").length, 1);
    monsters.add(st.players.find((p) => p.role === "monster").name);
  }
  assert.deepEqual([...monsters].sort(), ["Ana", "Beto"]);
});

test("una partida ya empezada no acepta más jugadores", async () => {
  const host = await createRoom();
  await joinRoom(host.msg.code);
  sendMsg(host.ws, { t: "start" });
  await waitFor(host.ws, "start");
  const late = await joinRoom(host.msg.code);
  assert.equal(late.msg.t, "error");
  assert.match(late.msg.msg, /empezó/);
});

test("si el anfitrión sale de la sala, otro jugador queda como anfitrión", async () => {
  const host = await createRoom();
  const g1 = await joinRoom(host.msg.code);
  const g2 = await joinRoom(host.msg.code);
  await close(host.ws);
  const h = await waitFor(g1.ws, "host");
  assert.equal(h.id, g1.msg.id);
  assert.equal((await waitFor(g2.ws, "host")).id, g1.msg.id);
});

test("los eventos llegan a todos los demás jugadores de la sala", async () => {
  const host = await createRoom();
  const g1 = await joinRoom(host.msg.code);
  const g2 = await joinRoom(host.msg.code);
  sendMsg(g2.ws, { t: "event", e: "pick", d: { id: "mansion-0" } });
  for (const ws of [host.ws, g1.ws]) {
    const ev = await waitFor(ws, "event");
    assert.equal(ev.id, g2.msg.id);
    assert.equal(ev.e, "pick");
  }
  await expectNone(g2.ws, "event");
});

test("el nombre se recorta a 16 caracteres", async () => {
  const host = await createRoom("x".repeat(40));
  const guest = await joinRoom(host.msg.code);
  assert.equal(guest.msg.peers[0].name.length, 16);
});

/* ---------------- sincronización ---------------- */
test("state: posición/rotación/animación llega al otro jugador y no al emisor", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  await waitFor(host.ws, "peer-join");

  sendMsg(host.ws, { t: "state", p: [1.5, 0, -3.25], r: 0.785, a: 1.2 });
  const st = await waitFor(guest.ws, "state");
  assert.deepEqual(st, { t: "state", id: host.msg.id, p: [1.5, 0, -3.25], r: 0.785, a: 1.2 });
  await expectNone(host.ws, "state");

  // y en sentido contrario
  sendMsg(guest.ws, { t: "state", p: [0, 0, 0], r: 3.14, a: 0 });
  const back = await waitFor(host.ws, "state");
  assert.equal(back.id, guest.msg.id);
  assert.equal(back.r, 3.14);
});

test("state: muchos paquetes llegan completos y en orden", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  const N = 200;
  const got = [];
  const done = new Promise((resolve) => {
    guest.ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.t === "state") { got.push(m.p[0]); if (got.length === N) resolve(); }
    });
  });
  for (let i = 0; i < N; i++) sendMsg(host.ws, { t: "state", p: [i, 0, 0], r: 0, a: 0 });
  await done;
  assert.deepEqual(got, Array.from({ length: N }, (_, i) => i));
});

test("event: linterna y rugido se reenvían al otro jugador", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);

  sendMsg(host.ws, { t: "event", e: "flash", d: false });
  assert.deepEqual(await waitFor(guest.ws, "event"),
    { t: "event", id: host.msg.id, e: "flash", d: false });

  sendMsg(guest.ws, { t: "event", e: "roar" });
  const roar = await waitFor(host.ws, "event");
  assert.equal(roar.e, "roar");
  assert.equal(roar.id, guest.msg.id);
});

test("las salas están aisladas entre sí", async () => {
  const a = await createRoom();
  const a2 = await joinRoom(a.msg.code);
  const b = await createRoom();
  const b2 = await joinRoom(b.msg.code);

  sendMsg(a.ws, { t: "state", p: [9, 9, 9], r: 0, a: 0 });
  await waitFor(a2.ws, "state");
  await expectNone(b.ws, "state");
  await expectNone(b2.ws, "state", 0);
});

test("state/event fuera de una sala se ignoran", async () => {
  const ws = await connect();
  sendMsg(ws, { t: "state", p: [0, 0, 0], r: 0, a: 0 });
  sendMsg(ws, { t: "event", e: "roar" });
  sendMsg(ws, { t: "ping", ts: 42 });
  // el servidor sigue respondiendo
  assert.equal((await waitFor(ws, "pong")).ts, 42);
});

test("ping devuelve pong con el mismo ts", async () => {
  const ws = await connect();
  sendMsg(ws, { t: "ping", ts: 123.45 });
  assert.deepEqual(await waitFor(ws, "pong"), { t: "pong", ts: 123.45 });
});

test("JSON inválido no tumba el servidor", async () => {
  const ws = await connect();
  ws.send("esto no es json {");
  ws.send(JSON.stringify({ t: "desconocido" }));
  sendMsg(ws, { t: "ping", ts: 1 });
  assert.equal((await waitFor(ws, "pong")).ts, 1);
});

/* ---------------- salidas y desconexiones ---------------- */
test("leave: el otro jugador recibe peer-leave", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  sendMsg(guest.ws, { t: "leave" });
  assert.deepEqual(await waitFor(host.ws, "peer-leave"),
    { t: "peer-leave", id: guest.msg.id, role: null });
});

test("cerrar la pestaña (desconexión) avisa al otro jugador", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  await close(host.ws);
  const pl = await waitFor(guest.ws, "peer-leave");
  assert.equal(pl.id, host.msg.id);
});

test("en partida, quien se va avisa con el rol que le tocó", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  sendMsg(host.ws, { t: "start" });
  const st = await waitFor(guest.ws, "start");
  await waitFor(host.ws, "start");
  const hostRole = st.players.find((p) => p.id === host.msg.id).role;
  await close(host.ws);
  assert.equal((await waitFor(guest.ws, "peer-leave")).role, hostRole);
});

test("si alguien sale de la sala de espera, puede entrar otro en su lugar", async () => {
  const host = await createRoom();
  const g1 = await joinRoom(host.msg.code);
  await close(g1.ws);
  await waitFor(host.ws, "peer-leave");
  const g2 = await joinRoom(host.msg.code);
  assert.equal(g2.msg.t, "joined");
  assert.equal(g2.msg.peers.length, 1);
});

test("una sala vacía se elimina", async () => {
  const host = await createRoom();
  await close(host.ws);
  await new Promise((r) => setTimeout(r, 100));
  const late = await joinRoom(host.msg.code);
  assert.equal(late.msg.t, "error");
});

test("crear otra sala abandona la anterior", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  sendMsg(host.ws, { t: "create" });
  await waitFor(host.ws, "created");
  await waitFor(guest.ws, "peer-leave");
});

test("unirse a tu propia sala no te deja en una sala fantasma", async () => {
  const host = await createRoom();
  sendMsg(host.ws, { t: "join", code: host.msg.code });
  const res = await Promise.race([waitFor(host.ws, "joined"), waitFor(host.ws, "error")]);
  assert.equal(res.t, "error");
  assert.match(res.msg, /Ya estás/);

  // si el anfitrión sigue en la sala, un 2º jugador debe poder entrar y verlo
  const guest = await joinRoom(host.msg.code);
  assert.equal(guest.msg.t, "joined", "la sala desapareció: " + JSON.stringify(guest.msg));
  sendMsg(host.ws, { t: "state", p: [1, 2, 3], r: 0, a: 0 });
  await waitFor(guest.ws, "state");
});

/* ---------------- personalización ---------------- */
test("la personalización de cada jugador llega a los demás (unirse y start)", async () => {
  const lookA = { survivorColor: "carmesi", flashColor: "azul", monsterType: "demonio", monsterSkin: "hueso", monsterEyes: "rojo", hat: "copa" };
  const lookB = { survivorColor: "noche", flashColor: "roja", monsterType: "llorona", monsterSkin: "sangre", monsterEyes: "verde", hat: "cuernos" };
  const a = await connect();
  sendMsg(a, { t: "create", name: "Ana", look: lookA });
  const created = await waitFor(a, "created");
  const b = await connect();
  sendMsg(b, { t: "join", code: created.code, name: "Beto", look: lookB });
  const joined = await waitFor(b, "joined");
  assert.deepEqual(joined.peers[0].look, lookA);                 // Beto ve cómo se ve Ana
  assert.deepEqual((await waitFor(a, "peer-join")).look, lookB); // Ana ve cómo se ve Beto
  sendMsg(a, { t: "start" });
  const st = await waitFor(b, "start");
  assert.deepEqual(st.players.find((p) => p.name === "Ana").look, lookA);
  assert.deepEqual(st.players.find((p) => p.name === "Beto").look, lookB);
});

test("personalización inválida: el servidor deja solo ids conocidos", async () => {
  const a = await connect();
  sendMsg(a, { t: "create", name: "Ana", look: { survivorColor: "<script>", hat: "corona", extra: "x", flashColor: 5 } });
  const created = await waitFor(a, "created");
  const b = await connect();
  sendMsg(b, { t: "join", code: created.code, name: "Beto" });   // sin look
  const joined = await waitFor(b, "joined");
  assert.deepEqual(joined.peers[0].look, { ...DEFAULT_LOOK, hat: "corona" });
  assert.deepEqual((await waitFor(a, "peer-join")).look, DEFAULT_LOOK);
});
