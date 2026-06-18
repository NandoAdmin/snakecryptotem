/* ============================================================
   scoring-rules.js — règles de validation de score PARTAGÉES
   entre le navigateur (CT.ScoringRules) et le serveur Node
   (module.exports). C'est LE point unique de vérité anti-triche :
   le client filtre pour l'UX, le serveur fait foi (mêmes fonctions).

   `cfg` regroupe les constantes de jeu utiles à la borne :
     { minStep, bonusEvery, bonusPoints }
   (côté navigateur : dérivées de CT.CONFIG ; côté serveur : voir RULES).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;          // Node
  if (typeof window !== 'undefined') { window.CT = window.CT || {}; window.CT.ScoringRules = api; } // navigateur
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMBO_MAX = 9;   // plafond du combo (cf. game.js)
  const DOUBLE_MULT = 2; // power-up « double points » : ×2 par batterie (cf. game.js)

  // Borne supérieure « physiquement atteignable » d'un score selon les règles.
  function maxPlausibleScore(meta, cfg) {
    const minStepS = cfg.minStep / 1000;
    const durS = Math.max(0, (meta.durationMs || 0) / 1000);
    const lvl = Math.max(1, meta.level || 1);
    // Une batterie demande au moins minStep ms (plancher de vitesse) → borne par le temps.
    const maxBatteries = Math.ceil(durS / minStepS) + 5;
    const perBattery = (50 + lvl * 10) * COMBO_MAX * DOUBLE_MULT;  // combo max × double points
    const maxBonuses = Math.ceil(maxBatteries / cfg.bonusEvery) + 2;
    const perBonus = cfg.bonusPoints * lvl;                // bonus le plus généreux
    return maxBatteries * perBattery + maxBonuses * perBonus + 100;
  }

  // Retourne { ok, reason } — rejette les scores aberrants / incohérents.
  function validate(entry, cfg) {
    const s = entry && entry.score;
    if (typeof s !== 'number' || !isFinite(s) || s < 0 || Math.floor(s) !== s) {
      return { ok: false, reason: 'score invalide' };
    }
    if (s > maxPlausibleScore(entry, cfg)) return { ok: false, reason: 'score implausible' };
    const minStepS = cfg.minStep / 1000;
    if (entry.batteries && entry.durationMs &&
        entry.batteries > (entry.durationMs / 1000) / minStepS + 5) {
      return { ok: false, reason: 'batteries/temps incohérents' };
    }
    return { ok: true };
  }

  return { COMBO_MAX, maxPlausibleScore, validate };
});
