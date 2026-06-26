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

### Intro de niveau
Au début de chaque niveau (jeu réel), une bannière **« NIVEAU X — Objectif : N
batteries »** s'affiche pendant `CONFIG.introDuration` s ; le serpent est **figé**
le temps de l'annonce (`introUntil`), ce qui laisse voir la map avant de jouer.

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
`{ name, score, level, batteries, bonuses, durationMs, seed, ts }`. L'écran de
fin affiche le pseudo (modifiable), un classement à onglets Semaine/Global (top
5, ligne du joueur surlignée), le rang et le record perso. L'**écran d'accueil**
affiche le **top 3 de la semaine** (mode attract — visible sur les écrans en bar).
**⚠️ Anti-triche :** le backend local (localStorage) **n'est pas** sécurisé —
c'est un placeholder. La validation vit dans `js/scoring-rules.js`
(`CT.ScoringRules.validate` / `maxPlausibleScore`), **partagée à l'identique**
entre le navigateur et le **serveur Node de référence**
(`server/leaderboard-server.js`) → source unique. Le serveur revalide, **horodate
côté serveur**, limite le débit et rejette les scores aberrants. Brancher le jeu :
`CT.Leaderboard.useRemote('http://localhost:8124')`. Voir
[docs/anti-cheat.md](docs/anti-cheat.md).

### Laboratoire / R&D (`js/lab.js` → `CT.Lab`)
Méta-progression persistante (localStorage `ct_lab`) qui donne de la durée de vie.
- **Banque** : à la mort, `CT.Lab.bank({batteries, points})` verse les ressources
  de la partie (batteries collectées + points) dans le portefeuille. `CT.Lab.spend(pts)`
  débite des pièces ⚡ (achats cosmétiques de la Boutique — voir Skins) ; `canAfford(pts)`.
- **Recherches** : on dépense **batteries + points** pour lancer **une** recherche
  qui prend du **temps réel** (`endsAt`, persiste même hors-jeu). Une seule à la
  fois. À la fin → bouton « Récupérer » (`claim`) qui applique le niveau.
- **Temps de recherche** : barème partagé `RESEARCH_TIME_S` indexé sur le **niveau
  visé** (`researchTimeMs(l+1)`, utilisé par tous les upgrades) : 30 s · 1 min · 3 min
  · 5 min · 10 min · 30 min · 1 h · 2 h · 4 h · 8 h · 12 h · 16 h · 24 h · 30 h · 36 h …
  puis **+6 h par niveau** au-delà (idle / retour différé).
- **12 améliorations** (`CT.Lab.UPGRADES`, plusieurs niveaux) : Surtension (+10 %
  points/batterie), Bouclier renforcé (+1 s), Surcharge prolongée (+1 s), Aimant
  longue portée (+1 s), Double prolongé (+1 s de double points), Combo facile
  (+0,5 s de fenêtre), R&D power-ups (fréquence), **Rendement R&D** (+5 %/niv de
  ressources versées, max 15), **Départ protégé** (+1 s/niv de bouclier en début de
  niveau), **Inflation** (+5 %/niv de pièces par objet ; coûte **uniquement des pièces**
  ⚡ : 100·250·500·750…), **Coup de chance** (+5 %/niv de proba, à chaque objet, de
  **×2 pièces + batterie** de ce ramassage) et **Double coupe** (+5 %/niv de proba que le
  **coupe-câble** retire **2 blocs** de queue au lieu d'1).
- **Effets** : `CT.Lab.effects()` → `game.mods` (figé au `startRun`), appliqué dans
  `onEat` (points/combo/fréquence + `pointMult` = surtension + inflation + proc
  `luckChance` via `Math.random` pour ne pas décaler l'aléa des spawns), `onEatBonus`
  (durées) et `startLevel` (`startShield` → bouclier de grâce). `bankMult` est appliqué
  dans `bank()`. Neutre par défaut. **UI** : `fmtTime` (main.js) formate les durées en
  unités lisibles (s · min · h · j) ; le coût masque 🔋 quand il est nul (pièces seules).
- **UI** : écran « 🔬 Laboratoire » (bouton sur l'accueil) — portefeuille, recherche
  active (barre + compte à rebours + Récupérer), cartes d'amélioration (coût
  🔋+⚡ + temps, niveau, désactivées si labo occupé / ressources insuffisantes).
- **Boucle de rétention** : l'écran de game over affiche les ressources versées
  (« 🔬 +X 🔋 +Y ⚡ au Labo ») + un bouton « 🔬 Laboratoire » qui y mène directement.
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
- **Achat** : `mod.buy(id)` débite le portefeuille du Labo via **`CT.Lab.spend(pts)`** (⚡ partagé
  avec la R&D → vrai choix économique) puis marque le skin **possédé** (`localStorage ct_skins_own`
  / `ct_boss_own`). `isUnlocked` = seuil d'étoiles **ou** possédé/gratuit. Sélection persistée
  (`ct_skin` / `ct_boss_skin`), repliée sur `classic` si plus débloquée.
- **UI** : écran « 🎨 Skins & Boutique » (bouton accueil) — portefeuille ⚡ + 2 grilles (Serpent,
  Ennemis & Boss). Chaque carte : aperçu en **pastilles**, état (✓ Équipé / Choisir / 🔒 N ★ / pastille
  « ⚡ prix » verte=abordable, rouge=trop cher). `renderSkinGrid(container, mod, apply)` est générique
  (snake & boss partagent l'API : `SKINS`, `isUnlocked`, `selectedId`, `select`, `buy`, `preview`) ;
  `apply` reflète le choix à chaud (`CT.game.palette` / `CT.game.enemySkin`). Acheter coûte les ⚡,
  équipe le skin et rafraîchit. ⚠️ `isUnlocked` (snake) appelle l'**interne** `stars()` (pas l'export).

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
- Couleurs **uniquement** via `CONFIG.theme`.
- Code attaché à `window.CT`, ordre de chargement des `<script>` important
  (config → audio → input → scoring-rules → leaderboard → lab → achievements →
  skins → qrcode → cinematics → game → main).

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
- [ ] **Durcir le serveur pour la prod** : auth + nonce anti-rejeu + HTTPS + vraie base.
- [x] **Aléa gameplay déterministe** : spawns (food/obstacles/bonus) via PRNG ensemençable
      `CT.util.makeRng(seed)` → parties reproductibles (base du rejeu serveur).
- [ ] **Rejeu déterministe (suite)** : journal d'inputs + moteur de rejeu côté serveur.
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
      « 🎨 Skins & Boutique » (2 grilles + portefeuille).
- [x] **Musique dynamique** (`CT.Audio.setTension`) : la musique d'ambiance monte en tension
      près de l'objectif, sous malus et en combat de boss (no-op si musique coupée).
