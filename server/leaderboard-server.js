/* ============================================================
   leaderboard-server.js — serveur de classement de RÉFÉRENCE.
   Node pur (zéro dépendance). Démarrer : node server/leaderboard-server.js
   Brancher le jeu : CT.Leaderboard.useRemote('http://localhost:8124')

   Démontre le modèle anti-triche (cf. docs/anti-cheat.md) :
   - revalidation serveur via la MÊME logique que le client (js/scoring-rules.js) ;
   - horodatage SERVEUR (le client ne choisit pas son `ts` ni sa semaine) ;
   - rate-limiting par IP (anti-spam / anti-rejeu basique) ;
   - assainissement du pseudo.
   ⚠️ Référence pédagogique : en prod, ajouter auth + nonce + HTTPS + base de
   données + détection d'anomalies, et idéalement le rejeu déterministe.
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const rules = require('../js/scoring-rules.js');

const PORT = process.env.PORT || 8124;
const STORE = path.join(__dirname, 'scores.json');

// Constantes de validation — DOIVENT refléter js/config.js (minStep + bonus).
const RULES = { minStep: 72, bonusEvery: 4, bonusPoints: 250 };

// ---- stockage (fichier JSON ; en prod : vraie base) ----
let scores = [];
try { scores = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { scores = []; }
function persist() { try { fs.writeFileSync(STORE, JSON.stringify(scores)); } catch (e) {} }

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

function send(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e4) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve(null); } });
  });
}

const lastByIp = new Map(); // pour /relabel (faute d'auth dans cette référence)

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || 'ip';
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // GET /boards?name=
  if (req.method === 'GET' && url.pathname === '/boards') {
    const name = url.searchParams.get('name') || '';
    const ws = weekStart(Date.now());
    const ds = dayStart(Date.now());
    // scores CHRONO exclus des classements normaux (mode dédié, non comparable)
    const norm = scores.filter((e) => !e.chrono);
    const week = sorted(norm.filter((e) => e.ts >= ws));
    const day = sorted(norm.filter((e) => e.daily && e.ts >= ds));   // Défi du jour uniquement
    const glob = sorted(norm);
    const chrono = sorted(scores.filter((e) => e.chrono));
    const mine = scores.filter((e) => !name || e.name === name);
    const personal = mine.reduce((m, e) => Math.max(m, e.score), 0);
    return send(res, 200, {
      personal,
      daily: day.slice(0, 5),
      weekly: week.slice(0, 5),
      global: glob.slice(0, 5),
      chrono: chrono.slice(0, 5),
      dailyRank: personal ? rankOf(day, personal) : 0,
      weeklyRank: personal ? rankOf(week, personal) : 0,
      globalRank: personal ? rankOf(glob, personal) : 0,
      chronoRank: personal ? rankOf(chrono, personal) : 0,
    });
  }

  // POST /scores
  if (req.method === 'POST' && url.pathname === '/scores') {
    if (rateLimited(ip)) return send(res, 429, { ok: false, reason: 'trop de requêtes' });
    const body = await readBody(req);
    if (!body) return send(res, 400, { ok: false, reason: 'json invalide' });

    const v = rules.validate(body, RULES);        // MÊME validation que le client
    if (!v.ok) return send(res, 400, v);

    const entry = {
      name: cleanName(body.name),
      score: Math.floor(body.score),
      level: body.level | 0,
      batteries: body.batteries | 0,
      bonuses: body.bonuses | 0,
      durationMs: body.durationMs | 0,
      seed: body.seed >>> 0,
      daily: !!body.daily,                         // Défi du jour (en prod : vérifier seed == seed du jour)
      chrono: !!body.chrono,                       // Mode Chrono → classement dédié
      ts: Date.now(),                              // ⚠️ horodatage SERVEUR (jamais le client)
    };
    scores.push(entry);
    if (scores.length > 5000) scores = sorted(scores).slice(0, 5000);
    persist();
    lastByIp.set(ip, entry);
    return send(res, 200, { ok: true, rank: rankOf(sorted(scores), entry.score) });
  }

  // POST /relabel  (en prod : via l'identité authentifiée, pas l'IP)
  if (req.method === 'POST' && url.pathname === '/relabel') {
    const body = await readBody(req);
    const last = lastByIp.get(ip);
    if (last && body && body.name) { last.name = cleanName(body.name); persist(); }
    return send(res, 200, { ok: true });
  }

  send(res, 404, { ok: false, reason: 'not found' });
});

server.listen(PORT, () => console.log('Classement Cryptotem sur http://localhost:' + PORT));
