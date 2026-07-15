/* ============================================================
   leaderboard-server.js — serveur de classement de RÉFÉRENCE (Node, zéro dépendance).
   Démarrer :  node server/leaderboard-server.js
   Brancher le jeu :  CT.Leaderboard.useRemote('https://…', token)

   Modèle anti-triche (cf. docs/anti-cheat.md), DURCI pour un usage réel :
   - revalidation serveur via la MÊME logique que le client (js/scoring-rules.js) ;
   - rejeu déterministe (étape 1) : validation STRUCTURELLE du journal d'inputs
     (js/sim-core.js) — nb de pas cohérent avec la durée + les batteries ;
   - horodatage SERVEUR (le client ne choisit ni son `ts` ni sa semaine) ;
   - AUTH par token de borne (env CT_TOKENS) — provisionné sur la borne, pas dans
     le JS public (un HMAC embarqué dans le client serait extractible → théâtre) ;
   - ANTI-REJEU : nonce à usage unique + fenêtre d'horloge (empêche de renvoyer 100×
     la même partie) ;
   - HTTPS natif si CT_TLS_KEY / CT_TLS_CERT sont fournis ;
   - BASE DURABLE : node:sqlite si disponible (vraie base SQL, fichier + index),
     sinon repli JSON avec écritures atomiques (tmp + rename) ;
   - rate-limiting par IP + assainissement du pseudo.

   Variables d'environnement :
     PORT=8124                 port d'écoute
     CT_TOKENS=t1,t2           tokens de borne acceptés (vide = ouvert, dev only)
     CT_TLS_KEY=/chemin.key    clé TLS (+ CT_TLS_CERT) → HTTPS
     CT_TLS_CERT=/chemin.crt
     CT_DB=/chemin/scores.(db|json)   stockage (défaut : server/scores.*)
   ============================================================ */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const rules = require('../js/scoring-rules.js');
const sim = require('../js/sim-core.js');

const PORT = process.env.PORT || 8124;

// Constantes de validation — DOIVENT refléter js/config.js (minStep + bonus).
// NB : le réglage de difficulté ne modifie PAS minStep (plancher) → ce plafond reste valide.
const RULES = { minStep: 72, bonusEvery: 4, bonusPoints: 250 };

// AUTH : tokens de borne acceptés (provisionnés hors du JS public). Vide = ouvert (dev).
const TOKENS = new Set((process.env.CT_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean));
const CLOCK_SKEW_MS = 5 * 60 * 1000;   // fenêtre d'acceptation de l'horloge client (anti-rejeu)
const NONCE_TTL_MS = 10 * 60 * 1000;   // durée de rétention d'un nonce vu

// ---- utilitaires ----
function weekStart(ts) {                 // lundi 00:00 (heure SERVEUR)
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day);
  return d.getTime();
}
function dayStart(ts) {                  // minuit (heure SERVEUR) — classement du Défi du jour
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function sorted(list) { return list.slice().sort((a, b) => b.score - a.score || a.ts - b.ts); }
function cleanName(n) { return String(n || 'Joueur').replace(/[<>]/g, '').trim().slice(0, 14) || 'Joueur'; }
function rankOf(list, score) { const i = list.findIndex((e) => e.score <= score); return i >= 0 ? i + 1 : list.length + 1; }

// ---- STOCKAGE : vraie base (node:sqlite) si dispo, sinon JSON atomique ----
function makeStore() {
  const wantDb = process.env.CT_DB || path.join(__dirname, 'scores');
  // 1) tentative node:sqlite (Node ≥ 22.5) → vraie base SQL durable + indexée
  try {
    const { DatabaseSync } = require('node:sqlite');
    const file = wantDb.endsWith('.db') ? wantDb : wantDb + '.db';
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, score INTEGER, level INTEGER, batteries INTEGER, bonuses INTEGER, durationMs INTEGER, seed INTEGER, daily INTEGER, chrono INTEGER, diff TEXT, steps INTEGER, journal TEXT, venue TEXT, ts INTEGER)');
    try { db.exec('ALTER TABLE scores ADD COLUMN venue TEXT'); } catch (e) { /* déjà présente (base fraîche) */ }   // migre les bases existantes
    db.exec('CREATE INDEX IF NOT EXISTS idx_ts ON scores(ts)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_score ON scores(score)');
    const ins = db.prepare('INSERT INTO scores (name,score,level,batteries,bonuses,durationMs,seed,daily,chrono,diff,steps,journal,venue,ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const sel = db.prepare('SELECT * FROM scores');
    return {
      kind: 'sqlite:' + file,
      add(e) { ins.run(e.name, e.score, e.level, e.batteries, e.bonuses, e.durationMs, e.seed, e.daily ? 1 : 0, e.chrono ? 1 : 0, e.diff, e.steps | 0, e.journal || '', e.venue || '', e.ts); },
      all() { return sel.all().map((r) => Object.assign({}, r, { daily: !!r.daily, chrono: !!r.chrono })); },
    };
  } catch (e) { /* pas de node:sqlite → repli JSON */ }

  // 2) repli : fichier JSON avec écritures ATOMIQUES (tmp + rename → jamais de fichier corrompu)
  const file = wantDb.endsWith('.json') ? wantDb : wantDb + '.json';
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { rows = []; }
  function persist() {
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rows)); fs.renameSync(tmp, file); } catch (e) {}
  }
  return {
    kind: 'json:' + file,
    add(e) { rows.push(e); if (rows.length > 20000) rows = sorted(rows).slice(0, 20000); persist(); },
    all() { return rows; },
  };
}
const store = makeStore();

