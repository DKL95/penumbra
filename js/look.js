/* =========================================================
   PENUMBRA — Personalización del jugador
   Ropa del superviviente, luz de la linterna, piel y ojos del
   monstruo y un accesorio en la cabeza (opciones en Rules.LOOK).

   Se guarda en tres lugares:
     - LocalStorage: siempre, para que funcione sin servidor.
     - Cuenta del jugador (MySQL, api/look.php): si hay sesión.
       Al iniciar sesión se descarga la de la cuenta; si la
       cuenta aún no tiene, se le sube la que elegiste.
     - Multijugador: app.js la manda al crear o unirse a una
       sala y server.js la reparte a los demás.
   Expone window.Look = { get, set, reset, pull, onChange, onStatus }.
   ========================================================= */

const Look = (() => {
  const KEY = "penumbra.look.v1";
  const changeFns = [], statusFns = [];
  let current = Rules.sanitizeLook(readLocal());
  let saveTimer = null;
  let status = { state: "local", msg: "" };

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* sin almacenamiento */ }
  }
  function setStatus(state, msg) {
    status = { state, msg };
    statusFns.forEach((fn) => fn(status));
  }
  function emit() { const l = get(); changeFns.forEach((fn) => fn(l)); }

  function get() { return { ...current }; }

  // cambia una o varias opciones; guarda en local y (con sesión) en la cuenta
  function set(partial) {
    current = Rules.sanitizeLook({ ...current, ...partial });
    writeLocal();
    emit();
    scheduleUpload();
    return get();
  }
  function reset() { return set(Rules.defaultLook()); }

  function scheduleUpload() {
    if (!window.Api || !Api.user) {
      setStatus("local", "Guardado en este equipo. Inicia sesión en Puntajes para guardarlo en tu cuenta.");
      return;
    }
    setStatus("saving", "Guardando en tu cuenta…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(upload, 500);   // varios clics seguidos = una sola petición
  }
  async function upload() {
    try {
      current = Rules.sanitizeLook(await Api.saveLook(current));
      writeLocal();
      setStatus("saved", `Guardado en la cuenta de ${Api.user.name}.`);
    } catch (e) {
      setStatus("error", `${e.message} Quedó guardado en este equipo.`);
    }
  }

  // al iniciar sesión: la cuenta manda; si no tiene, se le sube la local
  async function pull() {
    if (!window.Api || !Api.user) return;
    try {
      const remote = await Api.getLook();
      if (remote) {
        current = Rules.sanitizeLook(remote);
        writeLocal();
        emit();
        setStatus("saved", `Personalización de la cuenta de ${Api.user.name}.`);
      } else {
        await upload();
      }
    } catch (e) {
      setStatus("error", `No se pudo leer tu cuenta (${e.message}). Se usa la de este equipo.`);
    }
  }

  function onChange(fn) { changeFns.push(fn); }
  function onStatus(fn) { statusFns.push(fn); fn(status); }

  if (window.Api) {
    Api.onChange((user) => {
      if (user) pull();
      else setStatus("local", "Guardado en este equipo. Inicia sesión en Puntajes para guardarlo en tu cuenta.");
    });
    // con una sesión guardada, Api.refresh() (al arrancar app.js) dispara onChange → pull()
  }

  return { get, set, reset, pull, onChange, onStatus };
})();

window.Look = Look;
