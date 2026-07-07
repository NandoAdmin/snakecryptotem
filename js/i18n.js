/* ============================================================
   i18n.js — internationalisation (FR / EN / ES).
   Chargé tôt (après access.js) → CT.i18n.t(key, params) partout.

   • STR : chaînes de la coque UI + du runtime, par langue, avec {placeholders}.
   • CAT : catalogues traduits (Labo, Quêtes, Skins, Missions, Médailles, Biomes),
           référencés au moment du rendu (les modules de données restent le repli FR).
   • apply(root) : traduit le HTML statique marqué [data-i18n] / [data-i18n-html]
                   / [data-i18n-ph] (placeholder).
   Langue persistée (localStorage `ct_lang`) ; auto-détectée au 1ᵉʳ lancement.
   ============================================================ */
window.CT = window.CT || {};

CT.i18n = (function () {
  const KEY = 'ct_lang';
  const LANGS = ['fr', 'en', 'es'];

  const STR = {
    fr: {
      'home.tagline': 'Rechargez la ville. Attrapez les batteries. ⚡',
      'btn.play': 'JOUER', 'challenge.play': '🎯 RELEVER LE DÉFI',
      'btn.daily': '📅 DÉFI DU JOUR', 'btn.chrono': '⏱️ CHRONO — 2 MIN', 'btn.versus': '👥 2 JOUEURS — DUEL',
      'home.record': '🏆 Record :',
      'howto.1': '🔋 Attrapez les batteries pour allonger votre câble USB-C',
      'howto.2': '🌀 Traversez les bords : vous ressortez de l\'autre côté !',
      'howto.3': '🎯 Atteignez l\'objectif pour terminer le niveau',
      'howto.4': '⚠️ Évitez les obstacles… et votre propre câble',
      'btn.lab': '🔬 Laboratoire', 'btn.quests': '🏆 Quêtes', 'btn.skins': '🎨 Skins',
      'btn.stats': '📊 Stats', 'btn.options': '⚙️ Options',
      'home.controls': 'Flèches · WASD · Swipe · D-pad',
      'audio.sound': 'Son', 'audio.music': '🎵 Musique :', 'word.on': 'On', 'word.off': 'Off',
      'board.week': '📅 TOP DE LA SEMAINE', 'lb.empty': 'Sois le premier du classement !',
      'lb.rank': 'Ton rang : #{n}', 'lb.offline': '📡 hors-ligne — synchro à la reconnexion',
      'lab.title': '🔬 LABORATOIRE',
      'lab.intro': 'Dépense tes batteries & points pour rechercher des améliorations permanentes.',
      'lab.reset': 'Réinitialiser le Labo', 'lab.reset.confirm': '⚠️ Confirmer la remise à zéro',
      'lab.researching': 'recherche…', 'lab.ready': '✓ Prêt', 'lab.claim': 'RÉCUPÉRER',
      'lab.next': 'Prochain : ', 'lab.max': ' (max)', 'lab.busy': 'Labo occupé', 'lab.research': 'Rechercher',
      'btn.back': 'RETOUR',
      'quests.title': '🏆 QUÊTES', 'quests.intro': 'Gravis les 5 paliers de chaque quête : Bronze → Diamant.',
      'quests.done': 'Complété ✦ ', 'quests.toward': 'Vers {medal} : {value} / {next}',
      'ach.tier': 'PALIER ATTEINT',
      'stats.title': '📊 STATISTIQUES', 'stats.intro': 'Tes records et totaux cumulés sur cette borne.',
      'stats.games': 'Parties jouées', 'stats.bat': 'Batteries (total)', 'stats.bonus': 'Power-ups (total)',
      'stats.best': 'Meilleur score', 'stats.level': 'Niveau max', 'stats.combo': 'Combo max',
      'stats.survive': 'Meilleure survie', 'stats.lab': 'Versé au Labo', 'stats.walls': 'Murs brisés',
      'stats.snak': 'Snakator détruit', 'stats.quests': 'Quêtes (★)',
      'skins.title': '🎨 SKINS & BOUTIQUE',
      'skins.intro': 'Débloque des skins aux étoiles de quêtes, ou achète-les avec tes pièces.',
      'skins.sec.snakeColors': '🐍 Serpent — Couleurs', 'skins.sec.snakeHeads': '🐍 Serpent — Têtes',
      'skins.sec.trails': '✨ Serpent — Traînées', 'skins.sec.enemyColors': '👹 Ennemis & Boss — Couleurs',
      'skins.sec.enemyHeads': '👹 Ennemis & Boss — Têtes',
      'skins.equipped': '✓ Équipé', 'skins.choose': 'Choisir', 'skins.locked': '🔒 {n} ★ requises',
      'options.title': '⚙️ OPTIONS',
      'options.intro': 'Confort visuel — utile sur les bornes en bar (soleil, vision des couleurs).',
      'options.cb': '👁️ Mode daltonien', 'options.cb.desc': 'Le rouge de danger devient orange (plus distinct du vert).',
      'options.contrast': '🔆 Contraste élevé', 'options.contrast.desc': 'Fond plus sombre et grille plus visible.',
      'options.lang': '🌍 Langue', 'options.lang.desc': 'Choisis la langue du jeu.',
      'pause.title': 'PAUSE', 'btn.resume': 'REPRENDRE', 'btn.restart': 'RECOMMENCER', 'btn.menu': 'MENU',
      'over.name': 'Pseudo', 'over.name.ph': 'Ton pseudo',
      'tab.daily': '☀️ Jour', 'tab.weekly': '📅 Semaine', 'tab.global': '🌍 Global', 'tab.chrono': '⏱ Chrono',
      'over.perso': '🏅 Ton record :',
      'cta.title': '⚡ Plus de batterie ? Pas de panique.',
      'cta.sub': 'Une borne <b>Cryptotem</b> vous attend dans votre bar, ciné, bowling ou club préféré. Rechargez en quelques secondes.',
      'cta.qr': '📲 Scanne pour trouver une borne',
      'btn.retry': 'REJOUER', 'btn.defi': '📲 Défier un ami',
      'defi.cap': '📲 Fais scanner ce QR à un ami : même terrain, ton score à battre !',
      'btn.next': 'NIVEAU SUIVANT ▸',
      'over.title.dead': 'BATTERIE DÉCHARGÉE', 'over.title.timeup': '⏱️ TEMPS ÉCOULÉ !',
      'over.title.win1': '🏆 JOUEUR 1 GAGNE !', 'over.title.win2': '🏆 JOUEUR 2 GAGNE !', 'over.title.draw': '🤝 ÉGALITÉ !',
      'over.title.cwon': '🎉 DÉFI RELEVÉ !', 'over.title.clost': '😤 DÉFI MANQUÉ',
      'over.versus': 'Score final — 🔵 J1 <b>{a}</b>  ·  🔴 J2 <b>{b}</b>',
      'over.level': 'Niveau atteint : ', 'over.batteries': 'Batteries livrées : ', 'over.score': 'Score : ',
      'over.record': ' &nbsp;🏆 <b>Nouveau record !</b>',
      'over.recap': '⏱ {dur} &nbsp;·&nbsp; ⚡ {n} {pu} &nbsp;·&nbsp; 🔥 combo ×{combo}',
      'over.newghost': ' &nbsp;·&nbsp; 👻 <b>Nouveau fantôme du jour !</b>',
      'over.missions': '🎯 Missions {done}/{total} : ',
      'over.challenge': '🎯 Défi de <b>{name}</b> ({score}) : ', 'over.challenge.won': '✅ <b>relevé !</b>', 'over.challenge.lost': '❌ manqué',
      'over.labgain': '🔬 +{bat} 🔋 +{pts} ⚡ au Labo <small>(total {b} 🔋 · {p} ⚡)</small>',
      'word.powerup': 'power-up', 'word.powerups': 'power-ups', 'word.minute': 'minute', 'word.minutes': 'minutes',
      'hud.level': 'NIVEAU', 'hud.duel': '👥 DUEL', 'hud.chrono': '⏱ CHRONO',
      'intro.objective': 'Objectif : {n} batteries 🔋',
      'intro.daily': '📅 DÉFI DU JOUR', 'intro.daily.ghost': '  ·  👻 à battre : {score}',
      'intro.challenge': '🎯 Défi de {name} — à battre : {score}',
      'intro.enemy.alert': '⚠️ ALERTE', 'intro.enemy.title': 'LE SNAKATOR APPARAÎT !',
      'intro.enemy.sub': 'Évitez le serpent rouge… ou mordez-le sous bouclier 🛡️',
      'intro.boss': '👹 BOSS', 'intro.hydra': '🐉 HYDRE',
      'intro.boss.sub': 'Mordez-le sous bouclier 🛡️ pour le vaincre !', 'intro.hydra.sub': 'Coupez ses {n} têtes sous bouclier 🛡️ !',
      'intro.race': '🏁 COURSE', 'intro.race.sub1': 'Le GLOUTON vole vos batteries !',
      'intro.race.sub2': 'Chaque vol recule l\'objectif — mordez-le sous bouclier 🛡️',
      'intro.chrono': '⏱ CHRONO', 'intro.chrono.sub': '{mins} {unit} — score maximum !',
      'intro.chrono.sub2': 'Le temps file, le serpent accélère… tenez bon 🔋',
      'intro.versus': '👥 DUEL', 'intro.versus.sub': 'Premier à {n} batteries gagne !',
      'intro.versus.sub2': '🔵 J1 : flèches   ·   🔴 J2 : W A S D',
      'banner.surcharge': '⚡ SURCHARGE', 'banner.record': '🏆 RECORD BATTU !',
      'event.gold': '💰 RUÉE DORÉE — pièces ×{n} !', 'event.blackout': '🌑 BLACKOUT !', 'event.rain': '🎁 PLUIE DE POWER-UPS !',
      'tuto.move': '⬆️ Dirige la batterie : flèches, WASD ou swipe', 'tuto.border': '🌀 Fonce dans un bord : tu ressors en face !',
      'challenge.banner': '🎯 Défi de <b>{name}</b> — bats <b>{score}</b> !',
      'mission.toast': '🎯 MISSION ✓  +{n} ⚡',
    },
    en: {
      'home.tagline': 'Recharge the city. Grab the batteries. ⚡',
      'btn.play': 'PLAY', 'challenge.play': '🎯 TAKE THE CHALLENGE',
      'btn.daily': '📅 DAILY CHALLENGE', 'btn.chrono': '⏱️ TIME ATTACK — 2 MIN', 'btn.versus': '👥 2 PLAYERS — DUEL',
      'home.record': '🏆 Best:',
      'howto.1': '🔋 Grab batteries to extend your USB-C cable',
      'howto.2': '🌀 Cross the edges: you come out the other side!',
      'howto.3': '🎯 Reach the goal to finish the level',
      'howto.4': '⚠️ Avoid obstacles… and your own cable',
      'btn.lab': '🔬 Lab', 'btn.quests': '🏆 Quests', 'btn.skins': '🎨 Skins',
      'btn.stats': '📊 Stats', 'btn.options': '⚙️ Options',
      'home.controls': 'Arrows · WASD · Swipe · D-pad',
      'audio.sound': 'Sound', 'audio.music': '🎵 Music:', 'word.on': 'On', 'word.off': 'Off',
      'board.week': '📅 TOP OF THE WEEK', 'lb.empty': 'Be the first on the board!',
      'lb.rank': 'Your rank: #{n}', 'lb.offline': '📡 offline — will sync when reconnected',
      'lab.title': '🔬 LAB',
      'lab.intro': 'Spend your batteries & points to research permanent upgrades.',
      'lab.reset': 'Reset the Lab', 'lab.reset.confirm': '⚠️ Confirm reset',
      'lab.researching': 'researching…', 'lab.ready': '✓ Ready', 'lab.claim': 'CLAIM',
      'lab.next': 'Next: ', 'lab.max': ' (max)', 'lab.busy': 'Lab busy', 'lab.research': 'Research',
      'btn.back': 'BACK',
      'quests.title': '🏆 QUESTS', 'quests.intro': 'Climb the 5 tiers of each quest: Bronze → Diamond.',
      'quests.done': 'Completed ✦ ', 'quests.toward': 'Toward {medal}: {value} / {next}',
      'ach.tier': 'TIER REACHED',
      'stats.title': '📊 STATISTICS', 'stats.intro': 'Your records and totals on this terminal.',
      'stats.games': 'Games played', 'stats.bat': 'Batteries (total)', 'stats.bonus': 'Power-ups (total)',
      'stats.best': 'Best score', 'stats.level': 'Max level', 'stats.combo': 'Max combo',
      'stats.survive': 'Best survival', 'stats.lab': 'Banked to Lab', 'stats.walls': 'Walls smashed',
      'stats.snak': 'Snakator destroyed', 'stats.quests': 'Quests (★)',
      'skins.title': '🎨 SKINS & SHOP',
      'skins.intro': 'Unlock skins with quest stars, or buy them with your coins.',
      'skins.sec.snakeColors': '🐍 Snake — Colors', 'skins.sec.snakeHeads': '🐍 Snake — Heads',
      'skins.sec.trails': '✨ Snake — Trails', 'skins.sec.enemyColors': '👹 Enemies & Bosses — Colors',
      'skins.sec.enemyHeads': '👹 Enemies & Bosses — Heads',
      'skins.equipped': '✓ Equipped', 'skins.choose': 'Select', 'skins.locked': '🔒 {n} ★ required',
      'options.title': '⚙️ OPTIONS',
      'options.intro': 'Visual comfort — handy on bar terminals (sunlight, color vision).',
      'options.cb': '👁️ Colorblind mode', 'options.cb.desc': 'Danger red turns orange (more distinct from green).',
      'options.contrast': '🔆 High contrast', 'options.contrast.desc': 'Darker background and more visible grid.',
      'options.lang': '🌍 Language', 'options.lang.desc': 'Choose the game language.',
      'pause.title': 'PAUSE', 'btn.resume': 'RESUME', 'btn.restart': 'RESTART', 'btn.menu': 'MENU',
      'over.name': 'Name', 'over.name.ph': 'Your name',
      'tab.daily': '☀️ Day', 'tab.weekly': '📅 Week', 'tab.global': '🌍 Global', 'tab.chrono': '⏱ Time',
      'over.perso': '🏅 Your best:',
      'cta.title': '⚡ Low battery? No worries.',
      'cta.sub': 'A <b>Cryptotem</b> station is waiting in your favorite bar, cinema, bowling alley or club. Recharge in seconds.',
      'cta.qr': '📲 Scan to find a station',
      'btn.retry': 'PLAY AGAIN', 'btn.defi': '📲 Challenge a friend',
      'defi.cap': '📲 Have a friend scan this QR: same board, your score to beat!',
      'btn.next': 'NEXT LEVEL ▸',
      'over.title.dead': 'BATTERY DEPLETED', 'over.title.timeup': '⏱️ TIME\'S UP!',
      'over.title.win1': '🏆 PLAYER 1 WINS!', 'over.title.win2': '🏆 PLAYER 2 WINS!', 'over.title.draw': '🤝 DRAW!',
      'over.title.cwon': '🎉 CHALLENGE WON!', 'over.title.clost': '😤 CHALLENGE MISSED',
      'over.versus': 'Final score — 🔵 P1 <b>{a}</b>  ·  🔴 P2 <b>{b}</b>',
      'over.level': 'Level reached: ', 'over.batteries': 'Batteries delivered: ', 'over.score': 'Score: ',
      'over.record': ' &nbsp;🏆 <b>New record!</b>',
      'over.recap': '⏱ {dur} &nbsp;·&nbsp; ⚡ {n} {pu} &nbsp;·&nbsp; 🔥 combo ×{combo}',
      'over.newghost': ' &nbsp;·&nbsp; 👻 <b>New daily ghost!</b>',
      'over.missions': '🎯 Missions {done}/{total}: ',
      'over.challenge': '🎯 {name}\'s challenge ({score}): ', 'over.challenge.won': '✅ <b>beaten!</b>', 'over.challenge.lost': '❌ missed',
      'over.labgain': '🔬 +{bat} 🔋 +{pts} ⚡ to the Lab <small>(total {b} 🔋 · {p} ⚡)</small>',
      'word.powerup': 'power-up', 'word.powerups': 'power-ups', 'word.minute': 'minute', 'word.minutes': 'minutes',
      'hud.level': 'LEVEL', 'hud.duel': '👥 DUEL', 'hud.chrono': '⏱ TIME',
      'intro.objective': 'Goal: {n} batteries 🔋',
      'intro.daily': '📅 DAILY CHALLENGE', 'intro.daily.ghost': '  ·  👻 to beat: {score}',
      'intro.challenge': '🎯 {name}\'s challenge — beat: {score}',
      'intro.enemy.alert': '⚠️ ALERT', 'intro.enemy.title': 'THE SNAKATOR APPEARS!',
      'intro.enemy.sub': 'Dodge the red snake… or bite it while shielded 🛡️',
      'intro.boss': '👹 BOSS', 'intro.hydra': '🐉 HYDRA',
      'intro.boss.sub': 'Bite it while shielded 🛡️ to defeat it!', 'intro.hydra.sub': 'Sever its {n} heads while shielded 🛡️!',
      'intro.race': '🏁 RACE', 'intro.race.sub1': 'The GLUTTON steals your batteries!',
      'intro.race.sub2': 'Each theft pushes the goal back — bite it while shielded 🛡️',
      'intro.chrono': '⏱ TIME ATTACK', 'intro.chrono.sub': '{mins} {unit} — max score!',
      'intro.chrono.sub2': 'Time flies, the snake speeds up… hang on 🔋',
      'intro.versus': '👥 DUEL', 'intro.versus.sub': 'First to {n} batteries wins!',
      'intro.versus.sub2': '🔵 P1: arrows   ·   🔴 P2: W A S D',
      'banner.surcharge': '⚡ OVERCHARGE', 'banner.record': '🏆 RECORD BEATEN!',
      'event.gold': '💰 GOLD RUSH — coins ×{n}!', 'event.blackout': '🌑 BLACKOUT!', 'event.rain': '🎁 POWER-UP RAIN!',
      'tuto.move': '⬆️ Steer to the battery: arrows, WASD or swipe', 'tuto.border': '🌀 Dash into an edge: you come out the other side!',
      'challenge.banner': '🎯 {name}\'s challenge — beat <b>{score}</b>!',
      'mission.toast': '🎯 MISSION ✓  +{n} ⚡',
    },
    es: {
      'home.tagline': 'Recarga la ciudad. Atrapa las baterías. ⚡',
      'btn.play': 'JUGAR', 'challenge.play': '🎯 ACEPTAR EL RETO',
      'btn.daily': '📅 RETO DIARIO', 'btn.chrono': '⏱️ CONTRARRELOJ — 2 MIN', 'btn.versus': '👥 2 JUGADORES — DUELO',
      'home.record': '🏆 Récord:',
      'howto.1': '🔋 Atrapa baterías para alargar tu cable USB-C',
      'howto.2': '🌀 Cruza los bordes: ¡sales por el otro lado!',
      'howto.3': '🎯 Alcanza el objetivo para terminar el nivel',
      'howto.4': '⚠️ Evita los obstáculos… y tu propio cable',
      'btn.lab': '🔬 Laboratorio', 'btn.quests': '🏆 Misiones', 'btn.skins': '🎨 Skins',
      'btn.stats': '📊 Estadís.', 'btn.options': '⚙️ Opciones',
      'home.controls': 'Flechas · WASD · Deslizar · D-pad',
      'audio.sound': 'Sonido', 'audio.music': '🎵 Música:', 'word.on': 'Sí', 'word.off': 'No',
      'board.week': '📅 TOP DE LA SEMANA', 'lb.empty': '¡Sé el primero del ranking!',
      'lb.rank': 'Tu puesto: #{n}', 'lb.offline': '📡 sin conexión — se sincroniza al reconectar',
      'lab.title': '🔬 LABORATORIO',
      'lab.intro': 'Gasta tus baterías y puntos para investigar mejoras permanentes.',
      'lab.reset': 'Reiniciar el Laboratorio', 'lab.reset.confirm': '⚠️ Confirmar reinicio',
      'lab.researching': 'investigando…', 'lab.ready': '✓ Listo', 'lab.claim': 'RECOGER',
      'lab.next': 'Siguiente: ', 'lab.max': ' (máx)', 'lab.busy': 'Lab ocupado', 'lab.research': 'Investigar',
      'btn.back': 'VOLVER',
      'quests.title': '🏆 MISIONES', 'quests.intro': 'Sube los 5 niveles de cada misión: Bronce → Diamante.',
      'quests.done': 'Completada ✦ ', 'quests.toward': 'Hacia {medal}: {value} / {next}',
      'ach.tier': '¡NIVEL ALCANZADO!',
      'stats.title': '📊 ESTADÍSTICAS', 'stats.intro': 'Tus récords y totales en esta terminal.',
      'stats.games': 'Partidas jugadas', 'stats.bat': 'Baterías (total)', 'stats.bonus': 'Power-ups (total)',
      'stats.best': 'Mejor puntuación', 'stats.level': 'Nivel máx.', 'stats.combo': 'Combo máx.',
      'stats.survive': 'Mejor supervivencia', 'stats.lab': 'Aportado al Lab', 'stats.walls': 'Muros rotos',
      'stats.snak': 'Snakator destruido', 'stats.quests': 'Misiones (★)',
      'skins.title': '🎨 SKINS Y TIENDA',
      'skins.intro': 'Desbloquea skins con estrellas de misiones, o cómpralas con tus monedas.',
      'skins.sec.snakeColors': '🐍 Serpiente — Colores', 'skins.sec.snakeHeads': '🐍 Serpiente — Cabezas',
      'skins.sec.trails': '✨ Serpiente — Estelas', 'skins.sec.enemyColors': '👹 Enemigos y Jefes — Colores',
      'skins.sec.enemyHeads': '👹 Enemigos y Jefes — Cabezas',
      'skins.equipped': '✓ Equipado', 'skins.choose': 'Elegir', 'skins.locked': '🔒 {n} ★ necesarias',
      'options.title': '⚙️ OPCIONES',
      'options.intro': 'Confort visual — útil en terminales de bar (sol, visión de los colores).',
      'options.cb': '👁️ Modo daltónico', 'options.cb.desc': 'El rojo de peligro se vuelve naranja (más distinto del verde).',
      'options.contrast': '🔆 Alto contraste', 'options.contrast.desc': 'Fondo más oscuro y rejilla más visible.',
      'options.lang': '🌍 Idioma', 'options.lang.desc': 'Elige el idioma del juego.',
      'pause.title': 'PAUSA', 'btn.resume': 'CONTINUAR', 'btn.restart': 'REINICIAR', 'btn.menu': 'MENÚ',
      'over.name': 'Alias', 'over.name.ph': 'Tu alias',
      'tab.daily': '☀️ Día', 'tab.weekly': '📅 Semana', 'tab.global': '🌍 Global', 'tab.chrono': '⏱ Tiempo',
      'over.perso': '🏅 Tu récord:',
      'cta.title': '⚡ ¿Sin batería? Sin problema.',
      'cta.sub': 'Una estación <b>Cryptotem</b> te espera en tu bar, cine, bolera o club favorito. Recarga en segundos.',
      'cta.qr': '📲 Escanea para encontrar una estación',
      'btn.retry': 'JUGAR DE NUEVO', 'btn.defi': '📲 Retar a un amigo',
      'defi.cap': '📲 Haz que un amigo escanee este QR: mismo tablero, ¡tu puntuación a batir!',
      'btn.next': 'NIVEL SIGUIENTE ▸',
      'over.title.dead': 'BATERÍA AGOTADA', 'over.title.timeup': '⏱️ ¡TIEMPO AGOTADO!',
      'over.title.win1': '🏆 ¡GANA EL JUGADOR 1!', 'over.title.win2': '🏆 ¡GANA EL JUGADOR 2!', 'over.title.draw': '🤝 ¡EMPATE!',
      'over.title.cwon': '🎉 ¡RETO SUPERADO!', 'over.title.clost': '😤 RETO FALLADO',
      'over.versus': 'Puntuación final — 🔵 J1 <b>{a}</b>  ·  🔴 J2 <b>{b}</b>',
      'over.level': 'Nivel alcanzado: ', 'over.batteries': 'Baterías entregadas: ', 'over.score': 'Puntuación: ',
      'over.record': ' &nbsp;🏆 <b>¡Nuevo récord!</b>',
      'over.recap': '⏱ {dur} &nbsp;·&nbsp; ⚡ {n} {pu} &nbsp;·&nbsp; 🔥 combo ×{combo}',
      'over.newghost': ' &nbsp;·&nbsp; 👻 <b>¡Nuevo fantasma del día!</b>',
      'over.missions': '🎯 Misiones {done}/{total}: ',
      'over.challenge': '🎯 Reto de <b>{name}</b> ({score}): ', 'over.challenge.won': '✅ <b>¡superado!</b>', 'over.challenge.lost': '❌ fallado',
      'over.labgain': '🔬 +{bat} 🔋 +{pts} ⚡ al Lab <small>(total {b} 🔋 · {p} ⚡)</small>',
      'word.powerup': 'power-up', 'word.powerups': 'power-ups', 'word.minute': 'minuto', 'word.minutes': 'minutos',
      'hud.level': 'NIVEL', 'hud.duel': '👥 DUELO', 'hud.chrono': '⏱ TIEMPO',
      'intro.objective': 'Objetivo: {n} baterías 🔋',
      'intro.daily': '📅 RETO DIARIO', 'intro.daily.ghost': '  ·  👻 a batir: {score}',
      'intro.challenge': '🎯 Reto de {name} — a batir: {score}',
      'intro.enemy.alert': '⚠️ ALERTA', 'intro.enemy.title': '¡APARECE EL SNAKATOR!',
      'intro.enemy.sub': 'Esquiva la serpiente roja… o muérdela con escudo 🛡️',
      'intro.boss': '👹 JEFE', 'intro.hydra': '🐉 HIDRA',
      'intro.boss.sub': '¡Muérdelo con escudo 🛡️ para vencerlo!', 'intro.hydra.sub': '¡Corta sus {n} cabezas con escudo 🛡️!',
      'intro.race': '🏁 CARRERA', 'intro.race.sub1': '¡El GLOTÓN roba tus baterías!',
      'intro.race.sub2': 'Cada robo aleja el objetivo — muérdelo con escudo 🛡️',
      'intro.chrono': '⏱ CONTRARRELOJ', 'intro.chrono.sub': '{mins} {unit} — ¡puntuación máxima!',
      'intro.chrono.sub2': 'El tiempo vuela, la serpiente acelera… ¡aguanta! 🔋',
      'intro.versus': '👥 DUELO', 'intro.versus.sub': '¡El primero en {n} baterías gana!',
      'intro.versus.sub2': '🔵 J1: flechas   ·   🔴 J2: W A S D',
      'banner.surcharge': '⚡ SOBRECARGA', 'banner.record': '🏆 ¡RÉCORD BATIDO!',
      'event.gold': '💰 FIEBRE DEL ORO — monedas ×{n}!', 'event.blackout': '🌑 ¡APAGÓN!', 'event.rain': '🎁 ¡LLUVIA DE POWER-UPS!',
      'tuto.move': '⬆️ Dirige hacia la batería: flechas, WASD o deslizar', 'tuto.border': '🌀 Lánzate a un borde: ¡sales por el otro lado!',
      'challenge.banner': '🎯 Reto de <b>{name}</b> — ¡bate <b>{score}</b>!',
      'mission.toast': '🎯 MISIÓN ✓  +{n} ⚡',
    },
  };

  // Catalogues traduits (repli = chaîne française du module de données).
  const MEDALS = { fr: ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant'],
    en: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
    es: ['Bronce', 'Plata', 'Oro', 'Platino', 'Diamante'] };

  const BIOME = {
    fr: { bar: 'BAR', cine: 'CINÉMA', bowling: 'BOWLING', disco: 'DISCOTHÈQUE', laser: 'LASER GAME' },
    en: { bar: 'BAR', cine: 'CINEMA', bowling: 'BOWLING', disco: 'NIGHTCLUB', laser: 'LASER GAME' },
    es: { bar: 'BAR', cine: 'CINE', bowling: 'BOLERA', disco: 'DISCOTECA', laser: 'LÁSER GAME' },
  };

  const MISSION = {
    fr: { combo5: 'Atteins un combo ×5', bat25: 'Ramasse 25 batteries', bonus5: 'Ramasse 5 power-ups', walls3: 'Brise 3 murs sous bouclier', snak4: 'Détruis 4 blocs ennemis', surv120: 'Survis 2 minutes', lvl4: 'Atteins le niveau 4' },
    en: { combo5: 'Reach a ×5 combo', bat25: 'Grab 25 batteries', bonus5: 'Grab 5 power-ups', walls3: 'Smash 3 walls while shielded', snak4: 'Destroy 4 enemy blocks', surv120: 'Survive 2 minutes', lvl4: 'Reach level 4' },
    es: { combo5: 'Consigue un combo ×5', bat25: 'Recoge 25 baterías', bonus5: 'Recoge 5 power-ups', walls3: 'Rompe 3 muros con escudo', snak4: 'Destruye 4 bloques enemigos', surv120: 'Sobrevive 2 minutos', lvl4: 'Alcanza el nivel 4' },
  };

  const QUEST = {
    fr: { batteries: 'Batteries ramassées', niveau: 'Niveau atteint', combo: 'Combo max', powerups: 'Power-ups ramassés', survie: 'Survie en une partie', score: 'Meilleur score', labo: 'Mécène du Labo', parties: 'Parties jouées', casse: 'Ralph la Casse', snakator: 'Tueur de Snakator' },
    en: { batteries: 'Batteries collected', niveau: 'Level reached', combo: 'Max combo', powerups: 'Power-ups collected', survie: 'Survival in one game', score: 'Best score', labo: 'Lab patron', parties: 'Games played', casse: 'Wall Wrecker', snakator: 'Snakator Slayer' },
    es: { batteries: 'Baterías recogidas', niveau: 'Nivel alcanzado', combo: 'Combo máx.', powerups: 'Power-ups recogidos', survie: 'Supervivencia en una partida', score: 'Mejor puntuación', labo: 'Mecenas del Lab', parties: 'Partidas jugadas', casse: 'Rompemuros', snakator: 'Cazador de Snakator' },
  };

  // Skins : noms par groupe (snake/boss/head/trail/enemyhead) → id → nom.
  const SKIN = {
    en: {
      snake: { classic: 'Classic Cyan', glace: 'Glacier', foret: 'Neon Forest', magma: 'Magma', prisme: 'Prism', or: 'Pure Gold', braise: 'Ember', abysse: 'Abyss', vapeur: 'Vaporwave' },
      boss: { classic: 'Blood Red', toxic: 'Toxic', givre: 'Frost', dore: 'Golden', ombre: 'Shadow' },
      head: { classic: 'T Logo', drole: 'Goofy', agressif: 'Aggressive', ete: 'Summer', sperm: 'Spermatozoon', ver: 'Earthworm' },
      trail: { none: 'None', etincelles: 'Sparks', bulles: 'Bubbles', flamme: 'Flames', etoiles: 'Stars' },
      enemyhead: { classic: 'Fierce', drole: 'Goofy', agressif: 'Enraged', ete: 'Holiday', sperm: 'Spermatozoon', ver: 'Earthworm' },
    },
    es: {
      snake: { classic: 'Cian clásico', glace: 'Glaciar', foret: 'Bosque neón', magma: 'Magma', prisme: 'Prisma', or: 'Oro puro', braise: 'Brasa', abysse: 'Abismo', vapeur: 'Vaporwave' },
      boss: { classic: 'Rojo sangre', toxic: 'Tóxico', givre: 'Escarcha', dore: 'Dorado', ombre: 'Sombra' },
      head: { classic: 'Logo T', drole: 'Gracioso', agressif: 'Agresivo', ete: 'Verano', sperm: 'Espermatozoide', ver: 'Lombriz' },
      trail: { none: 'Ninguna', etincelles: 'Chispas', bulles: 'Burbujas', flamme: 'Llamas', etoiles: 'Estrellas' },
      enemyhead: { classic: 'Feroz', drole: 'Gracioso', agressif: 'Enfurecido', ete: 'Vacaciones', sperm: 'Espermatozoide', ver: 'Lombriz' },
    },
  };

  // Descriptions des améliorations du Labo (EN/ES) — {v} = valeur calculée par le module.
  // Le module lab.js reste le repli FR (labDesc renvoie null en 'fr').
  const LAB_DESC = {
    en: {
      surtension: (l) => '+' + (l * 10) + '% points per battery',
      bouclier: (l) => '+' + (l * 0.5) + ' s of shield',
      surcharge: (l) => '+' + l + ' s of overcharge (slow-mo)',
      aimant: (l) => '+' + l + ' s of magnet',
      double: (l) => '+' + l + ' s of double points',
      combo: (l) => '+' + (l * 0.5) + ' s combo window',
      frequence: (l) => 'power-ups +' + l + ' frequency',
      rendement: (l) => '+' + (l * 5) + '% resources banked to the Lab',
      depart: (l) => '+' + (l * 0.5) + ' s of shield at level start',
      inflation: (l) => '+' + (l * 5) + '% coins per pickup',
      chance: (l) => (l * 5) + '% chance of ×2 (coins + battery) per pickup',
      doublecoupe: (l) => (l * 5) + '% chance to cut 2 blocks (instead of 1) with the cutter',
    },
    es: {
      surtension: (l) => '+' + (l * 10) + '% de puntos por batería',
      bouclier: (l) => '+' + (l * 0.5) + ' s de escudo',
      surcharge: (l) => '+' + l + ' s de sobrecarga (cámara lenta)',
      aimant: (l) => '+' + l + ' s de imán',
      double: (l) => '+' + l + ' s de puntos dobles',
      combo: (l) => '+' + (l * 0.5) + ' s de ventana de combo',
      frequence: (l) => 'power-ups +' + l + ' de frecuencia',
      rendement: (l) => '+' + (l * 5) + '% de recursos aportados al Lab',
      depart: (l) => '+' + (l * 0.5) + ' s de escudo al empezar el nivel',
      inflation: (l) => '+' + (l * 5) + '% de monedas por objeto',
      chance: (l) => (l * 5) + '% de probabilidad de ×2 (monedas + batería) por objeto',
      doublecoupe: (l) => (l * 5) + '% de probabilidad de cortar 2 bloques (en vez de 1) con el cortacables',
    },
  };
  const LAB_NAME = {
    en: { surtension: 'Surge', bouclier: 'Reinforced Shield', surcharge: 'Extended Overcharge', aimant: 'Long-range Magnet', double: 'Extended Double', combo: 'Easy Combo', frequence: 'Power-up R&D', rendement: 'R&D Yield', depart: 'Protected Start', inflation: 'Inflation', chance: 'Lucky Strike', doublecoupe: 'Double Cut' },
    es: { surtension: 'Sobretensión', bouclier: 'Escudo reforzado', surcharge: 'Sobrecarga prolongada', aimant: 'Imán de largo alcance', double: 'Doble prolongado', combo: 'Combo fácil', frequence: 'I+D de power-ups', rendement: 'Rendimiento I+D', depart: 'Inicio protegido', inflation: 'Inflación', chance: 'Golpe de suerte', doublecoupe: 'Doble corte' },
  };

  function detect() {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored && LANGS.indexOf(stored) >= 0) return stored;
      const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
      return LANGS.indexOf(nav) >= 0 ? nav : 'fr';
    } catch (e) { return 'fr'; }
  }
  let lang = detect();

  function sub(s, params) {
    if (!params) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
  }
  function t(key, params) {
    const d = STR[lang] || STR.fr;
    const s = (d[key] != null) ? d[key] : (STR.fr[key] != null ? STR.fr[key] : key);
    return sub(s, params);
  }

  // Catalogues : renvoie la traduction ou null (→ l'appelant garde le texte FR du module).
  function medal(i) { return (MEDALS[lang] || MEDALS.fr)[i]; }
  function biome(id) { const m = BIOME[lang] || BIOME.fr; return m[id] || null; }
  function mission(id) { const m = MISSION[lang]; return (m && m[id]) || null; }
  function quest(id) { const m = QUEST[lang]; return (m && m[id]) || null; }
  function skin(group, id) { const g = SKIN[lang]; return (g && g[group] && g[group][id]) || null; }
  function labName(key) { const m = LAB_NAME[lang]; return (m && m[key]) || null; }
  function labDesc(key, l) { const m = LAB_DESC[lang]; return (m && m[key]) ? m[key](l) : null; }

  // Traduit le HTML statique (attributs data-i18n / data-i18n-html / data-i18n-ph).
  function apply(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  }

  let onChange = function () {};
  function setLang(l) {
    if (LANGS.indexOf(l) < 0) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    apply(document);
    onChange(l);
  }

  return {
    LANGS, t, apply, medal, biome, mission, quest, skin, labName, labDesc,
    get() { return lang; }, setLang,
    setOnChange(fn) { onChange = fn || function () {}; },
  };
})();
