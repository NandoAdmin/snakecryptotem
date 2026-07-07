/* ============================================================
   access.js — options d'ACCESSIBILITÉ (confort visuel).
   Chargé juste après config.js → applique les préférences AVANT que game.js
   ne capture le thème. Deux options persistées (localStorage `ct_access`) :
     - daltonien : le rouge « danger » devient ORANGE (bien plus distinct du vert
       « charge » pour les deutéranopes/protanopes), l'ambre vire au jaune vif.
     - contraste élevé : fond plus sombre + grille plus visible (écrans de bar en
       plein jour).
   Tout passe par CONFIG.theme (rebrandable) : on MUTE les propriétés (jamais on
   ne remplace l'objet) → game.js lit `T.*` en direct, et on reflète les variables
   CSS de l'UI. Neutre par défaut.
   ============================================================ */
window.CT = window.CT || {};

CT.Access = (function () {
  const KEY = 'ct_access';
  const T = CT.CONFIG.theme;

  // valeurs d'origine (pour restaurer proprement en désactivant une option)
  const BASE = {};
  ['danger', 'amber', 'grid', 'bg0', 'bg1', 'textDim'].forEach((k) => { BASE[k] = T[k]; });

  // daltonien : danger orange vif, ambre jaune (séparés du vert charge + l'un de l'autre)
  const COLORBLIND = { danger: '#ff8a1e', amber: '#ffe14d' };
  // contraste élevé : fond quasi noir + grille nettement plus marquée
  const CONTRAST = { grid: 'rgba(255,255,255,0.11)', bg0: '#010a0c', bg1: '#03181d', textDim: '#a6d6d9' };

  let state = load();

  function load() {
    try { return Object.assign({ colorblind: false, contrast: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); }
    catch (e) { return { colorblind: false, contrast: false }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

  function apply() {
    Object.keys(BASE).forEach((k) => { T[k] = BASE[k]; });   // repart de la base
    if (state.colorblind) Object.assign(T, COLORBLIND);
    if (state.contrast) Object.assign(T, CONTRAST);
    syncCss();
  }

  // reflète les couleurs modifiées sur les variables CSS de l'UI (:root)
  function syncCss() {
    const r = document.documentElement && document.documentElement.style;
    if (!r) return;
    r.setProperty('--danger', T.danger);
    r.setProperty('--amber', T.amber);
    r.setProperty('--bg0', T.bg0);
    r.setProperty('--bg1', T.bg1);
    r.setProperty('--text-dim', T.textDim);
  }

  apply();   // applique les préférences dès le chargement (avant game.js)

  return {
    get(k) { return !!state[k]; },
    toggle(k) { state[k] = !state[k]; save(); apply(); return state[k]; },
    isColorblind() { return !!state.colorblind; },
    isContrast() { return !!state.contrast; },
  };
})();
