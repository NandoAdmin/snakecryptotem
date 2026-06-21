/* ============================================================
   achievements.js — Succès / Trophées (CT.Achievements).
   Persistant (localStorage `ct_ach`). Donne des objectifs de collection
   → rejouabilité. Le jeu pousse des stats cumulées via update({...}) ;
   le module débloque les succès atteints et renvoie les nouveaux.
   ============================================================ */
window.CT = window.CT || {};

CT.Achievements = (function () {
  const KEY = 'ct_ach';

  const DEFS = [
    { id: 'cable',     icon: '🔌', name: 'Premier câble', desc: 'Ramasser 10 batteries (au total)', test: (s) => s.totalBat >= 10 },
    { id: 'centurion', icon: '🔋', name: 'Centurion',     desc: 'Ramasser 100 batteries (au total)', test: (s) => s.totalBat >= 100 },
    { id: 'lvl5',      icon: '🗺️', name: 'Explorateur',   desc: 'Atteindre le niveau 5',            test: (s) => s.maxLevel >= 5 },
    { id: 'lvl10',     icon: '🏅', name: 'Vétéran',       desc: 'Atteindre le niveau 10',           test: (s) => s.maxLevel >= 10 },
    { id: 'lvl15',     icon: '🚀', name: 'Ascension',     desc: 'Atteindre le niveau 15',           test: (s) => s.maxLevel >= 15 },
    { id: 'combo9',    icon: '🔥', name: 'Combo Roi',     desc: 'Atteindre un combo ×9',            test: (s) => s.maxCombo >= 9 },
    { id: 'bonus25',   icon: '⚡', name: 'Branché',       desc: 'Ramasser 25 power-ups',            test: (s) => s.totalBonus >= 25 },
    { id: 'survive',   icon: '⏱️', name: 'Increvable',    desc: 'Survivre 3 min en une partie',     test: (s) => s.maxDurationMs >= 180000 },
    { id: 'survive5',  icon: '🏃', name: 'Marathonien',   desc: 'Survivre 5 min en une partie',     test: (s) => s.maxDurationMs >= 300000 },
    { id: 'score5k',   icon: '💯', name: 'Haute Tension', desc: '5 000 points en une partie',       test: (s) => s.bestScore >= 5000 },
    { id: 'mecene',    icon: '🔬', name: 'Mécène du Labo', desc: 'Verser 5 000 points au Labo (cumul)', test: (s) => s.bankedPts >= 5000 },
    { id: 'games10',   icon: '🎰', name: 'Habitué',       desc: 'Jouer 10 parties',                 test: (s) => (s.games || 0) >= 10 },
  ];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function state() {
    const s = load();
    s.stats = s.stats || { totalBat: 0, totalBonus: 0, maxCombo: 0, maxLevel: 1, bestScore: 0, maxDurationMs: 0, bankedPts: 0, games: 0 };
    if (s.stats.games == null) s.stats.games = 0; // rétro-compat anciennes sauvegardes
    s.unlocked = s.unlocked || {};
    return s;
  }

  // Met à jour les stats (delta cumulés / maxima) et renvoie les succès nouvellement débloqués.
  function update(delta) {
    const s = state(), st = s.stats;
    if (delta.bat) st.totalBat += delta.bat;
    if (delta.bonus) st.totalBonus += delta.bonus;
    if (delta.combo) st.maxCombo = Math.max(st.maxCombo, delta.combo);
    if (delta.level) st.maxLevel = Math.max(st.maxLevel, delta.level);
    if (delta.score) st.bestScore = Math.max(st.bestScore, delta.score);
    if (delta.durationMs) st.maxDurationMs = Math.max(st.maxDurationMs, delta.durationMs);
    if (delta.bankPts) st.bankedPts += delta.bankPts;
    if (delta.game) st.games += delta.game;
    const newly = [];
    DEFS.forEach((d) => { if (!s.unlocked[d.id] && d.test(st)) { s.unlocked[d.id] = Date.now(); newly.push(d); } });
    save(s);
    return newly;
  }

  function all() { const s = state(); return DEFS.map((d) => ({ id: d.id, icon: d.icon, name: d.name, desc: d.desc, unlocked: !!s.unlocked[d.id] })); }
  function count() { const s = state(); return { unlocked: Object.keys(s.unlocked).length, total: DEFS.length }; }
  function stats() { return Object.assign({}, state().stats); } // copie des stats cumulées (écran Statistiques)
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  return { DEFS, update, all, count, stats, reset };
})();
