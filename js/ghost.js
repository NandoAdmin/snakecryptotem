/* ============================================================
   ghost.js — CT.Ghost : « course contre ton fantôme » (Défi du jour).
   Persistant (localStorage `ct_ghost`, un seul fantôme : le MEILLEUR du jour).

   Pendant un Défi du jour, le jeu enregistre la position de la tête à chaque
   pas (`game.ghostRec` : [x, y, tSecondes, niveau]). À la mort, si le score
   bat le fantôme du jour, l'enregistrement le remplace. Aux tentatives
   suivantes (même seed → même map), le fantôme translucide rejoue sa course
   en temps réel : on se mesure à son meilleur soi.

   ⚠️ Le fantôme n'a de sens que sur le DÉFI DU JOUR (seed du jour partagé =
   même map). En partie normale, chaque seed génère une map différente.
   C'est aussi la 1ʳᵉ brique du « journal de partie » du rejeu anti-triche.
   ============================================================ */
window.CT = window.CT || {};

CT.Ghost = (function () {
  const KEY = 'ct_ghost';
  const MAX_FRAMES = 6000;   // ~12 min de pas — au-delà on arrête d'enregistrer

  function load() {
    try {
      const g = JSON.parse(localStorage.getItem(KEY));
      return (g && g.date === CT.util.todayStr() && Array.isArray(g.frames)) ? g : null;
    } catch (e) { return null; }
  }

  // Remplace le fantôme si `score` bat celui du jour. Renvoie true si sauvegardé.
  function maybeSave(score, frames) {
    if (!frames || !frames.length) return false;
    const cur = load();
    if (cur && score <= cur.score) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: CT.util.todayStr(), score, frames: frames.slice(0, MAX_FRAMES) }));
      return true;
    } catch (e) { return false; }
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  return { MAX_FRAMES, load, maybeSave, reset };
})();
