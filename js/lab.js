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

  // Temps de recherche selon le NIVEAU visé (secondes) : 30s · 1min · 3min · 5min · 10min
  // · 30min · 1h · 2h · 4h · 8h · 12h · 16h · 24h · 30h · 36h … puis +6 h par niveau au-delà.
  const RESEARCH_TIME_S = [30, 60, 180, 300, 600, 1800, 3600, 7200, 14400, 28800, 43200, 57600, 86400, 108000, 129600];
  function researchTimeMs(targetLevel) {
    const last = RESEARCH_TIME_S.length - 1, i = Math.max(0, targetLevel - 1);
    const s = i <= last ? RESEARCH_TIME_S[i] : RESEARCH_TIME_S[last] + (i - last) * 21600;
    return s * 1000;
  }

  // Arbre d'améliorations. cost(l) = coût pour passer du niveau l à l+1 ; le TEMPS dépend
  // du NIVEAU visé (l+1) via le barème partagé RESEARCH_TIME_S.
  const UPGRADES = {
    surtension: {
      name: 'Surtension', icon: '⚡', max: 5,
      desc: (l) => '+' + (l * 10) + '% de points par batterie',
      cost: (l) => ({ bat: 15 * (l + 1), pts: 600 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    bouclier: {
      name: 'Bouclier renforcé', icon: '🛡️', max: 5,
      desc: (l) => '+' + (l * 0.5) + ' s de bouclier',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    surcharge: {
      name: 'Surcharge prolongée', icon: '🌀', max: 5,
      desc: (l) => '+' + l + ' s de surcharge (ralenti)',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    aimant: {
      name: 'Aimant longue portée', icon: '🧲', max: 5,
      desc: (l) => '+' + l + ' s d\'aimant',
      cost: (l) => ({ bat: 12 * (l + 1), pts: 500 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    double: {
      name: 'Double prolongé', icon: '×2', max: 5,
      desc: (l) => '+' + l + ' s de double points',
      cost: (l) => ({ bat: 14 * (l + 1), pts: 600 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    combo: {
      name: 'Combo facile', icon: '🔥', max: 4,
      desc: (l) => '+' + (l * 0.5) + ' s de fenêtre de combo',
      cost: (l) => ({ bat: 18 * (l + 1), pts: 700 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    frequence: {
      name: 'R&D power-ups', icon: '🔬', max: 3,
      desc: (l) => 'power-ups +' + l + ' en fréquence',
      cost: (l) => ({ bat: 25 * (l + 1), pts: 1000 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    // — nouvelles fonctionnalités —
    rendement: {
      name: 'Rendement R&D', icon: '📈', max: 15,
      desc: (l) => '+' + (l * 5) + '% de ressources versées au Labo',
      cost: (l) => ({ bat: 30 * (l + 1), pts: 1200 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    depart: {
      name: 'Départ protégé', icon: '🦺', max: 5,
      desc: (l) => '+' + (l * 0.5) + ' s de bouclier en début de niveau',
      cost: (l) => ({ bat: 20 * (l + 1), pts: 800 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    inflation: {
      name: 'Inflation', icon: '🪙', max: 15,
      desc: (l) => '+' + (l * 5) + '% de pièces par objet ramassé',
      // coûte UNIQUEMENT des pièces (⚡) : 100 · 250 · 500 · 750 · 1000 …
      cost: (l) => ({ bat: 0, pts: l === 0 ? 100 : 250 * l }), time: (l) => researchTimeMs(l + 1),
    },
    chance: {
      name: 'Coup de chance', icon: '🍀', max: 10,
      desc: (l) => (l * 5) + '% de chance de ×2 (pièces + batterie) par objet',
      cost: (l) => ({ bat: 20 * (l + 1), pts: 1000 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    doublecoupe: {
      name: 'Double coupe', icon: '✂️', max: 10,
      desc: (l) => (l * 5) + '% de chance d\'enlever 2 blocs (au lieu d\'1) au coupe-câble',
      cost: (l) => ({ bat: 18 * (l + 1), pts: 900 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    // — survie / économie / méta (n'affectent PAS le score par batterie → plafond anti-triche intact) —
    antivirus: {
      name: 'Antivirus', icon: '🦠', max: 10,
      desc: (l) => (l * 5) + '% de chance de neutraliser un malus ramassé',
      cost: (l) => ({ bat: 16 * (l + 1), pts: 800 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    phenix: {
      name: 'Seconde chance', icon: '🔁', max: 2,
      desc: (l) => l + ' réanimation' + (l > 1 ? 's' : '') + ' par partie (bouclier de grâce à la mort)',
      cost: (l) => ({ bat: 60 * (l + 1), pts: 4000 * (l + 1) }), time: (l) => researchTimeMs(l + 4),
    },
    mission: {
      name: 'Prime de mission', icon: '🎯', max: 5,
      desc: (l) => '+' + (l * 20) + '% de ⚡ sur les missions accomplies',
      cost: (l) => ({ bat: 22 * (l + 1), pts: 900 * (l + 1) }), time: (l) => researchTimeMs(l + 1),
    },
    labspeed: {
      name: 'Labo accéléré', icon: '⏩', max: 5,
      desc: (l) => '−' + (l * 5) + '% de temps de recherche',
      cost: (l) => ({ bat: 28 * (l + 1), pts: 1100 * (l + 1) }), time: (l) => researchTimeMs(l + 2),
    },
  };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function state() {
    const s = load();
    s.wallet = s.wallet || { bat: 0, pts: 0 };
    s.up = s.up || {};
    s.research = s.research || null;
    s.next = s.next || null;        // recherche mise en file (une seule) — démarre à la récupération de l'active
    return s;
  }

  // « Labo accéléré » : facteur de réduction du temps de recherche (−5 %/niveau, plancher −25 %).
  function labMult(s) { return Math.max(0.75, 1 - 0.05 * (s.up.labspeed || 0)); }

  function level(key) { return state().up[key] || 0; }
  function wallet() { return state().wallet; }

  // Verse les ressources d'une partie dans la banque (× rendement R&D).
  function bank(run) {
    const s = state();
    const m = 1 + 0.05 * (s.up.rendement || 0);   // Rendement R&D : +5 %/niveau
    s.wallet.bat += Math.round(Math.max(0, run.batteries || 0) * m);
    s.wallet.pts += Math.round(Math.max(0, run.points || 0) * m);
    save(s);
  }

  // Dépense des pièces (⚡) du portefeuille — achats cosmétiques (skins). true si payé.
  function canAfford(pts) { return (state().wallet.pts || 0) >= (pts || 0); }
  function spend(pts) {
    const s = state();
    if ((s.wallet.pts || 0) < pts) return false;
    s.wallet.pts -= pts; save(s);
    return true;
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
    const time = Math.round(r.time * labMult(s));   // « Labo accéléré » : temps réduit
    s.research = { key, endsAt: Date.now() + time, durationMs: time };
    save(s);
    return { ok: true };
  }

  // File d'attente (UN seul créneau) : pendant qu'une recherche tourne, on peut réserver
  // LA prochaine (coût payé d'avance) ; elle démarre automatiquement à la récupération de
  // l'active (claim). On interdit de mettre en file la MÊME amélioration que l'active →
  // le coût/temps reste celui du niveau courant (pas de calcul de niveau projeté).
  function canEnqueue(key) {
    const s = state();
    if (!s.research) return { ok: false, reason: 'aucune recherche active' };
    if (s.next) return { ok: false, reason: 'file pleine' };
    if (s.research.key === key) return { ok: false, reason: 'déjà en cours' };
    const u = UPGRADES[key]; const l = level(key);
    if (l >= u.max) return { ok: false, reason: 'niveau max' };
    const c = u.cost(l);
    if (s.wallet.bat < c.bat || s.wallet.pts < c.pts) return { ok: false, reason: 'ressources insuffisantes' };
    return { ok: true, cost: c, time: Math.round(u.time(l) * labMult(s)) };
  }
  function enqueueNext(key) {
    const r = canEnqueue(key);
    if (!r.ok) return r;
    const s = state();
    s.wallet.bat -= r.cost.bat; s.wallet.pts -= r.cost.pts;
    s.next = { key, cost: r.cost, durationMs: r.time };   // coût mémorisé → remboursement exact si annulée
    save(s);
    return { ok: true };
  }
  function cancelNext() {
    const s = state();
    if (!s.next) return { ok: false };
    s.wallet.bat += (s.next.cost && s.next.cost.bat) || 0;   // remboursement intégral
    s.wallet.pts += (s.next.cost && s.next.cost.pts) || 0;
    const key = s.next.key; s.next = null;
    save(s);
    return { ok: true, key };
  }
  function nextResearch() { return state().next; }

  function research() { return state().research; }
  function researchRemaining() { const r = state().research; return r ? Math.max(0, r.endsAt - Date.now()) : 0; }
  function isReady() { const r = state().research; return !!r && Date.now() >= r.endsAt; }

  // « Terminer maintenant » : dépenser des pièces (⚡) pour finir instantanément la
  // recherche en cours. Coût PROPORTIONNEL au temps réel restant (plus on a attendu,
  // moins ça coûte) → sink économique pour les ⚡ (partagé avec la Boutique). 0 si rien /
  // déjà prête. `FINISH_COST_PER_S` est un levier d'équilibrage (⚡ par seconde restante).
  const FINISH_COST_PER_S = 0.25;              // ≈ 15 ⚡/min · 900 ⚡/h · 21 600 ⚡/24 h
  const FINISH_COST_MIN = 25;
  function finishCost() {
    const rem = researchRemaining();
    if (rem <= 0) return 0;
    return Math.max(FINISH_COST_MIN, Math.ceil((rem / 1000) * FINISH_COST_PER_S));
  }
  function finishNow() {
    const s = state(); const r = s.research;
    if (!r) return { ok: false, reason: 'aucune recherche' };
    if (Date.now() >= r.endsAt) return { ok: false, reason: 'déjà prête' };
    const cost = finishCost();
    if ((s.wallet.pts || 0) < cost) return { ok: false, reason: 'ressources insuffisantes' };
    s.wallet.pts -= cost;
    r.endsAt = Date.now();                      // devient récupérable (isReady) → clic « RÉCUPÉRER »
    save(s);
    return { ok: true, cost };
  }

  // Récupère une recherche terminée → applique le niveau. Si une recherche est en file,
  // elle démarre automatiquement (son coût a déjà été payé à la mise en file).
  function claim() {
    const s = state(); const r = s.research;
    if (!r || Date.now() < r.endsAt) return { ok: false };
    s.up[r.key] = (s.up[r.key] || 0) + 1;
    s.research = null;
    const res = { ok: true, key: r.key, level: s.up[r.key] };
    if (s.next) {
      const n = s.next; s.next = null;
      s.research = { key: n.key, endsAt: Date.now() + n.durationMs, durationMs: n.durationMs };
      res.startedNext = n.key;
    }
    save(s);
    return res;
  }

  // Modificateurs de gameplay dérivés des niveaux d'améliorations.
  function effects() {
    return {
      pointMult: 1 + 0.10 * level('surtension') + 0.05 * level('inflation'),
      shieldBonus: 0.5 * level('bouclier'),
      slowBonus: level('surcharge'),
      magnetBonus: level('aimant'),
      doubleBonus: level('double'),
      comboWindowBonus: 0.5 * level('combo'),
      bonusEveryDelta: level('frequence'),
      bankMult: 1 + 0.05 * level('rendement'),   // (informatif : appliqué dans bank())
      startShield: 0.5 * level('depart'),        // s de bouclier au début de chaque niveau (0,5/niv)
      luckChance: level('chance'),               // ×5 % proba de ×2 (pièces+batterie) par objet
      cutDoubleChance: level('doublecoupe'),     // ×5 % proba d'enlever 2 blocs au coupe-câble
      malusResist: level('antivirus'),           // ×5 % proba de neutraliser un malus
      revives: level('phenix'),                  // réanimations par partie (bouclier de grâce)
      missionMult: 1 + 0.20 * level('mission'),  // ×⚡ sur les récompenses de mission (banque)
    };
  }

  // Remet toute la progression à zéro (borne partagée / nouveau joueur).
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // Modificateurs neutres (avant chargement / fallback).
  function neutral() {
    return { pointMult: 1, shieldBonus: 0, slowBonus: 0, magnetBonus: 0, doubleBonus: 0, comboWindowBonus: 0, bonusEveryDelta: 0, bankMult: 1, startShield: 0, luckChance: 0, cutDoubleChance: 0, malusResist: 0, revives: 0, missionMult: 1 };
  }

  return {
    UPGRADES, level, wallet, bank, canAfford, spend,
    canResearch, startResearch, research, researchRemaining, isReady, claim,
    finishCost, finishNow,
    canEnqueue, enqueueNext, cancelNext, nextResearch,
    effects, neutral, reset,
  };
})();
