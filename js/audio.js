/* =========================================================
   PENUMBRA — Audio procedural (Web Audio API)
   Genera un drone de ambiente y sonidos de interfaz sin
   archivos externos. Se sustituirá / complementará con
   archivos reales de música y efectos en avances posteriores.
   ========================================================= */

const Sound = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let ambientNodes = [];
  let started = false;

  // Volúmenes 0..1 (los ajusta settings.js)
  let vol = { master: 0.7, music: 0.5 };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    masterGain = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();

    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    applyVolumes();
  }

  function applyVolumes() {
    if (!ctx) return;
    masterGain.gain.setTargetAtTime(vol.master, ctx.currentTime, 0.05);
    musicGain.gain.setTargetAtTime(vol.music * 0.6, ctx.currentTime, 0.05);
    sfxGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.05);
  }

  function setVolumes(master, music) {
    if (typeof master === "number") vol.master = master;
    if (typeof music === "number") vol.music = music;
    applyVolumes();
  }

  /* ---------- Ambiente de menú: drone grave + viento ---------- */
  function startAmbient() {
    init();
    if (!ctx || started) return;
    if (ctx.state === "suspended") ctx.resume();
    started = true;

    // Drone: dos osciladores con leve desafinación
    [55, 55.4, 82.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = i === 2 ? 0.04 : 0.08;

      // LFO de volumen para que "respire"
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.03;
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain).connect(g.gain);

      osc.connect(g).connect(musicGain);
      osc.start();
      lfo.start();
      ambientNodes.push(osc, lfo);
    });

    // Viento: ruido blanco filtrado
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 480;
    bandpass.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.015;

    const windLfo = ctx.createOscillator();
    const windLfoGain = ctx.createGain();
    windLfo.frequency.value = 0.08;
    windLfoGain.gain.value = 0.012;
    windLfo.connect(windLfoGain).connect(noiseGain.gain);

    noise.connect(bandpass).connect(noiseGain).connect(musicGain);
    noise.start();
    windLfo.start();
    ambientNodes.push(noise, windLfo);
  }

  function stopAmbient() {
    ambientNodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    ambientNodes = [];
    started = false;
  }

  /* ---------- Efectos de interfaz ---------- */
  function blip(freq, dur, type = "sine", gain = 0.12) {
    init();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g).connect(sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  const hover = () => blip(220, 0.06, "triangle", 0.05);
  const click = () => { blip(140, 0.12, "square", 0.09); blip(90, 0.22, "sine", 0.06); };
  const back = () => blip(110, 0.18, "sine", 0.08);
  const error = () => { blip(80, 0.3, "sawtooth", 0.08); };
  const confirm = () => { blip(330, 0.08, "sine", 0.08); setTimeout(() => blip(440, 0.12, "sine", 0.08), 70); };

  /* ---------- Efectos de juego (2º avance) ---------- */
  const flashlight = () => { blip(1800, 0.03, "square", 0.05); setTimeout(() => blip(900, 0.04, "square", 0.04), 40); };

  // rugido del monstruo: ruido filtrado que baja + sierra grave desafinada
  function roar(volume = 1) {
    init();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime, dur = 1.6;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * volume, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(sfxGain);
    src.start(t);

    [62, 64.5].forEach((f) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.12 * volume, t + 0.1);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(og).connect(sfxGain);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  /* =========================================================
     3ª entrega: música de fondo por escenario, latido de
     tensión y efectos de juego (todo sintetizado en vivo).
     ========================================================= */
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    return s;
  }
  function ready() {
    init();
    if (!ctx) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }
  // golpe de ruido filtrado: base de pasos, golpes y cerraduras
  function burst({ type = "lowpass", freq = 800, q = 1, dur = 0.12, gain = 0.2, sweepTo = null, at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const src = noise();
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfxGain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  // nota con envolvente (campana / piano sintético)
  function tone(freq, { type = "sine", dur = 0.4, gain = 0.1, at = 0, to = null, dest = null } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* ---------- Música de fondo: drone + melodía generativa ---------- */
  const THEMES = {
    // escala menor con 6ª: piano lúgubre en la mansión
    mansion:  { root: 110, scale: [0, 3, 5, 7, 8, 10, 12], every: 1.5, wave: "triangle", drone: [55, 82.4], cut: 1400 },
    // cromático y frío, con zumbido eléctrico de 60 Hz
    hospital: { root: 123.5, scale: [0, 1, 6, 7, 11, 12], every: 2.0, wave: "sine", drone: [61.7, 92.5], cut: 2600, hum: true },
    // pentatónica grave con viento
    forest:   { root: 98, scale: [0, 3, 5, 7, 10], every: 2.4, wave: "sawtooth", drone: [49, 73.4], cut: 650, wind: true },
  };
  let music = null;

  function startMusic(theme) {
    if (!ready()) return;
    stopMusic(true);
    stopAmbient();
    const th = THEMES[theme] || THEMES.mansion;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    bus.connect(musicGain);
    // eco largo para la melodía
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.48;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(bus);
    const nodes = [];

    th.drone.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f; g.gain.value = i ? 0.035 : 0.07;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.07 + i * 0.04; lg.gain.value = 0.025;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(bus);
      o.start(); lfo.start();
      nodes.push(o, lfo);
    });
    if (th.hum) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 60;
      f.type = "lowpass"; f.frequency.value = 240;
      g.gain.value = 0.018;
      o.connect(f).connect(g).connect(bus);
      o.start();
      nodes.push(o);
    }
    if (th.wind) {
      const n = noise(); n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 380; f.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.03;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.09; lg.gain.value = 0.022;
      lfo.connect(lg).connect(g.gain);
      n.connect(f).connect(g).connect(bus);
      n.start(); lfo.start();
      nodes.push(n, lfo);
    }

    let next = ctx.currentTime + 1.5;
    const timer = setInterval(() => {
      if (!ctx) return;
      while (next < ctx.currentTime + 0.6) {
        if (Math.random() > 0.22) {
          const deg = th.scale[Math.floor(Math.random() * th.scale.length)];
          const f = th.root * Math.pow(2, deg / 12) * (Math.random() < 0.3 ? 2 : 1);
          const at = next - ctx.currentTime;
          const filt = ctx.createBiquadFilter();
          filt.type = "lowpass"; filt.frequency.value = th.cut;
          filt.connect(bus); filt.connect(delay);
          tone(f, { type: th.wave, dur: 2.6, gain: 0.05, at, dest: filt });
          tone(f * 2.003, { type: "sine", dur: 1.6, gain: 0.015, at, dest: filt });
        }
        next += th.every * (0.55 + Math.random() * 0.9);
      }
    }, 200);
    music = { bus, nodes, timer, delay };
  }

  function stopMusic(fast) {
    if (!music || !ctx) return;
    const m = music;
    music = null;
    clearInterval(m.timer);
    m.bus.gain.setTargetAtTime(0, ctx.currentTime, fast ? 0.1 : 0.5);
    setTimeout(() => {
      m.nodes.forEach((n) => { try { n.stop(); } catch (e) {} });
      m.bus.disconnect();
    }, fast ? 500 : 2000);
  }

  /* ---------- Tensión: latido + cuerdas disonantes ---------- */
  let tension = 0, beatTimer = null, strings = null;
  function setTension(x) {
    tension = Math.max(0, Math.min(1, x || 0));
    if (!ctx) return;
    if (tension > 0.05 && !beatTimer) {
      const beat = () => {
        if (tension <= 0.05) { beatTimer = null; return; }
        tone(55, { dur: 0.18, gain: 0.32 * tension, to: 38 });
        tone(52, { dur: 0.2, gain: 0.24 * tension, to: 36, at: 0.22 });
        beatTimer = setTimeout(beat, (1.15 - 0.65 * tension) * 1000);
      };
      beat();
    }
    if (!strings && tension > 0.05) {
      strings = ctx.createGain();
      strings.gain.value = 0;
      strings.connect(musicGain);
      [466.2, 493.9, 233.1].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1200;
        o.connect(lp).connect(strings);
        o.start();
      });
    }
    if (strings) strings.gain.setTargetAtTime(Math.pow(Math.max(0, tension - 0.35) / 0.65, 2) * 0.03, ctx.currentTime, 0.3);
  }

  /* ---------- Efectos de juego ---------- */
  const STEP = {
    wood:  { type: "bandpass", freq: 520, q: 1.2, dur: 0.09, gain: 0.22 },
    tile:  { type: "highpass", freq: 1600, q: 0.8, dur: 0.05, gain: 0.16 },
    grass: { type: "lowpass", freq: 1300, q: 0.5, dur: 0.14, gain: 0.14 },
    heavy: { type: "lowpass", freq: 260, q: 1.5, dur: 0.22, gain: 0.4 },
  };
  function step(surface = "wood", vol = 0.6) {
    if (!ready()) return;
    const s = STEP[surface] || STEP.wood;
    burst({ ...s, gain: s.gain * vol, freq: s.freq * (0.9 + Math.random() * 0.2) });
    if (surface === "heavy") tone(48, { dur: 0.25, gain: 0.25 * vol, to: 30 });
    if (surface === "wood" && Math.random() < 0.08) tone(180 + Math.random() * 60, { type: "triangle", dur: 0.35, gain: 0.03 * vol, to: 120 });   // crujido
  }
  function pickup(relic) {
    if (!ready()) return;
    if (relic) [660, 880, 1320].forEach((f, i) => tone(f, { dur: 1.2, gain: 0.09, at: i * 0.09 }));
    else { tone(520, { dur: 0.15, gain: 0.08 }); tone(780, { dur: 0.25, gain: 0.07, at: 0.07 }); }
  }
  function useItem(kind) {
    if (!ready()) return;
    if (kind === "battery") { burst({ type: "highpass", freq: 3000, dur: 0.04, gain: 0.12 }); tone(300, { type: "square", dur: 0.3, gain: 0.04, to: 1200 }); }
    else if (kind === "medkit") { [392, 494, 587].forEach((f) => tone(f, { dur: 0.9, gain: 0.05 })); burst({ type: "bandpass", freq: 2500, dur: 0.2, gain: 0.05 }); }
    else { holy(); }
  }
  function holy() {
    if (!ready()) return;
    burst({ type: "bandpass", freq: 3000, q: 0.7, dur: 0.6, gain: 0.12, sweepTo: 600 });
    for (let i = 0; i < 8; i++) tone(1200 + Math.random() * 1600, { dur: 1.2, gain: 0.025, at: i * 0.05 });
  }
  function hurt() {
    if (!ready()) return;
    burst({ type: "lowpass", freq: 900, dur: 0.3, gain: 0.45 });
    tone(320, { type: "sawtooth", dur: 0.4, gain: 0.12, to: 70 });
    tone(90, { dur: 0.5, gain: 0.3, to: 40 });
  }
  function denied() {
    if (!ready()) return;
    tone(110, { type: "square", dur: 0.12, gain: 0.05 });
    tone(98, { type: "square", dur: 0.16, gain: 0.05, at: 0.14 });
  }
  function unlock() {
    if (!ready()) return;
    burst({ type: "lowpass", freq: 500, dur: 0.15, gain: 0.4 });
    burst({ type: "bandpass", freq: 2200, dur: 0.06, gain: 0.2, at: 0.12 });
    [330, 415, 494, 659].forEach((f, i) => tone(f, { dur: 1.5, gain: 0.06, at: 0.2 + i * 0.08 }));
  }
  function stun() {
    if (!ready()) return;
    holy();
    tone(800, { type: "triangle", dur: 1.5, gain: 0.06, to: 120 });
  }
  function swipe() {
    if (!ready()) return;
    burst({ type: "bandpass", freq: 2400, q: 1.5, dur: 0.22, gain: 0.25, sweepTo: 350 });
  }
  function growl(volume = 0.7) { roar(volume * 0.55); }
  function win() {
    if (!ready()) return;
    [220, 277.2, 329.6, 440, 554.4].forEach((f, i) => tone(f, { type: "triangle", dur: 3.5, gain: 0.07, at: i * 0.12 }));
  }
  function lose() {
    if (!ready()) return;
    roar(1);
    [58, 61.5, 87, 92].forEach((f) => tone(f, { type: "sawtooth", dur: 3, gain: 0.06 }));
  }

  return {
    init, startAmbient, stopAmbient, setVolumes, hover, click, back, error, confirm, flashlight, roar,
    startMusic, stopMusic, setTension, step, pickup, useItem, hurt, denied, unlock, stun, swipe, growl, win, lose,
  };
})();
