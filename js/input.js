/* ============================================================
   input.js — clavier / tactile → callbacks.
   CT.Input.init({ onDir, onAction }) :
     onDir('up'|'down'|'left'|'right'|'cw'|'ccw')   ('cw'/'ccw' = rotation relative)
     onAction('confirm'|'pause'|'mute')

   Schémas tactiles (choisis dans les Options, persistés `ct_controls`) :
     - 'dpad'     : D-pad tactile à l'écran (boutons ▲◀▶▼).
     - 'swipe'    : glisser le doigt sur le plateau (continu, ré-ancré → pilotage fluide).
     - 'zones'    : taper la moitié gauche/droite → tourner à gauche/droite (relatif).
     - 'joystick' : un joystick flottant apparaît sous le doigt, on l'incline pour diriger.
   ============================================================ */
window.CT = window.CT || {};

CT.Input = (function () {
  let handlers = { onDir: function () {}, onAction: function () {} };

  // J1 = flèches ; J2 = WASD / ZQSD (azerty). En solo, les deux pilotent l'unique serpent ;
  // en mode 2 joueurs, le groupe 'p2' pilote le second serpent.
  const KEY_DIR_P1 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const KEY_DIR_P2 = { w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left' };

  const CKEY = 'ct_controls';
  const SCHEMES = ['dpad', 'swipe', 'zones', 'joystick'];
  function loadScheme() { try { const s = localStorage.getItem(CKEY); return SCHEMES.indexOf(s) >= 0 ? s : 'swipe'; } catch (e) { return 'swipe'; } }
  let scheme = loadScheme();

  let dpadEl = null, joyEl = null, joyKnob = null;
  const THRESH = 22;   // px de glissé avant de déclencher un virage (swipe / joystick)
  const TAP_MAX = 16;  // px : en dessous = tap (zones)
  const JOY_R = 46;    // rayon max du knob du joystick

  function onKey(e) {
    // Ne pas capturer les touches quand l'utilisateur saisit du texte (champs pseudo / opérateur).
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (KEY_DIR_P1[e.key]) { e.preventDefault(); handlers.onDir(KEY_DIR_P1[e.key], 'p1'); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEY_DIR_P2[k]) { e.preventDefault(); handlers.onDir(KEY_DIR_P2[k], 'p2'); return; }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); handlers.onAction('confirm'); }
    else if (k === 'p' || k === 'Escape') { handlers.onAction('pause'); }
    else if (k === 'm') { handlers.onAction('mute'); }
  }

  function dirFromDelta(dx, dy) {
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }

  /* Boutons D-pad (actifs quand le D-pad est visible) */
  function bindDpad(dpad) {
    dpad.querySelectorAll('[data-dir]').forEach((btn) => {
      const fire = (e) => { e.preventDefault(); handlers.onDir(btn.dataset.dir, 'p1'); };
      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('mousedown', fire);
    });
  }

  /* Tactile sur le plateau — le comportement dépend du schéma courant */
  let st = { active: false };
  function onStart(e) {
    if (scheme === 'dpad') return;                 // le D-pad gère ses propres boutons
    const t = e.changedTouches[0];
    st = { active: true, sx: t.clientX, sy: t.clientY, ox: t.clientX, oy: t.clientY, lastDir: null, moved: false };
    if (scheme === 'joystick' && joyEl) {
      joyEl.style.left = t.clientX + 'px'; joyEl.style.top = t.clientY + 'px';
      joyEl.classList.remove('hidden');
      if (joyKnob) joyKnob.style.transform = 'translate(-50%,-50%)';
    }
  }
  function onMove(e) {
    if (!st.active) return;
    const t = e.changedTouches[0];
    if (scheme !== 'swipe' && scheme !== 'joystick') return;
    const dx = t.clientX - st.ox, dy = t.clientY - st.oy;
    if (scheme === 'joystick' && joyKnob) {          // le knob suit le doigt (clampé au rayon)
      const m = Math.hypot(dx, dy) || 1, k = Math.min(1, JOY_R / m);
      joyKnob.style.transform = 'translate(calc(-50% + ' + (dx * k).toFixed(1) + 'px), calc(-50% + ' + (dy * k).toFixed(1) + 'px))';
    }
    if (Math.hypot(dx, dy) >= THRESH) {
      const d = dirFromDelta(dx, dy);
      if (d !== st.lastDir) { handlers.onDir(d, 'p1'); st.lastDir = d; }
      st.ox = t.clientX; st.oy = t.clientY;          // ré-ancre → pilotage CONTINU (on garde le doigt posé)
      st.moved = true;
    }
  }
  function onEnd(e) {
    if (!st.active) return;
    st.active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.sx, dy = t.clientY - st.sy;
    const dist = Math.hypot(dx, dy);
    if (scheme === 'zones') {
      if (dist <= TAP_MAX) handlers.onDir(t.clientX < window.innerWidth / 2 ? 'ccw' : 'cw', 'p1');  // tap L/R = rotation
      else handlers.onDir(dirFromDelta(dx, dy), 'p1');                                              // glissé = virage direct
    } else if (scheme === 'swipe' && !st.moved && dist >= THRESH) {
      handlers.onDir(dirFromDelta(dx, dy), 'p1');    // flick rapide (aucun onMove déclenché)
    }
    if (scheme === 'joystick' && joyEl) joyEl.classList.add('hidden');
  }

  function applyScheme() {
    if (dpadEl) dpadEl.classList.toggle('hidden', scheme !== 'dpad');
    if (joyEl) joyEl.classList.add('hidden');
  }

  return {
    init(opts) {
      handlers = Object.assign(handlers, opts || {});
      window.addEventListener('keydown', onKey);
      const canvas = document.getElementById('game');
      dpadEl = document.getElementById('dpad');
      joyEl = document.getElementById('joystick');
      joyKnob = joyEl ? joyEl.querySelector('.joy-knob') : null;
      if (dpadEl) bindDpad(dpadEl);
      if (canvas) {
        canvas.addEventListener('touchstart', onStart, { passive: true });
        canvas.addEventListener('touchmove', onMove, { passive: true });
        canvas.addEventListener('touchend', onEnd, { passive: true });
      }
      applyScheme();
    },
    getScheme() { return scheme; },
    setScheme(s) {
      if (SCHEMES.indexOf(s) < 0) return;
      scheme = s;
      try { localStorage.setItem(CKEY, s); } catch (e) {}
      applyScheme();
    },
    SCHEMES,
  };
})();
