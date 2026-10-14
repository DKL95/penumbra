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
    env: { ...process.env, PORT: String(PORT) },
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

/* ---------------- creación de salas ---------------- */
test("crear sala: código de 4 letras y rol superviviente", async () => {
  const { msg } = await createRoom();
  assert.match(msg.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(msg.role, "survivor");
  assert.equal(typeof msg.id, "number");
});

test("cada sala recibe un código distinto", async () => {
  const codes = new Set();
  for (let i = 0; i < 20; i++) codes.add((await createRoom()).msg.code);
  assert.equal(codes.size, 20);
});

/* ---------------- unirse ---------------- */
test("unirse: el 2º jugador es el monstruo y ambos se ven", async () => {
  const host = await createRoom("Ana");
  const guest = await joinRoom(host.msg.code, "Beto");

  assert.equal(guest.msg.t, "joined");
  assert.equal(guest.msg.role, "monster");
  assert.equal(guest.msg.code, host.msg.code);
  assert.deepEqual(guest.msg.peers, [{ id: host.msg.id, role: "survivor", name: "Ana" }]);

  const pj = await waitFor(host.ws, "peer-join");
  assert.deepEqual(pj, { t: "peer-join", id: guest.msg.id, role: "monster", name: "Beto" });
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

test("un 3er jugador no puede entrar a una sala llena", async () => {
  const host = await createRoom();
  await joinRoom(host.msg.code);
  const third = await joinRoom(host.msg.code);
  assert.equal(third.msg.t, "error");
  assert.match(third.msg.msg, /llena/);
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
    { t: "peer-leave", id: guest.msg.id, role: "monster" });
});

test("cerrar la pestaña (desconexión) avisa al otro jugador", async () => {
  const host = await createRoom();
  const guest = await joinRoom(host.msg.code);
  await close(host.ws);
  const pl = await waitFor(guest.ws, "peer-leave");
  assert.equal(pl.role, "survivor");
});

test("tras salir el monstruo, otro jugador puede ocupar su lugar", async () => {
  const host = await createRoom();
  const g1 = await joinRoom(host.msg.code);
  await close(g1.ws);
  await waitFor(host.ws, "peer-leave");
  const g2 = await joinRoom(host.msg.code);
  assert.equal(g2.msg.t, "joined");
  assert.equal(g2.msg.role, "monster");
});

test("si sale el superviviente, quien entra después es superviviente", async () => {
  const host = await createRoom();
  const g1 = await joinRoom(host.msg.code);
  await close(host.ws);
  await waitFor(g1.ws, "peer-leave");
  const g2 = await joinRoom(host.msg.code);
  assert.equal(g2.msg.role, "survivor");
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
