/* ============================================================
   skins.js — apparences déblocables du serpent (CT.Skins).
   Persistant (localStorage `ct_skin`).

   Un skin = une PALETTE (1 couleur par batterie, cyclée comme CONFIG.snakePalette)
   donnée par des clés de CONFIG.theme → reste rebrandable (couleurs jamais en dur).
   Le serpent change de couleur à chaque batterie en parcourant cette palette.

   Déblocage : par le nombre d'ÉTOILES de quêtes déjà gagnées
   (CT.Achievements.count().unlocked) → récompense la progression existante, pas
   de nouvelle monnaie. Le skin « classique » est toujours disponible (0 étoile).
   ============================================================ */
window.CT = window.CT || {};

CT.Skins = (function () {
  const KEY = 'ct_skin';
  const T = CT.CONFIG.theme;

  // Skins : { id, name, stars (seuil de déblocage), palette (clés de CONFIG.theme) }.
  const SKINS = [
    { id: 'classic', name: 'Cyan classique', icon: '🔵', stars: 0,
      palette: ['cyan', 'charge', 'blue', 'violet', 'amber', 'pink', 'lime', 'glow'] },
    { id: 'glace',   name: 'Glacier',        icon: '🧊', stars: 4,
      palette: ['cyan', 'glow', 'teal', 'tealMid', 'blue', 'glow', 'cyan', 'teal'] },
    { id: 'foret',   name: 'Forêt néon',     icon: '🌿', stars: 9,
      palette: ['lime', 'charge', 'teal', 'glow', 'lime', 'charge', 'tealMid', 'cyan'] },
    { id: 'magma',   name: 'Magma',          icon: '🔥', stars: 16,
      palette: ['amber', 'danger', 'pink', 'amber', 'danger', 'glow', 'amber', 'pink'] },
    { id: 'prisme',  name: 'Prisme',         icon: '🌈', stars: 26,
      palette: ['danger', 'amber', 'lime', 'charge', 'cyan', 'blue', 'violet', 'pink'] },
    { id: 'or',      name: 'Or pur',         icon: '👑', stars: 40,
      palette: ['amber', 'glow', 'amber', 'charge', 'pink', 'amber', 'glow', 'charge'] },
  ];

  function load() { try { return localStorage.getItem(KEY) || 'classic'; } catch (e) { return 'classic'; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }

  // Étoiles de quêtes gagnées (sert de monnaie de déblocage).
  function stars() {
    try { return (CT.Achievements && CT.Achievements.count) ? CT.Achievements.count().unlocked : 0; }
    catch (e) { return 0; }
  }
  function get(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
  function isUnlocked(skin) { return stars() >= skin.stars; }

  // Id du skin sélectionné, en repliant sur « classic » s'il n'est (plus) débloqué.
  function selectedId() {
    const s = get(load());
    return isUnlocked(s) ? s.id : 'classic';
  }
  function selected() { return get(selectedId()); }

  // Sélectionne un skin (refusé si non débloqué). Renvoie true si appliqué.
  function select(id) {
    const s = get(id);
    if (!isUnlocked(s)) return false;
    save(s.id);
    return true;
  }

  // Palette résolue en hex pour le moteur (clés de thème → couleurs).
  function activePalette() { return selected().palette.map((k) => T[k] || k); }

  // Aperçu hex d'un skin (cartes de l'UI), sans le sélectionner.
  function paletteHex(id) { return get(id).palette.map((k) => T[k] || k); }

  return { SKINS, stars, isUnlocked, selectedId, selected, select, activePalette, paletteHex };
})();
