# Snake Cryptotem 🔋

Jeu promotionnel « Snake-like » pour **Cryptotem**, le réseau de stations de
location de batteries externes (bars, restaurants, cinémas, discothèques, aires
de jeux, bowlings, laser games…).

> **Pitch joueur :** une batterie Cryptotem se balade dans la ville. Chaque
> icône batterie ramassée allonge son câble USB-C. Une fois l'objectif atteint,
> une **cinématique** montre la batterie qui recharge un téléphone à plat.

---

## 🎯 Objectifs produit (cahier des charges client)

1. **Niveaux de difficulté.** Niveau 1 = 10 batteries à attraper (le téléphone
   n'a presque plus besoin de charge). Chaque niveau augmente l'objectif.
2. **Difficulté croissante** : des **obstacles** apparaissent sur la map aux
   niveaux supérieurs.
3. **Principe du Snake respecté** : à chaque batterie ramassée le câble grandit
   **et la vitesse augmente** un peu.
4. **Cinématique de fin de niveau** : toujours **différente** (mode cinématique),
   montrant la batterie qui se connecte à un téléphone faible.

---

## 🚀 Lancer le jeu

Aucune dépendance, aucun build. Deux options :

```bash
# Option A — serveur local (recommandé, évite les soucis de cache/CORS)
cd "Snake Cryptotem"
python3 -m http.server 8000
# puis ouvrir http://localhost:8000

# Option B — double-clic
open index.html      # fonctionne aussi en file:// (scripts classiques, pas de modules ES)
```

Cible : tablette / écran tactile en bar, mobile, et desktop. Contrôles :
flèches, WASD, **swipe**, ou D-pad tactile à l'écran.

---

## 🧱 Architecture

Jeu **vanilla JS + Canvas 2D**, zéro dépendance, scripts classiques chargés dans
l'ordre (pas de modules ES → marche en `file://`). Tout est attaché au namespace
global `window.CT`.

```
Snake Cryptotem/
├── index.html          # structure + overlays (menu, HUD, game over, cinématique)
├── css/style.css       # thème néon teal, glassmorphism, responsive + D-pad mobile
├── js/
│   ├── config.js       # CT.CONFIG (thème, grille) + CT.getLevel(n) + variantes ciné
│   ├── audio.js        # CT.Audio — sons synthétisés (WebAudio), pas de fichiers
│   ├── input.js        # CT.Input — clavier / swipe / D-pad → callbacks
│   ├── scoring-rules.js# CT.ScoringRules — validation anti-triche PARTAGÉE navigateur ↔ Node
│   ├── leaderboard.js  # CT.Leaderboard — classement perso/semaine/global (délègue à ScoringRules)
│   ├── lab.js          # CT.Lab — Laboratoire : banque + recherches chronométrées + upgrades permanents
│   ├── achievements.js # CT.Achievements — quêtes à 5 paliers (Bronze→Diamant) sur stats cumulées
│   ├── skins.js        # CT.Skins — apparences du serpent (palettes) déblocables aux étoiles de quêtes
│   ├── ghost.js        # CT.Ghost — fantôme du Défi du jour (meilleure course du jour, rejouée en translucide)
│   ├── qrcode.js       # CT.QR — générateur de QR code autonome (octet/UTF-8, niveau M) pour la CTA
│   ├── cinematics.js   # CT.Cinematic — animations de fin de niveau (plusieurs variantes)
│   ├── game.js         # CT.Game — machine à états, boucle, rendu monde, collisions
│   └── main.js         # bootstrap : câblage canvas/UI/boutons, resize, rAF
├── server/leaderboard-server.js  # serveur de classement de RÉFÉRENCE (Node pur, réutilise scoring-rules)
├── docs/anti-cheat.md  # architecture classement + sécurité (à lire avant le backend distant)
├── assets/logo.png     # logo Cryptotem (copie de la racine)
├── logo.png            # logo d'origine
└── Station.jpeg        # photo de la station (référence design)
```

### Machine à états (`CT.Game.state`)
`start` → `playing` ⇄ `paused` → `cinematic` → (niveau suivant) `playing` …
et `over` (game over) → `playing`. L'écran **pause** affiche les stats de la
partie (niveau / score / objectif), des raccourcis son & musique
(`syncAudioButtons` garde tous les boutons audio synchronisés), et les boutons
**Reprendre** / **Recommencer** (`restartBtn` → `begin` → repart au niveau 1) / **Menu**.

### Boucle de jeu
`requestAnimationFrame` + accumulateur de temps. Le serpent avance d'**une case**
tous les `stepInterval` ms. Le rendu **interpole** la position entre la case
précédente et la case courante (`t = acc / stepInterval`) → mouvement fluide du
câble. Chaque segment garde `prev` + `cur` ; les index sont stables (le segment
`i` suit le segment `i-1`).

### Direction / entrées (file de virages)
`setDir` empile les virages dans `dirQueue` (file, **max 2**) ; chaque `step()` en
défile **un** (`this.dir = dirQueue.shift()`). Le test anti-demi-tour se fait par
rapport au **dernier virage en file** (sinon `this.dir`), ce qui permet d'enchaîner
deux quarts de tour serrés (ex. ↑ puis ←) sans perdre le 2ᵉ — sans jamais autoriser
le demi-tour direct. La file plafonne à 2 pour rester réactive. L'IA démo écrit aussi
dans `dirQueue` (un virage recalculé par pas).

### Vitesse
`stepInterval = max(minStep, level.step - batteriesRamassées * speedupPerBattery)`.

### Intro de niveau (`drawIntro`, 3 types via `introKind`)
Au début de chaque niveau (jeu réel), une bannière s'affiche pendant `introDur` s ; le
serpent est **figé** le temps de l'annonce (`introUntil`), ce qui laisse voir la map.
`startLevel` choisit le **type** d'annonce (`introKind`) :
- **`normal`** : « NIVEAU X — Objectif : N batteries » (cyan), durée `CONFIG.introDuration`.
- **`enemy`** (niveau = `CONFIG.enemy.fromLevel` = 3, **une seule fois**) : annonce dramatique
  de l'arrivée du **Snakator** — « ⚠️ ALERTE / LE SNAKATOR APPARAÎT ! », vignette rouge pulsée
  + sting `CT.Audio.alert()`.
- **`boss`** (niveaux boss) : titre empilé « NIVEAU X / 👹 BOSS » ou « 🐉 HYDRE / Coupez ses N
  têtes » (empilé pour tenir à l'écran), même vignette rouge + sting.

Les annonces spéciales durent `+0.9 s` et ajoutent une **vignette rouge pulsée** + un texte qui
palpite (atténués sous `prefers-reduced-motion`). `CT.Audio.alert()` = sting grave « dun-dun ».

### Objectif proche
Quand il reste **≤ 2 batteries** avant la fin du niveau, `updateHud` ajoute la classe
`near-goal` sur `.hud-progress` → barre de progression qui **pulse** (glow) + compteur en
couleur `glow` (monte la tension vers la cinématique). Animation CSS, désactivée sous
`prefers-reduced-motion` (glow statique à la place).

### Reprise après pause (3·2·1)
À la reprise depuis la pause (`togglePause` : paused → playing), `resumeUntil = time + 1.5`
fige le serpent (même mécanisme que l'intro : `acc = 0` tant que `time < introUntil ||
time < resumeUntil`) et `drawResumeCountdown` affiche un **compte à rebours 3·2·1** centré,
le temps que le joueur se repositionne. `resumeUntil` est remis à zéro dans `reset`.

### Bords traversables (plateau toroïdal)
Les **murs ne tuent pas** : en sortant par un bord, le serpent **réapparaît en
face** (`nh.x = (nh.x + COLS) % COLS`, idem en y). Seuls les **obstacles** et le
**propre câble** sont mortels. Le rendu gère le franchissement : l'interpolation
prend le « court chemin » (sortie par le bord), le câble est **coupé** au bord
(deux tronçons partant des bords opposés, jamais une ligne en travers du
plateau), et tête/queue sont **dupliquées** de l'autre côté pendant la traversée
(`_forEachWrap`). L'IA démo et la distance utilisées sont **toroïdales**. Les
bords sont dessinés en pointillé « portail ».

### Serpent ennemi (`CONFIG.enemy`, dès le niveau `fromLevel` = 3)
Un **mini serpent rouge** (`this.enemy = { body, prev, dir }`, longueur `length`) rôde
sur la map à partir du niveau 3 (`spawnEnemy` dans `setupLevel`, loin du spawn joueur).
⚠️ `fromLevel=3` recouvre la plage de la démo (1→3) : l'apparition est **explicitement
bloquée en démo** (garde `!this.demo` dans `setupLevel`) pour garder l'écran attract calme.
Il avance d'**une case par pas** (`stepEnemy`, appelé
dans `step()`) : marche aléatoire avec inertie (`turnChance`), évite demi-tour /
obstacles / son corps, bords **toroïdaux**, aléa **déterministe** (`this.rng`). **Mortel
si notre tête le touche** (`enemyHits` → `die()`), testé avant ET après son déplacement,
**sauf bouclier**. ⚔️ **Sous bouclier, on le MORD** (`biteEnemy`, testé aux deux mêmes
points que la mort) : **tête-à-tête** (bloc 0) → **destruction totale** ; sinon on **coupe
sa queue** à partir du bloc touché (`body.splice(idx)`). Chaque bloc détruit rapporte
`enemy.bitePoints × niveau` pièces, alimente la quête **« Tueur de Snakator »**
(`_ach({snakator})`) et déclenche éclats/secousse/son ; le **bouclier reste actif** (comme
le brise-mur). Rendu `drawEnemy` **agressif** :
crâne en **pointe de lance** orienté vers la direction, **yeux fâchés** ambrés (sourcils
froncés) + pupilles ardentes, **crocs**, corps en **épine dorsale dentelée** (losanges) à
queue affinée, glow « danger » pulsé (atténué sous `prefers-reduced-motion`), duplication
aux bords (traversée). Dessiné **sous** le serpent joueur.

### Mini-boss (`CONFIG.boss`, tous les `everyLevels` = 5 niveaux)
Aux niveaux **5, 10, 15…** (`bossLevel`, jamais en démo), un **combat de boss DÉDIÉ**
remplace l'objectif batteries : **pas de batterie à ramasser** (`food = null`), il faut
**couper toutes les TÊTES** en les **mordant sous bouclier**. Les boss vivent dans un **tableau
`this.bosses`** (≠ `this.enemy`, réservé au Snakator normal). Chaque boss porte un tableau
**`heads`** : `[{ hp, maxHp, slot, dead }]` — **chaque tête = un point faible à ses propres PV**.
`spawnBosses(tier)` les place loin du joueur ET les uns des autres ; `tier = niveau / everyLevels`.
- **Deux formes alternées** (`bossSpec(tier)`, varie les plaisirs) :
  - **paliers IMPAIRS → ESSAIM** : `bossCount(tier)=1+⌊(tier-1)/countEvery⌋` boss à **1 tête**
    (plafond `maxCount`, 1·2·3·4…) ; PV/boss réduits (`perBossHpScale`) quand plusieurs.
  - **paliers PAIRS → HYDRE** : **un seul** boss à `min(maxHeads, 1+tier/2)` **têtes** (2-3),
    déployées en éventail devant le cou (`headCells` : `body[0] + dir + perp·slot`, `HEAD_SLOTS`),
    PV/tête réduits (`perHeadHpScale`). Couper **toutes** ses têtes pour l'abattre.
  - Tous **POURSUIVENT** le joueur (`stepSnake`, branche `e.boss` = option qui rapproche le plus
    de sa tête, toroïdal, + `boss.turnChance`).
- **Unification ennemi/boss** : `hostiles()` = `this.bosses` (niveau boss) sinon `[this.enemy]` ;
  `hostileAt(x,y)` teste corps **ET têtes vivantes** (`headCells`). Collisions/morsures de `step()`
  passent par là → **mortel au contact hors bouclier** (`die()`), **mordable sous bouclier**.
- **Morsure** (`biteSnake(e,x,y)`, branche `e.boss`) : viser les **têtes**. Mordre une tête vivante
  = `boss.headDamage` (2) à **cette** tête ; mordre le **corps** = 1 PV à la 1ʳᵉ tête vivante. À 0 PV
  la tête « tombe » (`dead`, moignon de cou) → toast « 🗡️ TÊTE COUPÉE ». Chaque PV ôté rapporte
  `enemy.bitePoints × niveau` (quête **« Tueur de Snakator »**). `killBoss(e)` quand **toutes** ses
  têtes sont coupées : retire le boss + récompense (`boss.reward × tier × niveau`) ; quand **tous**
  les boss sont abattus → `bossLevelCleared()` (flash + **cinématique**). PV cumulés via `bossesHp()`.
- **ENRAGE** : sous **50 % de PV** (toutes têtes cumulées), le boss passe `e.enraged = true` (une fois,
  détecté dans `biteSnake`) → toast « 😡 ENRAGÉ ! » + sting `alert()`, **poursuite implacable**
  (`turnChance × 0.4` dans `stepSnake` — même nombre d'appels rng, déterminisme préservé) et visuel
  chauffé à blanc (`drawHostile` : pulse ×14, aura ×2+, crâne éclairci).
- **ORBES (attaques)** : dès le palier `orbFromTier` (2 → niveaux 10+), chaque boss **crache une orbe**
  tous les `orbEvery` pas (×0.6 si enragé, plafond `orbMax` simultanées) qui **vise la tête du joueur**
  (`fireOrb`, chemin toroïdal). Les orbes vivent en **cases flottantes** (`this.orbs`), avancent dans
  `tick` (`updateOrbs(dt)`, bords toroïdaux, vie `orbLife` s) : contact tête **hors bouclier → mort**,
  **sous bouclier → orbe détruite** (éclat + son). Rendu `drawOrbs` : noyau (couleur `enemySkin.main`)
  + halo pulsé + traînée orientée. Vidées à chaque `setupLevel`. ⚠️ Mouvement par `dt` (pas par pas) →
  cosmétiquement fluide mais **hors du déterminisme strict pas-à-pas** (à journaliser pour le rejeu).
- **Boucliers fréquents** : pas de batterie → un **bouclier garanti** (`spawnBonus('shield')`)
  apparaît tous les `bossShieldEvery` pas (`shieldEveryBase` au palier 1, **+`shieldEveryPerTier`
  par palier** → de moins en moins). Spawn câblé dans `step()`. **Malus désactivés** en combat de boss.
- **Difficulté par palier** : PV `baseHp + (tier-1)·hpPerTier` (×`perBossHpScale`/`perHeadHpScale`),
  longueur `baseLen + (tier-1)·lenPerTier` (plafond `maxLen`), **murs** `(tier-1)·wallsPerTier`
  (aucun au 1ᵉʳ palier, plafond `wallsMax`), **+ nb de boss / de têtes** qui monte (voir ci-dessus).
- **UI** : HUD bascule sur les **PV CUMULÉS** (`❤️`, classe `.hud-progress.boss` rouge, `#batUnit`),
  bannière d'intro « 👹 BOSS » ou « 🐉 HYDRE — coupez ses N têtes », **barre de PV cumulés sur le
  canvas** (`drawBossBar`, « 🐉 HYDRE — N têtes » / « 👹 BOSS ×N »), et une **mini-barre de PV au-dessus
  de chaque tête** (hydre : par tête ; essaim : par boss → repère le plus faible). Rendu `drawHostile(e)` :
  boss = segments **×1.35** + **aura violette** (`glowCol = T.violet`) ; hydre = `body[0]` devient une
  jonction (losange), têtes en éventail reliées par des **cous**, têtes coupées en **moignons**. Le
  score boss reste **sous le plafond anti-triche** (le plafond suppose déjà une batterie max-combo
  à chaque pas → large marge).

### Défi du jour & fantôme (`CT.util.dailySeed` + `js/ghost.js`)
Bouton doré **« 📅 DÉFI DU JOUR »** sur l'accueil (`#dailyBtn`, `main.js` : `dailyMode` — REJOUER/
RECOMMENCER gardent le mode) : la partie démarre avec `startRun(CT.util.dailySeed())` = **FNV-1a de
la date locale** (`CT.util.todayStr()`) → **même map/spawns/événements pour tous aujourd'hui**.
- `game.daily = true` : badge « 📅 DÉFI DU JOUR (· 👻 à battre : N) » dans l'intro, entrée de
  classement marquée `daily: true` → **onglet « ☀️ Jour »** sur l'écran de fin (activé par défaut
  après un défi ; `boards()` local **et** serveur renvoient `daily[]` + `dailyRank`, filtre
  `e.daily && e.ts >= minuit`). ⚠️ En prod, le serveur devrait vérifier `seed == dailySeed(date)`.
- **Fantôme** (`CT.Ghost`, localStorage `ct_ghost`, un seul : le **meilleur du jour**) : pendant un
  défi, `step()` journalise `[x, y, tSecondes, niveau]` dans `game.ghostRec` (plafond
  `MAX_FRAMES` = 6000). À la mort, `CT.Ghost.maybeSave(points, frames)` remplace le fantôme si le
  score le bat (`game.newGhost` → « 👻 Nouveau fantôme du jour ! » dans le récap). Aux tentatives
  suivantes, `drawGhost` rejoue la course en **temps réel** (curseur `ghostIdx` monotone sur
  `t = time - runStart`), **seulement si le fantôme est sur le même niveau** (même map) — carré
  translucide + 👻. L'indice « 👻 score » s'affiche aussi sur le bouton de l'accueil
  (`#dailyGhostHint`). C'est la 1ʳᵉ brique du journal de partie du **rejeu anti-triche**.

### Événements aléatoires (`CONFIG.events`)
En jeu réel (jamais en démo, **jamais en combat de boss**, dès `events.fromLevel` = 2), une
tentative d'événement a lieu tous les `events.every` pas (proba `chance`, via **`this.rng`
déterministe** → même séquence pour tous sur le Défi du jour). Un seul à la fois +
`cooldown` s de temps mort (`eventCooldownUntil`). `startEvent()` tire le type, affiche une
**bannière transitoire** (`drawEventBanner`, texte qui palpite) + flash/sting :
- **💰 Ruée dorée** (`goldUntil`, `goldDuration` s) : pièces **×`goldMult`** sur les batteries
  (appliqué dans `onEat`), chip 💰. Sting `bonus()`.
