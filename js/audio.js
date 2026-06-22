/* ============================================================
   audio.js — sons synthétisés (WebAudio). Aucun fichier audio.
   CT.Audio.unlock() doit être appelé sur un geste utilisateur.
   ============================================================ */
window.CT = window.CT || {};

CT.Audio = (function () {
  let ctx = null;
  let muted = (function () { try { return localStorage.getItem('ct_mute') === '1'; } catch (e) { return false; } })();
  let musicOn = (function () { try { return localStorage.getItem('ct_music') === '1'; } catch (e) { return false; } })();
  let music = null; // nœuds de la musique d'ambiance (ou null si arrêtée)

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (musicOn && !muted) startMusic();
  }

  /* ---- musique d'ambiance : pad génératif doux, faible volume, opt-in ---- */
  const CHORDS = [
    [220.00, 261.63, 329.63],  // Am
    [174.61, 220.00, 261.63],  // F
    [196.00, 246.94, 293.66],  // G
    [261.63, 329.63, 392.00],  // C
  ];
  function startMusic() {
    if (!ctx || music || muted || !musicOn) return;
    const master = ctx.createGain(); master.gain.value = 0.0001;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 3;
    filter.connect(master);
    // LFO lent sur la coupure du filtre (mouvement)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(filter.frequency); lfo.start();
    // 3 voix de pad + 1 sub
    const oscs = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = i === 3 ? 'sine' : 'triangle';
      const g = ctx.createGain(); g.gain.value = i === 3 ? 0.5 : 0.3;
      o.connect(g).connect(filter); o.start(); oscs.push(o);
    }
    master.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 2.5); // fondu entrant
    music = { master, filter, lfo, oscs, ci: 0, timer: 0 };
    const apply = () => {
      if (!music) return;
      const c = CHORDS[music.ci % CHORDS.length]; music.ci++;
      const t = ctx.currentTime;
      music.oscs[0].frequency.setTargetAtTime(c[0], t, 0.9);
      music.oscs[1].frequency.setTargetAtTime(c[1], t, 0.9);
      music.oscs[2].frequency.setTargetAtTime(c[2], t, 0.9);
      music.oscs[3].frequency.setTargetAtTime(c[0] / 2, t, 0.9);
    };
    apply();
    music.timer = setInterval(apply, 9000);
  }
  function stopMusic() {
    if (!music) return;
    const m = music; music = null;
    clearInterval(m.timer);
    const t = ctx.currentTime;
    try {
      m.master.gain.cancelScheduledValues(t);
      m.master.gain.setValueAtTime(Math.max(m.master.gain.value, 0.0001), t);
      m.master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    } catch (e) {}
    setTimeout(() => { try { m.lfo.stop(); m.oscs.forEach((o) => o.stop()); } catch (e) {} }, 1400);
  }

  /* Bip enveloppé. type: sine/square/triangle/sawtooth */
  function tone(freq, dur, type, gain, when) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* Glissando (pour la charge / level up) */
  function sweep(f1, f2, dur, type, gain) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    setMuted(v) { muted = v; if (muted) stopMusic(); else if (musicOn) startMusic(); },
    isMuted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('ct_mute', muted ? '1' : '0'); } catch (e) {}
      if (muted) stopMusic(); else if (musicOn) startMusic();
      return muted;
    },
    isMusicOn() { return musicOn; },
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem('ct_music', musicOn ? '1' : '0'); } catch (e) {}
      if (musicOn) { unlock(); startMusic(); } else stopMusic();
      return musicOn;
    },

    pickup(combo) {       // batterie ramassée — la hauteur monte avec le combo (+1 demi-ton/palier)
      const step = Math.min(Math.max((combo || 1) - 1, 0), 8);   // 0..8 (combo max ×9)
      const mul = Math.pow(2, step / 12);
      tone(740 * mul, 0.09, 'square', 0.12);
      tone(1180 * mul, 0.12, 'square', 0.10, 0.05);
    },
    turn() {              // léger clic de direction (discret)
      tone(420, 0.03, 'sine', 0.04);
    },
    appear() {            // apparition d'un power-up : petit « ding » discret (attire l'œil)
      tone(880, 0.05, 'sine', 0.06);
      tone(1320, 0.07, 'sine', 0.05, 0.04);
    },
    smash() {             // mur détruit au bouclier : impact court et sec
      tone(180, 0.08, 'square', 0.14);
      tone(90, 0.13, 'sawtooth', 0.12, 0.02);
    },
    connect() {           // câble qui se branche (cinématique)
      tone(300, 0.06, 'square', 0.14);
      sweep(300, 900, 0.18, 'sawtooth', 0.12);
    },
    charge() {            // montée de charge
      sweep(420, 1320, 0.9, 'triangle', 0.16);
    },
    levelup() {           // fanfare courte
      const base = [523, 659, 784, 1047];
      base.forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.1));
    },
    bonus() {             // batterie dorée : arpège brillant
      const seq = [523, 659, 784, 1047, 1319];
      seq.forEach((f, i) => tone(f, 0.13, 'square', 0.13, i * 0.05));
      sweep(900, 1600, 0.25, 'triangle', 0.1);
    },
    shield() {            // bouclier : nappe douce qui monte
      const seq = [392, 523, 659, 880];
      seq.forEach((f, i) => tone(f, 0.16, 'sine', 0.13, i * 0.05));
      sweep(500, 1100, 0.35, 'sine', 0.08);
    },
    magnet() {            // aimant : vibrato grave « magnétique »
      sweep(220, 660, 0.18, 'sawtooth', 0.12);
      tone(330, 0.1, 'triangle', 0.12, 0.06);
      tone(660, 0.12, 'triangle', 0.12, 0.14);
    },
    double() {            // double points : « ka-ching » qui double (deux paliers)
      tone(880, 0.10, 'square', 0.12);
      tone(1320, 0.10, 'square', 0.12, 0.05);
      tone(880, 0.10, 'square', 0.11, 0.16);
      tone(1760, 0.16, 'square', 0.12, 0.21);
    },
    achievement() {       // succès débloqué : petite fanfare cristalline brillante
      const seq = [659, 988, 1319, 1760];   // montée brillante (E5-B5-E6-A6)
      seq.forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, i * 0.06));
      tone(1319, 0.30, 'sine', 0.07, 0.26);  // traîne scintillante
    },
    gameover() {
      sweep(440, 90, 0.7, 'sawtooth', 0.2);
    },
    ui() {
      tone(620, 0.05, 'sine', 0.1);
    },
  };
})();
