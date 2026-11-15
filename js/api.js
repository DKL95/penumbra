/* =========================================================
   PENUMBRA — Cliente del servicio web (PHP + MySQL)
   Consume /api/*.php con fetch y JSON:
     Api.info()                 estado del servicio + App ID de Facebook
     Api.loginGuest(name)       sesión de invitado
     Api.loginFacebook()        Facebook Login (SDK JS) → token verificado en PHP
     Api.logout()
     Api.submit(stats)          guarda el puntaje de una partida
     Api.list({ mode, difficulty, limit })
   Almacenamiento LOCAL (LocalStorage): la sesión, el id de
   invitado y un respaldo de puntajes para cuando no hay
   servidor. Almacenamiento REMOTO: MySQL vía PHP.
   ========================================================= */

const Api = (() => {
  const BASE = "api/";
  const K_SESSION = "penumbra.session.v1";
  const K_GUEST = "penumbra.guestId.v1";
  const K_LOCAL = "penumbra.scores.local.v1";
  const listeners = [];

  let session = read(K_SESSION);           // { token, user }
  let infoCache = null;

  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  function write(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

  function onChange(fn) { listeners.push(fn); }
  function setSession(s) {
    session = s;
    write(K_SESSION, s);
    listeners.forEach((fn) => fn(s && s.user));
  }

  async function call(path, { method = "GET", body, auth = false } = {}) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (auth && session) headers["X-Penumbra-Token"] = session.token;
    let res;
    try {
      res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Sin conexión con el servidor.");
    }
    let data = null;
    try { data = await res.json(); } catch { /* respuesta no JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const err = new Error((data && data.error) || `El servicio web respondió ${res.status}.`);
      err.status = res.status;
      if (res.status === 401 && auth) setSession(null);   // token vencido o inválido
      throw err;
    }
    return data;
  }

  async function info() {
    if (infoCache) return infoCache;
    try { infoCache = await call("public.php"); }
    catch (e) { infoCache = { ok: false, dbOk: false, error: e.message, facebookAppId: "" }; }
    return infoCache;
  }

  /* ---------------- Sesión ---------------- */
  async function loginGuest(name) {
    const d = await call("auth.php", { method: "POST", body: { provider: "guest", name, guestId: read(K_GUEST) || "" } });
    if (d.guestId) write(K_GUEST, d.guestId);
    setSession({ token: d.token, user: d.user });
    return d.user;
  }

  // El SDK de Facebook se carga al iniciar (si hay App ID) para que
  // FB.login() se llame directo desde el clic y no lo bloquee el navegador.
  let fbReady = null;
  function loadFacebook() {
    if (fbReady) return fbReady;
    fbReady = info().then((i) => new Promise((resolve, reject) => {
      if (!i.facebookAppId) return reject(new Error("Facebook no está configurado (falta FACEBOOK_APP_ID en api/config.local.php)."));
      if (window.FB) return resolve(window.FB);
      window.fbAsyncInit = () => {
        FB.init({ appId: i.facebookAppId, cookie: false, xfbml: false, version: "v19.0" });
        resolve(FB);
      };
      const s = document.createElement("script");
      s.src = "https://connect.facebook.net/es_LA/sdk.js";
      s.async = true; s.defer = true; s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook (¿sin internet o bloqueado?)."));
      document.head.appendChild(s);
    }));
    fbReady.catch(() => {});
    return fbReady;
  }

  function loginFacebook() {
    return new Promise((resolve, reject) => {
      const go = (FB) => FB.login((resp) => {
        if (!resp || !resp.authResponse) return reject(new Error("Inicio de sesión con Facebook cancelado."));
        call("auth.php", { method: "POST", body: { provider: "facebook", accessToken: resp.authResponse.accessToken } })
          .then((d) => { setSession({ token: d.token, user: d.user }); resolve(d.user); })
          .catch(reject);
      }, { scope: "public_profile" });
      if (window.FB) go(window.FB);
      else loadFacebook().then(go, reject);
    });
  }

  async function logout() {
    if (session) {
      try { await call("auth.php", { method: "DELETE", auth: true }); } catch { /* da igual */ }
      if (window.FB && session.user && session.user.provider === "facebook") { try { FB.logout(() => {}); } catch { /* sin sesión de FB */ } }
    }
    setSession(null);
  }

  // confirma con el servidor que la sesión guardada sigue viva
  async function refresh() {
    if (!session) return null;
    try {
      const d = await call("auth.php", { auth: true });
      setSession({ ...session, user: d.user });
      return d.user;
    } catch (e) {
      if (e.status !== 401) return session.user;   // servidor caído: se conserva la sesión local
      return null;
    }
  }

  /* ---------------- Puntajes ---------------- */
  function payload(stats) {
    return {
      mode: stats.mode, scenario: stats.scenario, difficulty: stats.difficulty, role: stats.role,
      result: stats.result, seconds: Math.max(1, Math.round(stats.seconds)), relics: stats.relics,
      levels: stats.levels, levelsPlayed: stats.levelsPlayed, hp: stats.hp,
    };
  }

  function saveLocal(stats, name) {
    const list = read(K_LOCAL) || [];
    list.push({
      name: name || (session && session.user ? session.user.name : "Tú"),
      mode: stats.mode, scenario: stats.scenario, difficulty: stats.difficulty, result: stats.result,
      points: stats.points, seconds: Math.round(stats.seconds), relics: stats.relics, date: new Date().toISOString(),
    });
    list.sort((a, b) => b.points - a.points || a.seconds - b.seconds);
    write(K_LOCAL, list.slice(0, 50));
  }

  async function submit(stats) {
    if (!stats._savedLocal) { saveLocal(stats); stats._savedLocal = true; }
    if (!session) throw Object.assign(new Error("Sin sesión: guardado solo en este equipo."), { status: 401 });
    return call("scores.php", { method: "POST", body: payload(stats), auth: true });
  }

  async function list({ mode = "escape", difficulty = "", limit = 10 } = {}) {
    const q = new URLSearchParams({ mode, limit });
    if (difficulty) q.set("difficulty", difficulty);
    try {
      const d = await call("scores.php?" + q);
      return { source: "remote", scores: d.scores };
    } catch (e) {
      const scores = (read(K_LOCAL) || [])
        .filter((s) => s.mode === mode && (!difficulty || s.difficulty === difficulty))
        .slice(0, limit)
        .map((s, i) => ({ ...s, rank: i + 1 }));
      return { source: "local", error: e.message, scores };
    }
  }

  return {
    info, loginGuest, loginFacebook, loadFacebook, logout, refresh, submit, list, onChange,
    get user() { return session ? session.user : null; },
  };
})();

window.Api = Api;
