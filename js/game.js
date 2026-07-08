/* ============================================================
   game.js — moteur Snake Cryptotem : machine à états, boucle,
   collisions, rendu du monde. Attaché à window.CT.
   ============================================================ */
window.CT = window.CT || {};

(function () {
  const U = CT.util;
  const T = CT.CONFIG.theme;
  const COLS = CT.CONFIG.cols;
  const ROWS = CT.CONFIG.rows;
  const t = (k, p) => (CT.i18n ? CT.i18n.t(k, p) : k);   // i18n (repli = clé)

  /* ---- helpers couleur ---- */
  function hexRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(c1, c2, t) {
    const a = hexRgb(c1), b = hexRgb(c2);
    return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  }
  function rgbToHex(c) {
    return '#' + c.map((v) => {
      const h = U.clamp(Math.round(v), 0, 255).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('');
  }

  // Palette parcourue par le serpent (1 couleur par batterie) — résolue depuis le thème.
  const PALETTE = (CT.CONFIG.snakePalette || ['cyan']).map((k) => T[k] || k);

  /* Le meilleur score perso et les classements vivent dans CT.Leaderboard. */

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };

  // Décalages (perpendiculaires au cou) des têtes d'une hydre, centrés. 1 tête = au ras du
  // corps ; 2-3 têtes = déployées en éventail devant (Y qui se sépare / trident).
  const HEAD_SLOTS = { 1: [0], 2: [-1, 1], 3: [-1, 0, 1] };

  // MISSIONS DE PARTIE : pool d'objectifs secondaires (CONFIG.missions.count tirés par run
  // via this.rng). `prog(g)` lit l'avancement dans l'état du jeu ; récompense en ⚡ versée
  // au Labo à la fin de la partie (jamais au score → classement/anti-triche intacts).
  const MISSION_POOL = [
    { id: 'combo5',  icon: '🔥', label: 'Atteins un combo ×5',         target: 5,   reward: 400, prog: (g) => g.maxComboRun },
    { id: 'bat25',   icon: '🔋', label: 'Ramasse 25 batteries',        target: 25,  reward: 500, prog: (g) => g.score },
    { id: 'bonus5',  icon: '⚡', label: 'Ramasse 5 power-ups',         target: 5,   reward: 450, prog: (g) => g.bonusCount },
    { id: 'walls3',  icon: '🧱', label: 'Brise 3 murs sous bouclier',  target: 3,   reward: 600, prog: (g) => g.wallsRun },
    { id: 'snak4',   icon: '🐍', label: 'Détruis 4 blocs ennemis',     target: 4,   reward: 600, prog: (g) => g.snakRun },
    { id: 'surv120', icon: '⏱️', label: 'Survis 2 minutes',            target: 120, reward: 500, prog: (g) => Math.floor(g.time - g.runStart) },
    { id: 'lvl4',    icon: '🗺️', label: 'Atteins le niveau 4',         target: 4,   reward: 550, prog: (g) => g.levelNum },
  ];

  CT.Game = function (ctx) {
    this.ctx = ctx;
    this.cine = new CT.Cinematic(ctx);
    this.W = 480; this.H = 480; this.cell = this.W / COLS;
    this.state = 'start';
    this.onState = function () {};
    this.onAchievement = function () {};   // (def) → notification de succès débloqué
    this.time = 0;
    // accessibilité : respecte « réduire les animations » de l'OS
    this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      if (window.matchMedia) window.matchMedia('(prefers-reduced-motion: reduce)')
        .addEventListener('change', (e) => { this.reduce = e.matches; });
    } catch (e) {}

    // refs DOM pour HUD / stats / bouton continuer
    this.dom = {
      lvlBox: document.querySelector('.hud-level'),   // réécrit en entier (NIVEAU n / ⏱ CHRONO)
      lvl: document.getElementById('lvlNum'),
      bat: document.getElementById('batCount'),
      need: document.getElementById('batNeed'),
      unit: document.getElementById('batUnit'),
      fill: document.getElementById('progFill'),
      progress: document.querySelector('.hud-progress'),
      score: document.getElementById('scoreVal'),
      best: document.getElementById('bestVal'),
      startBest: document.getElementById('startBest'),
      overStats: document.getElementById('overStats'),
      continueBtn: document.getElementById('continueBtn'),
    };

    this.reset();
  };

  const G = CT.Game.prototype;

  G.reset = function () {
    this.snake = null;
    this.prev = null;
    this.dir = DIRS.right;
    this.dirQueue = [];      // virages bufferisés (max 2) → tournants serrés fiables
    this.food = null;
    this.obstacles = [];
    this.obstacleSet = new Set();
    this.batteries = 0;
    this.score = 0;          // total batteries livrées sur la partie
    this.points = 0;         // score chiffré (avec combos)
    this.best = 0;           // record perso (chargé depuis le classement, async)
    this.recordToBeat = 0;   // record perso à battre, figé (≠ this.best qui suit les points en jeu)
    this.recordBeaten = false; // bannière « record battu » déjà déclenchée cette partie ?
    this.recordBannerUntil = 0;
    this.runStart = 0;       // horodatage (s) du début de partie (pour la durée)
    this.seed = (Math.random() * 4294967295) >>> 0;  // graine de partie
    this.rng = CT.util.makeRng(this.seed);           // aléa gameplay déterministe
    this.daily = false;      // Défi du jour (seed de la date → même map pour tous)
    this.ghost = null;       // fantôme à battre (meilleure course du jour) — { score, frames }
    this.ghostRec = null;    // enregistrement de la course en cours (Défi du jour)
    this.ghostIdx = 0;       // curseur de lecture du fantôme (t monotone)
    this.newGhost = false;   // la partie vient-elle de devenir le fantôme du jour ?
    this.orbs = [];          // ORBES tirées par les boss — [{ x, y, vx, vy, life }] (cases flottantes)
    this.chrono = false;     // MODE CHRONO : 2 minutes, score max (classement dédié)
    this.chronoEnd = 0;      // fin du chrono (time) — fixée à la fin de l'intro
    this.chronoExpired = false; // la partie s'est-elle finie au temps (≠ mort par collision) ?
    this._chronoShown = -1;  // dernière seconde affichée au HUD (maj 1×/s)
    this.pausedAt = 0;       // horodatage de la mise en pause (gel du chrono)
    this.portals = [];       // PORTAILS — paires successives [{x,y,pair}, {x,y,pair}, …]
    this.raceLevel = false;  // niveau COURSE en cours (le Glouton vole les batteries)
    this.rivalRespawnAt = 0; // retour du Glouton après destruction (time), 0 = pas en attente
    this.missions = [];      // MISSIONS de partie — [{ id, icon, label, target, reward, prog, done }]
    this.missionCoins = 0;   // ⚡ gagnées par missions (versées au Labo à la fin, pas au score)
    this.wallsRun = 0;       // murs brisés cette partie (mission)
    this.snakRun = 0;        // blocs ennemis détruits cette partie (mission)
    this.biome = null;       // décor de lieu du niveau (bar/ciné/bowling/disco/laser)
    this.speedup = CT.CONFIG.speedupPerBattery;   // accélération par batterie (× difficulté)
    this.diffId = 'normal';  // difficulté appliquée à la partie (tag de classement)
    this.stepCount = 0;      // nb de pas logiques de la partie (rejeu déterministe)
    this.journal = [];       // journal d'inputs [ [pas, codeDir], … ] (rejeu déterministe)
    this.tutorial = false;   // première partie guidée (onboarding) en cours ?
    this.challenge = null;   // défi d'un ami (QR) — { seed, score, name } ou null
    this.challengeWon = false; // le défi vient-il d'être relevé (score dépassé) ?
    this.versus = false;     // MODE 2 JOUEURS (duel local, même tablette)
    this.snake2 = null;      // serpent du joueur 2 (versus)
    this.prev2 = null;
    this.dir2 = DIRS.left;
    this.dirQueue2 = [];
    this.food2 = null;       // batterie du joueur 2 (versus)
    this.score2 = 0;         // batteries du joueur 2 (versus)
    this.color2Rgb = null;   // couleur courante du serpent 2 (versus)
    this.color2Target = null;
    this.versusWinner = 0;   // 0 = aucun · 1 = J1 · 2 = J2 · 3 = égalité (versus terminé)
    this.sinceEvent = 0;     // pas depuis la dernière tentative d'événement
    this.eventCooldownUntil = 0; // pas d'événement tant que time < cooldown
    this.eventBanner = null; // bannière d'annonce d'événement — { text, color, until }
    this.goldUntil = 0;      // 💰 Ruée dorée : pièces ×N tant que time < goldUntil
    this.rainUntil = 0;      // 🎁 Pluie de power-ups tant que time < rainUntil
    this.bonusCount = 0;     // nb de power-ups ramassés (métadonnée anti-triche)
    this.combo = 0;
    this.maxComboRun = 0;    // meilleur combo de la partie (récap de fin)
    this.lastEat = -10;
    this.levelNum = 1;
    this.stepInterval = 0.16;
    this.effInterval = 0.16;
    this.acc = 0;
    this.bonus = null;       // power-up à l'écran (ou null) — { x, y, life, max, type }
    this.sinceBonus = 0;     // batteries normales depuis le dernier bonus
    this.malus = null;       // MALUS à l'écran (ou null) — { x, y, life, max, type }
    this.sinceMalus = 0;     // pas écoulés (sans malus) depuis la dernière tentative
    this.enemy = null;       // serpent ennemi « Snakator » (niv 3+, hors boss) — { body, prev, dir } ou null
    this.bosses = [];        // BOSS simultanés (niveaux boss) — [{ body, prev, dir, boss:true, hp, maxHp, tier }]
    this.bossLevel = false;  // niveau boss en cours (combat à PV, pas d'objectif batteries)
    this.bossTier = 0;       // palier du combat de boss courant (= niveau / everyLevels)
    this.bossShieldEvery = 0; // boss : 1 essai d'apparition de bouclier tous les N pas
    this.bossShieldTimer = 0; // compteur de pas depuis le dernier essai de bouclier (boss)
    this.slowUntil = 0;      // surcharge/ralenti actif tant que time < slowUntil
    this.shieldUntil = 0;    // bouclier (invulnérabilité) actif tant que time < shieldUntil
    this.magnetUntil = 0;    // aimant (attire la batterie) actif tant que time < magnetUntil
    this.doubleUntil = 0;    // double points actif tant que time < doubleUntil
    this.rushUntil = 0;      // MALUS court-circuit (accélération) tant que time < rushUntil
    this.fogUntil = 0;       // MALUS brouillage (visibilité réduite) tant que time < fogUntil
    this.repelUntil = 0;     // MALUS aimant inversé (repousse la batterie) tant que time < repelUntil
    this.tempWalls = [];     // MALUS obstacles temporaires — [{ x, y, until }]
    this.introUntil = 0;     // bannière d'intro de niveau (serpent figé) tant que time < introUntil
    this.introKind = 'normal'; // type d'annonce : 'normal' · 'enemy' (Snakator) · 'boss' (plus dramatique)
    this.introDur = CT.CONFIG.introDuration;   // durée de l'annonce courante (plus longue si spéciale)
    this.resumeUntil = 0;    // compte à rebours « 3·2·1 » à la reprise après pause (serpent figé)
    this.fx = [];
    this.toast = null;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.shake = 0;          // intensité du screen-shake (décroît)
    this.lastVariant = null;
    this._tension = 0;       // tension musicale courante (musique dynamique)
    // palette du serpent : skin sélectionné (cycle de couleurs, 1 par batterie)
    this.palette = (window.CT && CT.Skins && CT.Skins.activePalette) ? CT.Skins.activePalette() : PALETTE;
    // apparence des ennemis / boss (skin acheté) : couleur principale + aura
    this.enemySkin = (window.CT && CT.BossSkins && CT.BossSkins.activeMain)
      ? { main: CT.BossSkins.activeMain(), aura: CT.BossSkins.activeAura() }
      : { main: T.danger, aura: T.violet };
    // styles de TÊTE achetés (visage du serpent joueur / des ennemis)
    this.headStyle = (window.CT && CT.HeadSkins) ? CT.HeadSkins.selectedId() : 'classic';
    this.enemyHeadStyle = (window.CT && CT.EnemyHeads) ? CT.EnemyHeads.selectedId() : 'classic';
    // traînée cosmétique achetée (particules derrière la tête ; 'none' = aucune)
    this.trailStyle = (window.CT && CT.Trails) ? CT.Trails.selectedId() : 'none';
    // couleur courante du serpent (change à chaque batterie ; lissée vers la cible)
    this.snakeColorRgb = hexRgb(this.palette[0]);
    this.snakeColorTarget = hexRgb(this.palette[0]);
    this.demo = false;
    // modificateurs issus du Laboratoire (R&D), figés au début de la partie
    this.mods = (window.CT && CT.Lab && CT.Lab.effects) ? CT.Lab.effects()
      : { pointMult: 1, shieldBonus: 0, slowBonus: 0, magnetBonus: 0, doubleBonus: 0, comboWindowBonus: 0, bonusEveryDelta: 0, bankMult: 1, startShield: 0, luckChance: 0, cutDoubleChance: 0, malusResist: 0, revives: 0, missionMult: 1 };
    this.revivesLeft = 0;    // réanimations restantes (Labo « Seconde chance »), fixées au startRun
    this.updateHud();
    this.loadPersonalBest();
  };

  // Charge le record perso depuis le classement (async, compatible backend distant).
  G.loadPersonalBest = function () {
    CT.Leaderboard.fetchBoards().then((b) => {
      if (b) {
        this.recordToBeat = b.personal || 0;   // record figé à battre (pour la bannière « record battu »)
        if (b.personal > this.best) { this.best = b.personal; this.updateHud(); }
      }
    });
  };

  G.resize = function (W, H) {
    this.W = W; this.H = H; this.cell = W / COLS;
    this.cine.resize(W, H);
  };

  G.setState = function (s) {
    this.state = s;
    this.onState(s);
  };

  /* ---------------- cycle de partie ---------------- */
  // `seed` optionnelle : fournie = DÉFI DU JOUR (CT.util.dailySeed() → même map pour tous).
  // `mode` optionnel : 'chrono' (2 min, score max) · 'versus' (2 joueurs) · 'challenge'
  // (défi d'un ami reçu par QR : même map + score à battre, cf. this.pendingChallenge).
  G.startRun = function (seed, mode) {
    this.reset();
    this.runStart = this.time;
    this.chrono = mode === 'chrono';
    this.versus = mode === 'versus';
    const isChallenge = mode === 'challenge';
    // DÉFI D'UN AMI (QR) : rejoue la map de l'ami (seed) avec son score à battre
    if (isChallenge && this.pendingChallenge) {
      this.challenge = {
        seed: this.pendingChallenge.seed >>> 0,
        score: this.pendingChallenge.score | 0,
        name: this.pendingChallenge.name || 'un ami',
      };
      seed = this.challenge.seed;
    }
    this.daily = !this.chrono && !this.versus && !isChallenge && seed != null;
    this.seed = (this.daily || isChallenge) ? (seed >>> 0) : (Math.random() * 4294967295) >>> 0;
    this.rng = CT.util.makeRng(this.seed);   // (re)graine pour la partie scorée
    this.bonusCount = 0;
    // fantôme (Défi du jour uniquement — même seed = même map, la course est comparable)
    if (this.daily && CT.Ghost) { this.ghost = CT.Ghost.load(); this.ghostRec = []; this.ghostIdx = 0; }
    // MISSIONS de partie (hors chrono / versus) : tirées via this.rng AVANT les spawns →
    // déterministes par seed (même trio pour tous sur le Défi du jour).
    this.missions = [];
    const MC = CT.CONFIG.missions;
    if (!this.chrono && !this.versus && MC && MC.count) {
      const pool = MISSION_POOL.slice();
      for (let i = 0; i < Math.min(MC.count, pool.length); i++) {
        const j = (this.rng() * pool.length) | 0;
        this.missions.push(Object.assign({ done: false }, pool[j]));
        pool.splice(j, 1);
      }
    }
    // ONBOARDING : première partie NORMALE jamais vue → tutoriel guidé (une seule fois)
    this.tutorial = !this.chrono && !this.versus && !this.daily && !isChallenge && !this._seen();
    if (this.tutorial) this._markSeen();
    // Labo « Seconde chance » : réanimations disponibles pour cette partie
    this.revivesLeft = (this.mods && this.mods.revives) || 0;
    this.startLevel(1);
  };

  // Première partie déjà vue ? (drapeau localStorage, borne partagée → une fois par appareil)
  G._seen = function () { try { return localStorage.getItem('ct_seen') === '1'; } catch (e) { return true; } };
  G._markSeen = function () { try { localStorage.setItem('ct_seen', '1'); } catch (e) {} };

  // Prépare un niveau (sans changer l'état) — partagé par jeu réel et démo.
  G.setupLevel = function (n) {
    this.levelNum = n;
    this.biome = CT.getBiome(n);   // décor de lieu (bar/ciné/bowling/disco/laser)
    // MODE 2 JOUEURS : arène de duel dédiée (deux serpents, deux batteries) → setup à part
    if (this.versus) { this.setupVersus(); return; }
    // MODE CHRONO : une seule arène sans objectif de niveau (needed infini → jamais de cinématique)
    if (this.chrono) {
      const CC = CT.CONFIG.chrono;
      this.level = { index: n, needed: Infinity, step: CC.step, obstacles: CC.obstacles, pattern: CC.pattern };
    } else {
      this.level = CT.getLevel(n);
    }
    // DIFFICULTÉ (partie NORMALE solo uniquement — pas en démo/chrono/daily/défi d'ami, pour
    // garder les maps partagées identiques et les classements dédiés équitables).
    this.speedup = CT.CONFIG.speedupPerBattery;
    this.diffId = 'normal';
    if (!this.demo && !this.chrono && !this.daily && !this.challenge && CT.getDifficulty) {
      const dm = CT.getDifficulty();
      this.diffId = CT.getDifficultyId();
      this.level = Object.assign({}, this.level, {
        step: Math.max(CT.CONFIG.minStep, Math.round(this.level.step * dm.stepMult)),
        obstacles: Math.max(0, Math.round(this.level.obstacles * dm.obstacleMult)),
      });
      this.speedup = CT.CONFIG.speedupPerBattery * dm.speedupMult;
    }
    this.batteries = 0;
    this.combo = 0;
    this.snakeColorRgb = hexRgb(this.palette[0]);   // le niveau repart sur la couleur de base
    this.snakeColorTarget = hexRgb(this.palette[0]);

    // Niveau BOSS (tous les `everyLevels` niveaux) : combat à PV, pas d'objectif batteries.
    // Murs ↑ et boucliers ↓ à chaque palier ; jamais en démo.
    const BCFG = CT.CONFIG.boss;
    const bossTier = BCFG ? (n / BCFG.everyLevels) : 0;
    this.bossLevel = !this.demo && !this.chrono && BCFG && Number.isInteger(bossTier) && bossTier >= 1;
    this.bossShieldTimer = 0;
    // niveau COURSE : le Glouton vole les batteries (offset ≠ 0 mod every → jamais un niveau boss)
    const RC = CT.CONFIG.race;
    this.raceLevel = !this.demo && !this.chrono && !this.bossLevel && RC &&
      n >= RC.fromLevel && n % RC.every === RC.offset;
    this.rivalRespawnAt = 0;
    if (this.bossLevel) {
      // murs : aucun au 1ᵉʳ palier, puis +wallsPerTier par palier (plafonné)
      const walls = Math.min(BCFG.wallsMax, (bossTier - 1) * BCFG.wallsPerTier);
      this.level = Object.assign({}, this.level, { obstacles: walls, pattern: 'pillars' });
      // boucliers très fréquents au 1ᵉʳ palier, de moins en moins ensuite
      this.bossShieldEvery = Math.max(4, BCFG.shieldEveryBase + (bossTier - 1) * BCFG.shieldEveryPerTier);
    }
    this.stepInterval = this.level.step / 1000;
    this.effInterval = this.stepInterval;
    this.acc = 0;
    this.bonus = null;
    this.sinceBonus = 0;
    this.malus = null;
    this.sinceMalus = 0;
    this.rushUntil = 0;
    this.fogUntil = 0;
    this.repelUntil = 0;
    this.tempWalls = [];
    this.slowUntil = 0;
    this.shieldUntil = 0;
    this.magnetUntil = 0;
    this.doubleUntil = 0;
    this.goldUntil = 0;
    this.rainUntil = 0;
    this.eventBanner = null;
    this.orbs = [];
    this.introUntil = 0;
    this.fx = [];
    this.toast = null;
    this.flash = 0;
    this.shake = 0;

    // serpent au centre, longueur 4, vers la droite
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    this.snake = [
      { x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }, { x: cx - 3, y: cy },
    ];
    this.prev = this.snake.map((s) => ({ x: s.x, y: s.y }));
    this.dir = DIRS.right; this.dirQueue = [];

    this.generateObstacles();
    this.spawnPortals();   // PORTAILS (dès portals.fromLevel ; jamais en démo / combat de boss)
    // pas de batterie à ramasser en combat de boss (l'objectif est de vaincre le boss)
    if (this.bossLevel) this.food = null; else this.spawnFood();
    // boss, sinon serpent ennemi à partir du niveau configuré ; jamais en démo (qui cycle
    // 1→3 et recouvre désormais fromLevel=3 → garde `!this.demo` indispensable)
    this.enemy = null;
    this.bosses = [];
    this.bossTier = this.bossLevel ? bossTier : 0;
    const ec = CT.CONFIG.enemy;
    if (this.bossLevel) this.spawnBosses(bossTier);
    else if (this.raceLevel) this.spawnEnemy(true);   // COURSE : le Glouton remplace le Snakator
    else if (ec && !this.demo && (n >= ec.fromLevel || (this.chrono && CT.CONFIG.chrono.enemy))) this.spawnEnemy();
    this.updateHud();
  };

  /* ---------------- mode 2 joueurs (versus) ---------------- */
  // Arène de duel : deux serpents opposés (J1 cyan à gauche, J2 rose à droite), chacun sa
  // batterie sur sa moitié. Pas de power-ups / ennemis / malus (duel épuré et équitable).
  G.setupVersus = function () {
    const V = CT.CONFIG.versus;
    this.level = { index: 1, needed: V.target, step: V.step, obstacles: V.obstacles, pattern: V.pattern };
    this.batteries = 0; this.score2 = 0; this.combo = 0;
    this.stepInterval = V.step / 1000; this.effInterval = this.stepInterval; this.acc = 0;
    // neutralise tous les systèmes solo
    this.bonus = null; this.malus = null; this.enemy = null; this.bosses = []; this.orbs = [];
    this.bossLevel = false; this.raceLevel = false; this.bossTier = 0;
    this.slowUntil = 0; this.shieldUntil = 0; this.magnetUntil = 0; this.doubleUntil = 0;
    this.rushUntil = 0; this.fogUntil = 0; this.repelUntil = 0; this.goldUntil = 0; this.rainUntil = 0;
    this.tempWalls = []; this.portals = []; this.eventBanner = null;
    this.fx = []; this.toast = null; this.flash = 0; this.shake = 0;
    this.introUntil = 0; this.versusWinner = 0;
    // couleurs fixes (lisibilité du duel) : J1 cyan, J2 rose
    this.snakeColorRgb = hexRgb(T.cyan); this.snakeColorTarget = hexRgb(T.cyan);
    this.color2Rgb = hexRgb(T.pink); this.color2Target = hexRgb(T.pink);
    const cy = Math.floor(ROWS / 2), x1 = 4, x2 = COLS - 5;
    this.snake = [{ x: x1, y: cy }, { x: x1 - 1, y: cy }, { x: x1 - 2, y: cy }, { x: x1 - 3, y: cy }];
    this.prev = this.snake.map((s) => ({ x: s.x, y: s.y })); this.dir = DIRS.right; this.dirQueue = [];
    this.snake2 = [{ x: x2, y: cy }, { x: x2 + 1, y: cy }, { x: x2 + 2, y: cy }, { x: x2 + 3, y: cy }];
    this.prev2 = this.snake2.map((s) => ({ x: s.x, y: s.y })); this.dir2 = DIRS.left; this.dirQueue2 = [];
    this.generateObstacles();
    // dégage les cases de spawn + le couloir de départ des deux serpents (jamais piégés)
    for (const s of this.snake) this._clearObstacle(s.x, s.y);
    for (const s of this.snake2) this._clearObstacle(s.x, s.y);
    for (let i = 1; i <= 4; i++) { this._clearObstacle((x1 + i) % COLS, cy); this._clearObstacle((x2 - i + COLS) % COLS, cy); }
    this.food = this.freeVersusCell('left');
    this.food2 = this.freeVersusCell('right');
    this.updateHud();
  };

  // Retire un obstacle d'une case (nettoyage des couloirs de spawn en versus).
  G._clearObstacle = function (x, y) {
    const k = this.cellKey(x, y);
    if (!this.obstacleSet.has(k)) return;
    this.obstacleSet.delete(k);
    const i = this.obstacles.findIndex((o) => o.x === x && o.y === y);
    if (i >= 0) this.obstacles.splice(i, 1);
  };

  // Case libre pour une batterie de duel (évite obstacles + les 2 serpents + les 2 batteries).
  // `side` biaise le tirage sur la moitié gauche/droite (chacun sa batterie).
  G.freeVersusCell = function (side) {
    const free = (x, y) => {
      if (this.obstacleSet.has(this.cellKey(x, y))) return false;
      for (const s of this.snake) if (s.x === x && s.y === y) return false;
      for (const s of this.snake2) if (s.x === x && s.y === y) return false;
      if (this.food && this.food.x === x && this.food.y === y) return false;
      if (this.food2 && this.food2.x === x && this.food2.y === y) return false;
      return true;
    };
    const half = COLS / 2;
    let tries = 0;
    while (tries++ < 300) {
      let x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (side === 'left') x = 1 + ((this.rng() * (half - 1)) | 0);
      else if (side === 'right') x = Math.ceil(half) + ((this.rng() * (half - 2)) | 0);
      if (free(x, y)) return { x, y, born: this.time };
    }
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (free(x, y)) return { x, y, born: this.time };
    return { x: 1, y: 1, born: this.time };
  };

  // Un pas de duel : avance les deux serpents, gère batteries + collisions + victoire.
  // Collisions testées APRÈS déplacement (obstacle · propre corps · corps adverse ; tête-à-tête
  // = égalité). Premier à `target` batteries — ou dernier survivant — gagne.
  G.stepVersus = function () {
    const V = CT.CONFIG.versus;
    if (this.dirQueue.length) this.dir = this.dirQueue.shift();
    if (this.dirQueue2.length) this.dir2 = this.dirQueue2.shift();
    const nh1 = { x: (this.snake[0].x + this.dir.x + COLS) % COLS, y: (this.snake[0].y + this.dir.y + ROWS) % ROWS };
    const nh2 = { x: (this.snake2[0].x + this.dir2.x + COLS) % COLS, y: (this.snake2[0].y + this.dir2.y + ROWS) % ROWS };
    const eat1 = this.food && nh1.x === this.food.x && nh1.y === this.food.y;
    const eat2 = this.food2 && nh2.x === this.food2.x && nh2.y === this.food2.y;
    // avance J1
    this.prev = this.snake.map((s) => ({ x: s.x, y: s.y }));
    for (let i = this.snake.length - 1; i >= 1; i--) { this.snake[i].x = this.prev[i - 1].x; this.snake[i].y = this.prev[i - 1].y; }
    this.snake[0] = nh1;
    if (eat1) { const t = this.prev[this.prev.length - 1]; this.snake.push({ x: t.x, y: t.y }); this.prev.push({ x: t.x, y: t.y }); }
    // avance J2
    this.prev2 = this.snake2.map((s) => ({ x: s.x, y: s.y }));
    for (let i = this.snake2.length - 1; i >= 1; i--) { this.snake2[i].x = this.prev2[i - 1].x; this.snake2[i].y = this.prev2[i - 1].y; }
    this.snake2[0] = nh2;
    if (eat2) { const t = this.prev2[this.prev2.length - 1]; this.snake2.push({ x: t.x, y: t.y }); this.prev2.push({ x: t.x, y: t.y }); }
    // effets de ramassage
    if (eat1) { this.batteries++; this.spawnFx(nh1.x, nh1.y, [T.cyan, T.glow, '#ffffff']); this.food = this.freeVersusCell('left'); this.flash = Math.max(this.flash, 0.4); this.flashColor = T.cyan; CT.Audio.pickup(1); }
    if (eat2) { this.score2++; this.spawnFx(nh2.x, nh2.y, [T.pink, '#ffffff']); this.food2 = this.freeVersusCell('right'); this.flash = Math.max(this.flash, 0.4); this.flashColor = T.pink; CT.Audio.pickup(1); }
    // collisions (après déplacement)
    const collide = (h, self, other) => {
      if (this.obstacleSet.has(this.cellKey(h.x, h.y))) return true;
      for (let i = 1; i < self.length; i++) if (self[i].x === h.x && self[i].y === h.y) return true;
      for (let i = 0; i < other.length; i++) if (other[i].x === h.x && other[i].y === h.y) return true;
      return false;
    };
    const headOn = nh1.x === nh2.x && nh1.y === nh2.y;
    const w1 = this.batteries >= V.target, w2 = this.score2 >= V.target;
    this.updateHud();
    if (headOn) return this.versusEnd(3);
    if (w1 && w2) return this.versusEnd(3);
    if (w1) return this.versusEnd(1);
    if (w2) return this.versusEnd(2);
    const d1 = collide(nh1, this.snake, this.snake2), d2 = collide(nh2, this.snake2, this.snake);
    if (d1 && d2) return this.versusEnd(3);
    if (d1) return this.versusEnd(2);
    if (d2) return this.versusEnd(1);
  };

  // Fin d'un duel : 1 = J1 · 2 = J2 · 3 = égalité. Pas de classement (mode non scoré).
  G.versusEnd = function (winner) {
    this.versusWinner = winner;
    this.flash = 1; this.flashColor = winner === 1 ? T.cyan : winner === 2 ? T.pink : T.amber;
    this.shake = this.reduce ? 0 : 0.85;
    this.haptic([0, 60, 40, 120]);
    if (winner === 3) { if (CT.Audio.gameover) CT.Audio.gameover(); }
    else if (CT.Audio.achievement) CT.Audio.achievement();
    this.setState('over');
  };

  // Place le serpent ennemi sur une case libre, loin du spawn du joueur (centre).
  // `race` = true → c'est le GLOUTON (niveau course) : il chasse la batterie, pas le joueur.
  G.spawnEnemy = function (race) {
    const ec = CT.CONFIG.enemy;
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    let x = 2, y = 2, tries = 0;
    do {
      x = 1 + ((this.rng() * (COLS - 2)) | 0);
      y = 1 + ((this.rng() * (ROWS - 2)) | 0);
    } while (++tries < 200 && (this.obstacleSet.has(this.cellKey(x, y)) || this.portalTwin(x, y) ||
             (Math.abs(x - cx) + Math.abs(y - cy)) < 7));   // démarre loin du joueur
    const body = [];
    for (let i = 0; i < ec.length; i++) body.push({ x, y });   // empilé → se déploie en bougeant
    const dirs = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    this.enemy = { body, prev: body.map((s) => ({ x: s.x, y: s.y })), dir: dirs[(this.rng() * 4) | 0], race: !!race };
  };

  /* ---------------- portails de téléportation ---------------- */
  // Nombre de paires selon le niveau (0 en démo / combat de boss ; 1 en chrono).
  G.portalPairs = function (n) {
    const P = CT.CONFIG.portals;
    if (!P || this.demo || this.bossLevel) return 0;
    if (this.chrono) return 1;
    if (n < P.fromLevel) return 0;
    return Math.min(P.maxPairs || 2, 1 + Math.floor((n - P.fromLevel) / (P.extraEvery || 6)));
  };

  // Place les paires de portails : cases libres hors couloir de spawn, bouches d'une même
  // paire éloignées (minDist toroïdal), paires écartées entre elles. Aléa déterministe.
  G.spawnPortals = function () {
    this.portals = [];
    const P = CT.CONFIG.portals;
    const pairs = this.portalPairs(this.levelNum);
    if (!pairs) return;
    const td = (ax, ay, bx, by) => {
      let dx = Math.abs(ax - bx); dx = Math.min(dx, COLS - dx);
      let dy = Math.abs(ay - by); dy = Math.min(dy, ROWS - dy);
      return dx + dy;
    };
    const okCell = (x, y) => {
      if (this.forbidden(x, y)) return false;
      if (this.obstacleSet.has(this.cellKey(x, y))) return false;
      for (const q of this.portals) if (td(x, y, q.x, q.y) < 3) return false;
      return true;
    };
    for (let p = 0; p < pairs; p++) {
      let a = null, b = null, tries = 0;
      while (tries++ < 300 && !b) {
        const x = 1 + ((this.rng() * (COLS - 2)) | 0);
        const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
        if (!okCell(x, y)) continue;
        if (!a) { a = { x, y, pair: p }; continue; }
        if (td(a.x, a.y, x, y) >= (P.minDist || 8)) b = { x, y, pair: p };
      }
      if (a && b) this.portals.push(a, b);
    }
  };

  // Bouche jumelle du portail en (x,y), ou null si la case n'est pas un portail.
  G.portalTwin = function (x, y) {
    for (let i = 0; i < this.portals.length; i++) {
      const q = this.portals[i];
      if (q.x === x && q.y === y) return this.portals[(i % 2 === 0) ? i + 1 : i - 1] || null;
    }
    return null;
  };

  // Nombre de boss simultanés selon le palier (+1 tous les `countEvery` paliers, plafonné).
  G.bossCount = function (tier) {
    const B = CT.CONFIG.boss;
    return Math.max(1, Math.min(B.maxCount || 1, 1 + Math.floor((tier - 1) / (B.countEvery || 99))));
  };

  // Décide la forme du combat selon le palier : paliers PAIRS → HYDRE (1 boss à 2-3 têtes),
  // paliers IMPAIRS → ESSAIM (plusieurs boss à 1 tête). Varie les plaisirs.
  G.bossSpec = function (tier) {
    const B = CT.CONFIG.boss;
    if (tier % 2 === 0) return { hydra: true, count: 1, heads: Math.min(B.maxHeads || 3, 1 + (tier / 2)) };
    return { hydra: false, count: this.bossCount(tier), heads: 1 };
  };

  // Place les BOSS (serpents rouges surdimensionnés) loin du spawn joueur ET les uns des
  // autres. Chaque boss porte un tableau `heads` : 1 tête (essaim) ou 2-3 (hydre), chacune
  // avec ses propres PV → couper toutes les têtes pour l'abattre.
  G.spawnBosses = function (tier) {
    const B = CT.CONFIG.boss;
    const spec = this.bossSpec(tier);
    const count = spec.count;
    const len = Math.min(B.maxLen, B.baseLen + (tier - 1) * B.lenPerTier);
    const baseHp = B.baseHp + (tier - 1) * B.hpPerTier;
    // PV par tête : hydre → réparti (perHeadHpScale) ; essaim → perBossHpScale si plusieurs
    const headHp = spec.hydra
      ? Math.max(2, Math.round(baseHp * (B.perHeadHpScale || 0.6)))
      : (count > 1 ? Math.max(3, Math.round(baseHp * (B.perBossHpScale || 1))) : baseHp);
    const slots = HEAD_SLOTS[spec.heads] || [0];
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    const dirs = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    this.bosses = [];
    for (let k = 0; k < count; k++) {
      let x = 2, y = 2, tries = 0, ok = false;
      do {
        x = 1 + ((this.rng() * (COLS - 2)) | 0);
        y = 1 + ((this.rng() * (ROWS - 2)) | 0);
        const farCenter = (Math.abs(x - cx) + Math.abs(y - cy)) >= 8;
        let farOthers = true;
        for (const o of this.bosses) {
          const h = o.body[0];
          if (Math.abs(x - h.x) + Math.abs(y - h.y) < 6) { farOthers = false; break; }
        }
        ok = !this.obstacleSet.has(this.cellKey(x, y)) && !this.portalTwin(x, y) && farCenter && farOthers;
      } while (++tries < 250 && !ok);
      const body = [];
      for (let i = 0; i < len; i++) body.push({ x, y });
      const heads = slots.map((slot) => ({ hp: headHp, maxHp: headHp, slot, dead: false }));
      this.bosses.push({
        body, prev: body.map((s) => ({ x: s.x, y: s.y })), dir: dirs[(this.rng() * 4) | 0],
        boss: true, hydra: spec.hydra, tier, heads,
      });
    }
  };

  // Cases-grille des têtes VIVANTES d'un boss (hitboxes / cibles). 1 tête → au ras du corps
  // (body[0]) ; plusieurs → déployées une case devant, en éventail perpendiculaire au cou.
  // Toroïdal. Renvoie [{ x, y, head }].
  G.headCells = function (e) {
    const cells = [];
    if (!e.heads) return cells;
    const reach = e.heads.length > 1 ? 1 : 0;
    const d = e.dir, px = -d.y, py = d.x;          // perpendiculaire au cou
    const h0 = e.body[0];
    const bx = h0.x + d.x * reach, by = h0.y + d.y * reach;
    for (const head of e.heads) {
      if (head.dead) continue;
      const x = ((bx + px * head.slot) % COLS + COLS) % COLS;
      const y = ((by + py * head.slot) % ROWS + ROWS) % ROWS;
      cells.push({ x, y, head });
    }
    return cells;
  };

  // Liste des serpents hostiles courants : les BOSS (niveau boss) ou le Snakator (sinon).
  G.hostiles = function () {
    if (this.bosses && this.bosses.length) return this.bosses;
    return this.enemy ? [this.enemy] : [];
  };

  // PV cumulés (toutes têtes de tous les boss) → barres HUD/canvas + tension musicale.
  G.bossesHp = function () {
    let hp = 0, max = 0;
    for (const e of this.bosses) for (const h of e.heads) { hp += Math.max(0, h.hp); max += h.maxHp; }
    return { hp, max };
  };

  // Renvoie le serpent hostile occupant la case (x,y), ou null (corps OU tête vivante).
  G.hostileAt = function (x, y) {
    const list = this.hostiles();
    for (const e of list) {
      const b = e.body;
      for (let i = 0; i < b.length; i++) if (b[i].x === x && b[i].y === y) return e;
      if (e.boss) { const hc = this.headCells(e); for (let i = 0; i < hc.length; i++) if (hc[i].x === x && hc[i].y === y) return e; }
    }
    return null;
  };

  G.startLevel = function (n) {
    this.demo = false;
    this.setupLevel(n);
    // Annonce de niveau — plus dynamique pour l'arrivée du Snakator (niv. fromLevel), les boss,
    // la COURSE (Glouton) et le mode CHRONO.
    const ec = CT.CONFIG.enemy;
    this.introKind = this.versus ? 'versus'
      : this.chrono ? 'chrono'
      : this.bossLevel ? 'boss'
      : this.raceLevel ? 'race'
      : (this.enemy && ec && n === ec.fromLevel) ? 'enemy'
      : 'normal';
    const alarm = this.introKind === 'enemy' || this.introKind === 'boss' || this.introKind === 'race';
    this.introDur = CT.CONFIG.introDuration + (alarm ? 0.9 : (this.introKind === 'chrono' || this.introKind === 'versus') ? 0.4 : 0);
    this.introUntil = this.time + this.introDur;   // annonce le niveau (serpent figé)
    // MODE CHRONO : le décompte démarre quand le serpent s'élance (fin de l'annonce)
    if (this.chrono) this.chronoEnd = this.introUntil + (CT.CONFIG.chrono.duration || 120);
    // Labo « Départ protégé » : bouclier de grâce après l'annonce de niveau
    if (this.mods && this.mods.startShield) this.shieldUntil = this.introUntil + this.mods.startShield;
    if (alarm && CT.Audio.alert) CT.Audio.alert();                          // sting d'alerte
    else if (this.introKind === 'chrono' && CT.Audio.bonus) CT.Audio.bonus();   // sting « c'est parti »
    this._ach({ level: n });
    this.setState('playing');
  };

  G.continueLevel = function () {
    this.startLevel(this.levelNum + 1);
  };

  // Mode démo / attract : le serpent joue tout seul derrière le menu.
  G.startDemo = function () {
    this.demo = true;
    this.points = 0;
    this.combo = 0;
    this.setupLevel(1);
    this.setState('start');
    this.updateHud();
  };

  G.restartDemo = function () {
    const next = this.levelNum >= 3 ? 1 : this.levelNum + 1; // cycle 1→2→3 pour varier
    this.setupLevel(next);
  };

  G.togglePause = function () {
    if (this.state === 'playing') { this.pausedAt = this.time; this.setState('paused'); }
    else if (this.state === 'paused') {
      this.resumeUntil = this.time + 1.5;   // 3·2·1 avant de relancer le serpent (le joueur se repositionne)
      // MODE CHRONO : le temps passé en pause (+ le 3·2·1) ne compte pas
      if (this.chrono && this.chronoEnd > 0) this.chronoEnd += (this.time - this.pausedAt) + 1.5;
      this.setState('playing');
    }
  };

  G.toMenu = function () {
    this.reset();
    this.startDemo();
  };

  /* ---------------- entrées ---------------- */
  // `group` : 'p1' (flèches/swipe/D-pad) ou 'p2' (WASD). En solo, les deux pilotent le
  // serpent unique ; en versus, 'p2' pilote le 2ᵉ serpent (WASD contre les flèches).
  G.setDir = function (name, group) {
    if (this.state !== 'playing') return;
    const nd = DIRS[name];
    if (!nd) return;
    const p2 = this.versus && group === 'p2';
    const queue = p2 ? this.dirQueue2 : this.dirQueue;
    const cur = p2 ? this.dir2 : this.dir;
    // référence = dernier virage en file (sinon la direction courante) → permet d'enchaîner
    // deux quarts de tour serrés (ex. ↑ puis ←) sans que le 2ᵉ soit rejeté à tort comme demi-tour
    const ref = queue.length ? queue[queue.length - 1] : cur;
    if (nd.x === -ref.x && nd.y === -ref.y) return;   // interdit le demi-tour (relatif à la file)
    if (nd.x === ref.x && nd.y === ref.y) return;     // déjà cette direction → ignore
    if (queue.length >= 2) return;                    // file courte = réactivité (max 2 virages)
    queue.push(nd);
    // journal d'inputs (rejeu déterministe) : virage du JOUEUR en partie scorée
    if (!p2 && !this.demo && CT.SimCore && this.journal.length < CT.SimCore.MAX_TURNS) {
      this.journal.push([this.stepCount, CT.SimCore.DIR_CODE[name]]);
    }
    CT.Audio.turn();
  };

  /* ---------------- pilote auto (mode démo) ---------------- */
  // Une case est-elle sûre à l'arrivée ? (obstacles, corps sauf queue ; bords traversables)
  G.safeCell = function (x, y) {
    x = (x + COLS) % COLS; y = (y + ROWS) % ROWS;   // les bords se traversent
    if (this.obstacleSet.has(x + ',' + y)) return false;
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === x && this.snake[i].y === y) return false;
    }
    return true;
  };

  // Nombre de voisins libres autour d'une case (préfère l'espace ouvert).
  G.freedom = function (x, y) {
    let c = 0;
    for (const k in DIRS) { const d = DIRS[k]; if (this.safeCell(x + d.x, y + d.y)) c++; }
    return c;
  };

  // IA gloutonne : se rapproche de la batterie en évitant la mort immédiate.
  G.autopilot = function () {
    const head = this.snake[0], food = this.food;
    // distance toroïdale (les bords se traversent)
    const td = (a, b, n) => { const r = Math.abs(a - b); return Math.min(r, n - r); };
    let best = null, bestScore = -1e9;
    for (const k in DIRS) {
      const d = DIRS[k];
      if (d.x === -this.dir.x && d.y === -this.dir.y) continue; // pas de demi-tour
      const nx = (head.x + d.x + COLS) % COLS, ny = (head.y + d.y + ROWS) % ROWS;
      if (!this.safeCell(nx, ny)) continue;
      let s = -(td(nx, food.x, COLS) + td(ny, food.y, ROWS)); // plus proche = mieux
      s += this.freedom(nx, ny) * 1.5;                        // évite de s'enfermer
      s += Math.random() * 0.4;                               // un peu d'aléa
      if (s > bestScore) { bestScore = s; best = d; }
    }
    this.dirQueue = best ? [best] : [];
  };

  /* ---------------- monde ---------------- */
  G.cellKey = function (x, y) { return x + ',' + y; };

  G.isFree = function (x, y) {
    if (this.obstacleSet.has(this.cellKey(x, y))) return false;
    if (this.portalTwin(x, y)) return false;   // rien ne spawne sur une bouche de portail
    for (const s of this.snake) if (s.x === x && s.y === y) return false;
    if (this.food && this.food.x === x && this.food.y === y) return false;
    if (this.bonus && this.bonus.x === x && this.bonus.y === y) return false;
    if (this.malus && this.malus.x === x && this.malus.y === y) return false;
    return true;
  };

  // `forceType` (optionnel) impose le type du power-up (ex. bouclier garanti en combat de boss).
  G.spawnBonus = function (forceType) {
    let tries = 0;
    do {
      const x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (this.isFree(x, y)) {
        const B = CT.CONFIG.bonus;
        const r = this.rng();
        const cumD = B.shieldChance + B.magnetChance + B.doubleChance;
        const type = forceType ? forceType
          : r < B.shieldChance ? 'shield'
          : r < B.shieldChance + B.magnetChance ? 'magnet'
          : r < cumD ? 'double'
          : r < cumD + B.cutChance ? 'cut' : 'fast';
        this.bonus = { x, y, life: B.life, max: B.life, type };
        // annonce de l'apparition (power-up à durée limitée → attire l'œil)
        const col = type === 'shield' ? T.blue : type === 'magnet' ? T.violet
          : type === 'double' ? T.pink : type === 'cut' ? T.lime : T.amber;
        this.spawnFx(x, y, [col, '#ffffff', T.glow], 14);   // éclat « pop » (réduit si reduce-motion)
        if (!this.demo && CT.Audio.appear) CT.Audio.appear();
        return;
      }
    } while (++tries < 200);
  };

  // MALUS : apparition aléatoire (type tiré au hasard) sur une case libre. Aléa déterministe.
  G.spawnMalus = function () {
    const M = CT.CONFIG.malus;
    let tries = 0;
    do {
      const x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (this.isFree(x, y)) {
        const type = M.types[(this.rng() * M.types.length) | 0];
        this.malus = { x, y, life: M.life, max: M.life, type };
        this.spawnFx(x, y, [T.danger, T.amber, '#ffffff'], 12);   // éclat « pop » rouge (alerte)
        if (!this.demo && CT.Audio.appear) CT.Audio.appear();
        return;
      }
    } while (++tries < 200);
  };

  // Allonge le serpent ENNEMI de n blocs (plafonné). No-op s'il n'y a pas d'ennemi.
  G.growEnemy = function (n) {
    const e = this.enemy; if (!e) return;
    const max = CT.CONFIG.malus.maxEnemyLen || 14;
    for (let i = 0; i < n && e.body.length < max; i++) {
      const t = e.body[e.body.length - 1];
      e.body.push({ x: t.x, y: t.y });
      if (e.prev) e.prev.push({ x: t.x, y: t.y });
    }
  };

  // MALUS obstacles surprise : pose `count` murs TEMPORAIRES, loin de la tête (jamais piégeant).
  G.spawnTempWalls = function (count) {
    const head = this.snake[0];
    const until = this.time + (CT.CONFIG.malus.wallsDuration || 6);
    let placed = 0, tries = 0;
    while (placed < count && tries < 300) {
      tries++;
      const x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (!this.isFree(x, y)) continue;
      let ddx = Math.abs(x - head.x); ddx = Math.min(ddx, COLS - ddx);   // distance toroïdale
      let ddy = Math.abs(y - head.y); ddy = Math.min(ddy, ROWS - ddy);
      if (ddx + ddy < 4) continue;                       // pas juste devant la tête (fair-play)
      this.obstacleSet.add(this.cellKey(x, y));
      this.obstacles.push({ x, y });
      this.tempWalls.push({ x, y, until });
      this.spawnFx(x, y, [T.danger, '#ffffff'], 8);
      placed++;
    }
  };

  // MALUS ramassé : effet selon le type. Burger → allonge le JOUEUR ; les autres →
  // effet propre + allongent l'ENNEMI (enemyGrow). Indépendant des batteries/objectif.
  G.onEatMalus = function () {
    const m = this.malus, M = CT.CONFIG.malus;
    this.malus = null;
    // Labo « Antivirus » : proba (5 %/niv) de NEUTRALISER le malus (Math.random → ne décale
    // pas l'aléa déterministe des spawns). Feedback rassurant, aucun effet négatif appliqué.
    if (!this.demo && this.mods.malusResist > 0 && Math.random() < 0.05 * this.mods.malusResist) {
      const head = this.snake[0];
      this.flash = Math.max(this.flash, 0.5); this.flashColor = T.blue;
      this.spawnFx(head.x, head.y, [T.blue, T.cyan, '#ffffff'], 16);
      if (CT.Audio.shield) CT.Audio.shield();
      this.haptic(20);
      this.spawnToast('🦠 MALUS NEUTRALISÉ', head.x, head.y);
      this.updateHud();
      return;
    }
    this.flash = Math.max(this.flash, 0.7); this.flashColor = T.danger;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.45);
    this.haptic([0, 60, 40, 60]);
    if (CT.Audio.malus) CT.Audio.malus();
    const head = this.snake[0];
    this.spawnFx(head.x, head.y, [T.danger, T.amber, '#ffffff'], 22);
    let label = '🍔';
    if (m.type === 'burger') {
      for (let i = 0; i < M.grow; i++) {                 // allonge le serpent JOUEUR (duplique la queue)
        const t = this.snake[this.snake.length - 1];
        this.snake.push({ x: t.x, y: t.y });
        if (this.prev) this.prev.push({ x: t.x, y: t.y });
      }
      label = '🍔 +' + M.grow + ' blocs';
    } else {
      if (m.type === 'speed') { this.rushUntil = this.time + M.speedDuration; label = '⚡ COURT-CIRCUIT'; }
      else if (m.type === 'fog') { this.fogUntil = this.time + M.fogDuration; label = '🌫️ BROUILLAGE'; }
      else if (m.type === 'repel') { this.repelUntil = this.time + M.repelDuration; label = '🧲 AIMANT INVERSÉ'; }
      else if (m.type === 'walls') { this.spawnTempWalls(M.wallsCount); label = '🧱 OBSTACLES !'; }
      else if (m.type === 'steal') {
        const lost = Math.round(this.points * (M.stealFrac || 0.15));
        this.points = Math.max(0, this.points - lost); label = '💸 −' + lost + ' pts';
      }
      this.growEnemy(M.enemyGrow);                       // malus 2-6 : +2 blocs à l'ennemi
    }
    if (!this.demo) { this.spawnToast(label, head.x, head.y); this.updateHud(); }
  };

  // MALUS aimant inversé : repousse la batterie d'une case loin de la tête (déterministe).
  G.pushFood = function () {
    if (!this.food) return;
    const head = this.snake[0];
    let dx = head.x - this.food.x; if (dx > COLS / 2) dx -= COLS; else if (dx < -COLS / 2) dx += COLS;
    let dy = head.y - this.food.y; if (dy > ROWS / 2) dy -= ROWS; else if (dy < -ROWS / 2) dy += ROWS;
    const move = (mx, my) => {
      if (!mx && !my) return false;
      const nx = (this.food.x + mx + COLS) % COLS, ny = (this.food.y + my + ROWS) % ROWS;
      if (this.obstacleSet.has(this.cellKey(nx, ny))) return false;
      for (const s of this.snake) if (s.x === nx && s.y === ny) return false;
      this.food.x = nx; this.food.y = ny; return true;
    };
    // s'éloigne : direction OPPOSÉE à la tête (-sign), repli sur l'autre axe si bloqué
    if (Math.abs(dx) >= Math.abs(dy)) { if (!move(-Math.sign(dx), 0)) move(0, -Math.sign(dy)); }
    else { if (!move(0, -Math.sign(dy))) move(-Math.sign(dx), 0); }
  };

  // Retire les murs temporaires (MALUS) dont la durée est écoulée.
  G.expireTempWalls = function () {
    for (let i = this.tempWalls.length - 1; i >= 0; i--) {
      const w = this.tempWalls[i];
      if (this.time < w.until) continue;
      this.obstacleSet.delete(this.cellKey(w.x, w.y));
      const idx = this.obstacles.findIndex((o) => o.x === w.x && o.y === w.y);
      if (idx >= 0) this.obstacles.splice(idx, 1);
      this.spawnFx(w.x, w.y, [T.danger, '#ffffff'], 6);
      this.tempWalls.splice(i, 1);
    }
  };

  G.spawnFood = function () {
    let tries = 0;
    do {
      const x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (this.isFree(x, y)) { this.food = { x, y, born: this.time }; return; }
    } while (++tries < 400);
    // secours : première case libre
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++)
      if (this.isFree(x, y)) { this.food = { x, y, born: this.time }; return; }
  };

  // zone interdite : pourtour + couloir de spawn du serpent
  G.forbidden = function (x, y) {
    if (x < 1 || y < 1 || x > COLS - 2 || y > ROWS - 2) return true;
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    if (y >= cy - 1 && y <= cy + 1 && x >= cx - 6 && x <= cx + 2) return true;
    return false;
  };

  G.generateObstacles = function () {
    this.obstacles = [];
    this.obstacleSet = new Set();
    const count = this.level.obstacles | 0;
    if (count <= 0) return;

    const add = (x, y) => {
      const k = this.cellKey(x, y);
      if (this.forbidden(x, y) || this.obstacleSet.has(k)) return false;
      this.obstacleSet.add(k);
      this.obstacles.push({ x, y });
      return true;
    };

    const pattern = this.level.pattern;
    let guard = 0;
    while (this.obstacles.length < count && guard++ < 1500) {
      if (pattern === 'pillars') {
        const x = 2 + ((this.rng() * (COLS - 4)) | 0);
        const y = 2 + ((this.rng() * (ROWS - 4)) | 0);
        add(x, y);
      } else if (pattern === 'corners') {
        const corners = [[2, 2], [COLS - 3, 2], [2, ROWS - 3], [COLS - 3, ROWS - 3]];
        const c = corners[(this.rng() * 4) | 0];
        add(c[0], c[1]); add(c[0] + (c[0] < COLS / 2 ? 1 : -1), c[1]);
        add(c[0], c[1] + (c[1] < ROWS / 2 ? 1 : -1));
      } else if (pattern === 'diamond') {
        // anneau en losange : cases dont la distance de Manhattan au centre ≈ R
        const cx = (COLS / 2) | 0, cy = (ROWS / 2) | 0;
        const R = Math.floor(Math.min(COLS, ROWS) * 0.32);
        const x = 1 + ((this.rng() * (COLS - 2)) | 0);
        const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
        if (Math.abs((Math.abs(x - cx) + Math.abs(y - cy)) - R) <= 1) add(x, y);
      } else if (pattern === 'maze') {
        // murs courts alignés sur une grille (pas 3) → allure labyrinthe, couloirs réguliers
        const gx = 2 + 3 * ((this.rng() * Math.floor((COLS - 4) / 3)) | 0);
        const gy = 2 + 3 * ((this.rng() * Math.floor((ROWS - 4) / 3)) | 0);
        add(gx, gy);
        if ((gx + gy) % 2 === 0) add(gx + 1, gy); else add(gx, gy + 1);
      } else if (pattern === 'cross') {
        // croix « + » : bandes centrale verticale/horizontale, centre dégagé (spawn protégé)
        const cx = (COLS / 2) | 0, cy = (ROWS / 2) | 0, clear = 4;
        if (this.rng() < 0.5) {                       // bande verticale (x = cx)
          const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
          if (Math.abs(y - cy) > clear) add(cx, y);
        } else {                                       // bande horizontale (y = cy)
          const x = 1 + ((this.rng() * (COLS - 2)) | 0);
          if (Math.abs(x - cx) > clear) add(x, cy);
        }
      } else { // bars : segments aléatoires
        const horiz = this.rng() < 0.5;
        const len = 3 + ((this.rng() * 2) | 0);
        let x = 2 + ((this.rng() * (COLS - 4)) | 0);
        let y = 2 + ((this.rng() * (ROWS - 4)) | 0);
        for (let i = 0; i < len; i++) { add(x, y); if (horiz) x++; else y++; }
      }
    }

    this.ensureConnected();   // garantit que toute la map reste accessible
  };

  // BFS des cases libres atteignables depuis `start` (voisinage toroïdal).
  G.floodFree = function (start) {
    const seen = new Set();
    const sx = (start.x + COLS) % COLS, sy = (start.y + ROWS) % ROWS;
    const sk = sx + ',' + sy;
    if (this.obstacleSet.has(sk)) return seen;
    const stack = [[sx, sy]]; seen.add(sk);
    while (stack.length) {
      const cur = stack.pop();
      for (const k in DIRS) {
        const d = DIRS[k];
        const nx = (cur[0] + d.x + COLS) % COLS, ny = (cur[1] + d.y + ROWS) % ROWS;
        const nk = nx + ',' + ny;
        if (!seen.has(nk) && !this.obstacleSet.has(nk)) { seen.add(nk); stack.push([nx, ny]); }
      }
    }
    return seen;
  };

  // Ouvre des passages jusqu'à ce que toutes les cases libres soient accessibles
  // depuis le spawn (retire un obstacle frontière d'une poche isolée à chaque tour).
  G.ensureConnected = function () {
    const spawn = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
    let guard = 0;
    while (guard++ < 600) {
      const reached = this.floodFree(spawn);
      let pocket = null;
      for (let y = 0; y < ROWS && !pocket; y++) {
        for (let x = 0; x < COLS; x++) {
          const k = x + ',' + y;
          if (!this.obstacleSet.has(k) && !reached.has(k)) { pocket = { x, y }; break; }
        }
      }
      if (!pocket) return;              // tout est connecté
      this.openNear(pocket);
    }
  };

  // Retire un obstacle bordant la poche libre contenant `start`.
  G.openNear = function (start) {
    const region = this.floodFree(start);
    const borders = [];
    for (const key of region) {
      const p = key.split(',');
      const x = +p[0], y = +p[1];
      for (const k in DIRS) {
        const d = DIRS[k];
        const nk = ((x + d.x + COLS) % COLS) + ',' + ((y + d.y + ROWS) % ROWS);
        if (this.obstacleSet.has(nk)) borders.push(nk);
      }
    }
    if (borders.length) {
      const k = borders[(this.rng() * borders.length) | 0];
      this.obstacleSet.delete(k);
      this.obstacles = this.obstacles.filter((o) => (o.x + ',' + o.y) !== k);
    }
  };

  /* ---------------- pas logique ---------------- */
  G.step = function () {
    // MODE CHRONO : temps écoulé → fin de partie (score encaissé, pas une « mort » par collision)
    if (this.chrono && !this.demo && this.chronoEnd > 0 && this.time >= this.chronoEnd) {
      this.chronoExpired = true;
      return this.die();
    }
    if (!this.demo) this.stepCount++;                             // compteur de pas (rejeu déterministe)
    if (this.dirQueue.length) this.dir = this.dirQueue.shift();   // applique un virage par pas
    const head = this.snake[0];
    const nh = { x: head.x + this.dir.x, y: head.y + this.dir.y };
    const len = this.snake.length;

    // traversée des bords : on ressort en face (plateau toroïdal)
    nh.x = (nh.x + COLS) % COLS;
    nh.y = (nh.y + ROWS) % ROWS;

    // PORTAIL : entrer par une bouche → ressortir par l'autre (direction conservée)
    const twin = this.portalTwin(nh.x, nh.y);
    if (twin) {
      this.spawnFx(nh.x, nh.y, [T.cyan, T.violet, '#ffffff'], 10);
      nh.x = twin.x; nh.y = twin.y;
      this.spawnFx(nh.x, nh.y, [T.cyan, T.violet, '#ffffff'], 10);
      if (!this.demo && CT.Audio.appear) CT.Audio.appear();
      this.haptic(15);
    }

    const willEat = this.food && nh.x === this.food.x && nh.y === this.food.y;

    // Bouclier actif : heurter un mur le DÉTRUIT (+ bonus pièces) ; le bouclier reste actif.
    if (this.time < this.shieldUntil && this.obstacleSet.has(this.cellKey(nh.x, nh.y))) this.smashWall(nh.x, nh.y);

    // collisions mortelles (obstacles + corps + serpent ennemi) — ignorées pendant le bouclier
    if (this.time >= this.shieldUntil) {
      if (this.obstacleSet.has(this.cellKey(nh.x, nh.y))) return this.die();
      for (let i = 1; i < len; i++) {
        if (i === len - 1 && !willEat) continue; // la queue va libérer sa case
        if (this.snake[i].x === nh.x && this.snake[i].y === nh.y) return this.die();
      }
      if (this.hostileAt(nh.x, nh.y)) return this.die();   // on fonce dans l'ennemi / un boss
    } else {
      const hit = this.hostileAt(nh.x, nh.y);
      if (hit) this.biteSnake(hit, nh.x, nh.y);   // BOUCLIER : on mord (Snakator détruit / boss entamé)
    }

    // déplacement (index stables : segment i suit i-1)
    this.prev = this.snake.map((s) => ({ x: s.x, y: s.y }));
    for (let i = len - 1; i >= 1; i--) {
      this.snake[i].x = this.prev[i - 1].x;
      this.snake[i].y = this.prev[i - 1].y;
    }
    this.snake[0] = nh;

    // traînée cosmétique (skin acheté) : particules émises sur la case que la tête quitte
    if (this.trailStyle && this.trailStyle !== 'none') this.emitTrail(this.prev[0].x, this.prev[0].y);

    // Défi du jour : journal de course (position de tête + temps + niveau) → fantôme à battre
    if (this.daily && !this.demo && this.ghostRec && this.ghostRec.length < (CT.Ghost ? CT.Ghost.MAX_FRAMES : 6000)) {
      this.ghostRec.push([nh.x, nh.y, Math.round((this.time - this.runStart) * 100) / 100, this.levelNum]);
    }

    if (willEat) {
      const tail = this.prev[len - 1];
      this.snake.push({ x: tail.x, y: tail.y });
      this.prev.push({ x: tail.x, y: tail.y });
      this.onEat();
    }

    // power-up : ne fait pas grandir le serpent ni avancer l'objectif
    if (this.bonus && nh.x === this.bonus.x && nh.y === this.bonus.y) this.onEatBonus();

    // MALUS : on a foncé dedans → effet selon le type (indépendant des batteries)
    if (this.malus && nh.x === this.malus.x && nh.y === this.malus.y) this.onEatMalus();

    // COURSE : le Glouton détruit revient après un court répit
    if (this.raceLevel && !this.enemy && this.rivalRespawnAt > 0 && this.time >= this.rivalRespawnAt) {
      this.rivalRespawnAt = 0;
      this.spawnEnemy(true);
      const rh = this.enemy.body[0];
      this.spawnFx(rh.x, rh.y, [T.amber, T.glow, '#ffffff'], 16);
      this.spawnToast('🏁 LE GLOUTON REVIENT !', rh.x, rh.y);
      if (CT.Audio.alert) CT.Audio.alert();
    }

    // apparition aléatoire d'un malus (jeu réel hors boss ; aléa déterministe this.rng)
    if (!this.demo && !this.bossLevel && !this.malus) {
      const M = CT.CONFIG.malus;
      if (++this.sinceMalus >= M.every) {
        this.sinceMalus = 0;
        if (this.rng() < M.chance) this.spawnMalus();
      }
    }

    // ÉVÉNEMENTS aléatoires (jeu réel, hors boss, dès events.fromLevel) — aléa déterministe
    const EV = CT.CONFIG.events;
    if (EV && !this.demo && !this.bossLevel && this.levelNum >= EV.fromLevel && this.time >= this.eventCooldownUntil) {
      if (++this.sinceEvent >= EV.every) {
        this.sinceEvent = 0;
        if (this.rng() < EV.chance) this.startEvent();
      }
    }
    // 🎁 Pluie de power-ups : un power-up réapparaît dès que le slot est libre
    if (this.time < this.rainUntil && !this.bonus) this.spawnBonus();

    // BOSS : pas de batterie pour faire apparaître des power-ups → on sème des BOUCLIERS
    // (l'arme contre le boss) à intervalle régulier, de moins en moins souvent par palier.
    if (this.bossLevel && !this.demo && this.bossShieldEvery > 0) {
      if (++this.bossShieldTimer >= this.bossShieldEvery) {
        this.bossShieldTimer = 0;
        if (!this.bonus) this.spawnBonus('shield');
      }
    }

    // aimant : attire la batterie (bonus) OU la repousse (malus aimant inversé) — déterministe
    if (this.time < this.magnetUntil) this.pullFood();
    if (this.time < this.repelUntil) this.pushFood();

    // serpent ennemi (niv 3+) : il se déplace, puis on reteste le contact avec la tête
    const hostiles = this.hostiles();
    if (hostiles.length && this.state === 'playing') {
      const B = CT.CONFIG.boss;
      for (const e of hostiles) {
        this.stepSnake(e);                           // chaque ennemi/boss avance d'une case
        if (e.race) this.rivalEats(e);               // COURSE : le Glouton vole la batterie ?
        // ATTAQUE : dès le palier orbFromTier, le boss crache une ORBE qui vise le joueur
        if (e.boss && e.tier >= (B.orbFromTier || 99)) {
          e.orbTimer = (e.orbTimer || 0) + 1;
          const every = e.enraged ? Math.max(4, Math.round(B.orbEvery * 0.6)) : B.orbEvery;   // enragé : tir ↑
          if (e.orbTimer >= every && this.orbs.length < (B.orbMax || 5)) { e.orbTimer = 0; this.fireOrb(e); }
        }
      }
      if (this.time >= this.shieldUntil) {
        if (this.hostileAt(nh.x, nh.y)) return this.die();
      } else {
        const hit = this.hostileAt(nh.x, nh.y);   // BOUCLIER : un hostile a foncé sur notre tête → on le mord
        if (hit) this.biteSnake(hit, nh.x, nh.y);
      }
    }

    // MISSIONS : vérifie les objectifs secondaires (compteurs mis à jour pendant ce pas)
    this.checkMissions();
  };

  // COURSE : la tête du Glouton est-elle sur la batterie ? Il la mange → il grandit et
  // VOTRE objectif recule d'une batterie (la tension de la course).
  G.rivalEats = function (e) {
    const f = this.food;
    if (!f || !e.body.length) return;
    const h = e.body[0];
    if (h.x !== f.x || h.y !== f.y) return;
    const R = CT.CONFIG.race;
    const max = CT.CONFIG.malus.maxEnemyLen || 14;
    for (let i = 0; i < (R.grow || 1) && e.body.length < max; i++) {
      const t2 = e.body[e.body.length - 1];
      e.body.push({ x: t2.x, y: t2.y });
      if (e.prev) e.prev.push({ x: t2.x, y: t2.y });
    }
    this.batteries = Math.max(0, this.batteries - 1);   // l'objectif recule
    this.spawnFx(f.x, f.y, [T.amber, T.danger, '#ffffff'], 16);
    this.spawnToast('😋 BATTERIE VOLÉE !', f.x, f.y);
    this.flash = Math.max(this.flash, 0.45); this.flashColor = T.amber;
    if (CT.Audio.malus) CT.Audio.malus();
    this.spawnFood();
    this.updateHud();
  };

  // MISSIONS : marque les objectifs atteints (toast + ⚡ vers le Labo, jamais au score).
  G.checkMissions = function () {
    if (this.demo || !this.missions || !this.missions.length) return;
    for (const m of this.missions) {
      if (m.done || m.prog(this) < m.target) continue;
      m.done = true;
      // Labo « Prime de mission » : bonus ⚡ sur la récompense (versée au Labo, pas au score)
      const reward = Math.round(m.reward * (this.mods.missionMult || 1));
      this.missionCoins += reward;
      const head = this.snake[0];
      this.spawnToast(t('mission.toast', { n: reward }), head.x, head.y);
      this.flash = Math.max(this.flash, 0.6); this.flashColor = T.glow;
      this.haptic([0, 30, 30, 60]);
      if (CT.Audio.achievement) CT.Audio.achievement();
    }
  };

  // Bouclier : MORD le serpent hostile `e` à la case (x,y). Snakator : tête-à-tête (bloc 0) →
  // destruction TOTALE, sinon coupe la queue au point d'impact. BOSS : entame les PV (garde sa
  // taille) ; à 0 PV il tombe, et quand TOUS les boss tombent → niveau terminé.
  // Renvoie le nb de blocs détruits / PV ôtés.
  G.biteSnake = function (e, x, y) {
    if (!e) return 0;

    // BOSS / HYDRE : on vise les TÊTES. Mordre une tête vivante = headDamage à CETTE tête ;
    // mordre le corps = grignotage (1 PV) de la 1ʳᵉ tête vivante. La tête « tombe » à 0 PV ;
    // le boss est abattu quand TOUTES ses têtes sont coupées.
    if (e.boss) {
      let target = null, headHit = false;
      for (const hc of this.headCells(e)) if (hc.x === x && hc.y === y) { target = hc.head; headHit = true; break; }
      if (!target) {
        let onBody = false; for (const s of e.body) if (s.x === x && s.y === y) { onBody = true; break; }
        if (!onBody) return 0;
        target = e.heads.find((h) => !h.dead);   // morsure de corps → grignote une tête vivante
        if (!target) return 0;
      }
      const dmg = headHit ? (CT.CONFIG.boss.headDamage || 2) : 1;
      const wasAlive = !target.dead;
      target.hp = Math.max(0, target.hp - dmg);
      if (target.hp <= 0) target.dead = true;
      const justCut = wasAlive && target.dead;
      const stillAlive = e.heads.some((h) => !h.dead);
      this.spawnFx(x, y, [T.danger, T.amber, '#ffffff'], justCut ? 18 : (headHit ? 14 : 10));
      this.flash = Math.max(this.flash, justCut ? 0.9 : headHit ? 0.7 : 0.5); this.flashColor = T.danger;
      if (!this.reduce) this.shake = Math.max(this.shake, justCut ? 0.8 : headHit ? 0.6 : 0.4);
      this.haptic(justCut ? [0, 50, 30, 90] : headHit ? [0, 40, 30, 70] : 25);
      if (CT.Audio.smash) CT.Audio.smash();
      if (!this.demo) {
        const gain = (CT.CONFIG.enemy.bitePoints || 40) * this.levelNum * dmg;
        this.points += gain; this._scored();
        // « TÊTE COUPÉE » seulement s'il reste des têtes (sinon killBoss affichera la victoire)
        this.spawnToast((justCut && stillAlive) ? '🗡️ TÊTE COUPÉE !' : '💥 −' + dmg + ' PV', x, y);
        this._ach({ snakator: dmg });   // alimente la quête « Tueur de Snakator »
        this.snakRun += dmg;            // + la mission « blocs ennemis »
        if (justCut && CT.Audio.achievement) CT.Audio.achievement();
        this.updateHud();
      }
      // ENRAGE : sous 50 % de PV, le boss s'énerve (une fois) → poursuite implacable + aura
      // chauffée à blanc (drame en fin de combat).
      if (!e.enraged && stillAlive) {
        const tot = e.heads.reduce((s2, hh) => s2 + hh.maxHp, 0);
        const cur = e.heads.reduce((s2, hh) => s2 + Math.max(0, hh.hp), 0);
        if (cur / Math.max(1, tot) <= 0.5) {
          e.enraged = true;
          this.spawnFx(x, y, [T.danger, T.amber, '#ffffff'], 16);
          if (!this.demo) { this.spawnToast('😡 ENRAGÉ !', x, y); if (CT.Audio.alert) CT.Audio.alert(); }
        }
      }
      if (!stillAlive) this.killBoss(e);
      return dmg;
    }

    const b = e.body;
    let idx = -1;
    for (let i = 0; i < b.length; i++) if (b[i].x === x && b[i].y === y) { idx = i; break; }
    if (idx < 0) return 0;
    const headHit = idx === 0;
    const removed = b.slice(idx);          // blocs détruits (pour les FX) ; tête-à-tête → tout
    const destroyed = removed.length;
    if (headHit) {
      this.enemy = null;                   // destruction totale
      // le GLOUTON (niveau course) n'est jamais éliminé pour de bon : il revient après un répit
      if (e.race && this.raceLevel) this.rivalRespawnAt = this.time + ((CT.CONFIG.race && CT.CONFIG.race.respawn) || 6);
    } else {
      e.body.splice(idx);                  // coupe la queue au point d'impact
      if (e.prev) e.prev.splice(idx);
    }
    // feedback d'impact (cosmétique)
    for (const s of removed) this.spawnFx(s.x, s.y, [T.danger, T.amber, '#ffffff'], headHit ? 16 : 10);
    this.flash = Math.max(this.flash, headHit ? 0.85 : 0.5); this.flashColor = T.danger;
    if (!this.reduce) this.shake = Math.max(this.shake, headHit ? 0.7 : 0.4);
    this.haptic(headHit ? [0, 40, 30, 70] : 25);
    if (CT.Audio.smash) CT.Audio.smash();
    // récompense + quête (jeu réel uniquement ; l'ennemi n'existe pas en démo)
    if (!this.demo) {
      const gain = (CT.CONFIG.enemy.bitePoints || 40) * this.levelNum * destroyed;
      this.points += gain;
      this._scored();
      this.spawnToast((headHit ? (e.race ? '💥 GLOUTON DÉTRUIT +' : '💥 SNAKATOR DÉTRUIT +') : '✂️ +') + gain, x, y);
      this._ach({ snakator: destroyed });
      this.snakRun += destroyed;           // mission « blocs ennemis »
      if (headHit && CT.Audio.achievement) CT.Audio.achievement();
      this.updateHud();
    }
    return destroyed;
  };

  // UN boss tombe (PV à zéro) : retiré de la liste + récompense. Quand TOUS sont tombés
  // → bossLevelCleared() (niveau terminé). Avec plusieurs boss, n'enchaîne pas la cinématique
  // tant qu'il en reste.
  G.killBoss = function (e) {
    const tier = e.tier || this.bossTier || 1;
    const h = e.body[0];
    const i = this.bosses.indexOf(e);
    if (i >= 0) this.bosses.splice(i, 1);
    this.spawnFx(h.x, h.y, [T.amber, T.danger, T.glow, '#ffffff'], 30);
    this.flash = Math.max(this.flash, 0.9); this.flashColor = T.amber;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.7);
    this.haptic([0, 50, 30, 90]);
    if (!this.demo) {
      const gain = (CT.CONFIG.boss.reward || 800) * tier * this.levelNum;
      this.points += gain; this._scored();
      this.spawnToast('👹 BOSS −1  +' + gain, h.x, h.y);
      if (CT.Audio.achievement) CT.Audio.achievement();
      this.updateHud();
    }
    if (!this.bosses.length) this.bossLevelCleared();
  };

  // Tous les boss du niveau sont tombés → flash + cinématique de fin de niveau.
  G.bossLevelCleared = function () {
    this.bossLevel = false;   // évite tout re-déclenchement
    this.flash = 1; this.flashColor = T.glow;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.9);
    if (!this.demo) this.updateHud();
    this.startCinematic();
  };

  /* ---------------- événements aléatoires ---------------- */
  // Déclenche un événement surprise (type tiré via this.rng → déterministe) : bannière,
  // sting, effet temporisé. Un seul à la fois (cooldown géré par l'appelant via eventCooldownUntil).
  G.startEvent = function () {
    const EV = CT.CONFIG.events;
    const types = ['gold', 'blackout', 'rain'];
    const type = types[(this.rng() * types.length) | 0];
    let dur, text, color;
    if (type === 'gold') {              // 💰 pièces ×N sur les batteries
      dur = EV.goldDuration; this.goldUntil = this.time + dur;
      text = t('event.gold', { n: EV.goldMult }); color = T.amber;
      if (CT.Audio.bonus) CT.Audio.bonus();
    } else if (type === 'blackout') {   // 🌑 brouillard total (réutilise fogUntil/drawFog)
      dur = EV.blackoutDuration; this.fogUntil = Math.max(this.fogUntil, this.time + dur);
      text = t('event.blackout'); color = T.danger;
      if (CT.Audio.alert) CT.Audio.alert();
    } else {                            // 🎁 un power-up dès que le slot est libre
      dur = EV.rainDuration; this.rainUntil = this.time + dur;
      text = t('event.rain'); color = T.glow;
      if (CT.Audio.bonus) CT.Audio.bonus();
    }
    this.eventCooldownUntil = this.time + dur + (EV.cooldown || 15);
    this.eventBanner = { text, color, until: this.time + 2.2 };
    this.flash = Math.max(this.flash, 0.5); this.flashColor = color;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.3);
    this.haptic([0, 30, 30, 30]);
  };

  /* ---------------- orbes de boss (projectiles) ---------------- */
  // Tire une orbe depuis la tête du boss vers la tête du joueur (chemin toroïdal le plus
  // court). Position/vitesse en cases FLOTTANTES ; mise à jour dans tick (updateOrbs).
  G.fireOrb = function (e) {
    const B = CT.CONFIG.boss;
    const from = e.body[0], to = this.snake[0];
    let dx = to.x - from.x; if (dx > COLS / 2) dx -= COLS; else if (dx < -COLS / 2) dx += COLS;
    let dy = to.y - from.y; if (dy > ROWS / 2) dy -= ROWS; else if (dy < -ROWS / 2) dy += ROWS;
    const d = Math.hypot(dx, dy) || 1;
    this.orbs.push({
      x: from.x, y: from.y,
      vx: (dx / d) * B.orbSpeed, vy: (dy / d) * B.orbSpeed,
      life: B.orbLife, max: B.orbLife,
    });
    if (!this.demo && CT.Audio.appear) CT.Audio.appear();
  };

  // Avance les orbes (bords toroïdaux), teste le contact avec la tête : bouclier → orbe
  // DÉTRUITE (éclat), sinon → mort. Appelé chaque frame (dt) pendant la simulation.
  G.updateOrbs = function (dt) {
    if (!this.orbs.length) return;
    const head = this.snake[0];
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt;
      o.x = (o.x + o.vx * dt + COLS) % COLS;
      o.y = (o.y + o.vy * dt + ROWS) % ROWS;
      if (o.life <= 0) { this.orbs.splice(i, 1); continue; }
      let ddx = Math.abs(o.x - head.x); ddx = Math.min(ddx, COLS - ddx);   // distance toroïdale
      let ddy = Math.abs(o.y - head.y); ddy = Math.min(ddy, ROWS - ddy);
      if (ddx * ddx + ddy * ddy < 0.55 * 0.55) {
        this.orbs.splice(i, 1);
        if (this.time < this.shieldUntil) {          // bouclier : l'orbe éclate sans mal
          this.spawnFx(head.x, head.y, [T.violet, T.danger, '#ffffff'], 12);
          if (CT.Audio.smash) CT.Audio.smash();
          this.haptic(15);
        } else {
          return this.die();                          // orbe au visage → mort
        }
      }
    }
  };

  // Orbe : noyau incandescent + halo pulsé + courte traînée (lisible et menaçant).
  G.drawOrbs = function () {
    if (!this.orbs.length) return;
    const ctx = this.ctx, cell = this.cell;
    const skin = this.enemySkin || { main: T.danger, aura: T.violet };
    const pulse = this.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 10);
    for (const o of this.orbs) {
      const x = (o.x + 0.5) * cell, y = (o.y + 0.5) * cell;
      const a = U.clamp(o.life / o.max, 0, 1);
      const r = cell * (0.22 + 0.05 * pulse);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * a;
      // traînée (opposée à la vitesse)
      const tl = cell * 0.8;
      const d = Math.hypot(o.vx, o.vy) || 1;
      const grad = ctx.createLinearGradient(x, y, x - (o.vx / d) * tl, y - (o.vy / d) * tl);
      grad.addColorStop(0, skin.aura); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (o.vx / d) * tl, y - (o.vy / d) * tl); ctx.stroke();
      // noyau
      ctx.shadowColor = skin.aura; ctx.shadowBlur = 14 + pulse * 10;
      ctx.fillStyle = skin.main;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  // Bouclier : détruit un mur heurté (+ bonus pièces) sans consommer le bouclier.
  G.smashWall = function (x, y) {
    const k = this.cellKey(x, y);
    if (!this.obstacleSet.has(k)) return;
    this.obstacleSet.delete(k);
    const idx = this.obstacles.findIndex((o) => o.x === x && o.y === y);
    if (idx >= 0) this.obstacles.splice(idx, 1);
    // feedback d'impact (cosmétique, même en démo)
    this.spawnFx(x, y, [T.danger, T.amber, '#ffffff', T.blue], 18);   // éclats du mur
    this.flash = Math.max(this.flash, 0.5); this.flashColor = T.blue;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.4);
    this.haptic(20);
    if (CT.Audio.smash) CT.Audio.smash();
    // bonus en pièces (points × niveau) — jeu réel uniquement
    if (!this.demo) {
      const gain = (CT.CONFIG.bonus.wallPoints || 60) * this.levelNum;
      this.points += gain;
      this._scored();
      this.spawnToast('🧱 +' + gain, x, y);
      this._ach({ walls: 1 });
      this.wallsRun++;                     // mission « murs brisés »
      this.updateHud();
    }
  };

  // Vrai si (x,y) touche un hostile (serpent ennemi ou un boss). (compat — délègue à hostileAt)
  G.enemyHits = function (x, y) { return !!this.hostileAt(x, y); };

  // Déplace un serpent hostile `e` d'une case : marche aléatoire avec inertie (ou poursuite
  // si boss), évite demi-tour / obstacles / son propre corps ; bords toroïdaux. Aléa déterministe.
  G.stepSnake = function (e) {
    if (!e) return;
    const head = e.body[0];
    const opts = [];
    for (const k in DIRS) {
      const d = DIRS[k];
      if (d.x === -e.dir.x && d.y === -e.dir.y) continue;           // pas de demi-tour
      const nx = (head.x + d.x + COLS) % COLS, ny = (head.y + d.y + ROWS) % ROWS;
      if (this.obstacleSet.has(this.cellKey(nx, ny))) continue;     // évite les obstacles
      let onSelf = false;
      for (let i = 0; i < e.body.length - 1; i++) if (e.body[i].x === nx && e.body[i].y === ny) { onSelf = true; break; }
      if (onSelf) continue;
      opts.push(d);
    }
    let nd = e.dir;
    if (opts.length) {
      if (e.boss) {
        // BOSS : poursuit le joueur (option qui rapproche le plus de sa tête, chemin toroïdal),
        // avec un peu d'imprévu (turnChance) pour laisser respirer.
        const ph = this.snake[0];
        const td = (a, b2, n) => { const r = Math.abs(a - b2); return Math.min(r, n - r); };
        let bestD = 1e9, bestOpt = opts[0];
        for (const d of opts) {
          const nx = (head.x + d.x + COLS) % COLS, ny = (head.y + d.y + ROWS) % ROWS;
          const dist = td(nx, ph.x, COLS) + td(ny, ph.y, ROWS);
          if (dist < bestD) { bestD = dist; bestOpt = d; }
        }
        // enragé (< 50 % PV) : quasi plus d'imprévu → poursuite implacable
        const tc = e.enraged ? CT.CONFIG.boss.turnChance * 0.4 : CT.CONFIG.boss.turnChance;
        nd = (this.rng() < tc) ? opts[(this.rng() * opts.length) | 0] : bestOpt;
      } else if (e.race && this.food) {
        // GLOUTON (niveau course) : fonce sur la BATTERIE (pas sur le joueur), chemin toroïdal.
        const fd = this.food;
        const td = (a, b2, n) => { const r = Math.abs(a - b2); return Math.min(r, n - r); };
        let bestD = 1e9, bestOpt = opts[0];
        for (const d of opts) {
          const nx = (head.x + d.x + COLS) % COLS, ny = (head.y + d.y + ROWS) % ROWS;
          const dist = td(nx, fd.x, COLS) + td(ny, fd.y, ROWS);
          if (dist < bestD) { bestD = dist; bestOpt = d; }
        }
        const tc = (CT.CONFIG.race && CT.CONFIG.race.turnChance) || 0.1;
        nd = (this.rng() < tc) ? opts[(this.rng() * opts.length) | 0] : bestOpt;
      } else {
        const straight = opts.find((d) => d.x === e.dir.x && d.y === e.dir.y);
        const turn = this.rng() < CT.CONFIG.enemy.turnChance;
        nd = (straight && !turn) ? straight : opts[(this.rng() * opts.length) | 0];
      }
    }
    e.dir = nd;
    let nx = (head.x + nd.x + COLS) % COLS, ny = (head.y + nd.y + ROWS) % ROWS;
    // les hostiles empruntent aussi les portails (entrée → sortie jumelle)
    const tw = this.portalTwin(nx, ny);
    if (tw) { this.spawnFx(nx, ny, [T.cyan, T.violet], 6); nx = tw.x; ny = tw.y; }
    e.prev = e.body.map((s) => ({ x: s.x, y: s.y }));
    for (let i = e.body.length - 1; i >= 1; i--) { e.body[i].x = e.prev[i - 1].x; e.body[i].y = e.prev[i - 1].y; }
    e.body[0] = { x: nx, y: ny };
  };

  // Rapproche la batterie d'une case de la tête (chemin toroïdal, sans traverser
  // les obstacles ni le corps). S'arrête au contact (la tête doit la manger).
  G.pullFood = function () {
    if (!this.food) return;
    const head = this.snake[0];
    let dx = head.x - this.food.x;
    if (dx > COLS / 2) dx -= COLS; else if (dx < -COLS / 2) dx += COLS;
    let dy = head.y - this.food.y;
    if (dy > ROWS / 2) dy -= ROWS; else if (dy < -ROWS / 2) dy += ROWS;
    const move = (mx, my) => {
      if (!mx && !my) return false;
      const nx = (this.food.x + mx + COLS) % COLS, ny = (this.food.y + my + ROWS) % ROWS;
      if (this.obstacleSet.has(this.cellKey(nx, ny))) return false;
      for (const s of this.snake) if (s.x === nx && s.y === ny) return false; // pas sur le serpent
      this.food.x = nx; this.food.y = ny; return true;
    };
    // privilégie l'axe le plus éloigné, repli sur l'autre si bloqué
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (!move(Math.sign(dx), 0)) move(0, Math.sign(dy));
    } else {
      if (!move(0, Math.sign(dy))) move(Math.sign(dx), 0);
    }
  };

  // Pousse une maj de stats aux succès et notifie les nouveaux déblocages.
  G._ach = function (delta) {
    if (this.demo || !CT.Achievements) return;
    const newly = CT.Achievements.update(delta);
    for (const d of newly) this.onAchievement(d);
  };

  // Retour haptique (mobile/tablette) — no-op si non supporté, jamais en démo.
  G.haptic = function (pattern) {
    if (this.demo) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  };

  G.onEat = function () {
    this.batteries++;
    // le serpent prend la couleur suivante de la palette du skin (transition lissée dans tick)
    this.snakeColorTarget = hexRgb(this.palette[this.batteries % this.palette.length]);
    this.spawnFx(this.food.x, this.food.y);
    this.flash = 0.6; this.flashColor = T.charge;
    this.haptic(12);
    this.stepInterval = Math.max(
      CT.CONFIG.minStep / 1000,
      (this.level.step - this.batteries * this.speedup) / 1000
    );

    // Score + combo (uniquement en jeu réel, pas en démo)
    if (!this.demo) {
      this.score++;
      const comboWindow = 2.6 + this.mods.comboWindowBonus;          // Labo : combo facile
      this.combo = (this.time - this.lastEat < comboWindow) ? Math.min(this.combo + 1, 9) : 1;
      this.maxComboRun = Math.max(this.maxComboRun, this.combo);
      this.lastEat = this.time;
      const dbl = this.time < this.doubleUntil ? 2 : 1;             // power-up double points
      let gain = Math.round((50 + this.levelNum * 10) * this.combo * this.mods.pointMult * dbl); // Labo : surtension + inflation
      if (this.time < this.goldUntil) gain *= (CT.CONFIG.events.goldMult || 2);   // 💰 événement Ruée dorée
      // Labo « Coup de chance » : proba de doubler pièces + batterie de ce ramassage.
      // (Math.random, pas this.rng → ne décale pas l'aléa déterministe des spawns.)
      const lucky = this.mods.luckChance > 0 && Math.random() < 0.05 * this.mods.luckChance;
      if (lucky) { gain *= 2; this.score++; this.flash = 0.85; this.flashColor = T.amber; }
      this.points += gain;
      this._scored();
      this.spawnToast((lucky ? '🍀 ' : '') + '+' + gain + (this.combo > 1 ? '  x' + this.combo : ''), this.food.x, this.food.y);
      this._ach({ bat: lucky ? 2 : 1, combo: this.combo });
    }
    CT.Audio.pickup(this.combo || 1);   // son de ramassage : hauteur ↑ avec le combo (1 en démo)
    this.updateHud();

    if (this.batteries >= this.level.needed) {
      if (this.demo) this.restartDemo();
      else this.startCinematic();
    } else {
      this.spawnFood();
      // Tente de faire apparaître un power-up (fréquence ajustée par le Labo)
      this.sinceBonus++;
      const B = CT.CONFIG.bonus;
      const every = Math.max(2, B.every - this.mods.bonusEveryDelta);
      if (!this.bonus && this.sinceBonus >= every && this.rng() < B.chance) {
        this.spawnBonus();
        this.sinceBonus = 0;
      }
    }
  };

  // Power-up ramassé : bouclier (invuln.), aimant, double points (×2), ou charge rapide (surcharge)
  G.onEatBonus = function () {
    const b = this.bonus;
    const B = CT.CONFIG.bonus;
    this.bonus = null;

    if (!this.demo) { this.bonusCount++; this._ach({ bonus: 1 }); }
    this.haptic([0, 30, 40, 30]);
    if (!this.reduce) this.shake = Math.max(this.shake, 0.35);
    if (b.type === 'shield') {
      this.flash = 0.8; this.flashColor = T.blue;
      CT.Audio.shield();
      this.spawnFx(b.x, b.y, [T.blue, T.cyan, '#ffffff', T.glow], 26);
      this.shieldUntil = this.time + B.shieldDuration + this.mods.shieldBonus;   // Labo : bouclier renforcé
      if (!this.demo) this._awardBonus(B.shieldPoints * this.levelNum, 'BOUCLIER', b);
    } else if (b.type === 'magnet') {
      this.flash = 0.8; this.flashColor = T.violet;
      CT.Audio.magnet();
      this.spawnFx(b.x, b.y, [T.violet, T.cyan, '#ffffff', T.glow], 26);
      this.magnetUntil = this.time + B.magnetDuration + this.mods.magnetBonus;    // Labo : aimant longue portée
      if (!this.demo) this._awardBonus(B.magnetPoints * this.levelNum, 'AIMANT', b);
    } else if (b.type === 'double') {
      this.flash = 0.8; this.flashColor = T.pink;
      CT.Audio.double();
      this.spawnFx(b.x, b.y, [T.pink, '#ffffff', T.amber, T.glow], 26);
      this.doubleUntil = this.time + B.doubleDuration + this.mods.doubleBonus;     // Labo : double prolongé
      if (!this.demo) this._awardBonus(B.doublePoints * this.levelNum, 'DOUBLE', b);
    } else if (b.type === 'cut') {
      // Coupe-câble : effet INSTANTANÉ → raccourcit la queue (1 bloc, ×2 via Labo « Double coupe »).
      this.flash = 0.8; this.flashColor = T.lime;
      if (CT.Audio.smash) CT.Audio.smash();
      this.spawnFx(b.x, b.y, [T.lime, T.charge, '#ffffff', T.glow], 26);
      let n = CT.CONFIG.bonus.cutBlocks || 1;
      // Labo : proba (5 %/niv) d'enlever 2 blocs. Math.random (pas this.rng) → ne décale pas l'aléa des spawns.
      if (this.mods.cutDoubleChance > 0 && Math.random() < 0.05 * this.mods.cutDoubleChance) n = 2;
      const removed = this.cutTail(n);
      if (!this.demo) {
        const gain = B.cutPoints * this.levelNum;
        this.points += gain; this._scored();
        this.spawnToast('✂️ −' + removed + ' bloc' + (removed > 1 ? 's' : '') + '  +' + gain, b.x, b.y);
        this.updateHud();
      }
    } else {
      this.flash = 0.8; this.flashColor = T.amber;
      CT.Audio.bonus();
      this.spawnFx(b.x, b.y, ['#ffd76b', T.amber, '#ffffff', T.charge], 26);
      this.slowUntil = this.time + B.slowDuration + this.mods.slowBonus;          // Labo : surcharge prolongée
      if (!this.demo) this._awardBonus(B.points * this.levelNum, 'SURCHARGE', b);
    }
  };

  // Retire jusqu'à `n` blocs de la queue du serpent (sans descendre sous `cutMin`).
  // Renvoie le nombre réellement retiré. Tête + prev gardés cohérents pour l'interpolation.
  G.cutTail = function (n) {
    const min = CT.CONFIG.bonus.cutMin || 2;
    let removed = 0;
    while (removed < n && this.snake.length > min) {
      this.snake.pop();
      if (this.prev && this.prev.length > this.snake.length) this.prev.pop();
      removed++;
    }
    return removed;
  };

  G._awardBonus = function (gain, label, b) {
    this.points += gain;
    if (this.points > this.best) this.best = this.points;   // affichage ; persistance au game over
    this.spawnToast('+' + gain + ' ' + label, b.x, b.y);
    this.updateHud();
  };

  G.spawnToast = function (text, gx, gy) {
    this.toast = { text, x: gx, y: gy, life: 0.9, max: 0.9 };
  };

  // Mise à jour du score affiché + déclenche la bannière « RECORD BATTU ! » au franchissement
  // du record perso (une seule fois par partie ; jamais en démo, jamais si pas de record à battre).
  G._scored = function () {
    if (this.points > this.best) this.best = this.points;   // affichage ; persistance au game over
    if (!this.demo && !this.recordBeaten && this.recordToBeat > 0 && this.points > this.recordToBeat) {
      this.recordBeaten = true;
      this.recordBannerUntil = this.time + 1.8;
      if (CT.Audio.achievement) CT.Audio.achievement();   // fanfare cristalline
      this.haptic([0, 40, 50, 40]);
      if (!this.reduce) this.shake = Math.max(this.shake, 0.4);
    }
  };

  // Labo « Seconde chance » : bouclier de grâce à la place de la mort (traverse murs / câble /
  // ennemis / orbes le temps de se dégager). Consomme une réanimation.
  G.reviveGrace = function () {
    this.shieldUntil = this.time + 3;
    this.flash = 1; this.flashColor = T.blue;
    if (!this.reduce) this.shake = Math.max(this.shake, 0.6);
    const head = this.snake[0];
    this.spawnFx(head.x, head.y, [T.blue, T.cyan, '#ffffff', T.glow], 30);
    this.spawnToast('🔁 SECONDE CHANCE !', head.x, head.y);
    if (CT.Audio.achievement) CT.Audio.achievement();
    this.haptic([0, 60, 40, 90]);
  };

  G.die = function () {
    // En démo, on ne meurt pas : on relance simplement le tableau.
    if (this.demo) { this.restartDemo(); return; }
    // Labo « Seconde chance » : mort par COLLISION uniquement (pas au temps écoulé du chrono),
    // en jeu réel → réanimation avec bouclier de grâce au lieu du game over.
    if (!this.versus && !this.chronoExpired && this.revivesLeft > 0 && this.state === 'playing') {
      this.revivesLeft--;
      this.reviveGrace();
      return;
    }

    this.flash = 1; this.flashColor = T.danger;
    this.shake = this.reduce ? 0 : 1;
    CT.Audio.gameover();
    this.haptic([0, 70, 50, 140]);
    const isRecord = this.points >= this.best && this.points > 0;

    // soumission au classement (métadonnées pour validation serveur)
    this.lastEntry = {
      name: (CT.Leaderboard.getName() || 'Joueur').slice(0, 14),
      score: this.points,
      level: this.levelNum,
      batteries: this.score,
      bonuses: this.bonusCount,
      durationMs: Math.max(0, Math.round((this.time - this.runStart) * 1000)),
      seed: this.seed,
      daily: this.daily,                               // Défi du jour → classement « Jour »
      chrono: this.chrono,                             // Mode Chrono → classement « ⏱ Chrono »
      diff: this.diffId,                               // difficulté appliquée (easy/normal/hard)
      steps: this.stepCount,                           // nb de pas (rejeu déterministe)
      journal: (CT.SimCore ? CT.SimCore.encodeJournal(this.journal) : ''),  // journal d'inputs compact
      ts: Date.now(),
    };
    // Défi du jour : si la course bat le fantôme, elle DEVIENT le fantôme du jour
    this.newGhost = false;
    if (this.daily && CT.Ghost && this.ghostRec && this.points > 0) {
      this.newGhost = CT.Ghost.maybeSave(this.points, this.ghostRec);
    }
    // Défi d'un ami (QR) : score dépassé → défi relevé
    this.challengeWon = !!(this.challenge && this.points > this.challenge.score);
    // soumet au classement (serveur si configuré) ; l'UI attend cette promesse avant de relire les boards
    this.lastSubmit = this.points > 0 ? CT.Leaderboard.submit(this.lastEntry) : Promise.resolve({ ok: true });
    // verse les ressources de la partie dans la banque du Laboratoire
    // (+ les ⚡ des missions accomplies — récompense hors score, donc hors classement)
    if (CT.Lab) CT.Lab.bank({ batteries: this.score, points: this.points + (this.missionCoins || 0) });
    // succès liés à la fin de partie (+ comptage des parties jouées)
    this._ach({ score: this.points, durationMs: this.lastEntry.durationMs, bankPts: this.points, game: 1 });

    if (this.dom.overStats) {
      const totalS = Math.floor(this.lastEntry.durationMs / 1000);
      const dur = Math.floor(totalS / 60) + ':' + String(totalS % 60).padStart(2, '0');
      const pu = this.bonusCount > 1 ? t('word.powerups') : t('word.powerup');
      let html =
        t('over.level') + '<b>' + this.levelNum + '</b><br>' +
        t('over.batteries') + '<b>' + this.score + '</b><br>' +
        t('over.score') + '<b>' + this.points + '</b>' +
        (isRecord ? t('over.record') : '') +
        '<span class="over-recap">' + t('over.recap', { dur, n: this.bonusCount, pu, combo: this.maxComboRun }) +
        (this.newGhost ? t('over.newghost') : '') + '</span>';
      // Défi d'un ami (QR) : relevé ou non
      if (this.challenge) {
        html += '<span class="over-missions">' + t('over.challenge', { name: this.challenge.name, score: this.challenge.score }) +
          (this.challengeWon ? t('over.challenge.won') : t('over.challenge.lost')) + '</span>';
      }
      // récap des missions de partie (✅ accomplies / ▫️ manquées + ⚡ gagnées)
      if (this.missions && this.missions.length) {
        const done = this.missions.filter((m) => m.done).length;
        html += '<span class="over-missions">' + t('over.missions', { done, total: this.missions.length }) +
          this.missions.map((m) => (m.done ? '✅' : '▫️') + ' ' + m.icon).join(' &nbsp;') +
          (this.missionCoins ? ' &nbsp;·&nbsp; <b>+' + this.missionCoins + ' ⚡</b>' : '') + '</span>';
      }
      if (CT.Lab && (this.score > 0 || this.points > 0 || this.missionCoins > 0)) {
        const w = CT.Lab.wallet();
        html += '<br><span class="lab-gain">' + t('over.labgain', { bat: this.score, pts: this.points + (this.missionCoins || 0), b: w.bat, p: w.pts }) + '</span>';
      }
      this.dom.overStats.innerHTML = html;
    }
    this.setState('over');
  };

  G.startCinematic = function () {
    const variant = CT.pickCinematic(this.lastVariant);
    this.lastVariant = variant;
    this.cine.start(variant, this.levelNum, this.W, this.H);
    if (this.dom.continueBtn) this.dom.continueBtn.classList.add('hidden');
    this.setState('cinematic');
  };

  /* ---------------- effets (particules pixel) ---------------- */
  G.spawnFx = function (gx, gy, colors, count) {
    const cx = (gx + 0.5) * this.cell, cy = (gy + 0.5) * this.cell;
    const pal = colors || [T.cyan, T.glow, T.charge, T.teal];
    const n = this.reduce ? Math.ceil((count || 16) * 0.35) : (count || 16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 180;
      this.fx.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: this.cell * (0.12 + Math.random() * 0.18),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
        life: 0.5 + Math.random() * 0.4, max: 0.9,
        color: pal[(Math.random() * pal.length) | 0],
      });
    }
  };

  // Traînée cosmétique (CT.Trails) : émet 1-2 particules stylées sur la case (gx,gy) que la
  // tête vient de quitter. Math.random (cosmétique) → ne décale pas l'aléa déterministe.
  G.emitTrail = function (gx, gy) {
    const style = this.trailStyle;
    if (this.reduce && Math.random() < 0.65) return;   // reduce-motion : ~35 % des particules
    const cell = this.cell;
    const cx = (gx + 0.5) * cell, cy = (gy + 0.5) * cell;
    const headHex = rgbToHex(this.snakeColorRgb);
    const n = style === 'etoiles' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 28;
      const p = {
        x: cx + (Math.random() - 0.5) * cell * 0.4,
        y: cy + (Math.random() - 0.5) * cell * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: cell * (0.10 + Math.random() * 0.12),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6,
        life: 0.45 + Math.random() * 0.3, max: 0.75,
        color: headHex, shape: 'rect',
      };
      if (style === 'etincelles') {                    // ✨ éclats chauds qui crépitent
        p.color = [T.amber, T.glow, '#ffffff'][(Math.random() * 3) | 0];
      } else if (style === 'bulles') {                 // 🫧 bulles qui montent doucement
        p.color = T.cyan; p.shape = 'bubble';
        p.vx *= 0.4; p.vy = -(15 + Math.random() * 25);
      } else if (style === 'flamme') {                 // 🔥 flammèches qui lèchent vers le haut
        p.color = [T.danger, T.amber, '#ff8c42'][(Math.random() * 3) | 0];
        p.shape = 'circle'; p.vy = -(5 + Math.random() * 18);
      } else if (style === 'etoiles') {                // 🌟 scintillements 4 branches
        p.color = [T.amber, '#ffffff', T.glow][(Math.random() * 3) | 0];
        p.shape = 'star'; p.size = cell * (0.16 + Math.random() * 0.12);
      }
      this.fx.push(p);
    }
  };

  G.updateFx = function (dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92; p.rot += p.vr * dt;
      if (p.life <= 0) this.fx.splice(i, 1);
    }
  };

  /* ---------------- HUD ---------------- */
  G.updateHud = function () {
    // libellé de gauche : « NIVEAU n » · « ⏱ CHRONO » · « 👥 DUEL »
    if (this.dom.lvlBox) {
      if (this.versus) this.dom.lvlBox.textContent = t('hud.duel');
      else if (this.chrono) this.dom.lvlBox.textContent = t('hud.chrono');
      else this.dom.lvlBox.innerHTML = t('hud.level') + ' <b>' + this.levelNum + '</b>';
    }
    const boss = this.bossLevel && this.bosses.length;
    if (this.versus) {
      // DUEL : la barre HUD montre l'avance de J1 (le scoreboard canvas montre les deux)
      const V = CT.CONFIG.versus;
      if (this.dom.bat) this.dom.bat.textContent = this.batteries;
      if (this.dom.need) this.dom.need.textContent = V.target;
      if (this.dom.unit) this.dom.unit.textContent = '🔋';
      if (this.dom.fill) this.dom.fill.style.width = (100 * this.batteries / V.target) + '%';
      if (this.dom.progress) { this.dom.progress.classList.remove('boss', 'near-goal'); }
    } else if (this.chrono) {
      // MODE CHRONO : la barre affiche le TEMPS RESTANT (elle se vide) à la place des batteries
      const D = CT.CONFIG.chrono.duration || 120;
      const rem = this.chronoEnd > 0 ? Math.max(0, Math.ceil(this.chronoEnd - this.time)) : D;
      if (this.dom.bat) this.dom.bat.textContent = rem;
      if (this.dom.need) this.dom.need.textContent = D;
      if (this.dom.unit) this.dom.unit.textContent = '⏱';
      if (this.dom.fill) this.dom.fill.style.width = (100 * rem / D) + '%';
      if (this.dom.progress) {
        this.dom.progress.classList.remove('boss');
        this.dom.progress.classList.toggle('near-goal', rem <= (CT.CONFIG.chrono.warnAt || 10));   // pulse de fin
      }
    } else if (boss) {
      // en combat de boss, la barre affiche les PV CUMULÉS (toutes têtes) à la place des batteries
      const { hp, max } = this.bossesHp();
      if (this.dom.bat) this.dom.bat.textContent = hp;
      if (this.dom.need) this.dom.need.textContent = max;
      if (this.dom.unit) this.dom.unit.textContent = '❤️';
      if (this.dom.fill) this.dom.fill.style.width = (100 * hp / Math.max(1, max)) + '%';
      if (this.dom.progress) { this.dom.progress.classList.add('boss'); this.dom.progress.classList.remove('near-goal'); }
    } else {
      if (this.dom.bat) this.dom.bat.textContent = this.batteries;
      if (this.dom.need && this.level) this.dom.need.textContent = this.level.needed;
      if (this.dom.unit) this.dom.unit.textContent = '🔋';
      if (this.dom.fill && this.level) this.dom.fill.style.width = (100 * this.batteries / this.level.needed) + '%';
      if (this.dom.progress && this.level) {
        const remaining = this.level.needed - this.batteries;   // « objectif proche » : pulse sur les 2 dernières
        this.dom.progress.classList.remove('boss');
        this.dom.progress.classList.toggle('near-goal', !this.demo && remaining > 0 && remaining <= 2);
      }
    }
    if (this.dom.score) this.dom.score.textContent = this.points;
    if (this.dom.best) this.dom.best.textContent = this.best;
    if (this.dom.startBest) this.dom.startBest.textContent = this.best;
  };

  /* ---------------- boucle ---------------- */
  G.tick = function (dt) {
    this.time += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);  // décroît dans tous les états
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    // transition douce de la couleur du serpent vers la cible (change à chaque batterie)
    if (this.snakeColorRgb) {
      const k = Math.min(1, dt * 9);
      for (let i = 0; i < 3; i++) this.snakeColorRgb[i] += (this.snakeColorTarget[i] - this.snakeColorRgb[i]) * k;
    }
    const simulating = this.state === 'playing' || (this.state === 'start' && this.demo);

    if (simulating) {
      if (this.demo) this.autopilot();
      let f = (this.time < this.slowUntil) ? CT.CONFIG.bonus.slowFactor : 1;   // surcharge : plus lent
      if (this.time < this.rushUntil) f *= CT.CONFIG.malus.speedFactor;        // court-circuit (malus) : plus rapide
      this.effInterval = this.stepInterval * f;
      const intro = !this.demo && (this.time < this.introUntil || this.time < this.resumeUntil);   // figé : annonce de niveau OU reprise (3·2·1)
      if (intro) {
        this.acc = 0;
      } else {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= this.effInterval && steps < 5) {
          this.acc -= this.effInterval;
          if (this.versus) this.stepVersus(); else this.step();
          steps++;
          if (!(this.state === 'playing' || (this.state === 'start' && this.demo))) break;
        }
      }
      if (this.bonus) { this.bonus.life -= dt; if (this.bonus.life <= 0) this.bonus = null; }
      if (this.malus) { this.malus.life -= dt; if (this.malus.life <= 0) this.malus = null; }
      if (this.orbs.length && this.state === 'playing') this.updateOrbs(dt);   // orbes de boss
      if (this.tempWalls.length) this.expireTempWalls();
      this.updateFx(dt);
      if (this.toast && this.toast.life > 0) this.toast.life -= dt;
      this.renderWorld();
    } else if (this.state === 'cinematic') {
      this.cine.update(dt);
      this.cine.draw();
      if (this.cine.isReady() && this.dom.continueBtn && this.dom.continueBtn.classList.contains('hidden')) {
        this.dom.continueBtn.classList.remove('hidden');
      }
    } else {
      // start / paused / over : board statique en fond
      this.renderWorld();
    }

    // MODE CHRONO : rafraîchit le compte à rebours du HUD une fois par seconde
    if (this.chrono && !this.demo && this.state === 'playing' && this.chronoEnd > 0) {
      const remS = Math.max(0, Math.ceil(this.chronoEnd - this.time));
      if (remS !== this._chronoShown) { this._chronoShown = remS; this.updateHud(); }
    }

    // Musique dynamique : la tension monte près de l'objectif, sous malus, ou en combat de boss.
    if (CT.Audio && CT.Audio.setTension) {
      let tn = 0;
      if (this.state === 'playing' && !this.demo) {
        if (this.bossLevel && this.bosses.length) {
          const { hp, max } = this.bossesHp();
          tn = 0.55 + 0.4 * (1 - hp / Math.max(1, max));   // ↑ quand les boss faiblissent
        } else if (this.level) {
          const rem = this.level.needed - this.batteries;
          if (rem > 0 && rem <= 2) tn = Math.max(tn, 0.6);                          // objectif proche
        }
        if (this.time < this.rushUntil || this.time < this.fogUntil || this.time < this.repelUntil) tn = Math.max(tn, 0.85); // sous malus
        if (this.chrono && this.chronoEnd > 0 && this.chronoEnd - this.time <= 15) tn = Math.max(tn, 0.85);  // dernières secondes du chrono
      }
      if (Math.abs(tn - (this._tension || 0)) > 0.02) { this._tension = tn; CT.Audio.setTension(tn); }
    }
  };

  /* ---------------- rendu monde ---------------- */
  G.renderWorld = function () {
    const ctx = this.ctx, W = this.W, H = this.H, cell = this.cell;

    // fond — teinté par le BIOME du niveau (bar/ciné/bowling/disco/laser)
    const tint = (this.biome && T[this.biome.tint]) || T.teal;
    const g = ctx.createRadialGradient(W / 2, H * 0.35, 20, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, mix(T.bg1, tint, 0.30)); g.addColorStop(0.55, T.bg1); g.addColorStop(1, T.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    this.drawBiome(tint);   // motif décoratif du lieu (derrière la grille, fixe)

    // screen-shake : décale le plateau (le fond reste fixe pour éviter les bords vides)
    ctx.save();
    if (this.shake > 0) {
      const amp = this.shake * this.shake * cell * 0.45;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }

    // pointillés de grille
    ctx.fillStyle = T.grid;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      ctx.fillRect((x + 0.5) * cell - 1, (y + 0.5) * cell - 1, 2, 2);
    }
    // bords « portails » (traversables) : trait pointillé qui pulse doucement
    ctx.save();
    ctx.strokeStyle = 'rgba(43,240,216,' + (0.18 + 0.1 * Math.sin(this.time * 2)) + ')';
    ctx.lineWidth = 2;
    ctx.setLineDash([cell * 0.5, cell * 0.4]);
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();

    this.drawObstacles();
    if (this.versus) {
      // DUEL : deux batteries + deux serpents (aucun système solo)
      if (this.food) this.drawVersusFood(this.food, T.cyan);
      if (this.food2) this.drawVersusFood(this.food2, T.pink);
      this.drawVersusSnake(this.snake, this.prev, this.dir, T.cyan, '1');
      this.drawVersusSnake(this.snake2, this.prev2, this.dir2, T.pink, '2');
      this.drawFx();
    } else {
      this.drawPortals();                              // portails de téléportation (sous le vivant)
      if (this.food) this.drawFood();
      if (this.bonus) this.drawBonus();
      if (this.malus) this.drawMalus();
      this.drawGhost();                                // fantôme du Défi du jour (sous tout le vivant)
      for (const e of this.hostiles()) this.drawHostile(e);
      this.drawOrbs();                                 // orbes de boss (au-dessus des boss)
      if (this.snake) this.drawSnake();
      this.drawFx();
      if (this.time < this.fogUntil) this.drawFog();   // MALUS brouillage : voile sauf autour de la tête
      this.drawTutorial();                             // onboarding (première partie)
    }
    this.drawToast();
    this.drawSurcharge();
    this.drawRecordBanner();
    this.drawEventBanner();
    this.drawIntro();
    this.drawResumeCountdown();
    ctx.restore();   // fin du screen-shake

    this.drawEffects();   // chips d'effets actifs (hors shake, style HUD)
    this.drawBossBar();   // barre de PV du boss (hors shake)
    this.drawChronoWarning();   // dernières secondes du mode chrono (hors shake)
    this.drawVersusHud();   // scoreboard du duel (hors shake)

    // flash plein écran
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * (this.reduce ? 0.12 : 0.22);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  // Petites pastilles « effet actif + compte à rebours » (coin haut-gauche du plateau).
  G.drawEffects = function () {
    const items = [];
    // combo en cours + fenêtre restante (lisibilité du système de score ; jamais en démo)
    if (!this.demo && this.combo >= 2 && this.state === 'playing') {
      const w = 2.6 + ((this.mods && this.mods.comboWindowBonus) || 0);
      const rem = this.lastEat + w - this.time;
      if (rem > 0) items.push({ c: T.amber, t: '🔥×' + this.combo, s: rem });
    }
    if (this.time < this.shieldUntil) items.push({ c: T.blue, t: '🛡️', s: this.shieldUntil - this.time });
    // événements actifs
    if (this.time < this.goldUntil) items.push({ c: T.amber, t: '💰', s: this.goldUntil - this.time });
    if (this.time < this.rainUntil) items.push({ c: T.glow, t: '🎁', s: this.rainUntil - this.time });
    if (this.time < this.slowUntil) items.push({ c: T.cyan, t: '🌀', s: this.slowUntil - this.time });
    if (this.time < this.magnetUntil) items.push({ c: T.violet, t: '🧲', s: this.magnetUntil - this.time });
    if (this.time < this.doubleUntil) items.push({ c: T.pink, t: '×2', s: this.doubleUntil - this.time });
    // MALUS temporisés (rouge)
    if (this.time < this.rushUntil) items.push({ c: T.danger, t: '⚡', s: this.rushUntil - this.time });
    if (this.time < this.fogUntil) items.push({ c: T.danger, t: '🌫️', s: this.fogUntil - this.time });
    if (this.time < this.repelUntil) items.push({ c: T.danger, t: '🧲', s: this.repelUntil - this.time });
    if (!items.length) return;
    const ctx = this.ctx, cell = this.cell;
    const h = cell * 0.74, w = cell * 1.7, pad = cell * 0.35, gap = cell * 0.18;
    ctx.save();
    ctx.font = '700 ' + Math.round(cell * 0.42) + 'px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    items.forEach((it, i) => {
      const x = pad, y = pad + i * (h + gap);
      ctx.globalAlpha = 0.82; ctx.fillStyle = 'rgba(2,22,26,0.7)';
      U.rr(ctx, x, y, w, h, h * 0.32); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = it.c; ctx.lineWidth = 1.5;
      U.rr(ctx, x, y, w, h, h * 0.32); ctx.stroke();
      ctx.fillStyle = it.c;
      ctx.fillText(it.t + ' ' + Math.ceil(it.s) + 's', x + h * 0.32, y + h * 0.54);
    });
    ctx.restore();
  };

  // Power-up + anneau de minuterie (temps restant).
  // Doré = charge rapide · bleu = bouclier · violet = aimant · rose = double points.
  G.drawBonus = function () {
    const ctx = this.ctx, cell = this.cell, b = this.bonus;
    const ring = b.type === 'shield' ? T.blue : b.type === 'magnet' ? T.violet
      : b.type === 'double' ? T.pink : b.type === 'cut' ? T.lime : T.amber;
    const cx = (b.x + 0.5) * cell, cy = (b.y + 0.5) * cell;
    const frac = U.clamp(b.life / b.max, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    const expiring = frac < 0.3;                                   // dernier tiers de vie → alerte « vite ! »
    const ringCol = expiring ? mix(ring, T.danger, 0.6) : ring;    // l'anneau vire au rouge
    ctx.save();
    ctx.translate(cx, cy);
    if (expiring) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 14));  // clignotement
    // anneau de minuterie
    ctx.shadowColor = ringCol; ctx.shadowBlur = 18 + pulse * 12;
    ctx.strokeStyle = ringCol; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, cell * 0.52, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();

    const bw = cell * 0.6 * (1 + pulse * 0.08), bh = cell * 0.4 * (1 + pulse * 0.08);
    const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    if (b.type === 'shield') { grad.addColorStop(0, '#9ec7ff'); grad.addColorStop(1, T.blue); }
    else if (b.type === 'magnet') { grad.addColorStop(0, '#d6c2ff'); grad.addColorStop(1, T.violet); }
    else if (b.type === 'double') { grad.addColorStop(0, '#ffc2e6'); grad.addColorStop(1, T.pink); }
    else if (b.type === 'cut') { grad.addColorStop(0, '#cffbb8'); grad.addColorStop(1, T.lime); }
    else { grad.addColorStop(0, '#ffe79b'); grad.addColorStop(1, T.amber); }
    ctx.fillStyle = grad; ctx.shadowBlur = 14;
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.3); ctx.fill();
    // borne +
    ctx.fillStyle = ring; ctx.shadowBlur = 0;
    ctx.fillRect(bw / 2, -bh * 0.18, bw * 0.1, bh * 0.36);

    if (b.type === 'shield') {
      // glyphe bouclier
      ctx.fillStyle = '#06243a';
      ctx.beginPath();
      ctx.moveTo(0, -bh * 0.34); ctx.lineTo(bw * 0.2, -bh * 0.14); ctx.lineTo(bw * 0.2, bh * 0.06);
      ctx.quadraticCurveTo(0, bh * 0.42, -bw * 0.2, bh * 0.06); ctx.lineTo(-bw * 0.2, -bh * 0.14);
      ctx.closePath(); ctx.fill();
    } else if (b.type === 'magnet') {
      // glyphe aimant en fer à cheval (U avec pointes)
      ctx.lineWidth = bh * 0.2; ctx.lineCap = 'butt';
      ctx.strokeStyle = '#241038';
      ctx.beginPath();
      ctx.moveTo(-bw * 0.2, -bh * 0.22); ctx.lineTo(-bw * 0.2, bh * 0.04);
      ctx.arc(0, bh * 0.04, bw * 0.2, Math.PI, 0, true);
      ctx.lineTo(bw * 0.2, -bh * 0.22);
      ctx.stroke();
      ctx.strokeStyle = '#ff5b6e';   // pointes
      ctx.beginPath(); ctx.moveTo(-bw * 0.2, -bh * 0.22); ctx.lineTo(-bw * 0.2, -bh * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bw * 0.2, -bh * 0.22); ctx.lineTo(bw * 0.2, -bh * 0.04); ctx.stroke();
    } else if (b.type === 'double') {
      // glyphe « ×2 »
      ctx.fillStyle = '#3a0a26';
      ctx.font = '800 ' + Math.round(bh * 0.95) + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('×2', 0, bh * 0.04);
    } else if (b.type === 'cut') {
      // glyphe ciseaux (deux lames croisées + anneaux des poignées)
      ctx.strokeStyle = '#0c3a18'; ctx.lineWidth = bh * 0.12; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-bw * 0.24, -bh * 0.24); ctx.lineTo(bw * 0.24, bh * 0.2);
      ctx.moveTo(-bw * 0.24, bh * 0.24); ctx.lineTo(bw * 0.24, -bh * 0.2);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(-bw * 0.26, -bh * 0.22, bh * 0.13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-bw * 0.26, bh * 0.22, bh * 0.13, 0, Math.PI * 2); ctx.stroke();
    } else {
      // éclair sombre
      ctx.fillStyle = '#5a3b00';
      ctx.beginPath();
      ctx.moveTo(bw * 0.06, -bh * 0.32); ctx.lineTo(-bw * 0.12, bh * 0.04);
      ctx.lineTo(bw * 0.0, bh * 0.04); ctx.lineTo(-bw * 0.06, bh * 0.34);
      ctx.lineTo(bw * 0.16, -bh * 0.04); ctx.lineTo(bw * 0.02, -bh * 0.04);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // MALUS : icône ROUGE qui CLIGNOTE + anneau de minuterie rouge. Tous rouges (vs power-ups
  // colorés) ; le TYPE se lit au glyphe blanc (le burger garde sa forme dédiée).
  G.drawMalus = function () {
    const ctx = this.ctx, cell = this.cell, m = this.malus;
    const cx = (m.x + 0.5) * cell, cy = (m.y + 0.5) * cell;
    const frac = U.clamp(m.life / m.max, 0, 1);
    const blink = this.reduce ? 0.9 : 0.45 + 0.55 * Math.abs(Math.sin(this.time * 8));   // clignotement
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = blink;
    // anneau de minuterie rouge (commun à tous les malus)
    ctx.shadowColor = T.danger; ctx.shadowBlur = 16;
    ctx.strokeStyle = T.danger; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, cell * 0.52, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();

    if (m.type === 'burger') {                          // 🍔 burger rouge (forme dédiée)
      const w = cell * 0.84, h = cell * 0.7;
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#e8643a'; U.rr(ctx, -w / 2, h * 0.12, w, h * 0.26, h * 0.13); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#3a160c'; U.rr(ctx, -w * 0.46, h * 0.02, w * 0.92, h * 0.14, h * 0.05); ctx.fill();
      ctx.fillStyle = '#ff9d6b'; U.rr(ctx, -w * 0.48, -h * 0.02, w * 0.96, h * 0.06, h * 0.03); ctx.fill();
      ctx.fillStyle = '#ff7a52';
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(-w / 2, -h * 0.44, 0, -h * 0.44);
      ctx.quadraticCurveTo(w / 2, -h * 0.44, w / 2, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe0b8';
      [[-w * 0.2, -h * 0.2], [0, -h * 0.28], [w * 0.2, -h * 0.2], [-w * 0.07, -h * 0.12], [w * 0.1, -h * 0.11]]
        .forEach((s) => { ctx.beginPath(); ctx.ellipse(s[0], s[1], w * 0.035, h * 0.028, 0, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore(); return;
    }

    // token rouge commun + glyphe blanc selon le type
    const w = cell * 0.78, h = cell * 0.64;
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, '#ff9aa6'); grad.addColorStop(1, T.danger);
    ctx.shadowBlur = 14; ctx.fillStyle = grad;
    U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#7a0a16'; ctx.lineWidth = Math.max(1, h * 0.06);
    U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.28); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (m.type === 'speed') {                            // ⚡ éclair (court-circuit)
      ctx.beginPath();
      ctx.moveTo(w * 0.08, -h * 0.30); ctx.lineTo(-w * 0.16, h * 0.04); ctx.lineTo(0, h * 0.04);
      ctx.lineTo(-w * 0.08, h * 0.32); ctx.lineTo(w * 0.18, -h * 0.04); ctx.lineTo(w * 0.02, -h * 0.04);
      ctx.closePath(); ctx.fill();
    } else if (m.type === 'fog') {                       // 🌫️ trois vagues (brouillage)
      ctx.lineWidth = h * 0.09;
      for (let i = 0; i < 3; i++) {
        const yy = -h * 0.2 + i * h * 0.2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.32, yy);
        ctx.quadraticCurveTo(-w * 0.1, yy - h * 0.1, 0, yy);
        ctx.quadraticCurveTo(w * 0.1, yy + h * 0.1, w * 0.32, yy);
        ctx.stroke();
      }
    } else if (m.type === 'repel') {                     // 🧲 deux flèches opposées (repousse)
      ctx.lineWidth = h * 0.11;
      ctx.beginPath();
      ctx.moveTo(-w * 0.04, 0); ctx.lineTo(-w * 0.3, 0);
      ctx.moveTo(-w * 0.22, -h * 0.14); ctx.lineTo(-w * 0.3, 0); ctx.lineTo(-w * 0.22, h * 0.14);
      ctx.moveTo(w * 0.04, 0); ctx.lineTo(w * 0.3, 0);
      ctx.moveTo(w * 0.22, -h * 0.14); ctx.lineTo(w * 0.3, 0); ctx.lineTo(w * 0.22, h * 0.14);
      ctx.stroke();
    } else if (m.type === 'walls') {                     // 🧱 briques décalées
      const bw2 = w * 0.18, bh2 = h * 0.13;
      [-h * 0.16, h * 0.04].forEach((ry, r) => {
        const off = r ? w * 0.11 : 0;
        for (let bx = -w * 0.34 + off; bx < w * 0.28; bx += w * 0.24) ctx.fillRect(bx, ry, bw2, bh2);
      });
    } else if (m.type === 'steal') {                     // 💸 pièce + flèche bas (vol)
      ctx.lineWidth = h * 0.09;
      ctx.beginPath(); ctx.arc(-w * 0.1, 0, h * 0.26, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.24, -h * 0.22); ctx.lineTo(w * 0.24, h * 0.22);
      ctx.moveTo(w * 0.13, h * 0.08); ctx.lineTo(w * 0.24, h * 0.22); ctx.lineTo(w * 0.35, h * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  };

  // MALUS brouillage : voile sombre sur le plateau, clair seulement autour de la tête.
  G.drawFog = function () {
    const ctx = this.ctx, cell = this.cell, W = this.W, H = this.H;
    const head = this.snake[0];
    const hx = (head.x + 0.5) * cell, hy = (head.y + 0.5) * cell;
    const r = cell * 4.5;
    const g = ctx.createRadialGradient(hx, hy, r * 0.4, hx, hy, r);
    g.addColorStop(0, 'rgba(2,12,16,0)');
    g.addColorStop(1, 'rgba(2,12,16,0.92)');
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  };

  // Barre de PV cumulés des boss (haut du plateau) pendant un combat de boss.
  G.drawBossBar = function () {
    if (!this.bossLevel || !this.bosses.length) return;
    const ctx = this.ctx, W = this.W, cell = this.cell;
    const { hp, max } = this.bossesHp();
    const isHydra = this.bosses.length === 1 && this.bosses[0].hydra;
    const n = isHydra ? this.bosses[0].heads.filter((h) => !h.dead).length : this.bosses.length;
    const label = isHydra ? ('🐉 HYDRE — ' + n + ' tête' + (n > 1 ? 's' : ''))
                          : ('👹 BOSS' + (n > 1 ? ' ×' + n : ''));
    const bw = Math.min(W * 0.62, cell * 13), bh = cell * 0.4;
    const bx = (W - bw) / 2, by = cell * 0.42;
    const frac = U.clamp(hp / Math.max(1, max), 0, 1);
    ctx.save();
    ctx.textAlign = 'center';
    // libellé (× nombre de boss s'ils sont plusieurs)
    ctx.fillStyle = T.danger; ctx.shadowColor = T.danger; ctx.shadowBlur = 10;
    ctx.font = '800 ' + Math.round(cell * 0.4) + 'px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label + ' — NIVEAU ' + this.levelNum, W / 2, by - cell * 0.14);
    ctx.shadowBlur = 0;
    // rail
    ctx.fillStyle = 'rgba(2,22,26,0.72)';
    U.rr(ctx, bx, by, bw, bh, bh * 0.5); ctx.fill();
    // remplissage PV
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#7a1f2a'); grad.addColorStop(1, T.danger);
    ctx.fillStyle = grad; ctx.shadowColor = T.danger; ctx.shadowBlur = 10;
    U.rr(ctx, bx, by, Math.max(bh, bw * frac), bh, bh * 0.5); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    U.rr(ctx, bx, by, bw, bh, bh * 0.5); ctx.stroke();
    // PV chiffrés
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(bh * 0.6) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText('❤️ ' + hp + ' / ' + max, W / 2, by + bh * 0.52);
    ctx.restore();
  };

  // Voile + bandeau pendant la surcharge (ralenti)
  G.drawSurcharge = function () {
    if (this.time >= this.slowUntil) return;
    const ctx = this.ctx, W = this.W, H = this.H, cell = this.cell;
    const a = 0.5 + 0.5 * Math.sin(this.time * 6);
    ctx.save();
    ctx.strokeStyle = 'rgba(38,224,224,' + (0.25 + 0.35 * a) + ')';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = T.cyan; ctx.globalAlpha = 0.9;
    ctx.shadowColor = T.cyan; ctx.shadowBlur = 14;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + (cell * 0.85).toFixed(0) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText(t('banner.surcharge'), W / 2, cell * 1.3);
    ctx.restore();
  };

  // Compte à rebours « 3 · 2 · 1 » à la reprise après pause (serpent figé le temps de se repositionner).
  G.drawResumeCountdown = function () {
    if (this.demo || this.time >= this.resumeUntil) return;
    const ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H);
    const remaining = this.resumeUntil - this.time;
    const n = U.clamp(Math.ceil(remaining / 0.5), 1, 3);   // 1,5 s → 3 · 2 · 1
    const frac = remaining / 0.5 - (n - 1);                // 1 → 0 dans le chiffre courant
    const a = U.clamp(frac * 1.4, 0, 1);
    const scale = 1.5 - 0.5 * frac;                        // le chiffre grossit en s'estompant
    ctx.save();
    ctx.globalAlpha = 0.35 * U.clamp(remaining / 0.4, 0, 1);   // voile (se lève à la fin)
    ctx.fillStyle = '#02161a'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.44); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = T.cyan; ctx.shadowColor = T.glow; ctx.shadowBlur = 24;
    ctx.font = '900 ' + Math.round(S * 0.18) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  };

  // Bannière « RECORD BATTU ! » (transitoire) quand le score dépasse le record perso en cours de partie.
  G.drawRecordBanner = function () {
    if (this.time >= this.recordBannerUntil) return;
    const ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H);
    const total = 1.8, remaining = this.recordBannerUntil - this.time, elapsed = total - remaining;
    const a = Math.min(U.clamp(elapsed / 0.25, 0, 1), U.clamp(remaining / 0.5, 0, 1));  // fondu entrée/sortie
    const pop = 1 + 0.05 * Math.sin(this.time * 16);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.30); ctx.scale(pop, pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 24;
    ctx.font = '900 ' + Math.round(S * 0.085) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText(t('banner.record'), 0, 0);
    ctx.restore();
  };

  // Bannière d'annonce d'ÉVÉNEMENT (« 💰 RUÉE DORÉE ! »…) — transitoire, au-dessus du plateau.
  G.drawEventBanner = function () {
    const b = this.eventBanner;
    if (!b || this.time >= b.until) return;
    const ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H);
    const total = 2.2, remaining = b.until - this.time, elapsed = total - remaining;
    const a = Math.min(U.clamp(elapsed / 0.25, 0, 1), U.clamp(remaining / 0.5, 0, 1));
    const pop = this.reduce ? 1 : 1 + 0.04 * Math.sin(this.time * 14);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.24); ctx.scale(pop, pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 22;
    ctx.font = '900 ' + Math.round(S * 0.062) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  };

  // Fantôme du Défi du jour : rejoue la meilleure course du jour (translucide) en temps réel.
  // Affiché seulement quand le fantôme est sur le MÊME niveau que le joueur (même map).
  G.drawGhost = function () {
    if (!this.daily || this.demo || !this.ghost || !this.ghost.frames || !this.ghost.frames.length) return;
    const frames = this.ghost.frames;
    const t = this.time - this.runStart;
    while (this.ghostIdx + 1 < frames.length && frames[this.ghostIdx + 1][2] <= t) this.ghostIdx++;
    const f = frames[this.ghostIdx];
    if (!f || f[2] > t) return;                        // le fantôme n'a pas encore bougé
    if (f[3] !== this.levelNum) return;                // fantôme sur un autre niveau (autre map)
    const ctx = this.ctx, cell = this.cell;
    const x = (f[0] + 0.5) * cell, y = (f[1] + 0.5) * cell;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = T.glow; ctx.shadowColor = T.glow; ctx.shadowBlur = 12;
    U.rr(ctx, x - cell * 0.42, y - cell * 0.42, cell * 0.84, cell * 0.84, cell * 0.24); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7;
    ctx.font = Math.round(cell * 0.6) + 'px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👻', x, y + cell * 0.03);
    ctx.restore();
  };

  // Bannière d'intro de niveau (« NIVEAU X — Objectif … »), serpent figé.
  G.drawIntro = function () {
    if (this.demo || this.time >= this.introUntil) return;
    const ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H);
    const kind = this.introKind || 'normal';
    const alarm = kind === 'enemy' || kind === 'boss' || kind === 'race';   // annonce dramatique
    const dur = this.introDur || CT.CONFIG.introDuration;
    const remaining = this.introUntil - this.time;
    const elapsed = dur - remaining;
    const a = Math.min(U.clamp(elapsed / 0.3, 0, 1), U.clamp(remaining / 0.4, 0, 1));
    const scale = 0.9 + 0.1 * U.clamp(elapsed / 0.3, 0, 1);
    ctx.save();
    // voile (rouge sombre pour les alertes)
    ctx.globalAlpha = a * (alarm ? 0.55 : 0.45);
    ctx.fillStyle = alarm ? '#180310' : '#02161a';
    ctx.fillRect(0, 0, W, H);
    // vignette d'alerte pulsée (entrée d'ennemi / boss / course)
    if (alarm && !this.reduce) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.globalAlpha = a * (0.18 + 0.22 * p);
      const vg = ctx.createRadialGradient(W / 2, H / 2, S * 0.18, W / 2, H / 2, S * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, T.danger);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    // textes
    ctx.globalAlpha = a;
    const pop = (alarm && !this.reduce) ? (1 + 0.035 * Math.sin(this.time * 11)) : 1;   // texte qui « palpite »
    ctx.translate(W / 2, H * 0.44); ctx.scale(scale * pop, scale * pop);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lvlTxt = t('hud.level') + ' ' + this.levelNum;
    if (kind === 'enemy') {                            // ⚠️ arrivée du Snakator (niv. 3)
      ctx.fillStyle = T.danger; ctx.shadowColor = T.danger; ctx.shadowBlur = 26;
      ctx.font = '900 ' + Math.round(S * 0.12) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.enemy.alert'), 0, -S * 0.06);
      ctx.shadowBlur = 12; ctx.fillStyle = T.text;
      ctx.font = '800 ' + Math.round(S * 0.058) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.enemy.title'), 0, S * 0.04);
      ctx.fillStyle = T.textDim; ctx.shadowBlur = 0;
      ctx.font = '700 ' + Math.round(S * 0.033) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.enemy.sub'), 0, S * 0.115);
    } else if (kind === 'boss') {                      // 👹 / 🐉 combat de boss (titre empilé → tient à l'écran)
      const hydra = this.bosses.length === 1 && this.bosses[0].hydra;
      const nHeads = hydra ? this.bosses[0].heads.length : 0;
      ctx.fillStyle = T.textDim; ctx.shadowColor = T.danger; ctx.shadowBlur = 8;
      ctx.font = '800 ' + Math.round(S * 0.05) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(lvlTxt, 0, -S * 0.095);
      ctx.fillStyle = T.danger; ctx.shadowColor = T.danger; ctx.shadowBlur = 26;
      ctx.font = '900 ' + Math.round(S * 0.12) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(hydra ? t('intro.hydra') : t('intro.boss'), 0, -S * 0.01);
      ctx.shadowBlur = 10; ctx.fillStyle = T.text;
      ctx.font = '700 ' + Math.round(S * 0.04) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(hydra ? t('intro.hydra.sub', { n: nHeads }) : t('intro.boss.sub'), 0, S * 0.085);
    } else if (kind === 'race') {                      // 🏁 niveau COURSE (le Glouton)
      ctx.fillStyle = T.textDim; ctx.shadowColor = T.amber; ctx.shadowBlur = 8;
      ctx.font = '800 ' + Math.round(S * 0.05) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(lvlTxt, 0, -S * 0.095);
      ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 26;
      ctx.font = '900 ' + Math.round(S * 0.115) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.race'), 0, -S * 0.01);
      ctx.shadowBlur = 10; ctx.fillStyle = T.text;
      ctx.font = '700 ' + Math.round(S * 0.04) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.race.sub1'), 0, S * 0.085);
      ctx.fillStyle = T.textDim; ctx.shadowBlur = 0;
      ctx.font = '700 ' + Math.round(S * 0.03) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.race.sub2'), 0, S * 0.145);
    } else if (kind === 'chrono') {                    // ⏱ MODE CHRONO
      ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 24;
      ctx.font = '900 ' + Math.round(S * 0.12) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.chrono'), 0, 0);
      ctx.shadowBlur = 10; ctx.fillStyle = T.text;
      ctx.font = '700 ' + Math.round(S * 0.045) + 'px -apple-system, system-ui, sans-serif';
      const mins = Math.round((CT.CONFIG.chrono.duration || 120) / 60);
      ctx.fillText(t('intro.chrono.sub', { mins, unit: mins > 1 ? t('word.minutes') : t('word.minute') }), 0, S * 0.1);
      ctx.fillStyle = T.textDim; ctx.shadowBlur = 0;
      ctx.font = '700 ' + Math.round(S * 0.032) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.chrono.sub2'), 0, S * 0.16);
    } else if (kind === 'versus') {                    // 👥 duel 2 joueurs
      ctx.fillStyle = T.cyan; ctx.shadowColor = T.glow; ctx.shadowBlur = 24;
      ctx.font = '900 ' + Math.round(S * 0.12) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.versus'), 0, -S * 0.02);
      ctx.shadowBlur = 10; ctx.fillStyle = T.text;
      ctx.font = '700 ' + Math.round(S * 0.04) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.versus.sub', { n: CT.CONFIG.versus.target }), 0, S * 0.07);
      ctx.fillStyle = T.textDim; ctx.shadowBlur = 0;
      ctx.font = '700 ' + Math.round(S * 0.03) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.versus.sub2'), 0, S * 0.135);
    } else {                                           // niveau normal
      if (this.daily) {                                // badge Défi du jour (map partagée)
        ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 12;
        ctx.font = '800 ' + Math.round(S * 0.038) + 'px -apple-system, system-ui, sans-serif';
        ctx.fillText(t('intro.daily') + (this.ghost ? t('intro.daily.ghost', { score: this.ghost.score }) : ''), 0, -S * 0.115);
      } else if (this.challenge) {                     // badge Défi d'un ami (QR)
        ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 12;
        ctx.font = '800 ' + Math.round(S * 0.036) + 'px -apple-system, system-ui, sans-serif';
        ctx.fillText(t('intro.challenge', { name: this.challenge.name, score: this.challenge.score }), 0, -S * 0.115);
      } else if (this.biome) {                         // badge du lieu (biome Cryptotem)
        const bn = (CT.i18n && CT.i18n.biome(this.biome.id)) || this.biome.name;
        ctx.fillStyle = (T[this.biome.tint] || T.teal); ctx.shadowColor = (T[this.biome.tint] || T.teal); ctx.shadowBlur = 12;
        ctx.font = '800 ' + Math.round(S * 0.038) + 'px -apple-system, system-ui, sans-serif';
        ctx.fillText(this.biome.icon + ' ' + bn, 0, -S * 0.115);
      }
      ctx.fillStyle = T.cyan; ctx.shadowColor = T.glow; ctx.shadowBlur = 24;
      ctx.font = '900 ' + Math.round(S * 0.13) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(lvlTxt, 0, 0);
      ctx.shadowBlur = 10; ctx.fillStyle = T.text;
      ctx.font = '700 ' + Math.round(S * 0.045) + 'px -apple-system, system-ui, sans-serif';
      ctx.fillText(t('intro.objective', { n: this.level.needed }), 0, S * 0.11);
      // MISSIONS de la partie (affichées au départ, niveau 1 uniquement)
      if (this.levelNum === 1 && this.missions && this.missions.length) {
        ctx.shadowBlur = 0;
        ctx.font = '700 ' + Math.round(S * 0.03) + 'px -apple-system, system-ui, sans-serif';
        this.missions.forEach((m, i) => {
          ctx.fillStyle = T.textDim;
          const ml = (CT.i18n && CT.i18n.mission(m.id)) || m.label;
          ctx.fillText('🎯 ' + ml + '  ·  +' + m.reward + ' ⚡', 0, S * (0.175 + i * 0.045));
        });
      }
    }
    ctx.restore();
  };

  // Portails : vortex à deux anneaux contre-rotatifs (couleur par paire) + cœur sombre.
  G.drawPortals = function () {
    if (!this.portals.length) return;
    const ctx = this.ctx, cell = this.cell;
    const colors = [[T.cyan, T.glow], [T.violet, T.pink]];   // une teinte par paire
    for (const q of this.portals) {
      const pal = colors[q.pair % colors.length];
      const x = (q.x + 0.5) * cell, y = (q.y + 0.5) * cell;
      const rot = this.reduce ? 0.8 : this.time * 2.4;
      const r = cell * 0.46;
      ctx.save();
      ctx.translate(x, y);
      // cœur sombre (la « bouche »)
      ctx.fillStyle = 'rgba(2,10,14,0.85)';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.fill();
      // anneaux tourbillon
      ctx.lineWidth = Math.max(2, cell * 0.09); ctx.lineCap = 'round';
      ctx.strokeStyle = pal[0]; ctx.shadowColor = pal[0]; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, r, rot, rot + Math.PI * 1.25); ctx.stroke();
      ctx.strokeStyle = pal[1]; ctx.shadowColor = pal[1];
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, -rot * 1.4, -rot * 1.4 + Math.PI * 1.1); ctx.stroke();
      // étincelle centrale pulsée
      ctx.shadowBlur = 8; ctx.fillStyle = pal[1];
      ctx.globalAlpha = 0.55 + (this.reduce ? 0 : 0.45 * Math.sin(this.time * 5 + q.pair * 2));
      ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  // MODE CHRONO : gros compte à rebours pulsé (haut du plateau) sur les dernières secondes.
  G.drawChronoWarning = function () {
    if (!this.chrono || this.demo || this.state !== 'playing' || this.chronoEnd <= 0) return;
    if (this.time < this.introUntil) return;
    const rem = this.chronoEnd - this.time;
    if (rem <= 0 || rem > (CT.CONFIG.chrono.warnAt || 10)) return;
    const ctx = this.ctx, W = this.W, cell = this.cell;
    const n = Math.ceil(rem);
    const frac = 1 - (rem - Math.floor(rem));           // 0→1 dans la seconde courante
    const scale = this.reduce ? 1 : 1.28 - 0.28 * Math.min(1, frac * 3);   // pop à chaque seconde
    const col = rem <= 5 ? T.danger : T.amber;
    ctx.save();
    ctx.translate(W / 2, cell * 1.6); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18;
    ctx.font = '900 ' + Math.round(cell * 1.15) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText('⏱ ' + n, 0, 0);
    ctx.restore();
  };

  // Décor thématique du lieu (derrière la grille, fixe). Subtil (basse opacité).
  G.drawBiome = function (tint) {
    const b = this.biome; if (!b) return;
    const ctx = this.ctx, W = this.W, H = this.H, motif = b.motif;
    ctx.save();
    if (motif === 'skyline') {                         // 🍸 bar : immeubles + fenêtres allumées
      let x = 0, i = 0;
      while (x < W) {
        const bw = W * 0.08 + (i % 3) * W * 0.02, bh = H * (0.12 + 0.06 * ((i * 7) % 5));
        ctx.globalAlpha = 0.18; ctx.fillStyle = mix(T.bg0, tint, 0.4);
        ctx.fillRect(x, H - bh, bw * 0.92, bh);
        ctx.globalAlpha = 0.10; ctx.fillStyle = tint;
        for (let wy = H - bh + 8; wy < H - 8; wy += 14) for (let wx = x + 6; wx < x + bw * 0.92 - 6; wx += 12) ctx.fillRect(wx, wy, 5, 6);
        x += bw; i++;
      }
    } else if (motif === 'film') {                     // 🎬 ciné : bandes de pellicule sur les côtés
      const sw = W * 0.06;
      ctx.globalAlpha = 0.16; ctx.fillStyle = mix(T.bg0, tint, 0.5);
      ctx.fillRect(0, 0, sw, H); ctx.fillRect(W - sw, 0, sw, H);
      ctx.globalAlpha = 0.45; ctx.fillStyle = T.bg0;
      for (let y = 8; y < H; y += 26) { ctx.fillRect(sw * 0.28, y, sw * 0.44, 14); ctx.fillRect(W - sw + sw * 0.28, y, sw * 0.44, 14); }
    } else if (motif === 'lanes') {                    // 🎳 bowling : pistes en perspective
      ctx.globalAlpha = 0.14; ctx.strokeStyle = mix(T.bg0, tint, 0.6); ctx.lineWidth = 2;
      const cxb = W / 2;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(cxb + k * W * 0.16, H); ctx.lineTo(cxb + k * W * 0.03, H * 0.2); ctx.stroke(); }
    } else if (motif === 'disco') {                    // 🪩 disco : rayons balayants depuis le haut
      const cxb = W / 2, cyb = H * 0.14;
      ctx.globalAlpha = 0.10;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + (this.reduce ? 0 : this.time * 0.3);
        ctx.fillStyle = k % 2 ? tint : T.violet;
        ctx.beginPath(); ctx.moveTo(cxb, cyb);
        ctx.lineTo(cxb + Math.cos(a) * W, cyb + Math.sin(a) * H);
        ctx.lineTo(cxb + Math.cos(a + 0.15) * W, cyb + Math.sin(a + 0.15) * H);
        ctx.closePath(); ctx.fill();
      }
    } else if (motif === 'laser') {                    // 🔫 laser game : faisceaux diagonaux croisés
      ctx.globalAlpha = 0.12; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const off = (k / 5) * H;
        ctx.strokeStyle = k % 2 ? tint : T.danger;
        ctx.beginPath(); ctx.moveTo(0, off); ctx.lineTo(W, off - H * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, H - off); ctx.lineTo(W, H - off + H * 0.5); ctx.stroke();
      }
    }
    ctx.restore();
  };

  // Batterie de duel (versus) dans la couleur du joueur.
  G.drawVersusFood = function (f, col) {
    const ctx = this.ctx, cell = this.cell;
    const cx = (f.x + 0.5) * cell, cy = (f.y + 0.5) * cell;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    const bw = cell * 0.6 * (1 + pulse * 0.06), bh = cell * 0.42 * (1 + pulse * 0.06);
    ctx.save(); ctx.translate(cx, cy);
    ctx.shadowColor = col; ctx.shadowBlur = 14 + pulse * 10;
    ctx.fillStyle = '#08252a'; U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = col; ctx.lineWidth = 2;
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(bw / 2, -bh * 0.18, bw * 0.10, bh * 0.36);
    ctx.fillStyle = mix(col, '#ffffff', 0.4);
    for (let i = 0; i < 3; i++) ctx.fillRect(-bw * 0.32 + i * bw * 0.22, -bh * 0.22, bw * 0.12, bh * 0.44);
    ctx.restore();
  };

  // Serpent de duel (versus) : câble coloré interpolé (traversée des bords) + tête numérotée.
  G.drawVersusSnake = function (snake, prev, dir, colHex, label) {
    const ctx = this.ctx, cell = this.cell;
    const t = this.state === 'playing' ? U.clamp(this.acc / this.effInterval, 0, 1) : 0;
    const len = snake.length, boardW = COLS * cell, boardH = ROWS * cell;
    const g = [];
    for (let i = 0; i < len; i++) {
      const p = prev[i] || snake[i], c = snake[i];
      let dx = c.x - p.x; if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;
      let dy = c.y - p.y; if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
      g.push({ x: p.x + dx * t, y: p.y + dy * t });
    }
    const px = (gx) => (gx + 0.5) * cell, py = (gy) => (gy + 0.5) * cell;
    const tailHex = mix(colHex, T.bg1, 0.55);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < len - 1; i++) {
      const f = i / Math.max(1, len - 1);
      const color = mix(colHex, tailHex, f), w = cell * (0.6 - 0.2 * f), blur = i < 3 ? 12 : 4;
      const a = g[i], b = g[i + 1], ax = px(a.x), ay = py(a.y), bx = px(b.x), by = py(b.y);
      if (Math.abs(a.x - b.x) > COLS / 2) {
        if (a.x < b.x) { this._cable(ax, ay, bx - boardW, by, color, w, blur); this._cable(ax + boardW, ay, bx, by, color, w, blur); }
        else { this._cable(ax, ay, bx + boardW, by, color, w, blur); this._cable(ax - boardW, ay, bx, by, color, w, blur); }
      } else if (Math.abs(a.y - b.y) > ROWS / 2) {
        if (a.y < b.y) { this._cable(ax, ay, bx, by - boardH, color, w, blur); this._cable(ax, ay + boardH, bx, by, color, w, blur); }
        else { this._cable(ax, ay, bx, by + boardH, color, w, blur); this._cable(ax, ay - boardH, bx, by, color, w, blur); }
      } else this._cable(ax, ay, bx, by, color, w, blur);
    }
    ctx.shadowBlur = 0;
    const head = g[0], ang = Math.atan2(dir.y, dir.x);
    this._forEachWrap(head.x, head.y, (x, y) => this._drawVersusHead(px(x), py(y), ang, colHex, label));
  };

  G._drawVersusHead = function (x, y, ang, colHex, label) {
    const ctx = this.ctx, cell = this.cell, w = cell * 1.4, h = cell * 1.0;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.shadowColor = colHex; ctx.shadowBlur = 14;
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#0c181c'); body.addColorStop(1, mix(colHex, '#0c181c', 0.45));
    ctx.fillStyle = body; U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.32); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = colHex; ctx.lineWidth = 2;
    U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.32); ctx.stroke();
    ctx.fillStyle = '#cfe9ea'; U.rr(ctx, w / 2 - cell * 0.06, -h * 0.18, cell * 0.22, h * 0.36, cell * 0.08); ctx.fill();
    ctx.rotate(-ang);   // libellé redressé
    ctx.fillStyle = colHex; ctx.shadowColor = colHex; ctx.shadowBlur = 8;
    ctx.font = '900 ' + Math.round(h * 0.6) + 'px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, h * 0.02);
    ctx.restore();
  };

  // Scoreboard du duel (haut du plateau, hors shake).
  G.drawVersusHud = function () {
    if (!this.versus) return;
    const ctx = this.ctx, W = this.W, cell = this.cell, V = CT.CONFIG.versus;
    ctx.save();
    ctx.font = '800 ' + Math.round(cell * 0.5) + 'px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = T.cyan; ctx.shadowColor = T.cyan; ctx.shadowBlur = 8; ctx.textAlign = 'left';
    ctx.fillText('🔵 J1  ' + this.batteries + '/' + V.target, cell * 0.4, cell * 0.6);
    ctx.fillStyle = T.pink; ctx.shadowColor = T.pink; ctx.textAlign = 'right';
    ctx.fillText(this.score2 + '/' + V.target + '  J2 🔴', W - cell * 0.4, cell * 0.6);
    ctx.restore();
  };

  // Onboarding : bandeau d'aide + halo sur la 1ʳᵉ batterie (première partie uniquement).
  G.drawTutorial = function () {
    if (!this.tutorial || this.demo || this.state !== 'playing') return;
    if (this.time < this.introUntil) return;           // attend la fin de l'annonce de niveau
    let msg;
    if (this.batteries === 0) msg = t('tuto.move');
    else if (this.batteries < 3) msg = t('tuto.border');
    else { this.tutorial = false; return; }            // tutoriel terminé (3 batteries)
    const ctx = this.ctx, W = this.W, H = this.H, cell = this.cell;
    // halo pulsé sur la batterie (étape 1)
    if (this.batteries === 0 && this.food) {
      const fx = (this.food.x + 0.5) * cell, fy = (this.food.y + 0.5) * cell;
      const p = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.save(); ctx.strokeStyle = T.glow; ctx.globalAlpha = 0.4 + 0.4 * p; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx, fy, cell * (0.75 + 0.18 * p), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // bandeau bas
    const bh = cell * 1.15, by = H - bh - cell * 0.4, bw = W - cell * 1.2, bx = cell * 0.6;
    ctx.save();
    ctx.fillStyle = 'rgba(2,22,26,0.85)'; U.rr(ctx, bx, by, bw, bh, cell * 0.3); ctx.fill();
    ctx.strokeStyle = T.glow; ctx.lineWidth = 2; U.rr(ctx, bx, by, bw, bh, cell * 0.3); ctx.stroke();
    ctx.fillStyle = T.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(cell * 0.46) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText(msg, W / 2, by + bh / 2);
    ctx.restore();
  };

  G.drawObstacles = function () {
    const ctx = this.ctx, cell = this.cell, pad = cell * 0.08, r = cell * 0.18;
    const dr = hexRgb(T.danger), hatch = 'rgba(' + dr.join(',') + ',0.42)';   // suit T.danger (mode daltonien)
    for (const o of this.obstacles) {
      const x = o.x * cell + pad, y = o.y * cell + pad, s = cell - pad * 2;
      ctx.save();
      // corps : dégradé sombre teinté danger (profondeur) + halo
      ctx.shadowColor = T.danger; ctx.shadowBlur = 8;
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, mix('#0c1a1e', T.danger, 0.22));
      g.addColorStop(1, '#0a161a');
      ctx.fillStyle = g;
      U.rr(ctx, x, y, s, s, r); ctx.fill();
      ctx.shadowBlur = 0;
      // hachures danger (deux diagonales), clippées au tuile arrondie
      ctx.save();
      U.rr(ctx, x, y, s, s, r); ctx.clip();
      ctx.strokeStyle = hatch; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.14, y + s * 0.86); ctx.lineTo(x + s * 0.86, y + s * 0.14);
      ctx.moveTo(x + s * 0.5, y + s * 0.92); ctx.lineTo(x + s * 0.92, y + s * 0.5);
      ctx.stroke();
      ctx.restore();
      // reflet biseauté (arête haute) → aspect « tuile » en relief
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + s - r, y + 1.5); ctx.stroke();
      // contour danger
      ctx.strokeStyle = T.danger; ctx.lineWidth = 2;
      U.rr(ctx, x, y, s, s, r); ctx.stroke();
      ctx.restore();
    }
  };

  G.drawFood = function () {
    const ctx = this.ctx, cell = this.cell;
    const cx = (this.food.x + 0.5) * cell, cy = (this.food.y + 0.5) * cell;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    const sc = 1 + pulse * 0.06;
    const bw = cell * 0.62 * sc, bh = cell * 0.42 * sc;

    // aura d'attraction de l'aimant : anneaux violets qui convergent
    if (this.time < this.magnetUntil) {
      ctx.save();
      ctx.strokeStyle = T.violet; ctx.shadowColor = T.violet; ctx.shadowBlur = 12;
      for (let i = 0; i < 3; i++) {
        const r = cell * (1.4 - ((this.time * 2.5 + i * 0.33) % 1) * 1.0);
        ctx.globalAlpha = 0.5 * (r / (cell * 1.4));
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // halo de charge pulsé (attire l'œil) — sauf sous aimant, qui a ses propres anneaux
    if (this.time >= this.magnetUntil) {
      ctx.save();
      ctx.globalAlpha = (this.reduce ? 0.28 : 0.22 + 0.22 * pulse);
      ctx.strokeStyle = T.charge; ctx.shadowColor = T.charge; ctx.shadowBlur = 10; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, cell * (0.66 + 0.12 * pulse), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);
    // corps batterie : dégradé teinté charge (haut plus clair) + halo
    ctx.shadowColor = T.charge; ctx.shadowBlur = 16 + pulse * 12;
    const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, mix('#0a2a30', T.charge, 0.16));
    bg.addColorStop(1, '#062024');
    ctx.fillStyle = bg;
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.fill();
    ctx.shadowBlur = 0;
    // reflet glossy (moitié haute)
    ctx.save();
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.clip();
    const gl = ctx.createLinearGradient(0, -bh / 2, 0, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(-bw / 2, -bh / 2, bw, bh * 0.5);
    ctx.restore();
    ctx.strokeStyle = T.charge; ctx.lineWidth = 2;
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.stroke();
    // borne +
    ctx.fillStyle = T.charge;
    ctx.fillRect(bw / 2, -bh * 0.18, bw * 0.10, bh * 0.36);
    // barres de charge
    ctx.fillStyle = mix(T.charge, T.cyan, 0.4);
    for (let i = 0; i < 3; i++) ctx.fillRect(-bw * 0.32 + i * bw * 0.22, -bh * 0.22, bw * 0.12, bh * 0.44);
    // éclair
    ctx.fillStyle = T.amber; ctx.shadowColor = T.amber; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(bw * 0.06, -bh * 0.3); ctx.lineTo(-bw * 0.12, bh * 0.05);
    ctx.lineTo(bw * 0.0, bh * 0.05); ctx.lineTo(-bw * 0.06, bh * 0.34);
    ctx.lineTo(bw * 0.16, -bh * 0.02); ctx.lineTo(bw * 0.02, -bh * 0.02);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  // Serpent hostile (Snakator ou BOSS) : chaîne de carrés rouges (tête à yeux), interpolés + glow.
  G.drawHostile = function (e) {
    if (!e) return;
    const ctx = this.ctx, cell = this.cell;
    // apparence achetée — sauf le GLOUTON (niveau course) : signature DORÉE (il convoite les batteries)
    const skin = e.race ? { main: T.amber, aura: T.glow }
      : (this.enemySkin || { main: T.danger, aura: T.violet });
    const eStyle = this.enemyHeadStyle || 'classic';   // visage acheté (classic/drole/agressif/ete)
    const boss = !!e.boss;                             // le BOSS est plus gros + aura « danger »
    const enraged = boss && !!e.enraged;               // < 50 % PV : pulse nerveux + aura chauffée
    const sizeScale = boss ? 1.35 : 1;
    const glowCol = boss ? skin.aura : skin.main;
    const moving = this.state === 'playing' || (this.state === 'start' && this.demo);
    const t = moving ? U.clamp(this.acc / this.effInterval, 0, 1) : 0;
    const pulse = this.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * (enraged ? 14 : 8));
    const bodyCol = mix(skin.main, '#16030a', 0.55);   // teinte sombre du corps
    const edgeCol = mix(skin.main, '#ffffff', 0.4);    // arête chaude, presque incandescente
    const ang = Math.atan2(e.dir.y, e.dir.x);          // oriente la tête vers la direction

    // Segment de corps : losange « épine dorsale » dentelée + arête vive (plus chaude vers la tête).
    const bodySeg = (x, y, s, f) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);                         // carré → losange (pointes agressives)
      const h = s / 2;
      ctx.shadowColor = glowCol; ctx.shadowBlur = (6 + pulse * 5) * (boss ? (enraged ? 2.3 : 1.6) : 1);
      ctx.fillStyle = bodyCol;
      ctx.fillRect(-h, -h, s, s);
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, s * 0.14);
      ctx.strokeStyle = mix(edgeCol, bodyCol, f);      // f petit = proche tête = arête plus chaude
      ctx.strokeRect(-h, -h, s, s);
      ctx.restore();
    };

    // Tête : crâne en pointe de lance, sourcils froncés, yeux ardents et crocs.
    // `a` = angle d'orientation (défaut = direction ; les têtes d'hydre s'écartent en éventail).
    const headSeg = (x, y, s, a) => {
      const h = s / 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a == null ? ang : a);
      if (eStyle === 'sperm' || eStyle === 'ver') {   // tête « forme libre » (remplace le crâne)
        this._drawCreatureHead(ctx, eStyle, skin.main, glowCol, s);
        ctx.restore(); return;
      }
      // crâne (pointe de lance vers +x = direction) — chauffé à blanc si enragé
      ctx.shadowColor = glowCol; ctx.shadowBlur = (14 + pulse * 16) * (boss ? (enraged ? 2.0 : 1.4) : 1);
      ctx.fillStyle = enraged ? mix(skin.main, '#ffffff', 0.22) : skin.main;
      ctx.beginPath();
      ctx.moveTo(-0.92 * h, -0.80 * h);
      ctx.lineTo( 0.18 * h, -1.00 * h);
      ctx.lineTo( 1.18 * h,  0);
      ctx.lineTo( 0.18 * h,  1.00 * h);
      ctx.lineTo(-0.92 * h,  0.80 * h);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeStyle = edgeCol; ctx.stroke();
      // crocs (triangles blancs au museau)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0.52 * h, -0.30 * h); ctx.lineTo(1.06 * h, -0.10 * h); ctx.lineTo(0.55 * h, 0.02 * h); ctx.closePath();
      ctx.moveTo(0.52 * h,  0.30 * h); ctx.lineTo(1.06 * h,  0.10 * h); ctx.lineTo(0.55 * h, -0.02 * h); ctx.closePath();
      ctx.fill();
      // VISAGE selon le skin de tête (eStyle). +x = avant ; les deux yeux straddle l'axe.
      if (eStyle === 'drole') {                        // 🤪 gros yeux ronds rigolos
        ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0.16 * h, -0.34 * h, 0.2 * h, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0.16 * h, 0.34 * h, 0.2 * h, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a0006';
        ctx.beginPath(); ctx.arc(0.24 * h, -0.30 * h, 0.09 * h, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0.24 * h, 0.38 * h, 0.09 * h, 0, Math.PI * 2); ctx.fill();
      } else if (eStyle === 'ete') {                   // 🕶️ lunettes de soleil
        ctx.shadowBlur = 0; ctx.fillStyle = '#04101a';
        ctx.fillRect(0.10 * h, -0.2 * h, 0.12 * h, 0.4 * h);    // pont entre les verres
        U.rr(ctx, -0.02 * h, -0.62 * h, 0.34 * h, 0.34 * h, 0.1 * h); ctx.fill();
        U.rr(ctx, -0.02 * h, 0.28 * h, 0.34 * h, 0.34 * h, 0.1 * h); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(0.04 * h, -0.56 * h, 0.1 * h, 0.08 * h);
        ctx.fillRect(0.04 * h, 0.34 * h, 0.1 * h, 0.08 * h);
      } else {                                          // classic / agressif : yeux fâchés (agressif ↑ + rouge)
        const big = eStyle === 'agressif' ? 1.22 : 1;
        ctx.shadowColor = T.amber; ctx.shadowBlur = 5 + pulse * 6;
        ctx.fillStyle = eStyle === 'agressif' ? '#ff5b6e' : mix(T.amber, '#ffffff', 0.35);
        ctx.save(); ctx.scale(1, big);
        ctx.beginPath();
        ctx.moveTo(-0.06 * h, -0.30 * h); ctx.lineTo(0.46 * h, -0.54 * h); ctx.lineTo(0.54 * h, -0.34 * h); ctx.lineTo(0.04 * h, -0.14 * h); ctx.closePath();
        ctx.moveTo(-0.06 * h,  0.30 * h); ctx.lineTo(0.46 * h,  0.54 * h); ctx.lineTo(0.54 * h,  0.34 * h); ctx.lineTo(0.04 * h,  0.14 * h); ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0; ctx.fillStyle = mix(skin.main, '#000000', 0.25);
        ctx.fillRect(0.20 * h, -0.44 * h, 0.13 * h, 0.13 * h);
        ctx.fillRect(0.20 * h,  0.31 * h, 0.13 * h, 0.13 * h);
      }
      ctx.restore();
    };

    // mini-barre de PV au-dessus d'une tête (helper local)
    const hpPip = (x, y, frac, w) => {
      const hbar = cell * 0.11, bx = x - w / 2, by = y - cell * 0.8;
      ctx.save();
      ctx.fillStyle = 'rgba(2,22,26,0.8)'; U.rr(ctx, bx, by, w, hbar, hbar * 0.5); ctx.fill();
      ctx.fillStyle = T.danger; ctx.shadowColor = T.danger; ctx.shadowBlur = 5;
      U.rr(ctx, bx, by, Math.max(hbar, w * U.clamp(frac, 0, 1)), hbar, hbar * 0.5); ctx.fill();
      ctx.restore();
    };

    const hydra = boss && e.hydra;                     // hydre : les têtes sont DEVANT le cou
    let headScreen = null, leadGx = 0, leadGy = 0;
    for (let i = e.body.length - 1; i >= 0; i--) {
      const cur = e.body[i], pv = (e.prev && e.prev[i]) || cur;
      let dx = cur.x - pv.x; if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;   // court chemin toroïdal
      let dy = cur.y - pv.y; if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
      // saut de portail : pas d'interpolation (le segment ressort directement de l'autre bouche)
      const jump = Math.abs(dx) > 1 || Math.abs(dy) > 1;
      const gx = jump ? cur.x : pv.x + dx * t, gy = jump ? cur.y : pv.y + dy * t;
      const isLead = i === 0;
      const drawSkull = isLead && !hydra;              // hydre : body[0] = jonction du cou (losange), pas un crâne
      const f = i / Math.max(1, e.body.length - 1);    // 0 = tête, 1 = queue
      const s = cell * (isLead ? 0.72 : 0.56 * (1 - 0.28 * f)) * sizeScale;   // queue qui s'affine ; boss ↑
      const seg = (cgx, cgy) => {
        const x = (cgx + 0.5) * cell, y = (cgy + 0.5) * cell;
        if (drawSkull) headSeg(x, y, s, ang); else bodySeg(x, y, s, f);
      };
      seg(gx, gy);                                     // image principale + doubles aux bords (traversée)
      if (gx < 0) seg(gx + COLS, gy); else if (gx > COLS - 1) seg(gx - COLS, gy);
      if (gy < 0) seg(gx, gy + ROWS); else if (gy > ROWS - 1) seg(gx, gy - ROWS);
      if (isLead) { headScreen = { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell }; leadGx = gx; leadGy = gy; }
    }
    ctx.shadowBlur = 0;

    if (hydra && headScreen) {
      // HYDRE : têtes déployées en éventail devant le cou. Chacune = point faible (mini-barre),
      // têtes coupées → moignon de cou. Cou dessiné du corps vers chaque tête.
      const d = e.dir, px = -d.y, py = d.x, s = cell * 0.72 * sizeScale;
      const baseGx = leadGx + d.x, baseGy = leadGy + d.y;
      for (const head of e.heads) {
        let cgx = baseGx + px * head.slot, cgy = baseGy + py * head.slot;
        if (cgx < -0.5) cgx += COLS; else if (cgx > COLS - 0.5) cgx -= COLS;       // wrap toroïdal au bord
        if (cgy < -0.5) cgy += ROWS; else if (cgy > ROWS - 0.5) cgy -= ROWS;
        const x = (cgx + 0.5) * cell, y = (cgy + 0.5) * cell;
        // cou
        ctx.save();
        ctx.strokeStyle = bodyCol; ctx.lineWidth = cell * 0.32 * sizeScale; ctx.lineCap = 'round';
        ctx.shadowColor = glowCol; ctx.shadowBlur = 6 + pulse * 4;
        ctx.beginPath(); ctx.moveTo(headScreen.x, headScreen.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
        if (head.dead) {                                // moignon (tête coupée)
          ctx.save(); ctx.fillStyle = mix(bodyCol, '#000000', 0.3);
          ctx.beginPath(); ctx.arc(x, y, cell * 0.17, 0, Math.PI * 2); ctx.fill(); ctx.restore();
          continue;
        }
        headSeg(x, y, s, ang + head.slot * 0.3);        // tête orientée vers l'extérieur
        hpPip(x, y, head.hp / head.maxHp, cell * 0.9);
      }
    } else if (boss && headScreen && this.bosses.length > 1 && e.heads && e.heads[0]) {
      // ESSAIM : mini-barre au-dessus de la tête de chaque boss (repère le plus faible).
      hpPip(headScreen.x, headScreen.y, e.heads[0].hp / e.heads[0].maxHp, cell * 1.1);
    }
  };

  G.drawSnake = function () {
    const ctx = this.ctx, cell = this.cell;
    const moving = this.state === 'playing' || (this.state === 'start' && this.demo);
    const t = moving ? U.clamp(this.acc / this.effInterval, 0, 1) : 0;
    const len = this.snake.length;
    const boardW = COLS * cell, boardH = ROWS * cell;

    // positions affichées (interpolation tenant compte de la traversée des bords) :
    // un segment se déplace toujours d'1 case ; si prev/cur sont sur des bords
    // opposés, on prend le « court chemin » (le segment sort par le bord).
    const g = [];
    for (let i = 0; i < len; i++) {
      const p = this.prev[i] || this.snake[i];
      const c = this.snake[i];
      let dx = c.x - p.x; if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;
      let dy = c.y - p.y; if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
      // saut de PORTAIL (déplacement > 1 case même après correction toroïdale) : pas
      // d'interpolation — le segment « pop » directement à la sortie du portail
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) g.push({ x: c.x, y: c.y });
      else g.push({ x: p.x + dx * t, y: p.y + dy * t });
    }
    const px = (gx) => (gx + 0.5) * cell;
    const py = (gy) => (gy + 0.5) * cell;

    // deux maillons sont-ils reliés ? (cases adjacentes, toroïdal) — faux de part et d'autre
    // d'un portail → le câble est COUPÉ à la traversée (il « entre » d'un côté, « sort » de l'autre)
    const adj = (u, v) => {
      let ddx = Math.abs(u.x - v.x); ddx = Math.min(ddx, COLS - ddx);
      let ddy = Math.abs(u.y - v.y); ddy = Math.min(ddy, ROWS - ddy);
      return ddx + ddy <= 1;
    };
    const linked = (i) => {
      if (!this.portals.length) return true;   // pas de portail sur la map → toujours relié
      const pa = this.prev[i] || this.snake[i], pb = this.prev[i + 1] || this.snake[i + 1];
      return adj(this.snake[i], this.snake[i + 1]) && adj(pa, pb);
    };

    // câble (dégradé tête→queue) ; couleur courante du serpent (change par batterie)
    const headHex = rgbToHex(this.snakeColorRgb);
    const tailHex = mix(headHex, T.bg1, 0.55);   // s'assombrit vers la queue
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < len - 1; i++) {
      if (!linked(i)) continue;                        // maillon en travers d'un portail : câble coupé
      const f = i / Math.max(1, len - 1);
      const color = mix(headHex, tailHex, f);
      const w = cell * (0.6 - 0.2 * f);
      const blur = i < 3 ? 14 : 5;
      const a = g[i], b = g[i + 1];
      const ax = px(a.x), ay = py(a.y), bx = px(b.x), by = py(b.y);
      if (Math.abs(a.x - b.x) > COLS / 2) {              // franchit un bord horizontal
        if (a.x < b.x) { this._cable(ax, ay, bx - boardW, by, color, w, blur); this._cable(ax + boardW, ay, bx, by, color, w, blur); }
        else { this._cable(ax, ay, bx + boardW, by, color, w, blur); this._cable(ax - boardW, ay, bx, by, color, w, blur); }
      } else if (Math.abs(a.y - b.y) > ROWS / 2) {       // franchit un bord vertical
        if (a.y < b.y) { this._cable(ax, ay, bx, by - boardH, color, w, blur); this._cable(ax, ay + boardH, bx, by, color, w, blur); }
        else { this._cable(ax, ay, bx, by + boardH, color, w, blur); this._cable(ax, ay - boardH, bx, by, color, w, blur); }
      } else {
        this._cable(ax, ay, bx, by, color, w, blur);
      }
    }
    ctx.shadowBlur = 0;

    // queue : connecteur USB-C (dupliqué si en train de traverser un bord)
    if (len >= 2) {
      const tail = g[len - 1], before = g[len - 2];
      let ddx = tail.x - before.x; if (ddx > 1) ddx -= COLS; else if (ddx < -1) ddx += COLS;
      let ddy = tail.y - before.y; if (ddy > 1) ddy -= ROWS; else if (ddy < -1) ddy += ROWS;
      const ang = Math.atan2(ddy, ddx);
      // la queue suit la couleur courante du serpent (comme la tête) : vif côté embout,
      // raccord avec la fin assombrie du câble côté corps
      this._forEachWrap(tail.x, tail.y, (x, y) => this._drawTail(px(x), py(y), ang, headHex, tailHex));
    }

    // tête : power bank (dupliquée si en train de traverser un bord)
    const head = g[0];
    this._forEachWrap(head.x, head.y, (x, y) => this.drawHead({ x: px(x), y: py(y) }));
  };

  // un segment de câble (ligne arrondie avec halo)
  G._cable = function (ax, ay, bx, by, color, w, blur) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.shadowColor = color; ctx.shadowBlur = blur;   // halo de la couleur du serpent
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };

  // appelle fn pour la position grille donnée + son image de l'autre côté si
  // elle est sur un bord (le hors-plateau est naturellement masqué par le canvas)
  G._forEachWrap = function (gx, gy, fn) {
    const xs = [gx], ys = [gy];
    if (gx < 1) xs.push(gx + COLS); else if (gx > COLS - 1) xs.push(gx - COLS);
    if (gy < 1) ys.push(gy + ROWS); else if (gy > ROWS - 1) ys.push(gy - ROWS);
    for (const x of xs) for (const y of ys) fn(x, y);
  };

  G._drawTail = function (x, y, ang, color, tailColor) {
    const ctx = this.ctx, cell = this.cell;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);   // +x pointe vers le bout de la queue
    // boîtier du connecteur USB-C — couleur courante du serpent (cycle comme la tête)
    const bw = cell * 0.36, bh = cell * 0.40;
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    const grad = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    grad.addColorStop(0, tailColor || color);   // côté corps : raccord avec la fin du câble
    grad.addColorStop(1, color);                 // côté embout : couleur vive du serpent
    ctx.fillStyle = grad;
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, cell * 0.1); ctx.fill();
    ctx.shadowBlur = 0;
    // embout métallique USB-C qui dépasse au bout
    ctx.fillStyle = '#cfe9ea';
    U.rr(ctx, bw / 2 - cell * 0.02, -cell * 0.13, cell * 0.16, cell * 0.26, cell * 0.06); ctx.fill();
    ctx.restore();
  };

  G.drawHead = function (p) {
    const ctx = this.ctx, cell = this.cell;
    const ang = Math.atan2(this.dir.y, this.dir.x);
    const w = cell * 1.5, h = cell * 1.05;
    const headHex = rgbToHex(this.snakeColorRgb);   // couleur courante du serpent

    // aura de bouclier (invulnérabilité)
    if (this.time < this.shieldUntil) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.save();
      ctx.shadowColor = T.blue; ctx.shadowBlur = 16;
      ctx.strokeStyle = T.blue; ctx.globalAlpha = 0.5 + 0.4 * pulse; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, cell * 0.95, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.fillStyle = T.blue;
      ctx.beginPath(); ctx.arc(p.x, p.y, cell * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(ang);
    const style = this.headStyle || 'classic';
    if (style === 'sperm' || style === 'ver') {
      // tête « forme libre » : remplace la power bank (perd le « T » → skin de prestige)
      this._drawCreatureHead(ctx, style, headHex, headHex, cell * 1.15);
    } else {
      // corps power bank
      ctx.shadowColor = headHex; ctx.shadowBlur = 16;
      const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      body.addColorStop(0, '#13242a'); body.addColorStop(1, '#0c181c');
      ctx.fillStyle = body;
      U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.32); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = headHex; ctx.lineWidth = 2;
      U.rr(ctx, -w / 2, -h / 2, w, h, h * 0.32); ctx.stroke();
      // embout USB-C à l'avant
      ctx.fillStyle = '#cfe9ea';
      U.rr(ctx, w / 2 - cell * 0.06, -h * 0.18, cell * 0.22, h * 0.36, cell * 0.08); ctx.fill();
      // visage / logo (redressé, indépendant de l'angle) — selon le skin de tête acheté
      ctx.rotate(-ang);
      this._drawHeadFace(ctx, headHex, h);
    }
    ctx.restore();
  };

  // Dessine le visage du serpent dans le repère local redressé (origine = centre de la tête).
  // `this.headStyle` : classic (logo « T ») · drole · agressif · ete.
  G._drawHeadFace = function (ctx, col, h) {
    const style = this.headStyle || 'classic';
    if (style === 'classic') {
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
      const tw = h * 0.5, tt = h * 0.16;
      ctx.fillRect(-tw / 2, -h * 0.22, tw, tt);
      ctx.fillRect(-tt / 2, -h * 0.22, tt, h * 0.46);
      return;
    }
    ctx.shadowBlur = 0;
    if (style === 'drole') {                          // 😜 gros yeux + grand sourire
      ctx.fillStyle = '#ffffff';
      [-0.2, 0.2].forEach((sx) => { ctx.beginPath(); ctx.arc(sx * h, -0.08 * h, 0.15 * h, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = '#06181c';
      [-0.2, 0.2].forEach((sx) => { ctx.beginPath(); ctx.arc(sx * h + 0.03 * h, -0.05 * h, 0.07 * h, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = col; ctx.lineWidth = h * 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0.05 * h, 0.2 * h, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
    } else if (style === 'agressif') {                // 😈 yeux furieux + dents serrées
      ctx.fillStyle = '#ff5b6e';
      ctx.beginPath(); ctx.moveTo(-0.33 * h, -0.18 * h); ctx.lineTo(-0.07 * h, -0.05 * h); ctx.lineTo(-0.07 * h, 0.04 * h); ctx.lineTo(-0.33 * h, -0.05 * h); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.33 * h, -0.18 * h); ctx.lineTo(0.07 * h, -0.05 * h); ctx.lineTo(0.07 * h, 0.04 * h); ctx.lineTo(0.33 * h, -0.05 * h); ctx.closePath(); ctx.fill();
      const mw = 0.42 * h, my = 0.13 * h, mh = 0.13 * h;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-mw / 2, my, mw, mh);
      ctx.strokeStyle = '#06181c'; ctx.lineWidth = Math.max(1, h * 0.025);
      for (let i = 1; i < 4; i++) { const x = -mw / 2 + i * mw / 4; ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mh); ctx.stroke(); }
    } else if (style === 'ete') {                     // 😎 lunettes de soleil + sourire détendu
      ctx.fillStyle = '#06181c';
      ctx.fillRect(-0.28 * h, -0.13 * h, 0.56 * h, 0.05 * h);   // barre/monture
      U.rr(ctx, -0.32 * h, -0.14 * h, 0.26 * h, 0.2 * h, 0.06 * h); ctx.fill();
      U.rr(ctx, 0.06 * h, -0.14 * h, 0.26 * h, 0.2 * h, 0.06 * h); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(-0.28 * h, -0.1 * h, 0.08 * h, 0.05 * h);
      ctx.fillRect(0.1 * h, -0.1 * h, 0.08 * h, 0.05 * h);
      ctx.strokeStyle = col; ctx.lineWidth = h * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0.1 * h, 0.16 * h, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  };

  // Têtes « forme libre » (remplacent la forme de la tête) — repère ALIGNÉ DIRECTION (+x = avant,
  // origine = centre de la tête). `S` = taille caractéristique. Partagé serpent ⇄ ennemis/boss.
  G._drawCreatureHead = function (ctx, style, col, glow, S) {
    if (style === 'sperm') {                           // 🦠 spermatozoïde : cellule ovale + flagelle ondulant
      // flagelle (derrière, -x) qui ondule
      ctx.strokeStyle = col; ctx.lineWidth = S * 0.09; ctx.lineCap = 'round';
      ctx.shadowColor = glow; ctx.shadowBlur = S * 0.28;
      ctx.beginPath();
      const segs = 16, len = S * 1.0;
      for (let i = 0; i <= segs; i++) {
        const f = i / segs, tx = -S * 0.28 - f * len, ty = Math.sin(f * 6 + this.time * 9) * S * 0.3 * f;
        i ? ctx.lineTo(tx, ty) : ctx.moveTo(tx, ty);
      }
      ctx.stroke();
      // cellule (tête ovale)
      ctx.shadowBlur = S * 0.34;
      const grad = ctx.createLinearGradient(-S * 0.3, 0, S * 0.4, 0);
      grad.addColorStop(0, mix(col, '#ffffff', 0.25)); grad.addColorStop(1, col);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(S * 0.05, 0, S * 0.4, S * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // noyau + yeux
      ctx.fillStyle = mix(col, '#04101a', 0.55);
      ctx.beginPath(); ctx.ellipse(S * 0.06, 0, S * 0.17, S * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(S * 0.2, -S * 0.1, S * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.2, S * 0.1, S * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#06181c';
      ctx.beginPath(); ctx.arc(S * 0.22, -S * 0.1, S * 0.03, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.22, S * 0.1, S * 0.03, 0, Math.PI * 2); ctx.fill();
    } else {                                            // 🪱 ver de terre : capsule annelée + anneau clair
      const bw = S * 0.95, bh = S * 0.52;
      ctx.shadowColor = glow; ctx.shadowBlur = S * 0.22;
      const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      grad.addColorStop(0, mix(col, '#ffffff', 0.25)); grad.addColorStop(1, mix(col, '#3a0820', 0.25));
      ctx.fillStyle = grad;
      U.rr(ctx, -bw * 0.5, -bh * 0.5, bw, bh, bh * 0.5); ctx.fill();
      ctx.shadowBlur = 0;
      // anneaux de segments
      ctx.strokeStyle = mix(col, '#000000', 0.4); ctx.lineWidth = Math.max(1, S * 0.04);
      for (let i = -1; i <= 2; i++) { const sx = i * S * 0.2; ctx.beginPath(); ctx.moveTo(sx, -bh * 0.42); ctx.lineTo(sx, bh * 0.42); ctx.stroke(); }
      // clitellum (anneau clair)
      ctx.fillStyle = mix(col, '#ffffff', 0.4); ctx.fillRect(-S * 0.04, -bh * 0.5, S * 0.14, bh);
      // yeux à l'avant (+x)
      ctx.fillStyle = '#06181c';
      ctx.beginPath(); ctx.arc(S * 0.38, -S * 0.1, S * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.38, S * 0.1, S * 0.05, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  G.drawToast = function () {
    if (!this.toast || this.toast.life <= 0) return;
    const ctx = this.ctx, cell = this.cell, p = this.toast;
    const a = U.clamp(p.life / p.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = T.charge; ctx.shadowColor = T.charge; ctx.shadowBlur = 12;
    ctx.font = '800 ' + (cell * 0.7).toFixed(0) + 'px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.text, (p.x + 0.5) * cell, (p.y + 0.5) * cell - (p.max - p.life) * 46);
    ctx.restore();
  };

  G.drawFx = function () {
    const ctx = this.ctx;
    for (const p of this.fx) {
      const a = U.clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      if (p.shape === 'bubble') {                      // anneau (bulle)
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * 0.18);
        ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.stroke();
      } else if (p.shape === 'circle') {               // disque (flammèche)
        ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'star') {                 // scintillement 4 branches
        const s = p.size / 2;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
        ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
        ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
        ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
        ctx.closePath(); ctx.fill();
      } else {                                         // carré pixel (défaut)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  };
})();