- **🌑 Blackout** (`blackoutDuration` s) : brouillard total — réutilise `fogUntil`/`drawFog`
  (chip 🌫️ rouge existant). Sting `alert()`.
- **🎁 Pluie de power-ups** (`rainUntil`, `rainDuration` s) : dans `step()`, un power-up
  **réapparaît dès que le slot est libre** (`spawnBonus()`), chip 🎁. Sting `bonus()`.
Timers purgés à chaque `setupLevel`. Le plafond anti-triche absorbe le ×2 temporaire (marge large).

### Mode Chrono (`CONFIG.chrono`, bouton « ⏱️ CHRONO — 2 MIN »)
Mode dédié aux bornes de bar : **une seule arène** (`pattern: 'pillars'`, Snakator dès le
départ, 1 paire de portails), **`duration` = 120 s**, **score max**. `startRun(seed, 'chrono')`
→ `game.chrono` ; `main.js` gère le mode via `runMode` (`'normal' | 'daily' | 'chrono'`,
REJOUER/RECOMMENCER le gardent). Détails :
- **Pas de niveaux ni de cinématique** : `level.needed = Infinity` (setupLevel), `levelNum`
  reste 1. Le serpent accélère par batterie comme d'habitude (plancher `minStep`).
- **Décompte** : `chronoEnd = introUntil + duration` (fixé dans `startLevel`) ; la **pause ne
  compte pas** (`togglePause` décale `chronoEnd` de la durée de pause + le 3·2·1). Le HUD
  bascule : libellé « ⏱ CHRONO » (`dom.lvlBox`), **barre = temps restant** qui se vide
  (`unit` ⏱, rafraîchie 1×/s dans `tick` via `_chronoShown`, classe `near-goal` ≤ `warnAt`).
  Sur les `warnAt` = 10 dernières s, `drawChronoWarning` affiche un **gros compte à rebours
  pulsé** (ambre puis rouge ≤ 5 s) + tension musicale ≥ 0,85 sur les 15 dernières s.
