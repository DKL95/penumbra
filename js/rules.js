/* =========================================================
   PENUMBRA — Reglas del juego (lógica pura, sin Three.js)
   - Niveles de dificultad (no dependen del tiempo: cambian
     vidas, visión/oído y velocidad del monstruo, batería,
     niebla e ítems disponibles).
   - Ítems especiales y su efecto.
   - Modos de juego, escenarios y cálculo del puntaje.
   Funciona en el navegador (window.Rules) y en Node (pruebas).
   ========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof self !== "undefined" ? self : this, function () {
  /* ---------------- Dificultad ---------------- */
  const DIFFICULTY = {
    normal: {
      label: "Normal",
      hp: 3,                 // golpes que aguanta el superviviente
      monsterWalk: 1.25,     // m/s del monstruo de la IA en su ronda
      monsterChase: 1.6,     // m/s cuando persigue
      vision: 4.5,           // metros a los que ve al superviviente
      hearRun: 0,            // metros a los que oye correr (0 = sordo)
      hearWalk: 0,
      drain: 1 / 150,        // batería que gasta la linterna por segundo
      recharge: 1 / 60,      // batería que recupera apagada por segundo
      fog: 0.055,
      monsterPlayerSpeed: 1.0, // multiplicador del monstruo controlado por un jugador
      mult: 1,               // multiplicador de puntaje
    },
    dark: {
      label: "Oscuro",
      hp: 2,
      monsterWalk: 1.45,
      monsterChase: 1.95,
      vision: 6.5,
      hearRun: 6,
      hearWalk: 0,
      drain: 1 / 110,
      recharge: 1 / 120,
      fog: 0.075,
      monsterPlayerSpeed: 1.1,
      mult: 1.5,
    },
    blackout: {
      label: "Apagón",
      hp: 1,
      monsterWalk: 1.6,
      monsterChase: 2.25,
      vision: 8,
      hearRun: 9,
      hearWalk: 3,
      drain: 1 / 70,
      recharge: 0,           // solo se recarga con baterías
      fog: 0.095,
      monsterPlayerSpeed: 1.2,
      mult: 2.2,
    },
  };
  function difficulty(id) { return DIFFICULTY[id] || DIFFICULTY.normal; }

  /* ---------------- Ítems ---------------- */
  // "relic" es el objetivo del nivel (su nombre cambia por escenario);
  // los demás se guardan en el inventario y se usan con 1 / 2 / 3.
  const ITEMS = {
    relic:     { label: "Reliquia",     key: null, max: 99 },
    battery:   { label: "Batería",      key: "1",  max: 3 },
    medkit:    { label: "Botiquín",     key: "2",  max: 3 },
    holywater: { label: "Agua bendita", key: "3",  max: 2 },
  };
  const INVENTORY = ["battery", "medkit", "holywater"];
  const BATTERY_CHARGE = 0.6;     // cuánto recarga una batería (0..1)
  const STUN_TIME = 5;            // segundos que el agua bendita paraliza al monstruo
  const STUN_RADIUS = 5;          // metros de alcance del agua bendita
  const INVULNERABLE = 2.2;       // segundos de invulnerabilidad tras un golpe
  const ATTACK_RANGE = 1.15;      // metros a los que el monstruo golpea
  const ATTACK_COOLDOWN = 1.8;

  // ¿Se coloca este ítem en esta dificultad? (los niveles marcan con
  // `skip` los ítems de ayuda que desaparecen en las dificultades altas)
  function itemsFor(list, diffId) {
    return list.filter((it) => !(it.skip || []).includes(diffId));
  }

  function emptyInventory() {
    return { battery: 0, medkit: 0, holywater: 0 };
  }
  // devuelve true si se pudo guardar
  function addItem(inv, kind) {
    const def = ITEMS[kind];
    if (!def || kind === "relic") return false;
    if ((inv[kind] || 0) >= def.max) return false;
    inv[kind] = (inv[kind] || 0) + 1;
    return true;
  }

  /* ---------------- Escenarios y modos ---------------- */
  const SCENARIOS = {
    mansion:  { label: "Mansión Ravenwood",  relic: "Fragmento de llave", relics: "fragmentos de la llave", short: "Fragmentos" },
    hospital: { label: "Hospital San Judas", relic: "Fusible",            relics: "fusibles",               short: "Fusibles" },
    forest:   { label: "Bosque de Ceniza",   relic: "Piedra rúnica",      relics: "piedras rúnicas",        short: "Runas" },
  };
  const CAMPAIGN = ["mansion", "hospital", "forest"];
  const RELICS_PER_LEVEL = 3;

  const MODES = {
    escape:   { label: "Escape",       desc: "Recorre los 3 escenarios: junta las reliquias y encuentra la salida." },
    survival: { label: "Supervivencia", desc: "Un escenario, sin salida: junta reliquias sin parar mientras el monstruo se vuelve más rápido." },
    versus:   { label: "Multijugador", desc: "Superviviente contra monstruo en tiempo real." },
  };

  /* ---------------- Puntaje ---------------- */
  // stats: { mode, role, difficulty, escaped, won, levels, levelsPlayed, relics, hp, seconds }
  // (api/lib/rules.php tiene la misma fórmula: el servidor recalcula los puntos)
  function score(stats) {
    const d = difficulty(stats.difficulty);
    const secs = Math.max(0, Math.floor(stats.seconds || 0));
    let pts;
    if (stats.role === "monster") {
      // el monstruo gana más cuanto antes atrapa al superviviente
      pts = stats.won ? 1500 + Math.max(0, 300 - secs) * 3 : 0;
    } else if (stats.mode === "survival") {
      pts = (stats.relics || 0) * 300 + Math.floor(secs) * 2;
    } else {
      const levels = stats.levels || 0;
      const par = 300 * Math.max(1, stats.levelsPlayed || levels || 1);  // 5 min por escenario
      pts = levels * 1000 + (stats.relics || 0) * 250;
      if (stats.escaped) pts += (stats.hp || 0) * 200 + Math.max(0, par - secs) * 2;
    }
    return Math.round(pts * d.mult);
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  /* ---------------- Personalización ---------------- */
  // Opciones cerradas: el navegador, server.js y api/lib/rules.php solo
  // aceptan estos ids (la primera opción de cada grupo es la de fábrica).
  // color: null = sin cambio (textura original / sin ojos / sin accesorio).
  const LOOK = {
    survivorColor: {
      label: "Ropa del superviviente",
      options: {
        original: { label: "Original", color: null },
        carmesi:  { label: "Carmesí",  color: 0xa83228 },
        bosque:   { label: "Bosque",   color: 0x4f8a45 },
        noche:    { label: "Noche",    color: 0x3f5a9e },
        ceniza:   { label: "Ceniza",   color: 0xb4b2ab },
        mostaza:  { label: "Mostaza",  color: 0xc9a034 },
        violeta:  { label: "Violeta",  color: 0x7b4a99 },
      },
    },
    flashColor: {
      label: "Luz de la linterna",
      options: {
        calida:  { label: "Cálida", color: 0xfff1d6 },
        blanca:  { label: "Blanca", color: 0xf4f8ff },
        azul:    { label: "Azul",   color: 0xa9c8ff },
        roja:    { label: "Roja",   color: 0xff8f80 },
        verde:   { label: "Verde",  color: 0xc4ffb4 },
      },
    },
    monsterType: {
      label: "Tipo de monstruo",
      options: {
        carnicero: { label: "El Carnicero" },
        slasher:   { label: "Slasher" },
        demonio:   { label: "Demonio" },
        llorona:   { label: "La Llorona" },
      },
    },
    monsterSkin: {
      label: "Color del monstruo",
      options: {
        original: { label: "Original", color: null },   // el de fábrica de cada tipo (js/monsters.js)
        sombra: { label: "Sombra", color: 0x050505 },
        ceniza: { label: "Ceniza", color: 0x4a4a48 },
        hueso:  { label: "Hueso",  color: 0xcfc6b0 },
        palido: { label: "Pálido", color: 0x8e9ba0 },
        sangre: { label: "Sangre", color: 0x4a0b07 },
      },
    },
    monsterEyes: {
      label: "Ojos del monstruo",
      options: {
        ninguno: { label: "Sin cara", color: null },
        rojo:    { label: "Rojos",    color: 0xff2a1a },
        ambar:   { label: "Ámbar",    color: 0xffb02a },
        blanco:  { label: "Blancos",  color: 0xeaf4ff },
        verde:   { label: "Verdes",   color: 0x5aff6a },
      },
    },
    hat: {
      label: "Accesorio en la cabeza",
      options: {
        ninguno:  { label: "Ninguno" },
        copa:     { label: "Sombrero de copa" },
        corona:   { label: "Corona" },
        cuernos:  { label: "Cuernos" },
        mascara:  { label: "Máscara" },
      },
    },
  };
  const LOOK_KEYS = Object.keys(LOOK);

  function defaultLook() {
    const out = {};
    for (const k of LOOK_KEYS) out[k] = Object.keys(LOOK[k].options)[0];
    return out;
  }
  // deja solo claves e ids conocidos; lo demás vuelve al valor de fábrica
  function sanitizeLook(look) {
    const out = defaultLook();
    if (look && typeof look === "object") {
      for (const k of LOOK_KEYS) {
        const v = look[k];
        if (typeof v === "string" && Object.prototype.hasOwnProperty.call(LOOK[k].options, v)) out[k] = v;
      }
    }
    return out;
  }
  function lookColor(look, key) {
    const l = sanitizeLook(look);
    return LOOK[key].options[l[key]].color ?? null;
  }

  return {
    DIFFICULTY, difficulty, ITEMS, INVENTORY, BATTERY_CHARGE, STUN_TIME, STUN_RADIUS,
    INVULNERABLE, ATTACK_RANGE, ATTACK_COOLDOWN, itemsFor, emptyInventory, addItem,
    SCENARIOS, CAMPAIGN, RELICS_PER_LEVEL, MODES, score, formatTime,
    LOOK, LOOK_KEYS, defaultLook, sanitizeLook, lookColor,
  };
});
