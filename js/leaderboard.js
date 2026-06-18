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
      const week = sorted(all.filter((e) => e.ts >= ws));
      const glob = sorted(all);
      const name = getName();
      const mine = all.filter((e) => !name || e.name === name);
      return Promise.resolve({
        personal: mine.reduce((m, e) => Math.max(m, e.score), 0),
        weekly: week.slice(0, 5),
        global: glob.slice(0, 5),
        weeklyRank: rankOf(week, me),
        globalRank: rankOf(glob, me),
      });
    },
  };

  /* ---- backend distant (futur) : le serveur valide + horodate + classe ---- */
  function makeRemote(endpoint, token) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {});
    return {
      submit(entry) {
        return fetch(endpoint + '/scores', { method: 'POST', headers, body: JSON.stringify(entry) })
          .then((r) => r.json()).catch(() => ({ ok: false, reason: 'réseau' }));
      },
      relabelLast(name) {
        return fetch(endpoint + '/relabel', { method: 'POST', headers, body: JSON.stringify({ name }) })
          .then((r) => r.json()).catch(() => ({ ok: false, reason: 'réseau' }));
      },
      boards(me) {
        const q = me ? '?name=' + encodeURIComponent(me.name || '') : '';
        return fetch(endpoint + '/boards' + q, { headers })
          .then((r) => r.json()).catch(() => ({ personal: 0, weekly: [], global: [], weeklyRank: 0, globalRank: 0 }));
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