// ---- rate-limiting par IP (≥ 1 s entre deux soumissions, ≤ 20 / min) ----
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { last: 0, windowStart: now, count: 0 };
  if (now - h.windowStart > 60000) { h.windowStart = now; h.count = 0; }
  if (now - h.last < 1000 || h.count >= 20) { hits.set(ip, h); return true; }
  h.last = now; h.count++; hits.set(ip, h);
  return false;
}

// ---- anti-rejeu : nonces à usage unique, avec expiration (borne la mémoire) ----
const seenNonces = new Map();   // nonce → expiry(ms)
function nonceUsed(nonce) {
  const now = Date.now();
  if (seenNonces.size > 5000) for (const [k, exp] of seenNonces) if (exp < now) seenNonces.delete(k);   // purge
  if (seenNonces.has(nonce) && seenNonces.get(nonce) > now) return true;
  seenNonces.set(nonce, now + NONCE_TTL_MS);
  return false;
}

// ---- auth : token de borne (Bearer). TOKENS vide = ouvert (dev). ----
function authorized(req) {
  if (!TOKENS.size) return true;
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return !!(m && TOKENS.has(m[1].trim()));
}

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });   // 100 KB (journal d'inputs inclus)
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve(null); } });
  });
}

const lastByIp = new Map(); // pour /relabel (faute d'auth par compte dans cette référence)

