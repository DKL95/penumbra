/* =========================================================
   PENUMBRA — Pruebas del servicio web (api/*.php)
   Arranca server.js, que a su vez levanta PHP (`php -S`), con
   una base SQLite temporal (DB_DRIVER=sqlite) para no tocar el
   MySQL real. Prueba el camino completo navegador → Node →
   PHP → BD. Si no hay PHP instalado, las pruebas se omiten.

   Contra MySQL (crea y borra una base desechable penumbra_test_*):
     TEST_DB_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASS=… npm test
   ========================================================= */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const Rules = require("../js/rules.js");

const PHP = [process.env.PHP_BIN, "php", "C:\\xampp\\php\\php.exe", "/usr/bin/php"]
  .filter(Boolean)
  .find((c) => { try { return spawnSync(c, ["-v"], { timeout: 4000 }).status === 0; } catch { return false; } });
const skip = PHP ? false : "PHP no está instalado";

let serverProc, BASE, dbFile;
const DRIVER = process.env.TEST_DB_DRIVER === "mysql" ? "mysql" : "sqlite";
const TEST_DB = `penumbra_test_${process.pid}`;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on("error", reject);
  });
}

async function api(file, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Penumbra-Token"] = token;
  const r = await fetch(`${BASE}/api/${file}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}

before(async () => {
  if (skip) return;
  let port = await freePort();
  while (port > 65000) port = await freePort();
  dbFile = path.join(os.tmpdir(), `penumbra-test-${process.pid}-${Date.now()}.sqlite`);
  serverProc = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(port), PHP_BIN: PHP, DB_DRIVER: DRIVER, DB_SQLITE: dbFile, DB_NAME: TEST_DB, FACEBOOK_APP_ID: "123456" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("el servidor no arrancó")), 8000);
    serverProc.stdout.on("data", (d) => { if (String(d).includes("servidor listo")) { clearTimeout(t); resolve(); } });
    serverProc.on("exit", (c) => reject(new Error("el servidor terminó con código " + c)));
  });
  BASE = `http://localhost:${port}`;
  // espera a que php -S acepte conexiones
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${BASE}/api/public.php`)).status === 200) return; } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("PHP no respondió");
});

after(() => {
  if (serverProc) serverProc.kill();
  if (!skip && DRIVER === "mysql") {
    // borra la base desechable
    spawnSync(PHP, ["-r", `$p = new PDO('mysql:host=' . getenv('DB_HOST') . ';port=' . (getenv('DB_PORT') ?: 3306), getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: ''); $p->exec('DROP DATABASE IF EXISTS ${TEST_DB}');`], { env: process.env });
  }
  if (dbFile) setTimeout(() => { try { fs.unlinkSync(dbFile); } catch { /* en uso */ } }, 300);
});

const stats = (o = {}) => ({
  mode: "escape", scenario: "campaign", difficulty: "normal", role: "survivor",
  result: "escaped", seconds: 600, relics: 9, levels: 3, levelsPlayed: 3, hp: 2, ...o,
});

test("public.php: estado del servicio y App ID de Facebook", { skip }, async () => {
  const { status, data } = await api("public.php");
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.dbOk, true);
  assert.equal(data.facebookAppId, "123456");
  assert.equal(data.db, DRIVER);
});

test("auth.php: invitado obtiene token y el mismo guestId conserva al usuario", { skip }, async () => {
  const a = await api("auth.php", { method: "POST", body: { provider: "guest", name: "  Ana <b>la</b>  valiente " } });
  assert.equal(a.status, 200);
  assert.match(a.data.token, /^[a-f0-9]{48}$/);
  assert.equal(a.data.user.name, "Ana la valiente");
  assert.equal(a.data.user.provider, "invitado");
  const b = await api("auth.php", { method: "POST", body: { provider: "guest", name: "Ana2", guestId: a.data.guestId } });
  assert.equal(b.data.user.id, a.data.user.id);
  assert.equal(b.data.user.name, "Ana2");
  const me = await api("auth.php", { token: b.data.token });
  assert.equal(me.data.user.name, "Ana2");
});

test("auth.php: nombre inválido, proveedor desconocido y token de Facebook falso", { skip }, async () => {
  assert.equal((await api("auth.php", { method: "POST", body: { provider: "guest", name: "A" } })).status, 400);
  assert.equal((await api("auth.php", { method: "POST", body: { provider: "myspace" } })).status, 400);
  assert.equal((await api("auth.php", { method: "POST", body: { provider: "facebook", accessToken: "" } })).status, 400);
  assert.equal((await api("auth.php", { token: "f".repeat(48) })).status, 401);
});

test("auth.php DELETE cierra la sesión", { skip }, async () => {
  const { data } = await api("auth.php", { method: "POST", body: { provider: "guest", name: "Temporal" } });
  assert.equal((await api("auth.php", { method: "DELETE", token: data.token })).status, 200);
  assert.equal((await api("auth.php", { token: data.token })).status, 401);
});

test("scores.php: guardar requiere sesión", { skip }, async () => {
  const r = await api("scores.php", { method: "POST", body: stats() });
  assert.equal(r.status, 401);
});

test("scores.php: el servidor recalcula los puntos (ignora los del navegador)", { skip }, async () => {
  const { data: s } = await api("auth.php", { method: "POST", body: { provider: "guest", name: "Beto" } });
  const r = await api("scores.php", { method: "POST", token: s.token, body: { ...stats(), points: 99999999 } });
  assert.equal(r.status, 201);
  assert.equal(r.data.points, Rules.score({ ...stats(), escaped: true }));
  assert.equal(r.data.best, r.data.points);
  assert.ok(r.data.rank >= 1);
});

test("scores.php: valida los datos de la partida", { skip }, async () => {
  const { data: s } = await api("auth.php", { method: "POST", body: { provider: "guest", name: "Carla" } });
  const bad = [
    { mode: "trampa" }, { scenario: "luna" }, { difficulty: "facil" }, { result: "abandon" },
    { seconds: 0 }, { relics: 40 }, { levels: 3, levelsPlayed: 1 }, { hp: 9 }, { mode: "survival", scenario: "campaign" },
  ];
  for (const o of bad) {
    const r = await api("scores.php", { method: "POST", token: s.token, body: stats(o) });
    assert.equal(r.status, 400, JSON.stringify(o));
  }
});

test("scores.php: lista ordenada por puntos y filtrable por modo y dificultad", { skip }, async () => {
  const { data: s } = await api("auth.php", { method: "POST", body: { provider: "guest", name: "Dani" } });
  await api("scores.php", { method: "POST", token: s.token, body: stats({ mode: "survival", scenario: "forest", relics: 4, seconds: 100, levels: 0, levelsPlayed: 1, result: "caught" }) });
  await api("scores.php", { method: "POST", token: s.token, body: stats({ mode: "survival", scenario: "hospital", relics: 9, seconds: 300, levels: 0, levelsPlayed: 1, result: "caught", difficulty: "dark" }) });
  const all = await api("scores.php?mode=survival");
  assert.equal(all.status, 200);
  assert.ok(all.data.scores.length >= 2);
  const pts = all.data.scores.map((x) => x.points);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.ok(all.data.scores.every((x) => x.mode === "survival"));
  assert.equal(all.data.scores[0].rank, 1);
  const dark = await api("scores.php?mode=survival&difficulty=dark");
  assert.ok(dark.data.scores.length >= 1 && dark.data.scores.every((x) => x.difficulty === "dark"));
  const mine = await api("scores.php?mode=survival&mine=1", { token: s.token });
  assert.ok(mine.data.scores.every((x) => x.name === "Dani"));
});

test("la fórmula de PHP coincide con la de js/rules.js", { skip }, () => {
  const cases = [];
  for (const difficulty of ["normal", "dark", "blackout"]) {
    cases.push({ mode: "escape", role: "survivor", difficulty, escaped: true, levels: 3, levelsPlayed: 3, relics: 9, hp: 1, seconds: 420 });
    cases.push({ mode: "escape", role: "survivor", difficulty, escaped: false, levels: 1, levelsPlayed: 3, relics: 4, hp: 0, seconds: 999 });
    cases.push({ mode: "versus", role: "survivor", difficulty, escaped: true, levels: 1, levelsPlayed: 1, relics: 3, hp: 2, seconds: 150 });
    cases.push({ mode: "versus", role: "monster", difficulty, won: true, relics: 2, seconds: 80 });
    cases.push({ mode: "survival", role: "survivor", difficulty, relics: 7, seconds: 333 });
  }
  const php = spawnSync(PHP, ["-r", `require 'api/lib/rules.php'; $c = json_decode(stream_get_contents(STDIN), true); echo json_encode(array_map('score_points', $c));`], {
    cwd: path.join(__dirname, ".."), input: JSON.stringify(cases),
  });
  assert.equal(php.status, 0, String(php.stderr));
  assert.deepEqual(JSON.parse(String(php.stdout)), cases.map(Rules.score));
});
