/* ============================================================
   main.js — bootstrap : canvas, redimensionnement, boucle rAF,
   câblage des boutons et gestion des overlays selon l'état.
   ============================================================ */
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const game = new CT.Game(ctx);

  // i18n : traduit le HTML statique dès le démarrage (langue persistée / auto-détectée)
  const t = (k, p) => (CT.i18n ? CT.i18n.t(k, p) : k);
  if (CT.i18n) CT.i18n.apply(document);

  // Classement EN LIGNE : si un serveur est configuré, les records s'enregistrent
  // dessus (partagés entre toutes les bornes) ; sinon stockage local. Voir CONFIG.leaderboard.
  const lbCfg = CT.CONFIG.leaderboard;
  if (lbCfg && lbCfg.url) CT.Leaderboard.useRemote(lbCfg.url, lbCfg.token);

  // Overlays
  const overlays = {
    start: document.getElementById('startScreen'),
    pause: document.getElementById('pauseScreen'),
    over: document.getElementById('overScreen'),
    cine: document.getElementById('cineUi'),
  };
  const hud = document.getElementById('hud');
  const muteBtn = document.getElementById('muteBtn');
  const labScreenEl = document.getElementById('labScreen');
  const achScreenEl = document.getElementById('achScreen');

  function hideAllOverlays() {
    Object.values(overlays).forEach((o) => o && o.classList.add('hidden'));
  }

  // Mappe l'état → overlays visibles
  game.onState = function (state) {
    hideAllOverlays();
    hud.classList.toggle('hidden', state === 'start');
    if (state === 'start') { overlays.start.classList.remove('hidden'); renderStartBoard(); }
    else if (state === 'paused') { overlays.pause.classList.remove('hidden'); showPause(); }
    else if (state === 'over') showOver();
    else if (state === 'cinematic') overlays.cine.classList.remove('hidden');
  };

  /* ---------------- top de la semaine (écran d'accueil) ---------------- */
  const startBoard = document.getElementById('startBoard');
  const dailyGhostHint = document.getElementById('dailyGhostHint');
  // Pastille « recherche prête » sur le bouton Laboratoire de l'accueil : rappelle au
  // joueur qu'une recherche terminée l'attend (les recherches longues finissent hors-jeu).
  const labBtnEl = document.getElementById('labBtn');
  function updateLabReadyBadge() { if (labBtnEl) labBtnEl.classList.toggle('lab-ready', CT.Lab.isReady()); }
  setInterval(updateLabReadyBadge, 2000);   // se met à jour même si une recherche finit pendant qu'on est sur l'accueil
  function renderStartBoard() {
    updateLabReadyBadge();
    // indice du Défi du jour : fantôme à battre (meilleure course du jour sur cette borne)
    if (dailyGhostHint) {
      const g = CT.Ghost && CT.Ghost.load();
      dailyGhostHint.textContent = g ? '· 👻 ' + g.score : '';
    }
    CT.Leaderboard.fetchBoards().then((b) => {
      const top = (b.weekly || []).slice(0, 3);
      startBoard.innerHTML = '<h3>' + t('board.week') + '</h3>';
      if (!top.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty'; e.textContent = t('lb.empty');
        startBoard.appendChild(e);
        return;
      }
      top.forEach((entry, i) => {
        const row = document.createElement('div'); row.className = 'sb-row';
        const pos = document.createElement('span'); pos.className = 'sb-pos'; pos.textContent = (i + 1);
        const who = document.createElement('span'); who.className = 'sb-who'; who.textContent = entry.name || 'Joueur';
        const pts = document.createElement('span'); pts.className = 'sb-pts'; pts.textContent = entry.score;
        row.append(pos, who, pts); startBoard.appendChild(row);
      });
    });
  }

  /* ---------------- classement (écran game over) ---------------- */
  const nameInput = document.getElementById('nameInput');
  const lbList = document.getElementById('lbList');
  const lbRank = document.getElementById('lbRank');
  const persoBest = document.getElementById('persoBest');
  let lbScope = 'weekly';

  function setScope(scope) {
    lbScope = scope;
    document.querySelectorAll('.lb-tab').forEach((b) => b.classList.toggle('active', b.dataset.scope === scope));
  }

  function renderLeaderboard() {
    // attend la fin de la soumission (serveur) avant de relire les classements,
    // pour que le score qu'on vient d'envoyer y figure déjà.
    Promise.resolve(game.lastSubmit).then((sub) =>
      CT.Leaderboard.fetchBoards(game.lastEntry).then((b) => ({ b, sub }))
    ).then(({ b, sub }) => {
      persoBest.textContent = b.personal;
      const list = lbScope === 'daily' ? (b.daily || [])
        : lbScope === 'chrono' ? (b.chrono || [])
        : lbScope === 'weekly' ? b.weekly : b.global;
      const rank = lbScope === 'daily' ? (b.dailyRank || 0)
        : lbScope === 'chrono' ? (b.chronoRank || 0)
        : lbScope === 'weekly' ? b.weeklyRank : b.globalRank;
      lbList.innerHTML = '';
      if (!list.length) {
        const li = document.createElement('li');
        li.className = 'empty'; li.textContent = t('lb.empty');
        lbList.appendChild(li);
      } else {
        list.forEach((e, i) => {
          const li = document.createElement('li');
          const me = game.lastEntry && e.ts === game.lastEntry.ts && e.name === game.lastEntry.name && e.score === game.lastEntry.score;
          if (me) li.className = 'me';
          const pos = document.createElement('span'); pos.className = 'lb-pos'; pos.textContent = (i + 1);
          const who = document.createElement('span'); who.className = 'lb-who'; who.textContent = e.name || 'Joueur';
          const pts = document.createElement('span'); pts.className = 'lb-pts'; pts.textContent = e.score;
          li.append(pos, who, pts);
          lbList.appendChild(li);
        });
      }
      const rankTxt = (rank > 5 && game.lastEntry && game.lastEntry.score > 0) ? t('lb.rank', { n: rank }) : '';
      // hors-ligne : le score est enregistré localement et sera synchronisé au retour du réseau
      lbRank.textContent = (sub && sub.offline)
        ? (rankTxt ? rankTxt + ' · ' : '') + t('lb.offline')
        : rankTxt;
    });
  }

  const overTitle = document.querySelector('#overScreen .overlay-title');
  const lbBlock = document.querySelector('#overScreen .lb');
  const overStatsEl = document.getElementById('overStats');
  const defiBtn = document.getElementById('defiBtn');
  const defiBox = document.getElementById('defiBox');
  function showOver() {
    overlays.over.classList.remove('hidden');
    if (defiBox) defiBox.classList.add('hidden');   // QR replié à chaque ouverture
    if (game.versus) {
      // DUEL : pas de classement (mode non scoré) — écran de victoire
      const w = game.versusWinner;
      if (overTitle) overTitle.textContent = w === 3 ? t('over.title.draw') : (w === 1 ? t('over.title.win1') : t('over.title.win2'));
      if (overStatsEl) overStatsEl.innerHTML = t('over.versus', { a: game.batteries, b: game.score2 });
      if (lbBlock) lbBlock.classList.add('hidden');
      if (defiBtn) defiBtn.classList.add('hidden');
      return;
    }
    if (lbBlock) lbBlock.classList.remove('hidden');
    if (defiBtn) defiBtn.classList.remove('hidden');
    // titre : défi relevé/manqué · temps écoulé (chrono) · défaite classique
    if (overTitle) {
      overTitle.textContent = game.challenge ? (game.challengeWon ? t('over.title.cwon') : t('over.title.clost'))
        : game.chronoExpired ? t('over.title.timeup') : t('over.title.dead');
    }
    nameInput.value = CT.Leaderboard.getName();
    // après un Défi du jour → onglet Jour ; après un Chrono → onglet Chrono
    setScope(game.chrono ? 'chrono' : game.daily ? 'daily' : 'weekly');
    renderLeaderboard();
  }

  document.querySelectorAll('.lb-tab').forEach((btn) => {
    btn.addEventListener('click', () => { setScope(btn.dataset.scope); renderLeaderboard(); });
  });
  nameInput.addEventListener('input', () => {
    const raw = nameInput.value.trim().slice(0, 14);
    CT.Leaderboard.setName(raw);
    const label = raw || 'Joueur';
    CT.Leaderboard.relabelLast(label).then(() => {
      if (game.lastEntry) game.lastEntry.name = label;
      renderLeaderboard();
    });
  });

  /* ---------------- redimensionnement ---------------- */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reserved = 84;  // HUD + marges
    const pad = 20;
    const availW = window.innerWidth - pad * 2;
    const availH = window.innerHeight - reserved - pad;
    let size = Math.min(availW, availH, 760);
    size = Math.max(size, 260);

    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.resize(size, size);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------- entrées ---------------- */
  CT.Input.init({
    onDir: (d, p) => game.setDir(d, p),
    onAction: (a) => {
      if (labScreenEl && !labScreenEl.classList.contains('hidden')) return; // Labo ouvert : on ignore les touches de jeu
      if (achScreenEl && !achScreenEl.classList.contains('hidden')) return; // Succès ouvert : idem
      if (statsScreenEl && !statsScreenEl.classList.contains('hidden')) return; // Stats ouvert : idem
      if (skinScreenEl && !skinScreenEl.classList.contains('hidden')) return; // Skins ouvert : idem
      if (optionsScreenEl && !optionsScreenEl.classList.contains('hidden')) return; // Options ouvert : idem
      if (a === 'pause') {
        if (game.state === 'playing' || game.state === 'paused') game.togglePause();
      } else if (a === 'mute') {
        toggleMute();
      } else if (a === 'confirm') {
        if (game.state === 'start') begin();
        else if (game.state === 'over') begin();
        else if (game.state === 'cinematic' && game.cine.isReady()) nextLevel();
        else if (game.state === 'paused') game.togglePause();
      }
    },
  });

  /* ---------------- actions UI ---------------- */
  // Mode courant : 'normal' · 'daily' (Défi du jour) · 'chrono' (2 min, score max).
  // REJOUER / RECOMMENCER gardent le mode.
  let runMode = 'normal';
  function begin() {
    CT.Audio.unlock();
    CT.Audio.ui();
    game.startRun(runMode === 'daily' ? CT.util.dailySeed() : undefined, runMode);
  }
  function nextLevel() {
    CT.Audio.ui();
    game.continueLevel();
  }
  const pauseSoundBtn = document.getElementById('pauseSoundBtn');
  const pauseMusicBtn = document.getElementById('pauseMusicBtn');
  function syncAudioButtons() {
    const muted = CT.Audio.isMuted(), music = CT.Audio.isMusicOn();
    const onOff = music ? t('word.on') : t('word.off');
    muteBtn.textContent = muted ? '🔇' : '🔊';
    pauseSoundBtn.textContent = (muted ? '🔇' : '🔊') + ' ' + t('audio.sound');
    pauseMusicBtn.textContent = t('audio.music') + ' ' + onOff;
    const mb = document.getElementById('musicBtn');
    if (mb) mb.textContent = t('audio.music') + ' ' + onOff;
  }
  function toggleMute() { CT.Audio.toggleMute(); syncAudioButtons(); }

  // JOUER relève le défi d'un ami si un lien ?defi a été ouvert, sinon partie normale
  document.getElementById('playBtn').addEventListener('click', () => { runMode = game.pendingChallenge ? 'challenge' : 'normal'; begin(); });
  document.getElementById('dailyBtn').addEventListener('click', () => { runMode = 'daily'; begin(); });
  document.getElementById('chronoBtn').addEventListener('click', () => { runMode = 'chrono'; begin(); });
  document.getElementById('versusBtn').addEventListener('click', () => { runMode = 'versus'; begin(); });
  document.getElementById('retryBtn').addEventListener('click', begin);   // garde le mode courant
  document.getElementById('continueBtn').addEventListener('click', nextLevel);
  document.getElementById('resumeBtn').addEventListener('click', () => game.togglePause());
  document.getElementById('restartBtn').addEventListener('click', begin);   // pause → repartir au niveau 1
  document.getElementById('pauseBtn').addEventListener('click', () => {
    if (game.state === 'playing' || game.state === 'paused') game.togglePause();
  });
  document.getElementById('quitBtn').addEventListener('click', () => { CT.Audio.ui(); game.toMenu(); });
  document.getElementById('menuBtn').addEventListener('click', () => { CT.Audio.ui(); game.toMenu(); });
  muteBtn.addEventListener('click', toggleMute);

  // Musique d'ambiance (opt-in, persistée)
  const musicBtn = document.getElementById('musicBtn');
  musicBtn.addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.toggleMusic(); syncAudioButtons(); });

  // Écran de pause enrichi : stats de la partie + raccourcis audio
  function showPause() {
    const el = document.getElementById('pauseStats');
    if (el && game.versus) {
      el.innerHTML = t('hud.duel') + ' · 🔵 J1 <b>' + game.batteries + '</b> · 🔴 J2 <b>' + game.score2 + '</b>';
      syncAudioButtons();
      return;
    }
    if (el && game.level) {
      let obj;
      if (game.bossLevel && game.bosses && game.bosses.length) {
        const hp = game.bossesHp();
        obj = '<b>' + hp.hp + '</b>/' + hp.max + ' ❤️';
      } else if (game.chrono) {
        const rem = game.chronoEnd > 0 ? Math.max(0, Math.ceil(game.chronoEnd - game.time)) : 0;
        obj = '<b>' + rem + '</b> s ⏱';
      } else {
        obj = '<b>' + game.batteries + '</b>/' + game.level.needed + ' 🔋';
      }
      el.innerHTML = (game.chrono ? t('hud.chrono') : t('hud.level') + ' <b>' + game.levelNum + '</b>') +
        ' · ⚡ <b>' + game.points + '</b> · ' + obj;
      // missions de la partie (✅ faites / 🎯 en cours)
      if (game.missions && game.missions.length) {
        el.innerHTML += '<span class="over-missions">' +
          game.missions.map((m) => (m.done ? '✅' : '🎯') + ' ' + ((CT.i18n && CT.i18n.mission(m.id)) || m.label)).join('<br>') + '</span>';
      }
    }
    syncAudioButtons();
  }
  pauseSoundBtn.addEventListener('click', toggleMute);
  pauseMusicBtn.addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.toggleMusic(); syncAudioButtons(); });

  syncAudioButtons();

  /* ---------------- Laboratoire (R&D) ---------------- */
  const walletBat = document.getElementById('walletBat');
  const walletPts = document.getElementById('walletPts');
  const labResearch = document.getElementById('labResearch');
  const labList = document.getElementById('labList');
  let labTimer = null;

  // Durée lisible : 45s · 9min · 9min30s · 2h · 2h05 · 1j · 1j6h
  function fmtTime(ms) {
    let s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) { const m = (s / 60) | 0, ss = s % 60; return ss ? m + 'min' + (ss < 10 ? '0' : '') + ss : m + 'min'; }
    if (s < 86400) { const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0; return m ? h + 'h' + (m < 10 ? '0' : '') + m : h + 'h'; }
    const d = (s / 86400) | 0, h = ((s % 86400) / 3600) | 0; return h ? d + 'j' + h + 'h' : d + 'j';
  }

  function renderWallet() { const w = CT.Lab.wallet(); walletBat.textContent = w.bat; walletPts.textContent = w.pts; }

  // Petite célébration à la récupération d'une recherche (la récompense d'une longue attente).
  let labToastTimer = null;
  function showLabClaimToast(res) {
    const u = CT.Lab.UPGRADES[res.key]; if (!u) return;
    const nm = (CT.i18n && CT.i18n.labName(res.key)) || u.name;
    let el = document.getElementById('labToast');
    if (!el) { el = document.createElement('div'); el.id = 'labToast'; el.className = 'lab-toast'; document.body.appendChild(el); }
    el.textContent = u.icon + ' ' + nm + ' — Niv ' + res.level + ' ' + t('lab.unlocked');
    // force reflow → rejoue la transition même sur récupérations rapprochées
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    if (labToastTimer) clearTimeout(labToastTimer);
    labToastTimer = setTimeout(() => { el.classList.remove('show'); }, 2400);
  }

  function renderResearch() {
    const r = CT.Lab.research();
    if (!r) { labResearch.classList.add('hidden'); labResearch.innerHTML = ''; return; }
    const u = CT.Lab.UPGRADES[r.key];
    const remaining = CT.Lab.researchRemaining();
    labResearch.classList.remove('hidden');
    labResearch.innerHTML = '';
    const head = document.createElement('div'); head.className = 'lr-head';
    const uName = (CT.i18n && CT.i18n.labName(r.key)) || u.name;
    const nm = document.createElement('span'); nm.textContent = u.icon + ' ' + uName + ' — ' + t('lab.researching');
    const tm = document.createElement('span'); tm.className = 'lr-time';
    head.append(nm, tm);
    const bar = document.createElement('div'); bar.className = 'lr-bar';
    const fill = document.createElement('i'); bar.appendChild(fill);
    labResearch.append(head, bar);
    if (CT.Lab.isReady()) {
      tm.textContent = t('lab.ready'); fill.style.width = '100%';
      const claim = document.createElement('button'); claim.className = 'lr-claim'; claim.textContent = t('lab.claim');
      claim.addEventListener('click', () => {
        const res = CT.Lab.claim();
        if (res.ok) { try { CT.Audio.achievement(); } catch (e) {} showLabClaimToast(res); }
        else { CT.Audio.ui(); }
        renderLab();
      });
      labResearch.appendChild(claim);
    } else {
      tm.textContent = fmtTime(remaining);
      fill.style.width = (Math.min(1, 1 - remaining / r.durationMs) * 100) + '%';
      // « Terminer maintenant » : payer en ⚡ pour finir tout de suite (coût ∝ temps restant).
      const cost = CT.Lab.finishCost();
      const afford = CT.Lab.wallet().pts >= cost;
      const fin = document.createElement('button');
      fin.className = 'lr-finish' + (afford ? '' : ' poor');
      fin.textContent = t('lab.finish') + ' — ⚡ ' + cost;
      fin.disabled = !afford;
      fin.addEventListener('click', () => { if (CT.Lab.finishNow().ok) { CT.Audio.ui(); renderLab(); } });
      labResearch.appendChild(fin);
    }
    // File d'attente (démarre l'une après l'autre à la récupération) + annulation par item (remboursée).
    const q = CT.Lab.queue();
    q.forEach((item, i) => {
      const nu = CT.Lab.UPGRADES[item.key];
      const nName = (CT.i18n && CT.i18n.labName(item.key)) || nu.name;
      const row = document.createElement('div'); row.className = 'lr-next';
      const prefix = i === 0 ? '⏭ ' + t('lab.queued') + ' ' : '';   // libellé « En file : » sur la 1ʳᵉ seulement
      const lbl = document.createElement('span'); lbl.textContent = prefix + (i + 1) + '. ' + nu.icon + ' ' + nName;
      const x = document.createElement('button'); x.className = 'lr-next-x'; x.textContent = '✕'; x.title = t('lab.cancelQueue');
      x.addEventListener('click', () => { CT.Audio.ui(); CT.Lab.cancelQueued(i); renderLab(); });
      row.append(lbl, x);
      labResearch.appendChild(row);
    });
  }

  // Regroupement des améliorations en rubriques (ordre + catégories définis côté rendu →
  // module lab.js inchangé). Toute clé non listée est rendue en fin de liste (sécurité).
  const LAB_CATEGORIES = [
    { id: 'eco',    keys: ['surtension', 'inflation', 'chance', 'rendement', 'mission'] },
    { id: 'power',  keys: ['bouclier', 'surcharge', 'aimant', 'double', 'combo', 'frequence', 'doublecoupe'] },
    { id: 'survie', keys: ['depart', 'antivirus', 'phenix'] },
    { id: 'meta',   keys: ['labspeed', 'solde'] },
  ];

  function renderList() {
    labList.innerHTML = '';
    const researching = !!CT.Lab.research();
    const w = CT.Lab.wallet();
    const U = CT.Lab.UPGRADES;
    const renderCard = (key) => {
      const u = U[key], l = CT.Lab.level(key);
      const uName = (CT.i18n && CT.i18n.labName(key)) || u.name;
      const dsc = (lv2) => (CT.i18n && CT.i18n.labDesc(key, lv2)) || u.desc(lv2);
      const card = document.createElement('div'); card.className = 'lab-up';
      const top = document.createElement('div'); top.className = 'lu-top';
      const ic = document.createElement('span'); ic.className = 'lu-icon'; ic.textContent = u.icon;
      const nm = document.createElement('span'); nm.className = 'lu-name'; nm.textContent = uName;
      const lv = document.createElement('span'); lv.className = 'lu-lvl'; lv.textContent = 'Niv ' + l + '/' + u.max;
      top.append(ic, nm, lv);
      const desc = document.createElement('div'); desc.className = 'lu-desc';
      card.append(top, desc);
      if (l >= u.max) { card.classList.add('maxed'); desc.textContent = dsc(l) + t('lab.max'); labList.appendChild(card); return; }
      desc.textContent = t('lab.next') + dsc(l + 1);
      const c = CT.Lab.costOf(key, l); const afford = w.bat >= c.bat && w.pts >= c.pts;   // coût après « Soldes R&D »
      const cost = document.createElement('div'); cost.className = 'lu-cost ' + (afford ? 'afford' : 'poor');
      cost.textContent = (c.bat ? '🔋 ' + c.bat + '   ' : '') + '⚡ ' + c.pts;   // 🔋 masqué si coût en pièces seules
      const tm = document.createElement('div'); tm.className = 'lu-time'; tm.textContent = '⏱ ' + fmtTime(u.time(l));
      const btn = document.createElement('button');
      if (researching) {
        // Labo occupé → on peut réserver CETTE amélioration comme prochaine recherche (file, 1 créneau).
        const q = CT.Lab.canEnqueue(key);
        btn.textContent = q.ok ? t('lab.queue') : t('lab.busy');
        btn.disabled = !q.ok;
        btn.addEventListener('click', () => { if (CT.Lab.enqueueNext(key).ok) { CT.Audio.ui(); renderLab(); } });
      } else {
        btn.textContent = t('lab.research');
        btn.disabled = !afford;
        btn.addEventListener('click', () => { if (CT.Lab.startResearch(key).ok) { CT.Audio.ui(); renderLab(); } });
      }
      card.append(cost, tm, btn);
      labList.appendChild(card);
    };
    const seen = {};
    LAB_CATEGORIES.forEach((cat) => {
      const keys = cat.keys.filter((k) => U[k]);
      if (!keys.length) return;
      // Améliorations au max → reléguées en bas de leur rubrique (tri stable).
      keys.sort((a, b) => (CT.Lab.level(a) >= U[a].max ? 1 : 0) - (CT.Lab.level(b) >= U[b].max ? 1 : 0));
      const h = document.createElement('div'); h.className = 'lab-cat'; h.textContent = t('lab.cat.' + cat.id);
      labList.appendChild(h);
      keys.forEach((k) => { seen[k] = 1; renderCard(k); });
    });
    Object.keys(U).forEach((k) => { if (!seen[k]) renderCard(k); });   // sécurité : clés non catégorisées
  }

  function renderLab() { renderWallet(); renderResearch(); renderList(); }

  const labResetBtn = document.getElementById('labResetBtn');
  let resetArmed = false, resetTimer = null;
  function disarmReset() {
    resetArmed = false; if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    labResetBtn.textContent = t('lab.reset'); labResetBtn.classList.remove('danger-armed');
  }
  labResetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      labResetBtn.textContent = t('lab.reset.confirm');
      labResetBtn.classList.add('danger-armed');
      resetTimer = setTimeout(disarmReset, 3500);
    } else {
      disarmReset(); CT.Lab.reset(); CT.Audio.ui(); renderLab();
    }
  });

  function openLab() {
    disarmReset();
    overlays.start.classList.add('hidden');
    labScreenEl.classList.remove('hidden');
    renderLab();
    if (labTimer) clearInterval(labTimer);
    labTimer = setInterval(() => { renderWallet(); renderResearch(); }, 1000);
  }
  function closeLab() {
    labScreenEl.classList.add('hidden');
    if (labTimer) { clearInterval(labTimer); labTimer = null; }
    overlays.start.classList.remove('hidden');
    renderStartBoard();
  }
  document.getElementById('labBtn').addEventListener('click', () => { CT.Audio.unlock(); openLab(); });
  document.getElementById('labCloseBtn').addEventListener('click', () => { CT.Audio.ui(); closeLab(); });
  document.getElementById('overLabBtn').addEventListener('click', () => { CT.Audio.ui(); game.toMenu(); openLab(); });

  /* ---------------- Succès / Trophées ---------------- */
  const achListEl = document.getElementById('achList');
  const achCountEl = document.getElementById('achCount');

  function renderAch() {
    const all = CT.Achievements.all();
    const c = CT.Achievements.count();
    achCountEl.textContent = '★ ' + c.unlocked + '/' + c.total;
    achListEl.innerHTML = '';
    all.forEach((q) => {
      const row = document.createElement('div'); row.className = 'ach-row' + (q.tier === 0 ? ' locked' : '');
      const ic = document.createElement('span'); ic.className = 'ach-ic'; ic.textContent = q.icon;
      const tx = document.createElement('div'); tx.className = 'ach-tx';
      const nm = document.createElement('div'); nm.className = 'ach-nm';
      nm.textContent = (CT.i18n && CT.i18n.quest(q.id)) || q.name;
      const curMedal = q.tier > 0 && CT.i18n ? CT.i18n.medal(q.tier - 1) : q.medal;
      const nextMedal = !q.done && CT.i18n ? CT.i18n.medal(q.tier) : q.nextMedal;
      if (q.medal) {
        const b = document.createElement('span'); b.className = 'ach-medal m-' + q.tier; b.textContent = curMedal;
        nm.appendChild(b);
      }
      const ds = document.createElement('div'); ds.className = 'ach-ds';
      ds.textContent = q.done
        ? t('quests.done') + q.valueFmt
        : t('quests.toward', { medal: nextMedal, value: q.valueFmt, next: q.nextDesc });
      tx.append(nm, ds);
      const st = document.createElement('span'); st.className = 'ach-st ach-stars';
      st.textContent = '★'.repeat(q.tier) + '☆'.repeat(q.max - q.tier);
      row.append(ic, tx, st);
      achListEl.appendChild(row);
    });
  }
  function openAch() {
    overlays.start.classList.add('hidden');
    achScreenEl.classList.remove('hidden');
    renderAch();
  }
  function closeAch() {
    achScreenEl.classList.add('hidden');
    overlays.start.classList.remove('hidden');
    renderStartBoard();
  }
  document.getElementById('achBtn').addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.ui(); openAch(); });
  document.getElementById('achCloseBtn').addEventListener('click', () => { CT.Audio.ui(); closeAch(); });

  /* ---------------- Statistiques (stats cumulées) ---------------- */
  const statsScreenEl = document.getElementById('statsScreen');
  const statsGridEl = document.getElementById('statsGrid');

  function fmtDuration(ms) {
    const s = Math.floor((ms || 0) / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function renderStats() {
    const st = CT.Achievements.stats();
    const c = CT.Achievements.count();
    const cards = [
      { ic: '🎮', label: t('stats.games'),   val: st.games || 0 },
      { ic: '🔋', label: t('stats.bat'),     val: st.totalBat || 0 },
      { ic: '⚡', label: t('stats.bonus'),   val: st.totalBonus || 0 },
      { ic: '🏆', label: t('stats.best'),    val: (st.bestScore || 0).toLocaleString('fr-FR') },
      { ic: '🗺️', label: t('stats.level'),   val: st.maxLevel || 1 },
      { ic: '🔥', label: t('stats.combo'),   val: '×' + (st.maxCombo || 0) },
      { ic: '⏱️', label: t('stats.survive'), val: fmtDuration(st.maxDurationMs) },
      { ic: '🔬', label: t('stats.lab'),     val: (st.bankedPts || 0).toLocaleString('fr-FR') + ' ⚡' },
      { ic: '🧱', label: t('stats.walls'),   val: (st.wallsSmashed || 0).toLocaleString('fr-FR') },
      { ic: '🐍', label: t('stats.snak'),    val: (st.snakatorBlocks || 0).toLocaleString('fr-FR') },
      { ic: '🏅', label: t('stats.quests'),  val: c.unlocked + '/' + c.total },
    ];
    statsGridEl.innerHTML = '';
    cards.forEach((c2) => {
      const card = document.createElement('div'); card.className = 'stat-card';
      const ic = document.createElement('div'); ic.className = 'stat-ic'; ic.textContent = c2.ic;
      const val = document.createElement('div'); val.className = 'stat-val'; val.textContent = c2.val;
      const lab = document.createElement('div'); lab.className = 'stat-label'; lab.textContent = c2.label;
      card.append(ic, val, lab);
      statsGridEl.appendChild(card);
    });
  }
  function openStats() {
    overlays.start.classList.add('hidden');
    statsScreenEl.classList.remove('hidden');
    renderStats();
  }
  function closeStats() {
    statsScreenEl.classList.add('hidden');
    overlays.start.classList.remove('hidden');
    renderStartBoard();
  }
  document.getElementById('statsBtn').addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.ui(); openStats(); });
  document.getElementById('statsCloseBtn').addEventListener('click', () => { CT.Audio.ui(); closeStats(); });

  /* ---------------- Skins & Boutique (serpent + ennemis/boss) ---------------- */
  const skinScreenEl = document.getElementById('skinScreen');
  const skinListEl = document.getElementById('skinList');
  const headSkinListEl = document.getElementById('headSkinList');
  const trailListEl = document.getElementById('trailList');
  const bossSkinListEl = document.getElementById('bossSkinList');
  const enemyHeadListEl = document.getElementById('enemyHeadList');
  const skinStarsEl = document.getElementById('skinStars');
  const skinWalletEl = document.getElementById('skinWallet');

  // Rendu générique d'une grille de skins (serpent ou boss) — `mod` expose l'API commune
  // (SKINS, isUnlocked, selectedId, select, buy, preview) ; `apply` reflète le choix en jeu.
  function renderSkinGrid(container, mod, apply, group) {
    const selId = mod.selectedId();
    const coins = CT.Lab.wallet().pts;
    container.innerHTML = '';
    mod.SKINS.forEach((s) => {
      const unlocked = mod.isUnlocked(s);
      const equipped = s.id === selId;
      const priced = s.price != null && s.price > 0;
      const card = document.createElement('div');
      card.className = 'skin-card' + (equipped ? ' selected' : '') + (!unlocked ? (priced ? ' buyable' : ' locked') : '');
      const top = document.createElement('div'); top.className = 'sk-top';
      const ic = document.createElement('span'); ic.className = 'sk-ic'; ic.textContent = s.icon;
      const nm = document.createElement('span'); nm.className = 'sk-name';
      nm.textContent = (group && CT.i18n && CT.i18n.skin(group, s.id)) || s.name;
      top.append(ic, nm);
      const colors = mod.preview(s.id);
      let sw;
      if (colors && colors.length) {
        sw = document.createElement('div'); sw.className = 'sk-swatch';
        colors.forEach((hex) => { const i = document.createElement('i'); i.style.background = hex; sw.appendChild(i); });
      } else {
        sw = document.createElement('div'); sw.className = 'sk-emoji'; sw.textContent = s.icon;   // tête : aperçu en emoji
      }
      const st = document.createElement('div'); st.className = 'sk-state';
      card.append(top, sw, st);
      if (equipped) {
        st.textContent = t('skins.equipped');
      } else if (unlocked) {
        st.textContent = t('skins.choose'); st.classList.add('sk-choose');
        card.addEventListener('click', () => { if (mod.select(s.id)) { CT.Audio.ui(); apply(); renderSkins(); } });
      } else if (priced) {
        const afford = coins >= s.price;
        st.textContent = '⚡ ' + s.price; st.classList.add('sk-buy'); if (!afford) st.classList.add('poor');
        if (afford) card.addEventListener('click', () => {
          if (mod.buy(s.id)) { if (CT.Audio.bonus) CT.Audio.bonus(); mod.select(s.id); apply(); renderSkins(); }
        });
      } else {
        st.textContent = t('skins.locked', { n: s.stars });
      }
      container.appendChild(card);
    });
  }

  function renderSkins() {
    skinStarsEl.textContent = '★ ' + CT.Skins.stars();
    skinWalletEl.textContent = CT.Lab.wallet().pts;
    renderSkinGrid(skinListEl, CT.Skins, () => { if (CT.game) CT.game.palette = CT.Skins.activePalette(); }, 'snake');
    renderSkinGrid(headSkinListEl, CT.HeadSkins, () => { if (CT.game) CT.game.headStyle = CT.HeadSkins.selectedId(); }, 'head');
    renderSkinGrid(trailListEl, CT.Trails, () => { if (CT.game) CT.game.trailStyle = CT.Trails.selectedId(); }, 'trail');
    renderSkinGrid(bossSkinListEl, CT.BossSkins, () => {
      if (CT.game) CT.game.enemySkin = { main: CT.BossSkins.activeMain(), aura: CT.BossSkins.activeAura() };
    }, 'boss');
    renderSkinGrid(enemyHeadListEl, CT.EnemyHeads, () => { if (CT.game) CT.game.enemyHeadStyle = CT.EnemyHeads.selectedId(); }, 'enemyhead');
  }
  function openSkins() {
    overlays.start.classList.add('hidden');
    skinScreenEl.classList.remove('hidden');
    renderSkins();
  }
  function closeSkins() {
    skinScreenEl.classList.add('hidden');
    overlays.start.classList.remove('hidden');
    renderStartBoard();
  }
  document.getElementById('skinBtn').addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.ui(); openSkins(); });
  document.getElementById('skinCloseBtn').addEventListener('click', () => { CT.Audio.ui(); closeSkins(); });

  /* ---------------- Options (accessibilité) ---------------- */
  const optionsScreenEl = document.getElementById('optionsScreen');
  const optColorblind = document.getElementById('optColorblind');
  const optContrast = document.getElementById('optContrast');
  const langBtns = optionsScreenEl.querySelectorAll('.opt-lang');
  const diffBtns = optionsScreenEl.querySelectorAll('.opt-diff');
  function renderOptions() {
    const setBtn = (btn, on) => { btn.textContent = on ? t('word.on') : t('word.off'); btn.classList.toggle('on', on); btn.setAttribute('aria-checked', on ? 'true' : 'false'); };
    if (CT.Access) { setBtn(optColorblind, CT.Access.isColorblind()); setBtn(optContrast, CT.Access.isContrast()); }
    const cur = CT.i18n ? CT.i18n.get() : 'fr';
    langBtns.forEach((b) => b.classList.toggle('on', b.dataset.lang === cur));
    const curDiff = CT.getDifficultyId ? CT.getDifficultyId() : 'normal';
    diffBtns.forEach((b) => b.classList.toggle('on', b.dataset.diff === curDiff));
  }
  function openOptions() {
    overlays.start.classList.add('hidden');
    optionsScreenEl.classList.remove('hidden');
    renderOptions();
  }
  function closeOptions() {
    optionsScreenEl.classList.add('hidden');
    overlays.start.classList.remove('hidden');
    renderStartBoard();
  }
  optColorblind.addEventListener('click', () => { if (CT.Access) CT.Access.toggle('colorblind'); CT.Audio.ui(); renderOptions(); });
  optContrast.addEventListener('click', () => { if (CT.Access) CT.Access.toggle('contrast'); CT.Audio.ui(); renderOptions(); });
  langBtns.forEach((b) => b.addEventListener('click', () => { if (CT.i18n) CT.i18n.setLang(b.dataset.lang); CT.Audio.ui(); renderOptions(); }));
  diffBtns.forEach((b) => b.addEventListener('click', () => { if (CT.setDifficulty) CT.setDifficulty(b.dataset.diff); CT.Audio.ui(); renderOptions(); }));
  document.getElementById('optionsBtn').addEventListener('click', () => { CT.Audio.unlock(); CT.Audio.ui(); openOptions(); });
  document.getElementById('optionsCloseBtn').addEventListener('click', () => { CT.Audio.ui(); closeOptions(); });

  /* ---------------- Défi d'un ami (QR) ---------------- */
  // Génère le QR à l'écran de fin : lien vers le jeu avec la seed jouée + le score à battre.
  const defiBtnEl = document.getElementById('defiBtn');
  const defiBoxEl = document.getElementById('defiBox');
  const defiQrEl = document.getElementById('defiQr');
  if (defiBtnEl) defiBtnEl.addEventListener('click', () => {
    CT.Audio.ui();
    if (!defiBoxEl.classList.contains('hidden')) { defiBoxEl.classList.add('hidden'); return; }  // 2ᵉ clic → replie
    try {
      const base = location.origin + location.pathname;
      const name = (CT.Leaderboard.getName() || 'Joueur').slice(0, 14);
      const params = 'defi=1&s=' + (game.seed >>> 0) + '&p=' + (game.points | 0) + '&n=' + encodeURIComponent(name);
      const url = base + '?' + params;
      if (CT.QR && defiQrEl) CT.QR.render(defiQrEl, url, { px: 220, quiet: 3, dark: '#04161a' });
      defiBoxEl.classList.remove('hidden');
    } catch (e) { console.warn('QR défi indisponible', e); }
  });

  // Lien de défi ouvert (?defi=1&s=&p=&n=) → prépare la partie « relever le défi »
  const challengeBannerEl = document.getElementById('challengeBanner');
  function applyChallengeUI() {   // (ré)affiche la bannière + le libellé JOUER (traduits)
    if (!game.pendingChallenge) return;
    const c = game.pendingChallenge;
    if (challengeBannerEl) {
      challengeBannerEl.classList.remove('hidden');
      challengeBannerEl.innerHTML = t('challenge.banner', { name: String(c.name).replace(/[<>]/g, ''), score: c.score });
    }
    const pb = document.getElementById('playBtn');
    if (pb) pb.textContent = t('challenge.play');
  }
  (function readChallengeLink() {
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('defi') !== '1') return;
      const seed = parseInt(q.get('s'), 10), score = parseInt(q.get('p'), 10);
      if (!isFinite(seed)) return;
      const name = (q.get('n') || 'un ami').slice(0, 14);
      game.pendingChallenge = { seed: seed >>> 0, score: isFinite(score) ? score : 0, name };
      applyChallengeUI();
    } catch (e) {}
  })();

  // Changement de langue → retraduit le HTML (fait par i18n) puis rafraîchit l'UI dynamique
  if (CT.i18n) CT.i18n.setOnChange(function () {
    syncAudioButtons();
    game.updateHud();
    applyChallengeUI();
    if (!optionsScreenEl.classList.contains('hidden')) renderOptions();
    if (!labScreenEl.classList.contains('hidden')) renderLab();
    if (!achScreenEl.classList.contains('hidden')) renderAch();
    if (!statsScreenEl.classList.contains('hidden')) renderStats();
    if (!skinScreenEl.classList.contains('hidden')) renderSkins();
    if (!overlays.over.classList.contains('hidden')) showOver();
    if (!overlays.start.classList.contains('hidden')) renderStartBoard();
    if (!overlays.pause.classList.contains('hidden')) showPause();
  });

  // Notification de succès débloqué (file d'attente : plusieurs peuvent tomber d'un coup)
  const achToast = document.getElementById('achToast');
  let achQueue = [], achShowing = false;
  function nextAchToast() {
    if (!achQueue.length) { achShowing = false; return; }
    achShowing = true;
    const d = achQueue.shift();
    achToast.innerHTML = '';
    const ic = document.createElement('span'); ic.className = 'at-ic'; ic.textContent = d.icon;
    const tx = document.createElement('div');
    const h = document.createElement('div'); h.className = 'at-h'; h.textContent = t('ach.tier');
    const qn = (CT.i18n && CT.i18n.quest(d.id)) ? (CT.i18n.quest(d.id) + ' — ' + CT.i18n.medal(d.tier - 1)) : d.name;
    const n = document.createElement('div'); n.className = 'at-n'; n.textContent = qn;
    tx.append(h, n);
    achToast.append(ic, tx);
    void achToast.offsetWidth;          // reflow → rejoue la transition
    achToast.classList.add('show');
    try { CT.Audio.achievement(); } catch (e) {}   // jingle dédié « succès débloqué »
    setTimeout(() => {
      achToast.classList.remove('show');
      setTimeout(nextAchToast, 480);    // laisse la sortie se jouer avant le suivant
    }, 2600);
  }
  game.onAchievement = function (def) {
    achQueue.push(def);
    if (!achShowing) nextAchToast();
  };

  // Pause auto si l'onglet perd le focus
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.togglePause();
  });

  /* ---------------- retour auto au mode attract (bornes en bar) ----------------
     Si un joueur s'éloigne, l'écran revient à la démo (attract) qui attire le
     suivant — au lieu de rester figé sur game over / pause / cinématique, ou de
     boucler indéfiniment sur un niveau sans obstacle. Délai par état (ms). */
  const IDLE_MS = { over: 30000, paused: 30000, cinematic: 30000, playing: 60000 };
  let lastActivity = performance.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    document.addEventListener(ev, () => { lastActivity = performance.now(); }, { passive: true }));

  /* ---------------- boucle ---------------- */
  let last = performance.now();
  let prevState = game.state;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;     // clamp (onglet en arrière-plan)
    game.tick(dt);
    // réarme le minuteur d'inactivité à chaque changement d'état
    if (game.state !== prevState) { prevState = game.state; lastActivity = now; }
    const idleLimit = IDLE_MS[game.state];
    if (idleLimit && now - lastActivity > idleLimit) { game.toMenu(); lastActivity = now; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // QR code Cryptotem sur l'écran de fin (charge publicitaire). Rendu une fois :
  // l'URL est constante (CONFIG.cryptotemUrl, à confirmer par le client).
  try {
    const qrCanvas = document.getElementById('ctaQr');
    if (qrCanvas && CT.QR && CT.CONFIG.cryptotemUrl) {
      CT.QR.render(qrCanvas, CT.CONFIG.cryptotemUrl, { px: 264, quiet: 3, dark: '#04161a' });
    }
  } catch (e) { console.warn('QR indisponible', e); }

  // reflète la préférence son sauvegardée
  muteBtn.textContent = CT.Audio.isMuted() ? '🔇' : '🔊';

  // état initial : la démo joue toute seule derrière le menu (mode attract pour les écrans)
  game.startDemo();

  // exposé pour debug
  CT.game = game;
})();
