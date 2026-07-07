/* ============================================================
   sim-core.js — noyau PARTAGÉ pour le rejeu déterministe (navigateur ↔ Node).
   1ʳᵉ brique du modèle « speedrun » anti-triche (cf. docs/anti-cheat.md) :

   • makeRng(seed)          : PRNG mulberry32 IDENTIQUE à CT.util.makeRng → le
                              serveur peut reconstruire la même séquence d'aléa.
   • encodeJournal/decode   : journal d'inputs compact { [step, dir] } ↔ chaîne.
   • validateJournal(e,cfg) : validation STRUCTURELLE du journal contre les
                              métadonnées (pas de re-simulation complète ici) —
                              nb de pas cohérent avec la durée (plancher minStep)
                              et les batteries, journal monotone, codes valides.

   ⚠️ PORTÉE : c'est l'étape 1 (journal + validation structurelle + graine
   reproductible). L'étape 2 (moteur de re-simulation complet qui RECALCULE le
   score canonique) suppose d'extraire `game.step`/spawns en un moteur headless
   partagé ET de retirer les sources d'aléa non journalées (Math.random du
   « coup de chance », orbes en dt) — cf. docs/anti-cheat.md.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;            // Node
  if (typeof window !== 'undefined') { window.CT = window.CT || {}; window.CT.SimCore = api; } // navigateur
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Directions ↔ codes compacts (journal). Doit rester aligné avec game.js.
  const DIR_CODE = { up: 0, down: 1, left: 2, right: 3 };
  const CODE_DIR = ['up', 'down', 'left', 'right'];
  const OPPOSITE = { 0: 1, 1: 0, 2: 3, 3: 2 };
  const MAX_TURNS = 3000;   // plafond de virages journalisés (borne la taille de l'entrée)

  // PRNG mulberry32 — COPIE EXACTE de CT.util.makeRng (source unique du déterminisme).
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Journal → chaîne compacte "step36.dir,step36.dir,…" (step en base 36).
  function encodeJournal(turns) {
    if (!turns || !turns.length) return '';
    const capped = turns.slice(0, MAX_TURNS);
    return capped.map((tn) => (tn[0] >>> 0).toString(36) + '.' + (tn[1] | 0)).join(',');
  }
  function decodeJournal(str) {
    if (!str) return [];
    const out = [];
    for (const part of String(str).split(',')) {
      const i = part.indexOf('.');
      if (i < 0) continue;
      const step = parseInt(part.slice(0, i), 36), dir = parseInt(part.slice(i + 1), 10);
      if (!isFinite(step) || !(dir >= 0 && dir <= 3)) continue;
      out.push([step, dir]);
    }
    return out;
  }

  // Validation STRUCTURELLE d'une entrée avec journal. `cfg` = { minStep }.
  // Ne rejette QUE des incohérences dures (le plafond de score reste dans scoring-rules).
  function validateJournal(entry, cfg) {
    if (!entry || entry.journal == null || entry.steps == null) return { ok: true, skipped: true }; // pas de journal → géré par la validation classique
    const steps = entry.steps;
    if (typeof steps !== 'number' || !isFinite(steps) || steps < 0 || Math.floor(steps) !== steps) {
      return { ok: false, reason: 'pas invalides' };
    }
    const minStepS = (cfg.minStep || 72) / 1000;
    const durS = Math.max(0, (entry.durationMs || 0) / 1000);
    // borne : chaque pas dure AU MOINS minStep (plancher de vitesse) → steps ≤ durée/minStep (+ marge)
    if (steps > Math.ceil(durS / minStepS) + 5) return { ok: false, reason: 'pas/temps incohérents' };
    // il faut au moins autant de pas que de batteries livrées (chaque batterie sur un pas distinct)
    if (entry.batteries != null && steps < (entry.batteries | 0)) return { ok: false, reason: 'pas < batteries' };

    const turns = Array.isArray(entry.journal) ? entry.journal : decodeJournal(entry.journal);
    if (turns.length > MAX_TURNS + 1) return { ok: false, reason: 'journal trop long' };
    if (turns.length > 2 * steps + 10) return { ok: false, reason: 'trop de virages' };
    let last = -1;
    for (const tn of turns) {
      const s = tn[0], d = tn[1];
      if (typeof s !== 'number' || s < 0 || s > steps + 1 || s < last) return { ok: false, reason: 'journal non monotone' };
      if (!(d >= 0 && d <= 3)) return { ok: false, reason: 'direction invalide' };
      last = s;
    }
    return { ok: true, turns: turns.length };
  }

  return { DIR_CODE, CODE_DIR, OPPOSITE, MAX_TURNS, makeRng, encodeJournal, decodeJournal, validateJournal };
});