- **Fin au temps** : testée en tête de `step()` → `chronoExpired = true` + `die()` ; l'écran
  de fin titre « **⏱️ TEMPS ÉCOULÉ !** » (sinon « BATTERIE DÉCHARGÉE » même en chrono si mort
  par collision). Entrée marquée **`chrono: true`** → **classement DÉDIÉ** (onglet « ⏱ Chrono »,
  actif par défaut après un chrono) ; les scores chrono sont **exclus** de Jour/Semaine/Global
  (local `boards()` **et** serveur). Pas de missions ni de Défi du jour en chrono ; validation
  anti-triche inchangée (le plafond dépend déjà de `durationMs`).

### Portails de téléportation (`CONFIG.portals`, dès le niveau `fromLevel` = 4)
Des **paires de vortex** (1 paire au niveau 4, +1 toutes les `extraEvery` = 6, plafond
`maxPairs` = 2 ; **jamais** en démo / combat de boss ; 1 paire en chrono) placées par
`spawnPortals` (via `this.rng` → déterministe, bouches d'une paire à ≥ `minDist` = 9 cases
toroïdales, hors couloir de spawn, jamais sur un obstacle). **Entrer par une bouche →
ressortir par l'autre, direction conservée** : dans `step()`, si la case d'arrivée `nh` est
un portail (`portalTwin`), `nh` devient la bouche jumelle (éclats aux deux bouts + son).
**Les hostiles les empruntent aussi** (même règle dans `stepSnake`). Détails :
- `isFree` exclut les bouches (rien ne spawne dessus) ; `spawnEnemy`/`spawnBosses` les évitent.
- **Rendu** (`drawPortals`, sous le vivant) : cœur sombre + 2 arcs en contre-rotation +
  étincelle pulsée ; couleur **par paire** (cyan/glow puis violet/rose).
- **Rendu de la traversée** : un déplacement > 1 case (après correction toroïdale) est un
  **saut de portail** → pas d'interpolation (le segment « pop » à la sortie), et le **câble
  est coupé** au portail (`linked(i)` dans `drawSnake` : maillons non adjacents en grille →
  pas de tronçon dessiné). Même « snap » dans `drawHostile`.

### Niveau COURSE — le Glouton (`CONFIG.race`, niveaux 7, 12, 17…)
Aux niveaux `fromLevel` + k·`every` (**`n % every === offset`**, offset = 2 → jamais un
niveau boss ; jamais en démo/chrono), le Snakator est remplacé par le **GLOUTON**
(`spawnEnemy(true)` → `enemy.race`), un rival **DORÉ** (skin forcé ambre/glow dans
`drawHostile`, prioritaire sur `CT.BossSkins`) qui **chasse la BATTERIE** au lieu du joueur
(branche `e.race` de `stepSnake` : glouton vers `this.food`, imprévu `race.turnChance`).
- **Vol** (`rivalEats`, testé après chaque pas du rival) : s'il atteint la batterie, il la
  mange → **`batteries − 1`** (l'objectif recule), il **grandit** de `race.grow` bloc(s)
  (plafond `malus.maxEnemyLen`), toast « 😋 BATTERIE VOLÉE ! » + son malus, la batterie
  réapparaît ailleurs.
- Mortel au contact hors bouclier (mécanique Snakator inchangée) ; **sous bouclier on le
  mord** — tête-à-tête = destruction (« 💥 GLOUTON DÉTRUIT »)… mais il **revient** après
  `race.respawn` = 6 s (`rivalRespawnAt`, réarmé dans `biteSnake`, respawn dans `step()`
  avec toast « 🏁 LE GLOUTON REVIENT ! »).
- **Intro dédiée** (`introKind: 'race'`) : « 🏁 COURSE / Le GLOUTON vole vos batteries ! »,
  vignette d'alarme + sting (comme enemy/boss). Les malus qui allongent l'ennemi allongent
  aussi le Glouton (c'est `this.enemy`).

### Missions de partie (`CONFIG.missions`, hors chrono/démo)
À chaque `startRun`, **3 objectifs secondaires** sont tirés du pool `MISSION_POOL` (game.js :
combo ×5, 25 batteries, 5 power-ups, 3 murs brisés, 4 blocs ennemis, survivre 2 min,
atteindre le niveau 4) **via `this.rng` AVANT les spawns** → déterministes par seed (même
trio pour tous sur le Défi du jour). Chaque mission = `{ id, icon, label, target, reward,
prog(g), done }` ; compteurs de run dédiés `wallsRun`/`snakRun` (smashWall/biteSnake).
- `checkMissions()` (fin de `step()`) marque les missions accomplies : toast
  « 🎯 MISSION ✓ +N ⚡ » + flash + jingle. La récompense s'accumule dans **`missionCoins`**
  et est **versée au Labo** à la mort (`bank({points: points + missionCoins})`) — **jamais
  au score** → classement et plafond anti-triche intacts (c'est le sink économique qui
  finance la Boutique).
- **UI** : listées dans l'**intro du niveau 1** (sous l'objectif), sur l'**écran pause**
  (✅/🎯 par ligne, `showPause`) et dans le **récap de fin** (`.over-missions` : ✅/▫️ par
  icône + total ⚡, avant la ligne `lab-gain` qui inclut désormais les ⚡ missions).

### Décors thématiques / biomes (`CONFIG.biomes` + `CT.getBiome`)
Le réseau Cryptotem vit dans les **bars, cinémas, bowlings, discothèques et laser games** :
chaque tranche de **3 niveaux** prend le décor d'un de ces lieux (`CT.getBiome(n)` = index
`⌊(n-1)/3⌋` modulo la liste). `this.biome` est fixé dans `setupLevel`. Un biome = `{ id, name,
icon, tint (clé de theme, rebrandable), motif }`. Le fond de `renderWorld` est **teinté** par
`mix(bg1, theme[tint], 0.3)`, et `drawBiome(tint)` dessine un **motif décoratif** subtil
(basse opacité, derrière la grille, fixe) : `skyline` (immeubles + fenêtres, bar), `film`
(bandes de pellicule sur les côtés, ciné), `lanes` (pistes en perspective, bowling), `disco`
(rayons balayants + violet), `laser` (faisceaux diagonaux croisés). L'intro « normale » affiche
un **badge du lieu** (icône + nom) au-dessus de « NIVEAU X » (sauf en Défi du jour / défi d'ami,
qui ont leur propre badge). Purement cosmétique — aucun impact gameplay.

### Options d'accessibilité (`js/access.js` → `CT.Access`)
Panneau « ⚙️ Options » (bouton accueil → `#optionsScreen`) avec 2 bascules **persistées**
(`localStorage ct_access`), utiles sur les bornes en bar :
- **Mode daltonien** : le rouge « danger » devient **orange** (`#ff8a1e`, bien plus distinct du
  vert « charge » pour les deutéranopes/protanopes), l'ambre vire au jaune vif.
- **Contraste élevé** : fond quasi noir + **grille nettement plus marquée**.
`access.js` est chargé **juste après config.js** → applique les préférences **avant** que game.js
ne capture le thème. Tout passe par **MUTATION** des propriétés de `CONFIG.theme` (jamais un
remplacement d'objet → game.js lit `T.*` en direct) + synchronisation des variables CSS `:root`
(`--danger`, `--amber`, `--bg0`, `--bg1`, `--text-dim`). Neutre par défaut ; toggle live via
`CT.Access.toggle('colorblind'|'contrast')`.

### Multi-langue / i18n (`js/i18n.js` → `CT.i18n`, FR / EN / ES)
Localisation complète de l'UI et du texte de jeu en **français, anglais, espagnol**. Chargé
**juste après access.js** → `CT.i18n.t(key, params)` disponible partout. Langue persistée
(`localStorage ct_lang`), **auto-détectée** au 1ᵉʳ lancement (`navigator.language`, repli FR).
Sélecteur **FR/EN/ES** dans l'écran Options.
- **`STR`** : chaînes de la coque + du runtime par langue, avec `{placeholders}` substitués par `t()`.
- **`apply(root)`** : traduit le HTML statique marqué **`data-i18n`** (textContent), **`data-i18n-html`**
  (innerHTML, ex. `cta.sub`) et **`data-i18n-ph`** (placeholder du champ pseudo). Appelé au
  démarrage (main.js) et à chaque changement de langue.
- **Catalogues** (`CT.i18n.quest/medal/skin/mission/labName/labDesc/biome`) : les modules de
  données (`lab.js`, `achievements.js`, `skins.js`, `MISSION_POOL`) restent le **repli FR** ; la
  traduction se fait **au rendu** (main.js/game.js) via ces helpers → aucun module de données modifié.
  Le sélecteur re-render l'écran ouvert (`CT.i18n.setOnChange` dans main.js : syncAudioButtons +
  updateHud + écran courant + bannière de défi).
- **Couverture** : accueil, HUD, toutes les intros (normal/enemy/boss/hydre/course/chrono/versus +
  badges lieu/défi/jour), tutoriel, bannières (surcharge/record/événements), écran de fin (titres +
  récap + missions + défi + labo), pause, Options, Labo, Quêtes, Stats, Skins & Boutique (noms +
  descriptions + états), classement, missions. **Restent en FR** (repli, non traduits en v1) : les
  **toasts fugaces en jeu** (« BATTERIE VOLÉE », « TÊTE COUPÉE », « GLOUTON DÉTRUIT », « ENRAGÉ »…),
  cosmétiques et éphémères. Ajouter une langue = ajouter une entrée dans `STR` + les catalogues.

### Onboarding — première partie guidée (`game.tutorial`)
À la **toute première partie normale** sur l'appareil (drapeau `localStorage ct_seen`, posé
au démarrage du tuto → une seule fois), `this.tutorial = true` (jamais en chrono/versus/daily/
défi). `drawTutorial` (appelé dans `renderWorld`, hors intro) affiche un **bandeau d'aide** en
bas + un **halo pulsé sur la 1ʳᵉ batterie**, avec un message qui évolue : 0 batterie → « Dirige
la batterie : flèches, WASD ou swipe » ; 1-2 → « Fonce dans un bord : tu ressors en face ! » ;
à 3 batteries le tuto s'éteint (`this.tutorial = false`). Non bloquant (le jeu se joue normalement).

