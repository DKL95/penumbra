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

  return { init, startAmbient, stopAmbient, setVolumes, hover, click, back, error, confirm, flashlight, roar };
})();
