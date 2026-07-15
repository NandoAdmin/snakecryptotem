/* ============================================================
   leaderboard.js — classement des joueurs.
   3 vues : record perso · record de la semaine · classement global.

   ⚠️ SÉCURITÉ : ce backend LOCAL (localStorage) n'est PAS infalsifiable —
   le navigateur peut éditer le stockage. Il sert de placeholder en attendant
   le backend distant. La VRAIE protection anti-triche est côté serveur :
   - le serveur recalcule/valide le score (mêmes fonctions validate /
     maxPlausibleScore que ci-dessous, à porter en Node) ;
   - idéalement, rejeu déterministe (seed + journal d'inputs) ;
   - horodatage SERVEUR pour la semaine, auth + rate-limit.
   Voir docs/anti-cheat.md.

   API (Promesses, donc compatible distant) :
     CT.Leaderboard.getName() / setName(n)
     CT.Leaderboard.submit(entry) -> Promise<{ok, reason}>
     CT.Leaderboard.fetchBoards(me?) -> Promise<{personal, weekly[], global[], weeklyRank, globalRank}>
     CT.Leaderboard.validate(entry) -> {ok, reason}
     CT.Leaderboard.maxPlausibleScore(meta) -> Number
     CT.Leaderboard.useRemote(endpoint, token)
   ============================================================ */
window.CT = window.CT || {};