### Mode 2 joueurs — DUEL (`CONFIG.versus`, bouton « 👥 2 JOUEURS »)
Duel local sur la même tablette : **J1 (cyan, flèches/swipe/D-pad) vs J2 (rose, WASD/ZQSD)**.
`startRun(seed, 'versus')` → `game.versus` ; `setupLevel` court-circuite vers `setupVersus`
(arène `pillars`, deux serpents opposés — J1 à gauche, J2 à droite —, chacun **sa batterie** sur
sa moitié via `freeVersusCell(side)`, couloirs de spawn dégagés par `_clearObstacle`). **Aucun
système solo** (power-ups / ennemis / malus / portails / missions / événements désactivés →
duel épuré et équitable, vitesse fixe `versus.step`). Détails :
- **Entrées** : `input.js` étiquette chaque touche `'p1'` (flèches) ou `'p2'` (WASD) ; en solo
  les deux pilotent l'unique serpent, en versus `setDir(name, 'p2')` route vers `dirQueue2`.
- **Pas de jeu** : `tick` appelle `stepVersus()` (au lieu de `step()`) — avance les deux serpents,
  chacun mange sa batterie (grandit + score, respawn), puis **collisions testées après
  déplacement** (obstacle · propre corps · corps adverse). **Tête-à-tête = égalité.** Premier à
  `versus.target` (15) batteries — ou **dernier survivant** — gagne (`versusEnd(1|2|3)`).
- **Rendu dédié** : `drawVersusFood` (batterie colorée), `drawVersusSnake` (câble interpolé +
  traversée des bords + tête numérotée « 1 »/« 2 »), `drawVersusHud` (scoreboard « 🔵 J1 n/target »
  / « n/target J2 🔴 »). HUD DOM = « 👥 DUEL ». Intro `introKind: 'versus'`.
- **Fin** : `versusEnd` → écran de fin avec titre « 🏆 JOUEUR X GAGNE ! » / « 🤝 ÉGALITÉ ! »,
  **classement masqué** (mode non scoré, `main.js showOver` cache `.lb` + le bouton défi).

### Défi d'un ami par QR (`game.pendingChallenge` / `game.challenge`)
À l'écran de fin, bouton **« 📲 Défier un ami »** (`#defiBtn`) → génère un **QR** (`CT.QR`, même
encodeur que la CTA) encodant un lien vers le jeu : `…/?defi=1&s=<seed>&p=<score>&n=<pseudo>`
(la **seed jouée** + le **score à battre** + le pseudo). L'ami scanne → `main.js` (IIFE
`readChallengeLink`) lit `location.search`, pose `game.pendingChallenge` et affiche une
**bannière dorée** sur l'accueil (« 🎯 Défi de X — bats N ! ») ; le bouton JOUER devient
« 🎯 RELEVER LE DÉFI » et lance `startRun(undefined, 'challenge')`. En mode défi : `game.challenge`
= `{ seed, score, name }`, **même map** (seed de l'ami), badge d'intro « 🎯 Défi de X — à battre : N ».
À la mort, `challengeWon = points > challenge.score` → écran de fin titré « 🎉 DÉFI RELEVÉ ! » /
« 😤 DÉFI MANQUÉ » + ligne récap. C'est un **run normal scoré** (soumis au classement Semaine/Global) ;
seul le fantôme n'est pas transmis (trop volumineux pour un QR → « bats mon score », pas « vs fantôme »).

---

## 🎨 Identité visuelle (d'après logo.png + Station.jpeg)

- **Motif signature** : la **dissolution en pixels** du logo (carrés qui se
  détachent) → réutilisée pour les particules quand on ramasse une batterie.
- **Palette** (voir `CONFIG.theme` dans `js/config.js`, point unique de vérité) :
  - Fond : `#02161A` → `#05242A` (teal très sombre)
  - Teal profond `#063C40`, teal `#13B5B8`, cyan `#26E0E0`, glow `#2BF0D8`
  - Bleu électrique batterie `#2F7BFF` (LED des power banks de la station)
  - Charge `#19E3B0`, danger/obstacles `#FF5B6E`, ambre `#FFC24B`
- **Serpent** : tête = power bank sombre avec « T » lumineux + embout USB-C ;
  corps = câble USB-C (dégradé couleur courante → teinte sombre) avec halo ; queue =
  connecteur USB-C (boîtier teinté de la couleur courante + embout métallique).
  **Le serpent change de couleur à chaque batterie ramassée**
  (cycle `CONFIG.snakePalette`, transition lissée) — tête, câble, halo, « T » **et la
  queue** suivent. Repart sur la 1ʳᵉ couleur (cyan) à chaque niveau.
- **Pour rebrander** : modifier `CONFIG.theme`. Pas de couleurs en dur ailleurs.

---

## ⚙️ Réglages gameplay (`js/config.js`)

- `CONFIG.snakePalette` : couleurs successives du serpent (1 par batterie),
  données par clés de `CONFIG.theme` (rebrandable). Cyclées modulo la longueur.
- `CONFIG.cols` / `CONFIG.rows` : taille de la grille (carrée).
- `CONFIG.minStep` : intervalle le plus rapide (ms) — plancher de vitesse.
- `CONFIG.speedupPerBattery` : ms retirés par batterie.
- `CONFIG.levels[]` : `{ needed, step, obstacles, pattern }` par niveau. Motifs
  d'obstacles, **tous visuellement distincts** : `none`, `corners` (amas dans les
  coins), `bars` (segments aléatoires), `cross` (croix « + » centrée, centre dégagé),
  `pillars` (cases éparses), `diamond` (anneau en losange), `maze` (murs courts sur une
  grille pas-3 → allure labyrinthe).
- `CT.getLevel(n)` : renvoie le niveau `n` (génère proceduralement au-delà du
  tableau — objectif/obstacles ↑, `step` ↓ ; le **motif alterne** sur les niveaux
  procéduraux — `corners`/`bars`/`cross`/`pillars`/`diamond`/`maze` — pour la variété).
- **Anti-blocage** : après placement, `ensureConnected()` vérifie par flood-fill
  toroïdal (`floodFree`) que **toutes** les cases libres sont accessibles depuis
  le spawn ; sinon `openNear` retire un obstacle frontière jusqu'à connexité.
  Garantit qu'aucune batterie n'est jamais enfermée (map toujours jouable).

### Cinématiques (`js/cinematics.js`)
10 **variantes** (recharge express, confettis, pulse néon, surcharge turbo, totem
pixel, **la ville se recharge** — skyline dont les fenêtres s'allument au rythme de
la charge —, **le réseau s'allume** — maillage de stations Cryptotem dont les
nœuds et liens s'allument avec la charge —, **aurore énergétique** — rideaux d'aurore
boréale néon qui ondulent et s'intensifient avec la charge —, **vortex néon** — spirale
d'énergie qui tourne et s'étend avec la charge — et **pluie de comètes** — traînées
lumineuses qui filent en diagonale sur un fond étoilé, de plus en plus nombreuses avec la
charge). `CT.pickCinematic(lastVariant)` choisit une variante **différente de la
précédente** (liste : `CT.CINEMATICS`). Timeline en phases : `enter` → `connect` →
`charge` → `celebrate` (boucle jusqu'au clic « Niveau suivant »). Chaque variante a
sa spec (`accent`, `title`, entrée `from`), son fond (`_drawBackground`) et ses
particules de célébration (`_emitCelebrate`) ; téléphone + power bank + câble partagés.

### Score, combo & record
- `points` : score chiffré. Gain par batterie = `(50 + niveau*10) * combo`.
- `combo` : ×N si on ramasse une batterie < 2,6 s après la précédente (max ×9).
  Un **chip « 🔥×N » + fenêtre restante** s'affiche parmi les pastilles d'effets (`drawEffects`,
  combo ≥ 2, jamais en démo) → le joueur voit le temps qu'il lui reste pour enchaîner.
- `best` : record perso, chargé depuis `CT.Leaderboard` (async) et affiché sur
  l'accueil, le HUD et l'écran de fin (« Nouveau record ! »). ⚠️ `best` est **bumpé en
  cours de partie** pour suivre `points` (affichage HUD) ; le vrai record à battre est figé
  dans `recordToBeat` (rempli par `loadPersonalBest`).
- **Bannière « 🏆 RECORD BATTU ! »** : quand `points` dépasse `recordToBeat` en cours de
  partie (une seule fois, jamais en démo, jamais si pas de record à battre), `_scored()`
  déclenche une bannière transitoire (`drawRecordBanner`, ~1,8 s) + fanfare
  `CT.Audio.achievement()` + haptique/shake. `_scored()` centralise le bump de `best` et
  ce test (appelé par `onEat` et `_awardBonus`).
- **Récap de fin** (`die`) : l'écran de game over affiche, sous le score, une ligne récap
  `⏱ temps de survie · ⚡ power-ups · 🔥 meilleur combo` (`maxComboRun`, suivi dans `onEat`,
  remis à zéro dans `reset`). Style `.over-recap`.

### Classement (`js/leaderboard.js`)
`CT.Leaderboard` — 3 vues : **record perso**, **record de la semaine**,
**classement global**. API à base de Promesses (compatible backend distant) :
`submit(entry)`, `fetchBoards(me)`, `relabelLast(name)`, `getName/setName`,
`useRemote(endpoint, token)`. À la mort, `game.die()` soumet une entrée
`{ name, score, level, batteries, bonuses, durationMs, seed, daily, chrono, diff, steps, journal, ts }` ;
le client remote ajoute un **`nonce` + `cts`** (horodatage client) à chaque POST (anti-rejeu).
L'écran de fin affiche le pseudo (modifiable), un classement à onglets Jour/Semaine/Global/Chrono
(top 5, ligne du joueur surlignée), le rang et le record perso. L'**écran d'accueil** affiche le
**top 3 de la semaine** (mode attract — visible sur les écrans en bar).
**⚠️ Anti-triche :** le backend local (localStorage) **n'est pas** sécurisé — c'est un placeholder.
La validation vit dans `js/scoring-rules.js` (`CT.ScoringRules.validate` / `maxPlausibleScore`),
**partagée à l'identique** navigateur ↔ **serveur Node de référence** (`server/leaderboard-server.js`).
Le serveur (durci pour la prod) : revalide le plafond, **valide le journal d'inputs** (rejeu déterministe
étape 1, `js/sim-core.js`), **horodate côté serveur**, exige un **token de borne** (`CT_TOKENS`), rejette
le **rejeu** (nonce à usage unique + fenêtre d'horloge), sert en **HTTPS** si certificats fournis
(`CT_TLS_KEY`/`CT_TLS_CERT`) et persiste dans une **vraie base** (`node:sqlite` si dispo, sinon JSON
atomique). Brancher le jeu : `CT.Leaderboard.useRemote('http://localhost:8124', token)`. Voir
[docs/anti-cheat.md](docs/anti-cheat.md).

### Difficulté (`CONFIG.difficulty` + `CT.getDifficulty`)
Réglage joueur (écran Options, persisté `ct_diff`, sélecteur ⚔️ Facile/Normal/Difficile) qui ajuste
la **vitesse de départ** (`stepMult`), l'**accélération** (`speedupMult` → `game.speedup`) et la
**densité d'obstacles** (`obstacleMult`). Appliqué dans `setupLevel` **uniquement en partie NORMALE
solo** — jamais en démo / Défi du jour / défi d'ami (map partagée), ni en chrono / duel (config
propre) → les classements dédiés restent équitables et les maps partagées identiques. Le plancher
`minStep` et l'objectif ne changent **pas** → le plafond anti-triche reste une borne valide (Difficile
n'exploite pas la faille). Entrée taguée `diff`.

