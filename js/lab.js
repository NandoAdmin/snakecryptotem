/* ============================================================
   lab.js — Laboratoire Cryptotem (méta-progression / R&D).
   Persistant (localStorage `ct_lab`).

   Boucle : chaque partie verse les batteries 🔋 + points ⚡ collectés dans la
   banque → on dépense (batteries + points) pour lancer UNE recherche qui prend
   du TEMPS RÉEL (même hors-jeu) → une fois terminée + récupérée, l'amélioration
   s'applique définitivement et modifie le gameplay (CT.Lab.effects()).
   ============================================================ */
window.CT = window.CT || {};

CT.Lab = (function () {
  const KEY = 'ct_lab';

  // Arbre d'améliorations. cost(l)/time(l) = coût/temps pour passer du niveau l à l+1.
  const UPGRADES = {
    surtension: {
      name: 'Surtension', icon: '⚡', max: 5,
      desc: (l) => '+' + (l * 10) + '% de points par batterie',
      cost: (l) => ({ bat: 15 * (l + 1), pts: 600 * (l + 1) }), time: (l) => (20 + l * 25) * 1000,
    },
    bouclier: {
      name: 'Bouclier renforcé', icon: '🛡️', max: 5,
      desc: (l) => '+' + l + ' s de bouclier',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => (30 + l * 30) * 1000,
    },
    surcharge: {
      name: 'Surcharge prolongée', icon: '🌀', max: 5,
      desc: (l) => '+' + l + ' s de surcharge (ralenti)',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => (30 + l * 30) * 1000,
    },
    aimant: {
      name: 'Aimant longue portée', icon: '🧲', max: 5,
      desc: (l) => '+' + l + ' s d\'aimant',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => (30 + l * 30) * 1000,
    },
    double: {
      name: 'Double prolongé', icon: '×2', max: 5,
      desc: (l) => '+' + l + ' s de double points',
      cost: (l) => ({ bat: 14 * (l + 1), pts: 600 * (l + 1) }), time: (l) => (35 + l * 30) * 1000,
    },
    combo: {
      name: 'Combo facile', icon: '🔥', max: 4,
      desc: (l) => '+' + (l * 0.5) + ' s de fenêtre de combo',
      cost: (l) => ({ bat: 18 * (l + 1), pts: 700 * (l + 1) }), time: (l) => (40 + l * 40) * 1000,
    },
    frequence: {
      name: 'R&D power-ups', icon: '🔬', max: 3,
      desc: (l) => 'power-ups +' + l + ' en fréquence',
      cost: (l) => ({ bat: 25 * (l + 1), pts: 1000 * (l + 1) }), time: (l) => (60 + l * 60) * 1000,
    },
  };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function state() {
    const s = load();
    s.wallet = s.wallet || { bat: 0, pts: 0 };
    s.up = s.up || {};
    s.research = s.research || null;
    return s;
  }

  function level(key) { return state().up[key] || 0; }
  function wallet() { return state().wallet; }

  // Verse les ressources d'une partie dans la banque.
  function bank(run) {
    const s = state();
    s.wallet.bat += Math.max(0, run.batteries || 0);
    s.wallet.pts += Math.max(0, run.points || 0);
    save(s);
  }

  function canResearch(key) {
    const s = state();
    if (s.research) return { ok: false, reason: 'recherche en cours' };
    const u = UPGRADES[key]; const l = level(key);
    if (l >= u.max) return { ok: false, reason: 'niveau max' };
    const c = u.cost(l);
    if (s.wallet.bat < c.bat || s.wallet.pts < c.pts) return { ok: false, reason: 'ressources insuffisantes' };
    return { ok: true, cost: c, time: u.time(l) };
  }

  function startResearch(key) {
    const r = canResearch(key);
    if (!r.ok) return r;
    const s = state();
    s.wallet.bat -= r.cost.bat; s.wallet.pts -= r.cost.pts;
    s.research = { key, endsAt: Date.now() + r.time, durationMs: r.time };
    save(s);
    return { ok: true };
  }

  function research() { return state().research; }
  function researchRemaining() { const r = state().research; return r ? Math.max(0, r.endsAt - Date.now()) : 0; }
  function isReady() { const r = state().research; return !!r && Date.now() >= r.endsAt; }

  // Récupère une recherche terminée → applique le niveau.
  function claim() {
    const s = state(); const r = s.research;
    if (!r || Date.now() < r.endsAt) return { ok: false };
    s.up[r.key] = (s.up[r.key] || 0) + 1;
    s.research = null;
    save(s);
    return { ok: true, key: r.key, level: s.up[r.key] };
  }

  // Modificateurs de gameplay dérivés des niveaux d'améliorations.
  function effects() {
    return {
      pointMult: 1 + 0.10 * level('surtension'),
      shieldBonus: level('bouclier'),
      slowBonus: level('surcharge'),
      magnetBonus: level('aimant'),
      doubleBonus: level('double'),
      comboWindowBonus: 0.5 * level('combo'),
      bonusEveryDelta: level('frequence'),
    };
  }

  // Remet toute la progression à zéro (borne partagée / nouveau joueur).
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Modificateurs neutres (avant chargement / fallback).
  function neutral() {
    return { pointMult: 1, shieldBonus: 0, slowBonus: 0, magnetBonus: 0, doubleBonus: 0, comboWindowBonus: 0, bonusEveryDelta: 0 };
  }

  return {
    UPGRADES, level, wallet, bank,
    canResearch, startResearch, research, researchRemaining, isReady, claim,
    effects, neutral, reset,
  };
})();
