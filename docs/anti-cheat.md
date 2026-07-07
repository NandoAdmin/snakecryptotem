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
  `{ name, score, level, batteries, bonuses, durationMs, seed, daily, chrono, diff, steps, journal, ts }`.
  Le client distant ajoute un **`nonce` + `cts`** (horodatage client) à chaque POST.
  Ces métadonnées permettent au serveur de **revalider** le score et de **rejouer** le journal.

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

**Durcissement prod (fait, réglable par variables d'env) :**

| Menace | Parade | Env |
|---|---|---|
| Requête forgée depuis un navigateur quelconque | **Token de borne** `Authorization: Bearer` (provisionné sur la borne, hors JS public) | `CT_TOKENS=t1,t2` |
| Renvoi en boucle de la même partie | **Nonce** à usage unique + **fenêtre d'horloge** client | (automatique) |
| Antidatage (semaine) | **Horodatage serveur** (`ts` fixé serveur) | (automatique) |
| Écoute réseau / MITM | **HTTPS** natif si certificats | `CT_TLS_KEY` + `CT_TLS_CERT` |
| Perte / corruption des scores | **Vraie base** `node:sqlite` (indexée) sinon **JSON atomique** (tmp+rename) | `CT_DB=/chemin` |
| Score/partie aberrants | Plafond partagé + **validation du journal d'inputs** (rejeu étape 1) | (automatique) |

Vérifié au curl : sans token → 401 ; score implausible → `score implausible` ;
journal incohérent (pas ≫ temps) → `rejeu: pas/temps incohérents` ; nonce rejoué →
`rejeu détecté (nonce)` ; horloge hors fenêtre → rejet ; client ancien sans
journal → accepté (rétro-compat) ; base SQLite créée + indexée.
⚠️ Vestige de référence : l'auth `/relabel` est encore par IP (→ identité
authentifiée en prod) ; le stock de nonces est en mémoire (→ contrainte d'unicité
en base en prod). **Rejeu déterministe : étape 1 faite** (journal + validation
structurelle) ; **étape 2** (re-simulation headless + score canonique) ci-dessous.

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
2. ✅ **Fait (étape 1) :** le client envoie le **journal d'inputs** (séquence des
   virages `[n° de pas, direction]`, compact) + `steps` dans l'entrée
   (`game.journal`, encodé par `js/sim-core.js`). Le serveur le **valide
   structurellement** (`CT.SimCore.validateJournal`) : nb de pas cohérent avec la
   durée (plancher `minStep`) et les batteries, journal monotone, codes valides.
   `js/sim-core.js` est **partagé** navigateur ↔ Node (comme `scoring-rules.js`) et
   embarque une **copie exacte de `makeRng`** → le serveur peut reconstruire l'aléa.
3. **TODO (étape 2) :** le serveur **rejoue** la partie avec exactement la même
   logique (extraire `game.step` + spawns en un **moteur headless partagé**) et
   **recalcule le score canonique** ; tout écart ⇒ rejet. Pré-requis : retirer du
   chemin de score les aléas **non journalés** — le « coup de chance » (`Math.random`
   dans `onEat`) et les **orbes** (déplacées en `dt`, hors du pas déterministe) —
   ou les journaliser.

## Schéma d'API serveur (référence)

```
POST /scores      { entry }            -> { ok, reason?, rank? }   # valide + horodate + stocke
GET  /boards?name= -> { personal, weekly[], global[], weeklyRank, globalRank }
POST /relabel     { name }             -> { ok }                   # renomme via l'identité authentifiée
```

Réutiliser `validate()` / `maxPlausibleScore()` de `js/leaderboard.js` côté
serveur garantit que **client et serveur appliquent la même borne** (le client
filtre pour l'UX, le serveur fait foi).