### Rejeu déterministe — étape 1 (`js/sim-core.js` → `CT.SimCore`)
Fondation du modèle « speedrun » (cf. docs/anti-cheat.md) : `game.step()` incrémente `stepCount` et
`setDir` journalise chaque virage joueur `[pas, codeDir]` dans `game.journal` (plafond `MAX_TURNS`) ;
`die()` joint `steps` + `journal` (encodé compact) à l'entrée. Le serveur revérifie via
`CT.SimCore.validateJournal` : nb de pas cohérent avec la durée (plancher `minStep`) et les batteries,
journal monotone, codes valides. `makeRng` y est une **copie exacte** de `CT.util.makeRng` (le serveur
peut reconstruire la même séquence d'aléa). **Étape 2 (à faire)** : moteur de re-simulation headless
partagé qui **recalcule le score canonique** — bloqué par l'extraction de `game.step`/spawns en module
partagé + le retrait de l'aléa non journalé (`Math.random` du « coup de chance », orbes en `dt`).

### Laboratoire / R&D (`js/lab.js` → `CT.Lab`)
Méta-progression persistante (localStorage `ct_lab`) qui donne de la durée de vie.
- **Banque** : à la mort, `CT.Lab.bank({batteries, points})` verse les ressources
  de la partie (batteries collectées + points) dans le portefeuille. `CT.Lab.spend(pts)`
  débite des pièces ⚡ (achats cosmétiques de la Boutique — voir Skins) ; `canAfford(pts)`.
- **Recherches** : on dépense **batteries + points** pour lancer **une** recherche
  qui prend du **temps réel** (`endsAt`, persiste même hors-jeu). Une seule **active**
  à la fois. À la fin → bouton « Récupérer » (`claim`) qui applique le niveau. La
  récupération **célèbre** la récompense : fanfare `CT.Audio.achievement()` + **toast doré**
  (`#labToast`, `.lab-toast`, `showLabClaimToast` dans main.js) « icône Nom — Niv N débloqué ! »
  (i18n `lab.unlocked`) en haut de l'écran, auto-masqué après ~2,4 s.
- **File d'attente (jusqu'à `QUEUE_MAX` = 3)** (`canEnqueue` / `enqueueNext` / `cancelQueued(index)`
  / `queue()` / `nextResearch`, tableau `s.queue`) : pendant qu'une recherche tourne, chaque carte
  d'amélioration propose « ＋ File » pour **réserver les prochaines** recherches (coût **payé
  d'avance** au niveau courant) ; elles **démarrent l'une après l'autre** à chaque récupération
  (`claim` défile `s.queue.shift()`). On **interdit** qu'une amélioration apparaisse **deux fois**
  (active OU déjà en file) → le coût/temps reste celui du niveau courant, **sans calcul de niveau
  projeté**. Chips numérotés « ⏭ En file : 1. … / 2. … » (`.lr-next`) sous la barre, chacun avec un
  **✕ qui l'annule et rembourse** intégralement (`cancelQueued`, coût mémorisé dans l'entrée). L'ancien
  créneau unique `s.next` est **migré** vers `s.queue` au chargement (`state()`). i18n `lab.queue` /
  `lab.queued` / `lab.cancelQueue` (FR/EN/ES).
- **« Terminer maintenant »** (`finishCost` / `finishNow`) : bouton ambre sous la barre
  de progression (`.lr-finish`, `renderResearch`) pour **finir instantanément** la recherche
  en cours en **dépensant des pièces ⚡**. Coût **proportionnel au temps réel restant**
  (`FINISH_COST_PER_S` = 0,25 ⚡/s ≈ 900 ⚡/h, plancher `FINISH_COST_MIN` = 25 → plus on a
  attendu, moins ça coûte) : c'est un **sink économique** pour les ⚡ (partagé avec la Boutique
  via le même portefeuille). `finishNow` débite le portefeuille et **avance `endsAt` à maintenant**
  → la recherche devient récupérable (clic « RÉCUPÉRER » habituel). Bouton **rouge + désactivé**
  si le portefeuille est trop court. Neutre pour l'anti-triche (méta/économie, n'affecte pas le
  score par batterie). i18n `lab.finish` (FR « Terminer » / EN « Finish now » / ES « Terminar ya »).
- **Temps de recherche** : barème partagé `RESEARCH_TIME_S` indexé sur le **niveau
  visé** (`researchTimeMs(l+1)`, utilisé par tous les upgrades) : 30 s · 1 min · 3 min
  · 5 min · 10 min · 30 min · 1 h · 2 h · 4 h · 8 h · 12 h · 16 h · 24 h · 30 h · 36 h …
  puis **+6 h par niveau** au-delà (idle / retour différé).
