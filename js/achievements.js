/* ============================================================
   achievements.js — Quêtes à paliers (CT.Achievements).
   Persistant (localStorage `ct_ach`). Chaque quête garde son thème mais
   compte 5 PALIERS de difficulté croissante (1 étoile chacun) :
     Bronze · Argent · Or · Platine · Diamant.
   Le jeu pousse des stats cumulées via update({...}) ; le module renvoie
   les paliers nouvellement franchis (pour la notification toast).
   ============================================================ */
window.CT = window.CT || {};

CT.Achievements = (function () {
  const KEY = 'ct_ach';

  // Médailles = nom du palier (index 0→4 = palier 1→5 = nombre d'étoiles).
  const MEDALS = ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant'];

  // Formateurs de valeur (affichage).
  const fNum = (v) => (v || 0).toLocaleString('fr-FR');
  const fMin = (ms) => {
    const m = (ms || 0) / 60000;
    return (Number.isInteger(m) ? m : Math.round(m * 10) / 10) + ' min';
  };
  const fCombo = (v) => '×' + (v || 0);

  // Quêtes : { id, icon, name, metric (clé de stats), tiers[5] croissants, fmt }.
  const QUESTS = [
    { id: 'batteries', icon: '🔋', name: 'Batteries ramassées', metric: 'totalBat',     tiers: [50, 250, 1000, 5000, 15000],            fmt: fNum },
    { id: 'niveau',    icon: '🗺️', name: 'Niveau atteint',      metric: 'maxLevel',     tiers: [5, 10, 15, 20, 30],                      fmt: fNum },
    { id: 'combo',     icon: '🔥', name: 'Combo max',           metric: 'maxCombo',     tiers: [3, 5, 7, 8, 9],                          fmt: fCombo },
    { id: 'powerups',  icon: '⚡', name: 'Power-ups ramassés',  metric: 'totalBonus',   tiers: [25, 100, 300, 750, 2000],                fmt: fNum },
    { id: 'survie',    icon: '⏱️', name: 'Survie en une partie', metric: 'maxDurationMs', tiers: [60000, 180000, 300000, 600000, 1200000], fmt: fMin },
    { id: 'score',     icon: '💯', name: 'Meilleur score',      metric: 'bestScore',    tiers: [5000, 25000, 75000, 200000, 500000],     fmt: fNum },
    { id: 'labo',      icon: '🔬', name: 'Mécène du Labo',      metric: 'bankedPts',    tiers: [5000, 50000, 200000, 1000000, 5000000],  fmt: fNum },
    { id: 'parties',   icon: '🎰', name: 'Parties jouées',      metric: 'games',        tiers: [10, 50, 150, 400, 1000],                 fmt: fNum },
    { id: 'casse',     icon: '🧱', name: 'Ralph la Casse',      metric: 'wallsSmashed', tiers: [5, 25, 100, 250, 500],                   fmt: fNum },
    { id: 'snakator',  icon: '🐍', name: 'Tueur de Snakator',   metric: 'snakatorBlocks', tiers: [5, 25, 75, 200, 500],                 fmt: fNum },
  ];
  const TIERS_PER_QUEST = 5;

  function tierOf(q, st) {
    const v = st[q.metric] || 0;
    let t = 0;
    for (let i = 0; i < q.tiers.length; i++) if (v >= q.tiers[i]) t = i + 1;
    return t;
  }

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function state() {
    const s = load();
    s.stats = s.stats || { totalBat: 0, totalBonus: 0, maxCombo: 0, maxLevel: 1, bestScore: 0, maxDurationMs: 0, bankedPts: 0, games: 0, wallsSmashed: 0, snakatorBlocks: 0 };
    if (s.stats.games == null) s.stats.games = 0; // rétro-compat
    if (s.stats.wallsSmashed == null) s.stats.wallsSmashed = 0; // rétro-compat
    if (s.stats.snakatorBlocks == null) s.stats.snakatorBlocks = 0; // rétro-compat
    // Paliers déjà atteints : initialisés depuis les stats existantes (sans toast à la 1ʳᵉ fois).
    if (!s.tiers) { s.tiers = {}; QUESTS.forEach((q) => { s.tiers[q.id] = tierOf(q, s.stats); }); }
    return s;
  }

  // Met à jour les stats (cumuls / maxima) et renvoie les PALIERS nouvellement franchis.
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
    if (delta.walls) st.wallsSmashed += delta.walls;
    if (delta.snakator) st.snakatorBlocks += delta.snakator;
    const newly = [];
    QUESTS.forEach((q) => {
      const cur = s.tiers[q.id] || 0;
      const nt = tierOf(q, st);
      for (let t = cur + 1; t <= nt; t++) {
        newly.push({ id: q.id, icon: q.icon, name: q.name + ' — ' + MEDALS[t - 1], medal: MEDALS[t - 1], tier: t });
      }
      if (nt > cur) s.tiers[q.id] = nt;
    });
    save(s);
    return newly;
  }

  // État de chaque quête pour l'UI (palier atteint, médaille, prochain seuil).
  function all() {
    const s = state();
    return QUESTS.map((q) => {
      const tier = s.tiers[q.id] || 0;
      const v = s.stats[q.metric] || 0;
      const done = tier >= TIERS_PER_QUEST;
      return {
        id: q.id, icon: q.icon, name: q.name,
        tier, max: TIERS_PER_QUEST,
        medal: tier > 0 ? MEDALS[tier - 1] : null,
        nextMedal: done ? null : MEDALS[tier],
        valueFmt: q.fmt(v),
        nextDesc: done ? null : q.fmt(q.tiers[tier]),
        done,
      };
    });
  }

  // Total d'étoiles gagnées / total possible (toutes quêtes × 5 paliers).
  function count() {
    const s = state();
    let earned = 0;
    QUESTS.forEach((q) => { earned += (s.tiers[q.id] || 0); });
    return { unlocked: earned, total: QUESTS.length * TIERS_PER_QUEST };
  }

  function stats() { return Object.assign({}, state().stats); } // stats cumulées (écran Statistiques)
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  return { QUESTS, MEDALS, update, all, count, stats, reset };
})();