function handler(req, res) {
  const ip = req.socket.remoteAddress || 'ip';
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // GET /boards?name=&venue=
  if (req.method === 'GET' && url.pathname === '/boards') {
    const name = url.searchParams.get('name') || '';
    const venueQ = (url.searchParams.get('venue') || '').slice(0, 40);
    const all = store.all();
    const ws = weekStart(Date.now());
    const ds = dayStart(Date.now());
    const norm = all.filter((e) => !e.chrono);   // les scores chrono ont leur classement dédié
    const week = sorted(norm.filter((e) => e.ts >= ws));
    const day = sorted(norm.filter((e) => e.daily && e.ts >= ds));
    const glob = sorted(norm);
    const chrono = sorted(all.filter((e) => e.chrono));
    // classement « ici » : meilleurs scores tous temps (hors chrono) du lieu de la borne demandée
    const venue = venueQ ? sorted(norm.filter((e) => e.venue === venueQ)) : [];
    const mine = all.filter((e) => !name || e.name === name);
    const personal = mine.reduce((m, e) => Math.max(m, e.score), 0);
    return send(res, 200, {
      personal,
      daily: day.slice(0, 5), weekly: week.slice(0, 5), global: glob.slice(0, 5), chrono: chrono.slice(0, 5),
      venue: venue.slice(0, 5),
      dailyRank: personal ? rankOf(day, personal) : 0,
      weeklyRank: personal ? rankOf(week, personal) : 0,
      globalRank: personal ? rankOf(glob, personal) : 0,
      chronoRank: personal ? rankOf(chrono, personal) : 0,
      venueRank: (venueQ && personal) ? rankOf(venue, personal) : 0,
    });
  }

  // POST /scores
  if (req.method === 'POST' && url.pathname === '/scores') {
    if (!authorized(req)) return send(res, 401, { ok: false, reason: 'non autorisé' });
    if (rateLimited(ip)) return send(res, 429, { ok: false, reason: 'trop de requêtes' });
    return readBody(req).then((body) => {
      if (!body) return send(res, 400, { ok: false, reason: 'json invalide' });

      // ANTI-REJEU : nonce unique + horloge client dans la fenêtre (le nonce fait foi).
      if (body.nonce != null) {
        if (typeof body.cts === 'number' && Math.abs(Date.now() - body.cts) > CLOCK_SKEW_MS) {
          return send(res, 400, { ok: false, reason: 'horodatage hors fenêtre' });
        }
        if (nonceUsed(String(body.nonce))) return send(res, 409, { ok: false, reason: 'rejeu détecté (nonce)' });
      }

      const v = rules.validate(body, RULES);          // MÊME plafond que le client
      if (!v.ok) return send(res, 400, v);
      const jv = sim.validateJournal(body, RULES);    // rejeu déterministe (étape 1 : structurel)
      if (!jv.ok) return send(res, 400, { ok: false, reason: 'rejeu: ' + jv.reason });

      const entry = {
        name: cleanName(body.name),
        score: Math.floor(body.score),
        level: body.level | 0,
        batteries: body.batteries | 0,
        bonuses: body.bonuses | 0,
        durationMs: body.durationMs | 0,
        seed: body.seed >>> 0,
        daily: !!body.daily,                           // (prod : vérifier seed == seed du jour)
        chrono: !!body.chrono,
        diff: String(body.diff || 'normal').slice(0, 8),
        steps: body.steps | 0,
        journal: typeof body.journal === 'string' ? body.journal.slice(0, 30000) : '',
        venue: String(body.venue || '').slice(0, 40),  // lieu de la borne (mode opérateur) → classement « ici »
        ts: Date.now(),                                // ⚠️ horodatage SERVEUR (jamais le client)
      };
      store.add(entry);
      lastByIp.set(ip, entry);
      return send(res, 200, { ok: true, rank: rankOf(sorted(store.all().filter((e) => !!e.chrono === !!entry.chrono)), entry.score) });
    });
  }

  // POST /relabel  (prod : via l'identité authentifiée, pas l'IP)
  if (req.method === 'POST' && url.pathname === '/relabel') {
    if (!authorized(req)) return send(res, 401, { ok: false, reason: 'non autorisé' });
    return readBody(req).then((body) => {
      const last = lastByIp.get(ip);
      if (last && body && body.name) { last.name = cleanName(body.name); }
      return send(res, 200, { ok: true });
    });
  }

  send(res, 404, { ok: false, reason: 'not found' });
}

// ---- HTTPS si certificats fournis, sinon HTTP (dev) ----
let server, scheme = 'http';
if (process.env.CT_TLS_KEY && process.env.CT_TLS_CERT) {
  try {
    const opts = { key: fs.readFileSync(process.env.CT_TLS_KEY), cert: fs.readFileSync(process.env.CT_TLS_CERT) };
    server = https.createServer(opts, handler); scheme = 'https';
  } catch (e) { console.error('TLS indisponible, repli HTTP :', e.message); }
}
if (!server) server = http.createServer(handler);

server.listen(PORT, () => {
  console.log('Classement Cryptotem sur ' + scheme + '://localhost:' + PORT);
  console.log('  base   : ' + store.kind);
  console.log('  auth   : ' + (TOKENS.size ? TOKENS.size + ' token(s) de borne' : 'OUVERT (dev — définir CT_TOKENS en prod)'));
  console.log('  rejeu  : validation structurelle du journal d\'inputs (étape 1)');
});
