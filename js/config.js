/* ============================================================
   config.js — point unique de vérité : thème, grille, niveaux.
   Tout est attaché à window.CT.
   ============================================================ */
window.CT = window.CT || {};

CT.CONFIG = {
  /* URL encodée dans le QR code de l'écran de fin (charge publicitaire).
     ⚠️ PLACEHOLDER — remplacer par l'URL exacte fournie par le client Cryptotem
     (site, page « trouver une borne », ou lien de campagne avec tracking). */
  cryptotemUrl: 'https://cryptotem.fr',

  /* Classement EN LIGNE (records partagés → tout le monde se compare).
     Le jeu POST les scores sur {url}/scores et lit les classements via {url}/boards
     (sans slash final dans `url` : le code ajoute les chemins).
     Serveur de référence fourni : server/leaderboard-server.js (Node, sans dépendance).
     - `url` renseignée  → records enregistrés sur le SERVEUR (avec repli local hors-ligne) ;
     - `url` vide ('')   → stockage 100 % local (mode hors-ligne / borne isolée).
     Pour tester en local : 'http://localhost:8124' (lancer le serveur de référence). */
  leaderboard: {
    url: 'https://cryptotem.fr/snake',  // endpoint du serveur de classement (→ /scores, /boards, /relabel)
    token: '',                          // jeton Bearer optionnel (auth serveur, si activée)
  },

  /* Grille (carrée). Plus c'est grand, plus le serpent paraît rapide. */
  cols: 24,
  rows: 24,

  /* Vitesse */
  minStep: 72,             // intervalle le plus court (ms) — plancher de vitesse
  speedupPerBattery: 3,    // ms retirés par batterie ramassée (accélération douce → parties plus longues/faciles)

  /* Durée de la bannière d'intro de niveau (s) — serpent figé le temps de l'annonce */
  introDuration: 1.7,

  /* Power-ups à durée limitée (batterie dorée « charge rapide » ou bouclier bleu) */
  bonus: {
    every: 4,            // tentative d'apparition toutes les N batteries normales
    chance: 0.7,         // probabilité d'apparition à chaque tentative
    life: 6,             // durée de vie à l'écran (s)
    points: 250,         // points « charge rapide » (× niveau)
    slowDuration: 3,     // durée de la « surcharge » (ralenti) accordée (s)
    slowFactor: 1.6,     // multiplicateur d'intervalle pendant la surcharge (plus lent)
    shieldChance: 0.30,  // proba qu'un power-up soit un bouclier
    shieldDuration: 5,   // durée d'invulnérabilité du bouclier (s)
    shieldPoints: 120,   // points bouclier (× niveau)
    magnetChance: 0.20,  // proba qu'un power-up soit un aimant (sinon charge rapide)
    magnetDuration: 5,   // durée d'attraction de l'aimant (s)
    magnetPoints: 150,   // points aimant (× niveau)
    doubleChance: 0.18,  // proba qu'un power-up soit « double points »
    doubleDuration: 6,   // durée du ×2 points (s)
    doublePoints: 200,   // points à la prise (× niveau) — ≤ points (plafond anti-triche)
    cutChance: 0.14,     // proba qu'un power-up soit un « coupe-câble » (raccourcit la queue)
    cutPoints: 120,      // points à la prise du coupe-câble (× niveau)
    cutBlocks: 1,        // nb de blocs de queue retirés (×2 via Labo « Double coupe »)
    cutMin: 2,           // longueur minimale du serpent (on ne coupe jamais en dessous)
    wallPoints: 60,      // bonus pièces (× niveau) par mur détruit au bouclier
  },

  /* MALUS (indépendants des power-ups ci-dessus) : icônes ROUGES clignotantes qui
     apparaissent aléatoirement sur la map. À ÉVITER (ils pénalisent le joueur).
     Un seul à la fois ; le TYPE est tiré aléatoirement à l'apparition. Tous rouges
     → se distinguent d'un coup d'œil des power-ups (colorés). */
  malus: {
    every: 30,           // nb de pas (sans malus) avant une tentative d'apparition
    chance: 0.4,         // probabilité d'apparition à chaque tentative
    life: 7,             // durée de vie à l'écran (s) avant de disparaître
    types: ['burger', 'speed', 'fog', 'repel', 'walls', 'steal'],  // tirés à proba égale
    grow: 2,             // 🍔 burger : +N blocs au serpent JOUEUR
    enemyGrow: 2,        // ⚡🌫️🧲🧱💸 : +N blocs au serpent ENNEMI (en plus de l'effet)
    maxEnemyLen: 14,     // plafond de longueur du serpent ennemi
    speedFactor: 0.62,   // ⚡ court-circuit : intervalle ×0.62 (plus rapide) pendant…
    speedDuration: 3,    //    …N s
    fogDuration: 4,      // 🌫️ brouillage : visibilité réduite N s
    repelDuration: 4,    // 🧲 aimant inversé : repousse la batterie N s
    wallsCount: 3,       // 🧱 obstacles surprise : nb de murs temporaires
    wallsDuration: 6,    //    …durée avant disparition (s)
    stealFrac: 0.15,     // 💸 vol : fraction des points retirée
  },

  /* Serpent ennemi (« Snakator ») : rôde sur la map à partir du niveau `fromLevel`.
     Mortel si notre tête le touche — SAUF sous bouclier : on le MORD alors (`biteEnemy`)
     → tête-à-tête = destruction totale, sinon on coupe sa queue au point d'impact.
     `bitePoints` = pièces gagnées par bloc détruit (× niveau). Se déplace d'une case/pas.
     ⚠️ `fromLevel` recouvre la plage de la démo (1→3) : l'apparition est explicitement
        bloquée en démo (cf. setupLevel, garde `!this.demo`) pour garder l'écran attract calme. */
  enemy: { fromLevel: 3, length: 4, turnChance: 0.25, bitePoints: 40 },

  /* MINI-BOSS (« Snakator Prime ») : un combat dédié tous les `everyLevels` niveaux
     (5, 10, 15…). Le niveau boss REMPLACE l'objectif batteries : pas de batterie à
     ramasser, on doit vider les PV du boss en le MORDANT sous bouclier (`biteEnemy`).
     Pour ça, des BOUCLIERS apparaissent très souvent (1 essai tous les `shieldEveryBase`
     pas au 1ᵉʳ palier) — de moins en moins à chaque palier (`shieldEveryPerTier`), et
     quelques MURS s'ajoutent par palier (`wallsPerTier`). Le boss POURSUIT le joueur.
     Mortel au contact hors bouclier (comme l'ennemi). `tier` = niveau / everyLevels. */
  boss: {
    everyLevels: 5,        // un combat de boss tous les N niveaux
    baseLen: 7,            // longueur d'un boss au 1ᵉʳ palier
    lenPerTier: 2,         // +blocs par palier (plafonné maxLen)
    maxLen: 16,
    baseHp: 8,             // PV au 1ᵉʳ palier (plus coriace)
    hpPerTier: 4,          // +PV par palier
    headDamage: 2,         // dégâts d'une morsure tête-à-tête (corps = 1)
    turnChance: 0.14,      // imprévu de poursuite (bas = poursuite plus tenace)
    wallsPerTier: 4,       // murs ajoutés par palier (0 au palier 1)
    wallsMax: 16,
    shieldEveryBase: 8,    // boucliers TRÈS fréquents au palier 1 (1 essai / N pas)
    shieldEveryPerTier: 5, // … de moins en moins fréquents par palier
    reward: 800,           // pièces (× palier × niveau) par boss vaincu, + bonus quand tous tombent
    // PLUSIEURS boss simultanés (essaim) aux paliers IMPAIRS (varie les plaisirs).
    countEvery: 2,         // +1 boss simultané tous les N paliers
    maxCount: 4,           // plafond de boss en même temps
    perBossHpScale: 0.65,  // PV/boss réduits quand ils sont plusieurs (évite l'éponge à PV)
    // HYDRE multi-têtes aux paliers PAIRS : un seul boss, mais 2-3 têtes (chacune un point
    // faible à couper sous bouclier ; le boss tombe quand TOUTES ses têtes sont coupées).
    maxHeads: 3,           // têtes max d'une hydre
    perHeadHpScale: 0.6,   // PV/tête (évite l'éponge ; total ≈ 1,8× un boss simple à 3 têtes)
  },

  /* Thème — couleurs de jeu. Rebrander = changer ces valeurs. */
  theme: {
    bg0:      '#02161a',
    bg1:      '#05242a',
    grid:     'rgba(255,255,255,0.035)',
    tealDeep: '#063c40',
    tealMid:  '#0b7e80',
    teal:     '#13b5b8',
    cyan:     '#26e0e0',
    glow:     '#2bf0d8',
    blue:     '#2f7bff',   // LED des power banks de la station
    violet:   '#9d6bff',   // power-up aimant
    charge:   '#19e3b0',   // remplissage de charge
    danger:   '#ff5b6e',   // obstacles / game over
    amber:    '#ffc24b',
    pink:     '#ff5bb0',   // teinte serpent (cycle de couleurs)
    lime:     '#7cff5b',   // teinte serpent (cycle de couleurs)
    text:     '#eafbfb',
    textDim:  '#7fb5b8',
  },

  /* Couleurs successives du serpent : il en change à CHAQUE batterie ramassée
     (le câble « se charge »). Liste de clés de CONFIG.theme → reste rebrandable.
     Le niveau démarre toujours sur la 1ʳᵉ (cyan). */
  snakePalette: ['cyan', 'charge', 'blue', 'violet', 'amber', 'pink', 'lime', 'glow'],

  /* Niveaux conçus à la main. Au-delà → génération procédurale (getLevel). */
  levels: [
    { needed: 10, step: 168, obstacles: 0,  pattern: 'none'    },
    { needed: 11, step: 156, obstacles: 5,  pattern: 'corners' },
    { needed: 12, step: 146, obstacles: 9,  pattern: 'bars'    },
    { needed: 13, step: 136, obstacles: 13, pattern: 'cross'   },
    { needed: 14, step: 126, obstacles: 18, pattern: 'pillars' },
    { needed: 15, step: 116, obstacles: 22, pattern: 'maze'    },
  ],
};

