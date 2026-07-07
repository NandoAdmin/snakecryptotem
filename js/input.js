/* ============================================================
   input.js — clavier / swipe / D-pad → callbacks.
   CT.Input.init({ onDir, onAction }) :
     onDir('up'|'down'|'left'|'right')
     onAction('confirm'|'pause'|'mute')
   ============================================================ */
window.CT = window.CT || {};

CT.Input = (function () {
  let handlers = { onDir: function () {}, onAction: function () {} };

  // J1 = flèches ; J2 = WASD / ZQSD (azerty). En solo, les deux pilotent l'unique serpent ;
  // en mode 2 joueurs, le groupe 'p2' pilote le second serpent.
  const KEY_DIR_P1 = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const KEY_DIR_P2 = { w: 'up', s: 'down', a: 'left', d: 'right', z: 'up', q: 'left' };

  function onKey(e) {
    // Ne pas capturer les touches quand l'utilisateur saisit du texte
    // (ex. champ pseudo de l'écran de fin) : sinon « a/q/z/w/s/d » (directions)
    // seraient avalées par preventDefault, et « p/m » déclencheraient pause/mute.
    const el = e.target;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

    if (KEY_DIR_P1[e.key]) { e.preventDefault(); handlers.onDir(KEY_DIR_P1[e.key], 'p1'); return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEY_DIR_P2[k]) { e.preventDefault(); handlers.onDir(KEY_DIR_P2[k], 'p2'); return; }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); handlers.onAction('confirm'); }
    else if (k === 'p' || k === 'Escape') { handlers.onAction('pause'); }
    else if (k === 'm') { handlers.onAction('mute'); }
  }

  /* Swipe sur le canvas */
  function bindSwipe(el) {
    let sx = 0, sy = 0, active = false;
    el.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; active = true;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return; // tap, pas swipe
      if (Math.abs(dx) > Math.abs(dy)) handlers.onDir(dx > 0 ? 'right' : 'left', 'p1');
      else handlers.onDir(dy > 0 ? 'down' : 'up', 'p1');
    }, { passive: true });
  }

  /* Boutons D-pad */
  function bindDpad(dpad) {
    dpad.querySelectorAll('[data-dir]').forEach((btn) => {
      const fire = (e) => { e.preventDefault(); handlers.onDir(btn.dataset.dir, 'p1'); };
      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('mousedown', fire);
    });
  }

  return {
    init(opts) {
      handlers = Object.assign(handlers, opts || {});
      window.addEventListener('keydown', onKey);
      const canvas = document.getElementById('game');
      const dpad = document.getElementById('dpad');
      if (canvas) bindSwipe(canvas);
      if (dpad) bindDpad(dpad);

      // Affiche le D-pad sur appareils tactiles / petits écrans
      const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (dpad && (touch || window.innerWidth < 820)) dpad.classList.remove('hidden');
    },
  };
})();