CT.Leaderboard = (function () {
  const KEY = 'ct_scores';
  const NAME = 'ct_name';
  const CAP = 500; // limite d'entrées stockées en local

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-CAP))); } catch (e) {} }
  function getName() { try { return localStorage.getItem(NAME) || ''; } catch (e) { return ''; } }
  function setName(n) { try { localStorage.setItem(NAME, (n || '').slice(0, 14)); } catch (e) {} }

  // Début de la semaine ISO (lundi 00:00) pour un timestamp donné.
  // ⚠️ En distant, ce calcul doit utiliser l'horloge SERVEUR (le client ment).
  function weekStart(ts) {
    const d = new Date(ts);
    const day = (d.getDay() + 6) % 7;     // lundi = 0
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d.getTime();
  }

  // Minuit local du jour courant (classement du Défi du jour).
  function dayStart(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /* ---- validation : déléguée au module partagé CT.ScoringRules (cf. serveur) ---- */
  function rulesCfg() {
    const C = CT.CONFIG;
    return { minStep: C.minStep, bonusEvery: C.bonus.every, bonusPoints: C.bonus.points };
  }
  function maxPlausibleScore(meta) { return CT.ScoringRules.maxPlausibleScore(meta, rulesCfg()); }
  function validate(entry) { return CT.ScoringRules.validate(entry, rulesCfg()); }

  /* ---- tri / rang ---- */
  function sorted(list) { return list.slice().sort((a, b) => b.score - a.score || a.ts - b.ts); }
  function rankOf(list, me) {
    if (!me) return 0;
    const i = list.findIndex((e) => e.ts === me.ts && e.name === me.name && e.score === me.score);
    if (i >= 0) return i + 1;
    const j = list.findIndex((e) => e.score <= me.score);
    return j >= 0 ? j + 1 : list.length + 1;
  }

  /* ---- backend local (placeholder) ---- */
  const local = {
    submit(entry) {
      const v = validate(entry);
      if (!v.ok) return Promise.resolve(v);
      const a = read(); a.push(entry); write(a);
      return Promise.resolve({ ok: true });
    },
    relabelLast(name) {
      const a = read();
      if (a.length) { a[a.length - 1].name = (name || 'Joueur').slice(0, 14); write(a); }
      return Promise.resolve({ ok: true });
    },
    boards(me) {
      const all = read();
      const ws = weekStart(Date.now());
      const ds = dayStart(Date.now());
      // les scores CHRONO (2 min) ont leur classement dédié — ils ne se comparent pas
      // aux parties normales, donc exclus de Jour / Semaine / Global
      const norm = all.filter((e) => !e.chrono);
      const week = sorted(norm.filter((e) => e.ts >= ws));
      const day = sorted(norm.filter((e) => e.daily && e.ts >= ds));   // Défi du jour uniquement
      const glob = sorted(norm);
      const chrono = sorted(all.filter((e) => e.chrono));
      // classement « ici » : meilleurs scores (tous temps, hors chrono) de la borne du lieu courant
      const myVenue = (window.CT && CT.Operator) ? CT.Operator.venue() : '';
      const venue = myVenue ? sorted(norm.filter((e) => e.venue === myVenue)) : [];
      const name = getName();
      const mine = all.filter((e) => !name || e.name === name);
      return Promise.resolve({
        personal: mine.reduce((m, e) => Math.max(m, e.score), 0),
        daily: day.slice(0, 5),
        weekly: week.slice(0, 5),
        global: glob.slice(0, 5),
        chrono: chrono.slice(0, 5),
        venue: venue.slice(0, 5),
        dailyRank: rankOf(day, me),
        weeklyRank: rankOf(week, me),
        globalRank: rankOf(glob, me),
        chronoRank: rankOf(chrono, me),
        venueRank: myVenue ? rankOf(venue, me) : 0,
      });
    },
  };

  /* ---- backend distant : le serveur valide + horodate + classe (source de vérité) ----
     Robustesse borne/bar : si le serveur est injoignable, on ne PERD jamais un score —
     il est mis dans une file d'attente locale (`ct_pending`) et renvoyé dès qu'on
     recapte le réseau ; les classements affichés tombent en repli sur le local. Un
     score REFUSÉ par le serveur (triche) n'est pas mis en file (la raison remonte). */
  const PENDING = 'ct_pending';
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING) || '[]'); } catch (e) { return []; } }
  function savePending(a) { try { localStorage.setItem(PENDING, JSON.stringify(a.slice(-50))); } catch (e) {} }

  // Nonce à usage unique par tentative d'envoi (anti-rejeu serveur). Frais à chaque POST →
  // un renvoi (file hors-ligne) obtient un nouveau nonce (pas de blocage sur un 409).
  function newNonce() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function makeRemote(endpoint, token) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {});
    const post = (path, body) => fetch(endpoint + path, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json());
    // ajoute nonce + horodatage client à l'entrée soumise (anti-rejeu)
    const stamp = (entry) => Object.assign({ nonce: newNonce(), cts: Date.now() }, entry);

    // Vide la file d'attente (best-effort, séquentiel, silencieux).
    function flushPending() {
      const a = loadPending();
      if (!a.length) return Promise.resolve();
      return post('/scores', stamp(a[0]))
        .then((res) => { if (res && res.ok) { savePending(a.slice(1)); return flushPending(); } })
        .catch(() => {});
    }

    return {
      submit(entry) {
        return post('/scores', stamp(entry))
          .then((res) => {
            if (res && res.ok) { flushPending(); return res; }          // accepté par le serveur
            if (res && res.reason) return res;                          // refusé (triche) : ne pas mettre en file
            throw new Error('réponse inattendue');
          })
          .catch(() => {                                                // serveur injoignable → file + repli local
            const a = loadPending(); a.push(entry); savePending(a);
            return local.submit(entry).then((r) => Object.assign({ offline: true }, r));
          });
      },
      relabelLast(name) {
        local.relabelLast(name);                                        // garde le repli local cohérent
        return post('/relabel', { name }).catch(() => ({ ok: false, reason: 'réseau' }));
      },
      boards(me) {
        flushPending();                                                 // tente de synchroniser au passage
        const params = [];
        if (me && me.name) params.push('name=' + encodeURIComponent(me.name));
        const venue = (window.CT && CT.Operator) ? CT.Operator.venue() : '';   // classement « ici » (mode opérateur)
        if (venue) params.push('venue=' + encodeURIComponent(venue));
        const q = params.length ? '?' + params.join('&') : '';
        return fetch(endpoint + '/boards' + q, { headers })
          .then((r) => r.json())
          .catch(() => local.boards(me));                               // serveur injoignable : classement local
      },
    };
  }

  let backend = local;

  return {
    getName, setName, validate, maxPlausibleScore,
    submit(entry) { return backend.submit(entry); },
    relabelLast(name) { return backend.relabelLast(name); },
    fetchBoards(me) { return backend.boards(me); },
    useRemote(endpoint, token) { backend = makeRemote(endpoint, token); },
  };
})();