/* Renvoie la config du niveau n (1-based), avec génération au-delà du tableau. */
CT.getLevel = function (n) {
  const L = CT.CONFIG.levels;
  if (n >= 1 && n <= L.length) {
    return Object.assign({ index: n }, L[n - 1]);
  }
  const last = L[L.length - 1];
  const extra = n - L.length;            // nb de niveaux au-delà du tableau
  // les niveaux procéduraux alternent les motifs (variété en jeu prolongé, au lieu de « maze » partout)
  const procPatterns = ['corners', 'bars', 'cross', 'pillars', 'diamond', 'maze'];
  return {
    index: n,
    needed: last.needed + extra,   // +1 batterie par niveau (objectif doux : 10, 11, 12…)
    step: Math.max(CT.CONFIG.minStep + 18, last.step - extra * 6),
    obstacles: Math.min(40, last.obstacles + extra * 4),
    pattern: procPatterns[(extra - 1) % procPatterns.length],
  };
};

/* Petits utilitaires partagés (math + dessin). */
CT.util = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  ease(t) { return 1 - Math.pow(1 - t, 3); },          // easeOutCubic
  easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  /* PRNG ensemençable (mulberry32) → aléa gameplay reproductible depuis un seed.
     Base du rejeu déterministe anti-triche (cf. docs/anti-cheat.md). */
  makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  /* Tracé d'un rectangle arrondi (fallback si roundRect absent). */
  rr(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  },
};

/* Variantes de cinématiques disponibles (détail dans cinematics.js). */
CT.CINEMATICS = ['express', 'confetti', 'pulse', 'turbo', 'totem', 'ville', 'reseau', 'aurora', 'galaxie', 'comete'];

/* Choisit une variante différente de la précédente. */
CT.pickCinematic = function (lastVariant) {
  const pool = CT.CINEMATICS.filter((v) => v !== lastVariant);
  return pool[(Math.random() * pool.length) | 0];
};
