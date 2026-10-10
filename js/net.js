/* =========================================================
   PENUMBRA — Cliente de red (multijugador en tiempo real)
   WebSocket contra server.js. Expone window.Net:
     Net.create()            crea sala → evento "created"
     Net.join(code)          se une     → evento "joined"
     Net.sendState(p, r, a)  posición / rotación / animación
     Net.sendEvent(e, d)     eventos sueltos
     Net.leave()
     Net.on(tipo, fn)        "created" "joined" "peer-join"
                             "peer-leave" "state" "event"
                             "error" "close" "ping"
   ========================================================= */

const Net = (() => {
  let ws = null;
  let pingTimer = null;
  const handlers = {};
  const info = { connected: false, code: null, id: null, role: null, peers: [], ping: 0 };

  function on(type, fn) { (handlers[type] ||= []).push(fn); }
  function emit(type, data) { (handlers[type] || []).forEach((fn) => fn(data)); }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return ws.readyState === WebSocket.OPEN
        ? Promise.resolve()
        : new Promise((res, rej) => {
            ws.addEventListener("open", res, { once: true });
            ws.addEventListener("error", rej, { once: true });
          });
    }
    return new Promise((resolve, reject) => {
      if (location.protocol === "file:") {
        reject(new Error("Abre el juego desde el servidor (npm start), no con doble clic."));
        return;
      }
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}`);
      ws.addEventListener("open", () => {
        info.connected = true;
        pingTimer = setInterval(() => raw({ t: "ping", ts: performance.now() }), 2000);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () =>
        reject(new Error("No se pudo conectar con el servidor. ¿Está corriendo npm start?")), { once: true });
      ws.addEventListener("message", onMessage);
      ws.addEventListener("close", () => {
        const wasInRoom = !!info.code;
        clearInterval(pingTimer);
        Object.assign(info, { connected: false, code: null, role: null, peers: [] });
        ws = null;
        emit("close", { wasInRoom });
      });
    });
  }

  function onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.t) {
      case "created":
        Object.assign(info, { code: msg.code, id: msg.id, role: msg.role, peers: [] });
        break;
      case "joined":
        Object.assign(info, { code: msg.code, id: msg.id, role: msg.role, peers: msg.peers });
        break;
      case "peer-join":
        info.peers.push({ id: msg.id, role: msg.role, name: msg.name });
        break;
      case "peer-leave":
        info.peers = info.peers.filter((p) => p.id !== msg.id);
        break;
      case "pong":
        info.ping = Math.round(performance.now() - msg.ts);
        emit("ping", info.ping);
        return;
    }
    emit(msg.t, msg);
  }

  function raw(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  async function create(name) {
    await connect();
    raw({ t: "create", name });
  }
  async function join(code, name) {
    await connect();
    raw({ t: "join", code, name });
  }
  function leave() {
    if (info.code) raw({ t: "leave" });
    Object.assign(info, { code: null, role: null, peers: [] });
  }

  // redondeo para mandar menos bytes
  const r3 = (n) => Math.round(n * 1000) / 1000;
  function sendState(p, r, a) {
    if (!info.code) return;
    raw({ t: "state", p: [r3(p.x), r3(p.y), r3(p.z)], r: r3(r), a });
  }
  function sendEvent(e, d) {
    if (info.code) raw({ t: "event", e, d });
  }

  // al cerrar o recargar la pestaña, avisar al servidor de inmediato
  window.addEventListener("pagehide", () => { if (ws) ws.close(); });

  return {
    on, create, join, leave, sendState, sendEvent, info,
    get inRoom() { return !!info.code; },
  };
})();

window.Net = Net;
