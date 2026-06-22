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
      lvl: document.getElementById('lvlNum'),
      bat: document.getElementById('batCount'),
      need: document.getElementById('batNeed'),
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
    this.enemy = null;       // serpent ennemi (niv 4+) — { body, prev, dir } ou null
    this.slowUntil = 0;      // surcharge/ralenti actif tant que time < slowUntil
    this.shieldUntil = 0;    // bouclier (invulnérabilité) actif tant que time < shieldUntil
    this.magnetUntil = 0;    // aimant (attire la batterie) actif tant que time < magnetUntil
    this.doubleUntil = 0;    // double points actif tant que time < doubleUntil
    this.introUntil = 0;     // bannière d'intro de niveau (serpent figé) tant que time < introUntil
    this.resumeUntil = 0;    // compte à rebours « 3·2·1 » à la reprise après pause (serpent figé)
    this.fx = [];
    this.toast = null;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.shake = 0;          // intensité du screen-shake (décroît)
    this.lastVariant = null;
    // couleur courante du serpent (change à chaque batterie ; lissée vers la cible)
    this.snakeColorRgb = hexRgb(PALETTE[0]);
    this.snakeColorTarget = hexRgb(PALETTE[0]);
    this.demo = false;
    // modificateurs issus du Laboratoire (R&D), figés au début de la partie
    this.mods = (window.CT && CT.Lab && CT.Lab.effects) ? CT.Lab.effects()
      : { pointMult: 1, shieldBonus: 0, slowBonus: 0, magnetBonus: 0, doubleBonus: 0, comboWindowBonus: 0, bonusEveryDelta: 0, bankMult: 1, startShield: 0, luckChance: 0 };
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
  G.startRun = function () {
    this.reset();
    this.runStart = this.time;
    this.seed = (Math.random() * 4294967295) >>> 0;
    this.rng = CT.util.makeRng(this.seed);   // (re)graine pour la partie scorée
    this.bonusCount = 0;
    this.startLevel(1);
  };

  // Prépare un niveau (sans changer l'état) — partagé par jeu réel et démo.
  G.setupLevel = function (n) {
    this.levelNum = n;
    this.level = CT.getLevel(n);
    this.batteries = 0;
    this.combo = 0;
    this.snakeColorRgb = hexRgb(PALETTE[0]);   // le niveau repart sur la couleur de base
    this.snakeColorTarget = hexRgb(PALETTE[0]);
    this.stepInterval = this.level.step / 1000;
    this.effInterval = this.stepInterval;
    this.acc = 0;
    this.bonus = null;
    this.sinceBonus = 0;
    this.slowUntil = 0;
    this.shieldUntil = 0;
    this.magnetUntil = 0;
    this.doubleUntil = 0;
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
    this.spawnFood();
    // serpent ennemi à partir du niveau configuré (jamais en démo : 1→3)
    this.enemy = null;
    const ec = CT.CONFIG.enemy;
    if (ec && n >= ec.fromLevel) this.spawnEnemy();
    this.updateHud();
  };

  // Place le serpent ennemi sur une case libre, loin du spawn du joueur (centre).
  G.spawnEnemy = function () {
    const ec = CT.CONFIG.enemy;
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    let x = 2, y = 2, tries = 0;
    do {
      x = 1 + ((this.rng() * (COLS - 2)) | 0);
      y = 1 + ((this.rng() * (ROWS - 2)) | 0);
    } while (++tries < 200 && (this.obstacleSet.has(this.cellKey(x, y)) ||
             (Math.abs(x - cx) + Math.abs(y - cy)) < 7));   // démarre loin du joueur
    const body = [];
    for (let i = 0; i < ec.length; i++) body.push({ x, y });   // empilé → se déploie en bougeant
    const dirs = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    this.enemy = { body, prev: body.map((s) => ({ x: s.x, y: s.y })), dir: dirs[(this.rng() * 4) | 0] };
  };

  G.startLevel = function (n) {
    this.demo = false;
    this.setupLevel(n);
    this.introUntil = this.time + CT.CONFIG.introDuration;   // annonce le niveau
    // Labo « Départ protégé » : bouclier de grâce après l'annonce de niveau
    if (this.mods && this.mods.startShield) this.shieldUntil = this.introUntil + this.mods.startShield;
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
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') {
      this.resumeUntil = this.time + 1.5;   // 3·2·1 avant de relancer le serpent (le joueur se repositionne)
      this.setState('playing');
    }
  };

  G.toMenu = function () {
    this.reset();
    this.startDemo();
  };

  /* ---------------- entrées ---------------- */
  G.setDir = function (name) {
    if (this.state !== 'playing') return;
    const nd = DIRS[name];
    if (!nd) return;
    // référence = dernier virage en file (sinon la direction courante) → permet d'enchaîner
    // deux quarts de tour serrés (ex. ↑ puis ←) sans que le 2ᵉ soit rejeté à tort comme demi-tour
    const ref = this.dirQueue.length ? this.dirQueue[this.dirQueue.length - 1] : this.dir;
    if (nd.x === -ref.x && nd.y === -ref.y) return;   // interdit le demi-tour (relatif à la file)
    if (nd.x === ref.x && nd.y === ref.y) return;     // déjà cette direction → ignore
    if (this.dirQueue.length >= 2) return;            // file courte = réactivité (max 2 virages)
    this.dirQueue.push(nd);
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
    for (const s of this.snake) if (s.x === x && s.y === y) return false;
    if (this.food && this.food.x === x && this.food.y === y) return false;
    if (this.bonus && this.bonus.x === x && this.bonus.y === y) return false;
    return true;
  };

  G.spawnBonus = function () {
    let tries = 0;
    do {
      const x = 1 + ((this.rng() * (COLS - 2)) | 0);
      const y = 1 + ((this.rng() * (ROWS - 2)) | 0);
      if (this.isFree(x, y)) {
        const B = CT.CONFIG.bonus;
        const r = this.rng();
        const type = r < B.shieldChance ? 'shield'
          : r < B.shieldChance + B.magnetChance ? 'magnet'
          : r < B.shieldChance + B.magnetChance + B.doubleChance ? 'double' : 'fast';
        this.bonus = { x, y, life: B.life, max: B.life, type };
        // annonce de l'apparition (power-up à durée limitée → attire l'œil)
        const col = type === 'shield' ? T.blue : type === 'magnet' ? T.violet
          : type === 'double' ? T.pink : T.amber;
        this.spawnFx(x, y, [col, '#ffffff', T.glow], 14);   // éclat « pop » (réduit si reduce-motion)
        if (!this.demo && CT.Audio.appear) CT.Audio.appear();
        return;
      }
    } while (++tries < 200);
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
    if (this.dirQueue.length) this.dir = this.dirQueue.shift();   // applique un virage par pas
    const head = this.snake[0];
    const nh = { x: head.x + this.dir.x, y: head.y + this.dir.y };
    const len = this.snake.length;

    // traversée des bords : on ressort en face (plateau toroïdal)
    nh.x = (nh.x + COLS) % COLS;
    nh.y = (nh.y + ROWS) % ROWS;

    const willEat = this.food && nh.x === this.food.x && nh.y === this.food.y;

    // collisions mortelles (obstacles + corps + serpent ennemi) — ignorées pendant le bouclier
    if (this.time >= this.shieldUntil) {
      if (this.obstacleSet.has(this.cellKey(nh.x, nh.y))) return this.die();
      for (let i = 1; i < len; i++) {
        if (i === len - 1 && !willEat) continue; // la queue va libérer sa case
        if (this.snake[i].x === nh.x && this.snake[i].y === nh.y) return this.die();
      }
      if (this.enemyHits(nh.x, nh.y)) return this.die();   // on fonce dans l'ennemi (niv 4+)
    }

    // déplacement (index stables : segment i suit i-1)
    this.prev = this.snake.map((s) => ({ x: s.x, y: s.y }));
    for (let i = len - 1; i >= 1; i--) {
      this.snake[i].x = this.prev[i - 1].x;
      this.snake[i].y = this.prev[i - 1].y;
    }
    this.snake[0] = nh;

    if (willEat) {
      const tail = this.prev[len - 1];
      this.snake.push({ x: tail.x, y: tail.y });
      this.prev.push({ x: tail.x, y: tail.y });
      this.onEat();
    }

    // power-up : ne fait pas grandir le serpent ni avancer l'objectif
    if (this.bonus && nh.x === this.bonus.x && nh.y === this.bonus.y) this.onEatBonus();

    // aimant : attire la batterie d'une case vers la tête (déterministe, sans aléa)
    if (this.time < this.magnetUntil) this.pullFood();

    // serpent ennemi (niv 4+) : il se déplace, puis on reteste le contact avec la tête
    if (this.enemy && this.state === 'playing') {
      this.stepEnemy();
      if (this.time >= this.shieldUntil && this.enemyHits(nh.x, nh.y)) return this.die();
    }
  };

  // Vrai si (x,y) est sur un segment du serpent ennemi.
  G.enemyHits = function (x, y) {
    if (!this.enemy) return false;
    const b = this.enemy.body;
    for (let i = 0; i < b.length; i++) if (b[i].x === x && b[i].y === y) return true;
    return false;
  };

  // Déplace le serpent ennemi d'une case : marche aléatoire avec inertie, évite
  // demi-tour / obstacles / son propre corps ; bords toroïdaux. Aléa déterministe (this.rng).
  G.stepEnemy = function () {
    const e = this.enemy; if (!e) return;
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
      const straight = opts.find((d) => d.x === e.dir.x && d.y === e.dir.y);
      const turn = this.rng() < CT.CONFIG.enemy.turnChance;
      nd = (straight && !turn) ? straight : opts[(this.rng() * opts.length) | 0];
    }
    e.dir = nd;
    const nx = (head.x + nd.x + COLS) % COLS, ny = (head.y + nd.y + ROWS) % ROWS;
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
    // le serpent prend la couleur suivante de la palette (transition lissée dans tick)
    this.snakeColorTarget = hexRgb(PALETTE[this.batteries % PALETTE.length]);
    this.spawnFx(this.food.x, this.food.y);
    this.flash = 0.6; this.flashColor = T.charge;
    this.haptic(12);
    this.stepInterval = Math.max(
      CT.CONFIG.minStep / 1000,
      (this.level.step - this.batteries * CT.CONFIG.speedupPerBattery) / 1000
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
    } else {
      this.flash = 0.8; this.flashColor = T.amber;
      CT.Audio.bonus();
      this.spawnFx(b.x, b.y, ['#ffd76b', T.amber, '#ffffff', T.charge], 26);
      this.slowUntil = this.time + B.slowDuration + this.mods.slowBonus;          // Labo : surcharge prolongée
      if (!this.demo) this._awardBonus(B.points * this.levelNum, 'SURCHARGE', b);
    }
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

  G.die = function () {
    // En démo, on ne meurt pas : on relance simplement le tableau.
    if (this.demo) { this.restartDemo(); return; }

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
      ts: Date.now(),
    };
    if (this.points > 0) CT.Leaderboard.submit(this.lastEntry);
    // verse les ressources de la partie dans la banque du Laboratoire
    if (CT.Lab) CT.Lab.bank({ batteries: this.score, points: this.points });
    // succès liés à la fin de partie (+ comptage des parties jouées)
    this._ach({ score: this.points, durationMs: this.lastEntry.durationMs, bankPts: this.points, game: 1 });

    if (this.dom.overStats) {
      const totalS = Math.floor(this.lastEntry.durationMs / 1000);
      const dur = Math.floor(totalS / 60) + ':' + String(totalS % 60).padStart(2, '0');
      let html =
        'Niveau atteint : <b>' + this.levelNum + '</b><br>' +
        'Batteries livrées : <b>' + this.score + '</b><br>' +
        'Score : <b>' + this.points + '</b>' +
        (isRecord ? ' &nbsp;🏆 <b>Nouveau record !</b>' : '') +
        '<span class="over-recap">⏱ ' + dur + ' &nbsp;·&nbsp; ⚡ ' + this.bonusCount +
        ' power-up' + (this.bonusCount > 1 ? 's' : '') + ' &nbsp;·&nbsp; 🔥 combo ×' + this.maxComboRun + '</span>';
      if (CT.Lab && (this.score > 0 || this.points > 0)) {
        const w = CT.Lab.wallet();
        html += '<br><span class="lab-gain">🔬 +' + this.score + ' 🔋 +' + this.points +
          ' ⚡ au Labo <small>(total ' + w.bat + ' 🔋 · ' + w.pts + ' ⚡)</small></span>';
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
    if (this.dom.lvl) this.dom.lvl.textContent = this.levelNum;
    if (this.dom.bat) this.dom.bat.textContent = this.batteries;
    if (this.dom.need && this.level) this.dom.need.textContent = this.level.needed;
    if (this.dom.fill && this.level) this.dom.fill.style.width = (100 * this.batteries / this.level.needed) + '%';
    if (this.dom.progress && this.level) {
      const remaining = this.level.needed - this.batteries;   // « objectif proche » : pulse sur les 2 dernières
      this.dom.progress.classList.toggle('near-goal', !this.demo && remaining > 0 && remaining <= 2);
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
      const slow = this.time < this.slowUntil;
      this.effInterval = this.stepInterval * (slow ? CT.CONFIG.bonus.slowFactor : 1);
      const intro = !this.demo && (this.time < this.introUntil || this.time < this.resumeUntil);   // figé : annonce de niveau OU reprise (3·2·1)
      if (intro) {
        this.acc = 0;
      } else {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= this.effInterval && steps < 5) {
          this.acc -= this.effInterval;
          this.step();
          steps++;
          if (!(this.state === 'playing' || (this.state === 'start' && this.demo))) break;
        }
      }
      if (this.bonus) { this.bonus.life -= dt; if (this.bonus.life <= 0) this.bonus = null; }
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
  };

  /* ---------------- rendu monde ---------------- */
  G.renderWorld = function () {
    const ctx = this.ctx, W = this.W, H = this.H, cell = this.cell;

    // fond
    const g = ctx.createRadialGradient(W / 2, H * 0.35, 20, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#073238'); g.addColorStop(0.55, T.bg1); g.addColorStop(1, T.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

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
    if (this.food) this.drawFood();
    if (this.bonus) this.drawBonus();
    if (this.enemy) this.drawEnemy();
    if (this.snake) this.drawSnake();
    this.drawFx();
    this.drawToast();
    this.drawSurcharge();
    this.drawRecordBanner();
    this.drawIntro();
    this.drawResumeCountdown();
    ctx.restore();   // fin du screen-shake

    this.drawEffects();   // chips d'effets actifs (hors shake, style HUD)

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
    if (this.time < this.shieldUntil) items.push({ c: T.blue, t: '🛡️', s: this.shieldUntil - this.time });
    if (this.time < this.slowUntil) items.push({ c: T.cyan, t: '🌀', s: this.slowUntil - this.time });
    if (this.time < this.magnetUntil) items.push({ c: T.violet, t: '🧲', s: this.magnetUntil - this.time });
    if (this.time < this.doubleUntil) items.push({ c: T.pink, t: '×2', s: this.doubleUntil - this.time });
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
      : b.type === 'double' ? T.pink : T.amber;
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
    ctx.fillText('⚡ SURCHARGE', W / 2, cell * 1.3);
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
    ctx.fillText('🏆 RECORD BATTU !', 0, 0);
    ctx.restore();
  };

  // Bannière d'intro de niveau (« NIVEAU X — Objectif … »), serpent figé.
  G.drawIntro = function () {
    if (this.demo || this.time >= this.introUntil) return;
    const ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H);
    const dur = CT.CONFIG.introDuration;
    const remaining = this.introUntil - this.time;
    const elapsed = dur - remaining;
    const a = Math.min(U.clamp(elapsed / 0.3, 0, 1), U.clamp(remaining / 0.4, 0, 1));
    const scale = 0.9 + 0.1 * U.clamp(elapsed / 0.3, 0, 1);
    ctx.save();
    // voile
    ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#02161a';
    ctx.fillRect(0, 0, W, H);
    // textes
    ctx.globalAlpha = a;
    ctx.translate(W / 2, H * 0.44); ctx.scale(scale, scale);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = T.cyan; ctx.shadowColor = T.glow; ctx.shadowBlur = 24;
    ctx.font = '900 ' + Math.round(S * 0.13) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText('NIVEAU ' + this.levelNum, 0, 0);
    ctx.shadowBlur = 10; ctx.fillStyle = T.text;
    ctx.font = '700 ' + Math.round(S * 0.045) + 'px -apple-system, system-ui, sans-serif';
    ctx.fillText('Objectif : ' + this.level.needed + ' batteries 🔋', 0, S * 0.11);
    ctx.restore();
  };

  G.drawObstacles = function () {
    const ctx = this.ctx, cell = this.cell, pad = cell * 0.08;
    for (const o of this.obstacles) {
      const x = o.x * cell + pad, y = o.y * cell + pad, s = cell - pad * 2;
      ctx.save();
      ctx.shadowColor = T.danger; ctx.shadowBlur = 8;
      ctx.fillStyle = '#0c1a1e';
      U.rr(ctx, x, y, s, s, cell * 0.18); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = T.danger; ctx.lineWidth = 2;
      U.rr(ctx, x, y, s, s, cell * 0.18); ctx.stroke();
      // hachure danger
      ctx.strokeStyle = 'rgba(255,91,110,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.75); ctx.lineTo(x + s * 0.75, y + s * 0.25); ctx.stroke();
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

    ctx.save();
    ctx.translate(cx, cy);
    // halo
    ctx.shadowColor = T.charge; ctx.shadowBlur = 16 + pulse * 12;
    // corps batterie
    ctx.fillStyle = '#08252a';
    U.rr(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28); ctx.fill();
    ctx.shadowBlur = 0;
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

  // Serpent ennemi : chaîne de petits carrés rouges (tête à yeux), interpolés + glow « danger ».
  G.drawEnemy = function () {
    const e = this.enemy; if (!e) return;
    const ctx = this.ctx, cell = this.cell;
    const moving = this.state === 'playing' || (this.state === 'start' && this.demo);
    const t = moving ? U.clamp(this.acc / this.effInterval, 0, 1) : 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
    const bodyCol = mix(T.danger, '#2a0a12', 0.4);
    for (let i = e.body.length - 1; i >= 0; i--) {
      const cur = e.body[i], pv = (e.prev && e.prev[i]) || cur;
      let dx = cur.x - pv.x; if (dx > 1) dx -= COLS; else if (dx < -1) dx += COLS;   // court chemin toroïdal
      let dy = cur.y - pv.y; if (dy > 1) dy -= ROWS; else if (dy < -1) dy += ROWS;
      const gx = pv.x + dx * t, gy = pv.y + dy * t;
      const head = i === 0;
      const s = cell * (head ? 0.62 : 0.46);
      const seg = (cgx, cgy) => {
        const x = (cgx + 0.5) * cell, y = (cgy + 0.5) * cell;
        ctx.fillStyle = head ? T.danger : bodyCol;
        ctx.shadowColor = T.danger; ctx.shadowBlur = head ? (10 + pulse * 10) : 6;
        U.rr(ctx, x - s / 2, y - s / 2, s, s, s * 0.32); ctx.fill();
        if (head) {                                   // yeux
          ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
          ctx.fillRect(x - s * 0.24, y - s * 0.14, s * 0.16, s * 0.16);
          ctx.fillRect(x + s * 0.08, y - s * 0.14, s * 0.16, s * 0.16);
        }
      };
      ctx.save();
      seg(gx, gy);                                     // image principale + doubles aux bords (traversée)
      if (gx < 0) seg(gx + COLS, gy); else if (gx > COLS - 1) seg(gx - COLS, gy);
      if (gy < 0) seg(gx, gy + ROWS); else if (gy > ROWS - 1) seg(gx, gy - ROWS);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
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
      g.push({ x: p.x + dx * t, y: p.y + dy * t });
    }
    const px = (gx) => (gx + 0.5) * cell;
    const py = (gy) => (gy + 0.5) * cell;

    // câble (dégradé tête→queue) ; couleur courante du serpent (change par batterie)
    const headHex = rgbToHex(this.snakeColorRgb);
    const tailHex = mix(headHex, T.bg1, 0.55);   // s'assombrit vers la queue
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < len - 1; i++) {
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
    // corps
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
    // « T » Cryptotem (redressé, indépendant de l'angle)
    ctx.rotate(-ang);
    ctx.fillStyle = headHex; ctx.shadowColor = headHex; ctx.shadowBlur = 10;
    const tw = h * 0.5, tt = h * 0.16;
    ctx.fillRect(-tw / 2, -h * 0.22, tw, tt);
    ctx.fillRect(-tt / 2, -h * 0.22, tt, h * 0.46);
    ctx.restore();
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
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  };
})();