- **17 améliorations** (`CT.Lab.UPGRADES`, plusieurs niveaux) : Surtension (+10 %
  points/batterie), Bouclier renforcé (+1 s), Surcharge prolongée (+1 s), Aimant
  longue portée (+1 s), Double prolongé (+1 s de double points), Combo facile
  (+0,5 s de fenêtre), R&D power-ups (fréquence), **Rendement R&D** (+5 %/niv de
  ressources versées, max 15), **Départ protégé** (+1 s/niv de bouclier en début de
  niveau), **Inflation** (+5 %/niv de pièces par objet ; coûte **uniquement des pièces**
  ⚡ : 100·250·500·750…), **Coup de chance** (+5 %/niv de proba, à chaque objet, de
  **×2 pièces + batterie** de ce ramassage), **Double coupe** (+5 %/niv de proba que le
  **coupe-câble** retire **2 blocs** de queue au lieu d'1). — **Survie / économie / méta**
  (n'affectent PAS le score par batterie → plafond anti-triche intact) : **Antivirus** 🦠
  (+5 %/niv de proba de **neutraliser un malus** ramassé, max 10 ; `mods.malusResist`,
  proc via `Math.random` dans `onEatMalus`), **Seconde chance** 🔁 (`mods.revives`, max 2 :
  à la mort par **collision** — pas au temps écoulé du chrono — consomme 1 réanimation →
  `reviveGrace` = bouclier de grâce 3 s ; `game.revivesLeft` figé au `startRun`, garde dans
  `die()`), **Prime de mission** 🎯 (+20 %/niv de ⚡ sur les missions via `mods.missionMult`,
  appliqué dans `checkMissions` → banque, pas au score), **Labo accéléré** ⏩ (−5 %/niv de
  **temps de recherche**, plancher −25 %, appliqué dans `startResearch` — lab-interne) et
  **Soldes R&D** 🏷️ (−3 %/niv de **coût des recherches**, plancher −15 %, via `costMult`/`costOf`
  utilisé partout — canResearch/canEnqueue + affichage `renderList` — lab-interne).
- **Effets** : `CT.Lab.effects()` → `game.mods` (figé au `startRun`), appliqué dans
  `onEat` (points/combo/fréquence + `pointMult` = surtension + inflation + proc
  `luckChance` via `Math.random` pour ne pas décaler l'aléa des spawns), `onEatBonus`
  (durées) et `startLevel` (`startShield` → bouclier de grâce). `bankMult` est appliqué
  dans `bank()`. Neutre par défaut. **UI** : `fmtTime` (main.js) formate les durées en
  unités lisibles (s · min · h · j) ; le coût masque 🔋 quand il est nul (pièces seules).
- **UI** : écran « 🔬 Laboratoire » (bouton sur l'accueil) — portefeuille, recherche
  active (barre + compte à rebours + Récupérer), cartes d'amélioration (coût
  🔋+⚡ + temps, niveau, désactivées si labo occupé / ressources insuffisantes).
  Les cartes sont **regroupées en rubriques** (`LAB_CATEGORIES` dans main.js →
  en-têtes `.lab-cat` pleine largeur, i18n `lab.cat.*`) : 💰 Économie & score · 🎁 Power-ups ·
  🛡️ Survie · 🔬 Labo (l'ordre/le classement est **côté rendu**, `lab.js` inchangé ; toute
  clé non catégorisée retombe en fin de liste). Dans chaque rubrique, les améliorations **au
  max sont reléguées en bas** (tri stable) pour garder les choix utiles en haut. Chaque carte
  affiche une **jauge segmentée** (`.lu-pips`, 1 segment/niveau, remplis cyan→glow ; dorés quand
  le palier est complété) sous le nom → progression du palier lisible d'un coup d'œil.
- **Boucle de rétention** : l'écran de game over affiche les ressources versées
  (« 🔬 +X 🔋 +Y ⚡ au Labo ») + un bouton « 🔬 Laboratoire » qui y mène directement.
  De plus, quand une recherche est **terminée et récupérable** (`CT.Lab.isReady()`), le
  bouton « 🔬 Laboratoire » de l'**accueil** porte une **pastille verte ✓** pulsée
  (`#labBtn.lab-ready::after`, désactivée sous `prefers-reduced-motion`) → rappelle au
  joueur d'aller la récupérer (les recherches longues finissent hors-jeu). `main.js`
  `updateLabReadyBadge()` bascule la classe dans `renderStartBoard` **et** via un intervalle
  de 2 s (pour capter une recherche qui se termine pendant qu'on est sur l'accueil). Et **en
  cours de partie**, si une recherche **en cours** se termine, une **bannière in-game**
  « 🔬 Recherche terminée ! » (`drawResearchBanner`, i18n `research.done`) + fanfare s'affiche
  une seule fois : `startRun` capte l'horodatage de fin (`pendingResearchEnd`, si pas déjà prête),
  `tick` compare à `Date.now()` (jamais en démo, drapeau `researchDoneNotified`).
- **Réinitialisation** : bouton « Réinitialiser le Labo » (double-clic de
  confirmation) → `CT.Lab.reset()` efface toute la progression — utile sur une
  borne partagée en bar.

### Quêtes à paliers (`js/achievements.js` → `CT.Achievements`)
Méta-progression persistante (localStorage `ct_ach`) → rejouabilité longue durée.
- **Stats cumulées** : le jeu pousse des deltas via `CT.Achievements.update({bat, bonus,
  combo, level, score, durationMs, bankPts, game})` (depuis `game._ach`, **jamais en démo**) ;
  le module met à jour cumuls/maxima et renvoie les **paliers nouvellement franchis**.
  `CT.Achievements.stats()` renvoie une copie des stats cumulées (écran Statistiques).
- **10 quêtes × 5 paliers** (`QUESTS`) — chaque quête garde son thème mais a 5 seuils
  croissants → médailles **Bronze · Argent · Or · Platine · Diamant** (1 étoile/palier,
  **50 étoiles** au total). Quêtes : Batteries ramassées, Niveau atteint, Combo max,
  Power-ups ramassés, Survie, Meilleur score, Mécène du Labo, Parties jouées, **Ralph la
  Casse** (murs brisés sous bouclier) et **Tueur de Snakator** (blocs du serpent ennemi
  détruits sous bouclier). Le palier
  courant = nb de seuils franchis (`tierOf`) ; `s.tiers` est initialisé depuis les stats
  existantes **sans toast** à la 1ʳᵉ fois (pas de rafale au chargement).
- **UI** (câblée dans `main.js`) : écran « 🏆 Quêtes » (bouton accueil) — pour chaque
  quête : médaille courante, **★ pleines/☆ vides**, et progression vers le palier suivant
  (`valeur / prochain seuil`) ; compteur `★ X/50` (dynamique via `count()`). À chaque
  palier franchi en jeu, `game.onAchievement(def)` affiche une **notification toast**
  (« PALIER ATTEINT », file d'attente, jingle `CT.Audio.achievement()`).
  `CT.Achievements.reset()` remet à zéro.

### Statistiques (`#statsScreen`, câblé dans `main.js`)
Écran « 📊 Stats » (bouton accueil) qui **affiche** les stats cumulées déjà suivies par
`CT.Achievements` : grille de cartes (parties jouées, batteries totales, power-ups,
meilleur score, niveau max, combo max, meilleure survie `mm:ss`, points versés au Labo,
murs brisés, Snakator détruit, quêtes `★ X/50`). Lecture seule via `CT.Achievements.stats()`
+ `count()`. Le compteur
**parties jouées** (`stats.games`) est incrémenté à la mort (`game._ach({game:1})`).

### Skins & Boutique (`js/skins.js` → `CT.Skins` + `CT.BossSkins`)
Apparences personnalisables du **serpent** ET des **ennemis/boss**, débloquées de deux façons :
par **ÉTOILES de quêtes** (récompenses gratuites) ou par **ACHAT en pièces ⚡** (boutique).
Couleurs toujours via des clés de `CONFIG.theme` (rebrandable).
- **`CT.Skins`** (serpent) : un **skin = une palette** (1 couleur/batterie, cyclée comme
  `CONFIG.snakePalette`). **9 skins** : 6 **aux étoiles** (Cyan classique 0★, Glacier 4★, Forêt 9★,
  Magma 16★, Prisme 26★, Or 40★ ; gating via la fonction **interne** `stars()` = `CT.Achievements.count().unlocked`)
  + 3 **payants** (Braise ⚡2500, Abysse ⚡4500, Vaporwave ⚡8000). `game.palette = CT.Skins.activePalette()`
  (figée au `reset` ; `setupLevel`/`onEat` cyclent `this.palette`, `PALETTE` = repli).
- **`CT.BossSkins`** (ennemis/boss) : un skin = couleur **`main`** (corps/crâne) + **`aura`** (halo),
  appliqué à **tous les hostiles** (Snakator + boss). **5 skins** : Rouge sang (défaut, gratuit),
  Toxique ⚡3000, Givré ⚡5000, Doré ⚡9000, Ombre ⚡14000. `game.enemySkin = { main, aura }`
  (figé au `reset`) ; `drawHostile` lit `this.enemySkin` au lieu des `T.danger`/`T.violet` en dur.
- **Têtes / visages** (forme, pas couleur ; axe indépendant des couleurs) — fabrique commune
  `ctMakeShop(selKey, ownKey, SKINS)` (100 % payants) : **`CT.HeadSkins`** (serpent → `game.headStyle`,
  lu par `drawHead`) et **`CT.EnemyHeads`** (ennemis → `game.enemyHeadStyle`, lu par `headSeg`).
  **6 styles** chacun, **prix de prestige** (dizaines→centaines de milliers de ⚡) : `classic` (gratuit :
  logo « T » / crâne féroce), `drole` ⚡25k, `agressif` ⚡50k, `ete` ⚡80k (lunettes) — visages posés sur
  la tête existante via `_drawHeadFace` (serpent) / le switch d'yeux de `headSeg` (ennemi). Et **2 têtes
  « forme libre »** qui **remplacent** la forme : `sperm` ⚡200k (🦠 cellule ovale + flagelle ondulant) et
  `ver` ⚡350k (🪱 capsule annelée), dessinées par **`_drawCreatureHead(ctx, style, col, glow, S)`** (repère
  aligné direction, +x avant) — **partagé serpent ⇄ ennemis**. Le module ne stocke que l'id ; `preview()`
  renvoie `[]` → carte en **emoji**.
- **Traînées** (`CT.Trails`, via `ctMakeShop`) : particules émises **derrière la tête à chaque pas**
  (`game.trailStyle`, figé au `reset` ; émission dans `step()` → `emitTrail(prev[0])`). **5 styles** :
  Aucune (gratuit), Étincelles ⚡40k (éclats ambre/glow), Bulles ⚡90k (anneaux cyan qui montent),
  Flammes ⚡160k (flammèches), Étoiles ⚡300k (scintillements 4 branches). `emitTrail` utilise
  `Math.random` (cosmétique → ne décale pas l'aléa déterministe) et réduit ~65 % des particules sous
  `prefers-reduced-motion`. `drawFx` gère désormais des **formes** (`shape` : rect/bubble/circle/star).
  ⚠️ Les fx vivent en **pixels** : un resize du canvas en cours de vol les décale (préexistant, bénin).
- **Achat** : `mod.buy(id)` débite le portefeuille du Labo via **`CT.Lab.spend(pts)`** (⚡ partagé
  avec la R&D → vrai choix économique) puis marque le skin **possédé** (`localStorage ct_skins_own`
  / `ct_boss_own`). `isUnlocked` = seuil d'étoiles **ou** possédé/gratuit. Sélection persistée
  (`ct_skin` / `ct_boss_skin`), repliée sur `classic` si plus débloquée.
- **UI** : écran « 🎨 Skins & Boutique » (bouton accueil) — portefeuille ⚡ + **4 grilles** (Serpent
  Couleurs/Têtes, Ennemis Couleurs/Têtes). Chaque carte : aperçu (**pastilles** couleur ou **emoji**
  pour une tête), état (✓ Équipé / Choisir / 🔒 N ★ / pastille « ⚡ prix » verte=abordable, rouge=trop
  cher). `renderSkinGrid(container, mod, apply)` est générique (tous les mods partagent l'API : `SKINS`,
  `isUnlocked`, `selectedId`, `select`, `buy`, `preview`) ; `apply` reflète le choix à chaud
  (`CT.game.palette` / `enemySkin` / `headStyle` / `enemyHeadStyle`). Acheter coûte les ⚡, équipe et
  rafraîchit. ⚠️ `isUnlocked` (snake palette) appelle l'**interne** `stars()` (pas l'export).

### Mode démo / attract (`G.startDemo` + `G.autopilot`)
Au chargement et au retour menu, le serpent **joue tout seul** derrière le menu
(idéal pour les écrans en bar). IA gloutonne : se rapproche de la batterie en
évitant murs/obstacles/corps et en privilégiant l'espace ouvert (`freedom`).
En démo : pas de score, pas de game over (relance auto), cycle des niveaux 1→3.
`CT.game` est exposé sur `window` pour le debug.
- **Retour auto au mode attract** (`main.js`, `IDLE_MS`) : après inactivité (30 s sur
  game over / pause / cinématique, 60 s en jeu), l'écran revient à la démo — pour les
  bornes en bar, l'écran ne reste jamais figé et invite le joueur suivant. Le minuteur
  se réarme à chaque entrée (pointerdown/keydown/touchstart) et à chaque changement d'état.

### Power-ups (`CONFIG.bonus`)
Un power-up apparaît périodiquement (toutes les `bonus.every` batteries, proba
`bonus.chance`), avec un **anneau de minuterie** (durée `bonus.life`) qui, dans son
**dernier tiers de vie** (`frac < 0.3`), **clignote et vire au rouge** (`mix(ring, danger)`)
pour signaler l'urgence. À l'apparition, `spawnBonus` joue une **annonce** : éclat de
particules de la couleur du type + petit son `CT.Audio.appear()` (attire l'œil sur ce
bonus à durée limitée).
Cinq types (`bonus.type`), tirés à l'apparition (`shieldChance` / `magnetChance` /
`doubleChance` / `cutChance`, sinon charge rapide) :
- **Charge Rapide** (batterie dorée) : `bonus.points × niveau`, particules
  dorées, et **« Surcharge »** = ralenti temporaire (`bonus.slowFactor` sur
  l'intervalle pendant `bonus.slowDuration` s) → bandeau « ⚡ SURCHARGE ».
- **Bouclier** (batterie bleue) : `bonus.shieldPoints × niveau`, et
  **invulnérabilité** pendant `bonus.shieldDuration` s (traverse le **propre câble** et
  le **serpent ennemi**) → aura bleue pulsée autour de la tête (`shieldUntil`).
  ⚡ **Heurter un mur sous bouclier le DÉTRUIT** (`smashWall`) + bonus pièces
  (`bonus.wallPoints × niveau`) ; le **bouclier reste actif** → on peut casser
  plusieurs murs tant qu'il dure (éclats + secousse + son `CT.Audio.smash`).
- **Aimant** (batterie violette) : `bonus.magnetPoints × niveau`, et **attire la
  batterie** d'une case vers la tête à chaque pas pendant `bonus.magnetDuration`
  s (`pullFood`, sans aléa → déterministe) → anneaux violets autour de la batterie.
- **Double Points** (batterie rose « ×2 ») : `bonus.doublePoints × niveau`, et
  **×2 sur les points de chaque batterie** pendant `bonus.doubleDuration` s
  (`doubleUntil`, appliqué dans `onEat`). ⚠️ Ce multiplicateur est répercuté dans
  le plafond anti-triche partagé (`scoring-rules.js`, `DOUBLE_MULT`).
- **Coupe-câble** (batterie verte ✂️) : `bonus.cutPoints × niveau`, et effet
  **INSTANTANÉ** → **raccourcit la queue** de `bonus.cutBlocks` bloc(s) (`cutTail`, sans
  descendre sous `bonus.cutMin`) — réduit le risque de se mordre la queue. Pas de durée
  (aucune pastille). Labo **« Double coupe »** : proba `5 %/niv` (`mods.cutDoubleChance`,
  via `Math.random` → ne décale pas l'aléa déterministe) d'enlever **2 blocs** au lieu d'1.

Aucun ne fait grandir le serpent ni avancer l'objectif. `effInterval` =
intervalle effectif (avec surcharge) utilisé par la boucle et l'interpolation.
Des **pastilles d'effet actif** (coin haut-gauche, `drawEffects`) affichent
🛡️/🌀/🧲/×2 + le **compte à rebours** restant (pratique avec les durées rallongées
par le Labo).

### Malus (`CONFIG.malus`)
Entités **indépendantes** des power-ups (`this.malus`, séparée de `this.bonus`). Des **icônes
ROUGES clignotantes** (`drawMalus` : token rouge + glyphe blanc, glow rouge + anneau de
minuterie ; **toutes rouges** → se distinguent des power-ups colorés) apparaissent
**aléatoirement** sur la map (jeu réel uniquement, **jamais en démo**) : toutes les
`malus.every` étapes sans malus, tentative de proba `malus.chance` via le **PRNG déterministe**
`this.rng` (`spawnMalus`) ; le **type** est aussi tiré au hasard. Un seul à la fois, vit
`malus.life` s puis disparaît. **À ÉVITER** (pénalisent le joueur). `onEatMalus` applique
l'effet (flash/secousse rouges + son `CT.Audio.malus`). N'affectent ni l'objectif ni les
power-ups en place. **6 types** (`malus.types`) :
- **🍔 burger** : **+`grow` blocs au serpent JOUEUR** (duplique la queue) → risque de se mordre.
- **⚡ court-circuit** : **accélération** temporaire (`rushUntil`, intervalle ×`speedFactor` pendant
  `speedDuration` s ; combiné à la surcharge dans `effInterval`).
- **🌫️ brouillage** : **visibilité réduite** `fogDuration` s (`fogUntil` → `drawFog` : voile sombre
  sauf un rayon clair autour de la tête).
- **🧲 aimant inversé** : **repousse la batterie** `repelDuration` s (`repelUntil` → `pushFood`,
  miroir de `pullFood`, déterministe).
- **🧱 obstacles surprise** : pose `wallsCount` **murs temporaires** (`spawnTempWalls`, loin de la
  tête, mortels comme les obstacles) retirés après `wallsDuration` s (`expireTempWalls`).
- **💸 vol de pièces** : retire **`stealFrac`** des points courants.
Sauf le burger, **chaque malus allonge AUSSI le serpent ENNEMI de `enemyGrow` blocs**
(`growEnemy`, plafonné à `maxEnemyLen` ; no-op s'il n'y a pas d'ennemi). Pastilles d'effet
rouges (`drawEffects`) pour les malus temporisés (court-circuit / brouillage / aimant inversé).

### Audio
- **SFX** synthétisés (WebAudio, aucun fichier) ; préférence **mute** persistée
  (`ct_mute`).
- **Son de ramassage combo-réactif** : `CT.Audio.pickup(combo)` monte la hauteur de
  +1 demi-ton par palier de combo (plafonné à ×9 → +8 demi-tons) → un enchaînement
  « sonne » de plus en plus haut. Appelé par `onEat` avec `this.combo || 1` (1 en démo).
- **Musique d'ambiance** optionnelle (`CT.Audio.toggleMusic`) : pad génératif
  doux (3 voix + sub, filtre lowpass + LFO lent, accords qui évoluent), **faible
  volume**, **désactivée par défaut**, persistée (`ct_music`), toggle « 🎵 Musique »
  sur l'accueil. Démarre au 1ᵉʳ geste utilisateur (politique autoplay) et est
  coupée par le mute global.
- **Musique dynamique** (`CT.Audio.setTension(0→1)`) : quand la musique tourne, le jeu
  module sa **tension** (volume + ouverture du filtre + vitesse du LFO) selon le contexte —
  **objectif proche** (≤ 2 batteries → ~0,6), **sous malus** (~0,85) ou **combat de boss**
  (~0,55 montant jusqu'à ~0,95 quand le boss faiblit). Calculée chaque frame dans `game.tick`
  et n'appelle `setTension` que sur **variation** (> 0,02) ; **no-op si la musique est coupée**.

### Game feel (retours)
- **Haptique** (`game.haptic`, mobile/tablette via `navigator.vibrate`, no-op
  sinon) : pulse court à la batterie, motif aux power-ups, motif long à la mort.
  Jamais en démo.
- **Screen-shake** (`game.shake`, décroît, cosmétique → n'affecte pas le
  déterminisme) : léger aux power-ups, fort à la mort. Le fond reste fixe (pas de
  bords vides), seul le plateau tremble.
- **Accessibilité** (`game.reduce`) : respecte `prefers-reduced-motion` de l'OS
  (écouté en direct) → **pas de screen-shake**, flash atténué, particules réduites
  (~35 %). Important pour un jeu public (confort / sensibilité au mouvement). Côté
  **CSS**, le même média désactive les animations décoratives continues (logo qui
  flotte, respiration des boutons, fondu d'overlay, pulse « objectif proche »).

### Call-to-action Cryptotem
L'écran de game over affiche un encart promo (logo + message « Une borne
Cryptotem vous attend… » + **QR code**) — c'est la charge publicitaire du jeu.
Le **QR code** est généré par `CT.QR` (voir ci-dessous) à partir de
`CONFIG.cryptotemUrl`.
⚠️ `CONFIG.cryptotemUrl` est un **placeholder** (`https://cryptotem.fr`) : le
remplacer par l'URL exacte fournie par le client (site / page « trouver une
borne » / lien de campagne avec tracking).

### Générateur de QR code (`js/qrcode.js` → `CT.QR`)
Encodeur QR **autonome, zéro dépendance** (mode octet UTF-8, niveau de correction
d'erreur **M**, versions 1→10 — large pour une URL). `CT.QR.generate(text)` →
`{ size, modules, version, mask }` ; `CT.QR.render(canvas, text, opts)` dessine sur
un `<canvas>` (fond clair + zone de silence → scannable). Algorithme standard
complet : Reed-Solomon GF(256), sélection de masque par pénalité, BCH format/version.
- **Câblage** : `main.js` rend le QR une fois au démarrage sur `#ctaQr` (l'URL est
  constante). Module aussi exportable en Node (`module.exports`).
- **⚠️ Vérification scannabilité** : toute modif de `qrcode.js` doit être revalidée
  par **décodage réel** (round-trip via `jsqr` en Node : encode → pixels → decode →
  comparer au texte). Un QR « qui s'affiche » n'est pas forcément scannable — c'est
  ainsi qu'a été trouvé le bug d'orientation des bits de format (copie 2).

---

## ✅ Conventions

- Commentaires et UI en **français** (projet client FR).
- Pas de dépendances externes ni d'étape de build : ça doit s'ouvrir et tourner.
- Couleurs **uniquement** via `CONFIG.theme` (les options d'accessibilité MUTENT ces valeurs).
- Texte visible via **`CT.i18n.t()`** / attributs `data-i18n` (FR/EN/ES) — pas de chaîne UI en dur.
- Code attaché à `window.CT`, ordre de chargement des `<script>` important
  (config → **access** → **i18n** → audio → input → scoring-rules → **sim-core** → leaderboard →
  lab → achievements → skins → ghost → qrcode → cinematics → game → main). `access.js` juste après
  `config.js` (thème d'accessibilité avant capture par `game.js`) ; `i18n.js` juste après.
  `sim-core.js` (rejeu déterministe) partagé navigateur ↔ Node comme `scoring-rules.js`.

## 🗺️ Pistes / TODO

- [x] Vérifier le rendu dans un navigateur (preview).
- [x] 10 variantes de cinématiques distinctes (express, confetti, pulse, turbo, totem,
      ville — la ville se recharge, fenêtres qui s'allument ; reseau — le réseau de
      stations Cryptotem qui s'allume, nœuds + liens ; aurora — aurore boréale néon ;
      galaxie — vortex d'énergie en spirale ; comete — pluie de comètes sur fond étoilé).
- [x] Score + combo + meilleur score persistant (localStorage).
- [x] Mode « attract / démo » qui tourne tout seul (écrans en bar).
- [x] Call-to-action Cryptotem sur l'écran de fin.
- [x] Power-up « Charge Rapide » (batterie dorée → bonus points + surcharge/ralenti).
- [x] Power-up « Bouclier » (batterie bleue → invulnérabilité temporaire).
- [x] Bords traversables (plateau toroïdal).
- [x] Préférence son persistée (localStorage).
- [x] Génération d'obstacles garantie sans blocage (flood-fill toroïdal).
- [x] Responsive vérifié (mobile portrait/paysage, tablette, desktop) : overlays
      compressés + scrollables sur écran court (`@media max-height: 560px`).
- [x] Classement perso / semaine / global + pseudo + validation anti-triche partagée
      (backend local placeholder, interface prête pour serveur — voir docs/anti-cheat.md).
- [x] **Serveur de classement de référence** (Node pur : revalidation + horodatage
      serveur + rate-limit + validation partagée `scoring-rules.js`).
- [x] **Serveur durci pour la prod** : token de borne (`CT_TOKENS`), nonce anti-rejeu + fenêtre
      d'horloge, HTTPS (`CT_TLS_*`), vraie base (`node:sqlite` sinon JSON atomique). Ouvert en dev.
- [x] **Aléa gameplay déterministe** : spawns (food/obstacles/bonus) via PRNG ensemençable
      `CT.util.makeRng(seed)` → parties reproductibles (base du rejeu serveur).
- [x] **Rejeu déterministe — étape 1** : journal d'inputs client (`game.journal`, `steps`) +
      validation structurelle serveur (`js/sim-core.js` `validateJournal`). **Étape 2 (TODO)** :
      re-simulation headless partagée recalculant le score canonique (extraire `game.step` +
      retirer `Math.random`/orbes-`dt` du chemin de score).
- [x] Power-up « Aimant » (batterie violette → attire la batterie vers le serpent).
- [x] Musique d'ambiance optionnelle (pad génératif WebAudio, opt-in, persistée).
- [x] **Laboratoire / R&D** : banque batteries+points, recherches chronométrées
      (barème de temps par niveau visé, jusqu'à 36 h+), 9 améliorations permanentes
      dont Rendement R&D & Départ protégé (durée de vie / méta-progression).
- [x] **Quêtes à paliers** : 10 quêtes × 5 paliers (Bronze→Diamant, 50 ★), écran « 🏆 Quêtes »
      (médaille + étoiles + progression) et notification toast à chaque palier franchi.
- [x] **Écran Statistiques** (« 📊 Stats ») : grille de cartes des stats cumulées
      (parties, batteries, power-ups, meilleur score, niveau/combo max, survie, Labo, succès).
- [x] **Serpent qui change de couleur** à chaque batterie (cycle `CONFIG.snakePalette`,
      transition lissée ; tête + câble + halo + « T »).
- [x] **QR code** réel sur l'écran de fin (`CT.QR`, encodeur autonome, scannable —
      vérifié par décodage jsQR). ⚠️ Reste à brancher l'URL exacte du client dans
      `CONFIG.cryptotemUrl` (actuellement un placeholder).
- [x] Power-up « Double Points » (batterie rose ×2 → double les points par batterie ;
      plafond anti-triche mis à jour, `DOUBLE_MULT`).
- [x] **Retour auto au mode attract** après inactivité (bornes en bar : l'écran ne
      reste jamais figé sur game over / pause / cinématique / partie abandonnée).
- [x] Power-up « Coupe-câble » (batterie verte ✂️ → raccourcit la queue, `cutTail`)
      + recherche Labo « Double coupe » (proba 5 %/niv d'enlever 2 blocs au lieu d'1).
- [x] **Malus** (icônes ROUGES clignotantes, apparition aléatoire `CONFIG.malus`, indépendants
      des power-ups, jamais en démo) — 6 types : 🍔 burger (+2 joueur), ⚡ court-circuit, 🌫️ brouillage,
      🧲 aimant inversé, 🧱 obstacles temporaires, 💸 vol de pièces. Sauf le burger, chacun
      allonge AUSSI le serpent ennemi de 2 blocs (`growEnemy`).
- [x] **Mini-boss** tous les 5 niveaux (`CONFIG.boss`) : combat dédié (pas d'objectif batteries),
      boss qui poursuivent, vaincus en les mordant sous bouclier. Boucliers très fréquents au 1ᵉʳ
      palier puis de moins en moins ; murs ajoutés par palier. **Deux formes alternées**
      (`bossSpec`) : paliers IMPAIRS = **essaim** de plusieurs boss à 1 tête (`bossCount`, jusqu'à
      `maxCount`) ; paliers PAIRS = **HYDRE** à 2-3 têtes (`maxHeads`), chaque tête un point faible
      à couper. Barre de PV cumulés (HUD ❤️ + canvas « 🐉 HYDRE — N têtes » / « 👹 BOSS ×N ») +
      mini-barre par tête, aura violette, récompense + cinématique quand tout tombe.
- [x] **Skins du serpent** (`js/skins.js`) : 6 palettes déblocables aux étoiles de quêtes
      (0/4/9/16/26/40 ★), écran « 🎨 Skins », sélection persistée (`ct_skin`).
- [x] **Boutique en pièces ⚡** (`CT.Lab.spend`) : skins de serpent payants (Braise/Abysse/Vaporwave)
      + **skins d'ennemis/boss** (`CT.BossSkins` : Toxique/Givré/Doré/Ombre, recolore Snakator + boss).
      Achat débité du portefeuille du Labo, possédés à vie (`ct_skins_own`/`ct_boss_own`), écran
      « 🎨 Skins & Boutique » (portefeuille + grilles).
- [x] **Têtes / visages achetables** (`CT.HeadSkins` serpent + `CT.EnemyHeads` ennemis, fabrique
      `ctMakeShop`) : 6 styles chacun, prix de prestige (⚡25k→350k). Visages posés (classic logo T,
      Rigolo, Agressif, Été lunettes) + **2 têtes « forme libre »** qui remplacent la forme
      (Spermatozoïde 🦠, Ver de terre 🪱, via `_drawCreatureHead` partagé serpent/ennemis). Aperçu emoji.
- [x] **Musique dynamique** (`CT.Audio.setTension`) : la musique d'ambiance monte en tension
      près de l'objectif, sous malus et en combat de boss (no-op si musique coupée).
- [x] **Annonces dynamiques** (`drawIntro` + `introKind`) : intro spéciale de l'arrivée du Snakator
      (niv. 3, « ⚠️ ALERTE ») et des boss/hydres (titre empilé), avec vignette rouge pulsée + sting
      `CT.Audio.alert()` → plus dynamique et immersif.
- [x] **Traînées achetables** (`CT.Trails`, boutique ⚡40k→300k) : particules stylées derrière la
      tête (étincelles/bulles/flammes/étoiles), formes gérées par `drawFx` (`shape`).
- [x] **Boss ENRAGÉ** : sous 50 % de PV → poursuite implacable (turnChance ×0.4), aura chauffée à
      blanc, toast « 😡 ENRAGÉ ! » + sting (drame de fin de combat).
- [x] **Chip de combo** (`drawEffects`) : « 🔥×N » + fenêtre restante → le système de combo devient
      lisible pendant la partie.
- [x] **Défi du jour** (`CT.util.dailySeed` = FNV-1a de la date) : bouton doré sur l'accueil, même
      map/spawns pour tous aujourd'hui, entrées `daily:true`, onglet « ☀️ Jour » (local + serveur).
- [x] **Fantôme** (`js/ghost.js`) : journal de course pendant le Défi du jour, le meilleur score du
      jour devient le fantôme 👻 rejoué en translucide aux tentatives suivantes (1ʳᵉ brique du rejeu).
- [x] **Événements aléatoires** (`CONFIG.events`, déterministes via this.rng) : 💰 Ruée dorée
      (pièces ×2), 🌑 Blackout (brouillard total), 🎁 Pluie de power-ups — bannière + sting + chips.
- [x] **Orbes de boss** (`CONFIG.boss.orb*`, palier ≥ 2) : projectiles lents qui visent le joueur,
      mortels hors bouclier, détruits sous bouclier ; cadence ↑ si boss enragé.
- [x] **Mode Chrono** (`CONFIG.chrono`, bouton « ⏱️ CHRONO — 2 MIN ») : une arène, 2 minutes,
      score max ; barre HUD = temps restant, compte à rebours pulsé, pause gelée, fin
      « ⏱️ TEMPS ÉCOULÉ ! » et **classement dédié** (onglet ⏱, exclu de Jour/Semaine/Global,
      local + serveur).
- [x] **Portails de téléportation** (`CONFIG.portals`, dès niv. 4) : paires de vortex
      déterministes (1→2 paires), direction conservée, hostiles téléportés aussi, câble coupé
      à la traversée (pas d'interpolation sur un saut).
- [x] **Niveau COURSE** (`CONFIG.race`, niveaux 7, 12, 17…) : le GLOUTON doré chasse la
      batterie — chaque vol recule l'objectif et le fait grandir ; destructible sous bouclier
      mais revient après 6 s ; intro « 🏁 COURSE » dédiée.
- [x] **Missions de partie** (`CONFIG.missions` + `MISSION_POOL`) : 3 objectifs secondaires
      par run (déterministes par seed), récompense ⚡ versée au Labo (jamais au score) ;
      affichées à l'intro niv. 1, en pause et au récap de fin.
- [x] **Décors thématiques / biomes** (`CONFIG.biomes` + `CT.getBiome`) : bar/ciné/bowling/
      disco/laser par tranche de 3 niveaux (fond teinté + motif `drawBiome` + badge d'intro).
- [x] **Options d'accessibilité** (`js/access.js`) : mode daltonien (danger→orange) + contraste
      élevé, persistés, appliqués via mutation de `CONFIG.theme` + variables CSS.
- [x] **Onboarding** (`game.tutorial`) : première partie guidée (bandeau + halo sur la 1ʳᵉ
      batterie, `ct_seen`), une seule fois par appareil.
- [x] **Mode 2 joueurs — DUEL** (`CONFIG.versus`) : deux serpents (flèches vs WASD), deux
      batteries, premier à 15 / dernier survivant gagne ; `stepVersus`, rendu + scoreboard dédiés.
- [x] **Défi d'un ami par QR** (`game.challenge`) : QR (`CT.QR`) encodant seed+score+pseudo →
      l'ami rejoue la même map avec le score à battre ; « DÉFI RELEVÉ / MANQUÉ » à la fin.
- [x] **Réglage de difficulté** (`CONFIG.difficulty`) : Facile/Normal/Difficile (vitesse +
      accélération + obstacles), sélecteur Options, appliqué en partie normale solo (maps
      partagées / classements dédiés intacts), plancher `minStep` inchangé (anti-triche valide).
- [x] **Multi-langue FR/EN/ES** (`js/i18n.js` → `CT.i18n`) : coque UI + runtime + catalogues
      (Labo/Quêtes/Skins/Missions) traduits, sélecteur dans Options, langue persistée +
      auto-détectée. Attributs `data-i18n` pour le HTML, `t()` pour le dynamique.
