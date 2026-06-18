# Classement & anti-triche — architecture

> **À retenir :** un classement **infalsifiable n'existe pas côté client.**
> Le navigateur peut éditer le `localStorage`, lire/patcher le JS et forger
> n'importe quelle requête réseau. La triche se bloque **côté serveur.** Le
> backend local actuel (`js/leaderboard.js`) n'est qu'un **placeholder** ; il
> partage déjà la logique de validation qui devra tourner sur le serveur.

## État actuel (local)

- `CT.Leaderboard` expose une API **à base de Promesses** (donc compatible avec
  un backend distant) : `submit(entry)`, `fetchBoards(me)`, `relabelLast(name)`,
  `getName/setName`, plus la **validation partagée** `validate(entry)` et
  `maxPlausibleScore(meta)`.
- 3 vues : **record perso**, **record de la semaine** (semaine ISO), **classement
  global**.
- Chaque partie soumet une **entrée riche** :
  `{ name, score, level, batteries, bonuses, durationMs, seed, ts }`.
  Ces métadonnées permettent au serveur de **revalider** le score.

## Passage au serveur (cible)

Basculer est censé être trivial côté client :

```js
CT.Leaderboard.useRemote('https://api.cryptotem.xxx', authToken);
```

Le client POST alors `entry` sur `/scores` et lit les classements via `/boards`.

## Serveur de référence inclus

Un serveur **Node sans dépendance** est fourni :
[`server/leaderboard-server.js`](../server/leaderboard-server.js).

```bash
node server/leaderboard-server.js     # écoute sur http://localhost:8124
```

Puis, dans la console du jeu (ou au boot) :

```js
CT.Leaderboard.useRemote('http://localhost:8124');
```

Il démontre concrètement le modèle : il **réutilise `js/scoring-rules.js`**
(même `validate` / `maxPlausibleScore` que le client → source unique),
**horodate côté serveur**, **limite le débit par IP** et assainit le pseudo.
Vérifié : un score legit renvoie `{ok:true,rank}` ; un score à 999 999 999 est
rejeté (`score implausible`) et **n'apparaît pas** dans les classements.
⚠️ Reste à ajouter pour la prod : **auth + nonce anti-rejeu**, **HTTPS**, **vraie
base de données** et idéalement le **rejeu déterministe**.

## Règles serveur (obligatoires)

1. **Ne jamais faire confiance au score envoyé.** Le serveur **recalcule /
   valide** avec la **même logique** que `validate()` + `maxPlausibleScore()`
   (à porter en Node — c'est volontairement du JS pur, sans dépendance au DOM).
   - borne supérieure plausible selon `(niveau, durée)` : nb de batteries borné
     par `durée / minStep`, points/batterie ≤ `(50 + niveau×10) × comboMax`,
     bonus bornés par `batteries / bonus.every` ;
   - cohérence `batteries` ↔ `durationMs` ;
   - score entier, positif, fini.
2. **Horodatage SERVEUR.** Le bucket « semaine » et `ts` sont fixés par le
   serveur — **jamais** par l'horloge du client (sinon on antidate ses scores).
3. **Authentification + anti-rejeu.** Token par compte/appareil, **nonce de
   session** à usage unique (empêche de renvoyer 100× la même partie).
4. **Rate-limiting** par compte/IP + détection d'anomalies (pic de scores,
   variance, vitesse de progression).
5. **HTTPS** obligatoire. Pas de secret de signature **dans le JS client** (il
   serait extractible) → un HMAC client est du théâtre, pas de la sécurité.

## Recommandé : vérification par **rejeu déterministe**

La protection la plus forte (modèle « speedrun ») :

1. ✅ **Fait :** toute l'aléa **affectant le score** (apparition des batteries,
   génération des obstacles, apparition/type des bonus) est dérivée d'un **PRNG
   graine** `CT.util.makeRng(seed)` (instance `game.rng`). `seed` est transmis
   dans l'entrée. *Vérifié : même `seed` + mêmes inputs ⇒ partie identique au pas
   près ; un autre `seed` diverge ; les maps restent toujours connexes.*
   (Le cosmétique — particules, IA démo — garde `Math.random`, sans effet sur le score.)
2. **TODO :** le client envoie le **journal d'inputs horodatés** (séquence des
   directions + n° de pas).
3. **TODO :** le serveur **rejoue** la partie avec exactement la même logique
   (porter `game.step` + spawns en Node) et **recalcule le score canonique** ;
   tout écart ⇒ rejet.

## Schéma d'API serveur (référence)

```
POST /scores      { entry }            -> { ok, reason?, rank? }   # valide + horodate + stocke
GET  /boards?name= -> { personal, weekly[], global[], weeklyRank, globalRank }
POST /relabel     { name }             -> { ok }                   # renomme via l'identité authentifiée
```

Réutiliser `validate()` / `maxPlausibleScore()` de `js/leaderboard.js` côté
serveur garantit que **client et serveur appliquent la même borne** (le client
filtre pour l'UX, le serveur fait foi).
