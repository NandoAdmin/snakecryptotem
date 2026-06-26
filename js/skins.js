/* ============================================================
   skins.js — apparences déblocables/achetables (CT.Skins + CT.BossSkins).
   Persistant (localStorage).

   • CT.Skins      : skins du SERPENT (une palette de couleurs, 1 par batterie).
   • CT.BossSkins  : apparences des ENNEMIS / BOSS (couleur du corps + aura).

   Déblocage : soit par les ÉTOILES de quêtes (skins de progression, gratuits), soit
   par ACHAT en pièces ⚡ (portefeuille du Labo, `CT.Lab.spend`) — possédés à vie.
   Couleurs toujours via des clés de CONFIG.theme → reste rebrandable.
   ============================================================ */
window.CT = window.CT || {};

/* ---------------- Skins du serpent ---------------- */
CT.Skins = (function () {
  const KEY = 'ct_skin';          // skin sélectionné
  const OWN_KEY = 'ct_skins_own'; // skins payants possédés (ids)
  const T = CT.CONFIG.theme;

  // Skins : { id, name, icon, palette (clés de thème) } + soit `stars` (seuil de quêtes),
  // soit `price` (coût en ⚡). Le skin « classic » est gratuit (stars 0).
  const SKINS = [
    // — débloqués aux ÉTOILES de quêtes (récompenses de progression) —
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
    // — ACHETABLES en pièces ⚡ (boutique) —
    { id: 'braise',  name: 'Braise',         icon: '🜂', price: 2500,
      palette: ['amber', 'danger', 'amber', 'pink', 'danger', 'amber', 'glow', 'pink'] },
    { id: 'abysse',  name: 'Abysse',         icon: '🌊', price: 4500,
      palette: ['tealDeep', 'tealMid', 'teal', 'cyan', 'tealMid', 'teal', 'glow', 'cyan'] },
    { id: 'vapeur',  name: 'Vaporwave',      icon: '🌴', price: 8000,
      palette: ['pink', 'violet', 'cyan', 'glow', 'pink', 'violet', 'blue', 'cyan'] },
  ];

  function load() { try { return localStorage.getItem(KEY) || 'classic'; } catch (e) { return 'classic'; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  function ownedSet() { try { return new Set(JSON.parse(localStorage.getItem(OWN_KEY)) || []); } catch (e) { return new Set(); } }
  function saveOwned(s) { try { localStorage.setItem(OWN_KEY, JSON.stringify([...s])); } catch (e) {} }
  function isOwned(id) { return ownedSet().has(id); }

  // Étoiles de quêtes gagnées (monnaie de déblocage des skins de progression).
  function stars() {
    try { return (CT.Achievements && CT.Achievements.count) ? CT.Achievements.count().unlocked : 0; }
    catch (e) { return 0; }
  }
  function get(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }

  // Débloqué = seuil d'étoiles atteint (skins ★) OU possédé/gratuit (skins ⚡).
  function isUnlocked(skin) {
    if (skin.price != null) return skin.price === 0 || isOwned(skin.id);
    return stars() >= (skin.stars || 0);
  }

  function selectedId() { const s = get(load()); return isUnlocked(s) ? s.id : 'classic'; }
  function selected() { return get(selectedId()); }
  function select(id) { const s = get(id); if (!isUnlocked(s)) return false; save(s.id); return true; }

  // Achète un skin payant (débite ⚡ via le Labo). Renvoie true si l'achat a réussi.
  function buy(id) {
    const s = get(id);
    if (s.price == null || isUnlocked(s)) return false;
    if (!(CT.Lab && CT.Lab.spend && CT.Lab.spend(s.price))) return false;
    const set = ownedSet(); set.add(id); saveOwned(set);
    return true;
  }

  function activePalette() { return selected().palette.map((k) => T[k] || k); }
  function preview(id) { return get(id).palette.map((k) => T[k] || k); }

  return { SKINS, stars, isUnlocked, isOwned, buy, selectedId, selected, select, activePalette, preview };
})();

/* ---------------- Apparences des ennemis / boss ---------------- */
CT.BossSkins = (function () {
  const KEY = 'ct_boss_skin';
  const OWN_KEY = 'ct_boss_own';
  const T = CT.CONFIG.theme;

  // Skin ennemi/boss : couleur principale `main` (corps/crâne) + `aura` (halo). Clés de thème.
  const SKINS = [
    { id: 'classic', name: 'Rouge sang', icon: '🔴', price: 0,     main: 'danger', aura: 'violet' },
    { id: 'toxic',   name: 'Toxique',    icon: '🟢', price: 3000,  main: 'lime',   aura: 'charge' },
    { id: 'givre',   name: 'Givré',      icon: '🔵', price: 5000,  main: 'cyan',   aura: 'blue'   },
    { id: 'dore',    name: 'Doré',       icon: '🟡', price: 9000,  main: 'amber',  aura: 'glow'   },
    { id: 'ombre',   name: 'Ombre',      icon: '🟣', price: 14000, main: 'violet', aura: 'pink'   },
  ];

  function load() { try { return localStorage.getItem(KEY) || 'classic'; } catch (e) { return 'classic'; } }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  function ownedSet() { try { return new Set(JSON.parse(localStorage.getItem(OWN_KEY)) || []); } catch (e) { return new Set(); } }
  function saveOwned(s) { try { localStorage.setItem(OWN_KEY, JSON.stringify([...s])); } catch (e) {} }
  function isOwned(id) { return ownedSet().has(id); }

  function get(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
  function isUnlocked(skin) { return skin.price === 0 || isOwned(skin.id); }
  function selectedId() { const s = get(load()); return isUnlocked(s) ? s.id : 'classic'; }
  function selected() { return get(selectedId()); }
  function select(id) { const s = get(id); if (!isUnlocked(s)) return false; save(s.id); return true; }

  function buy(id) {
    const s = get(id);
    if (s.price == null || isUnlocked(s)) return false;
    if (!(CT.Lab && CT.Lab.spend && CT.Lab.spend(s.price))) return false;
    const set = ownedSet(); set.add(id); saveOwned(set);
    return true;
  }

  function activeMain() { const s = selected(); return T[s.main] || s.main; }
  function activeAura() { const s = selected(); return T[s.aura] || s.aura; }
  function preview(id) { const s = get(id); return [T[s.main] || s.main, T[s.aura] || s.aura]; }

  return { SKINS, isUnlocked, isOwned, buy, selectedId, selected, select, activeMain, activeAura, preview };
})();
