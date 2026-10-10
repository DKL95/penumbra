/* =========================================================
   PENUMBRA — Configuración persistente (LocalStorage)
   Requisito de la UA: almacenamiento local con LocalStorage.
   Aquí se guardan las preferencias del jugador entre sesiones.
   ========================================================= */

const Settings = (() => {
  const KEY = "penumbra.settings.v1";

  const DEFAULTS = {
    volume: 70,        // 0..100
    music: 50,         // 0..100
    difficulty: "normal",
    quality: "medium",
    sensitivity: 8,    // 1..20
  };

  let current = { ...DEFAULTS };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      current = { ...DEFAULTS };
    }
    apply();
    return current;
  }

  function save(values) {
    current = { ...current, ...values };
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
    } catch (e) {
      /* modo incógnito o almacenamiento lleno: se ignora */
    }
    apply();
    return current;
  }

  function reset() {
    current = { ...DEFAULTS };
    try { localStorage.removeItem(KEY); } catch (e) {}
    apply();
    return current;
  }

  function get() {
    return { ...current };
  }

  /* Propaga la configuración al resto del juego */
  function apply() {
    if (window.Sound && Sound.setVolumes) {
      Sound.setVolumes(current.volume / 100, current.music / 100);
    }
    document.documentElement.dataset.quality = current.quality;

    // refleja dificultad en el HUD de la maqueta
    const diffLabel = {
      normal: "Normal",
      dark: "Oscuro",
      blackout: "Apagón",
    }[current.difficulty] || "Normal";
    const el = document.getElementById("hud-difficulty");
    if (el) el.textContent = diffLabel;
  }

  return { load, save, reset, get, DEFAULTS };
})();
