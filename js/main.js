/* ============================================================
   main.js — bootstrap : canvas, redimensionnement, boucle rAF,
   câblage des boutons et gestion des overlays selon l'état.
   ============================================================ */
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const game = new CT.Game(ctx);

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
  function renderStartBoard() {
    CT.Leaderboard.fetchBoards().then((b) => {
      const top = (b.weekly || []).slice(0, 3);
      startBoard.innerHTML = '<h3>📅 TOP DE LA SEMAINE</h3>';
      if (!top.length) {
        const e = document.createElement('div');
        e.className = 'sb-empty'; e.textContent = 'Sois le premier du classement !';
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
    CT.Leaderboard.fetchBoards(game.lastEntry).then((b) => {
      persoBest.textContent = b.personal;
      const list = lbScope === 'weekly' ? b.weekly : b.global;
      const rank = lbScope === 'weekly' ? b.weeklyRank : b.globalRank;
      lbList.innerHTML = '';
      if (!list.length) {
        const li = document.createElement('li');
        li.className = 'empty'; li.textContent = 'Sois le premier du classement !';
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
      lbRank.textContent = (rank > 5 && game.lastEntry && game.lastEntry.score > 0) ? 'Ton rang : #' + rank : '';
    });
  }

  function showOver() {
    overlays.over.classList.remove('hidden');
    nameInput.value = CT.Leaderboard.getName();
    setScope('weekly');
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
    onDir: (d) => game.setDir(d),
    onAction: (a) => {
      if (labScreenEl && !labScreenEl.classList.contains('hidden')) return; // Labo ouvert : on ignore les touches de jeu
      if (achScreenEl && !achScreenEl.classList.contains('hidden')) return; // Succès ouvert : idem
      if (statsScreenEl && !statsScreenEl.classList.contains('hidden')) return; // Stats ouvert : idem
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
  function begin() {
    CT.Audio.unlock();
    CT.Audio.ui();
    game.startRun();
  }
  function nextLevel() {
    CT.Audio.ui();
    game.continueLevel();
  }
  const pauseSoundBtn = document.getElementById('pauseSoundBtn');
  const pauseMusicBtn = document.getElementById('pauseMusicBtn');
  function syncAudioButtons() {
    const muted = CT.Audio.isMuted(), music = CT.Audio.isMusicOn();
    muteBtn.textContent = muted ? '🔇' : '🔊';
    pauseSoundBtn.textContent = (muted ? '🔇' : '🔊') + ' Son';
    pauseMusicBtn.textContent = '🎵 Musique : ' + (music ? 'On' : 'Off');
    const mb = document.getElementById('musicBtn');
    if (mb) mb.textContent = '🎵 Musique : ' + (music ? 'On' : 'Off');
  }
  function toggleMute() { CT.Audio.toggleMute(); syncAudioButtons(); }

  document.getElementById('playBtn').addEventListener('click', begin);
  document.getElementById('retryBtn').addEventListener('click', begin);
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
    if (el && game.level) {
      el.innerHTML = 'Niveau <b>' + game.levelNum + '</b> · Score <b>' + game.points +
        '</b> · <b>' + game.batteries + '</b>/' + game.level.needed + ' 🔋';
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

  function renderResearch() {
    const r = CT.Lab.research();
    if (!r) { labResearch.classList.add('hidden'); labResearch.innerHTML = ''; return; }
    const u = CT.Lab.UPGRADES[r.key];
    const remaining = CT.Lab.researchRemaining();
    labResearch.classList.remove('hidden');
    labResearch.innerHTML = '';
    const head = document.createElement('div'); head.className = 'lr-head';
    const nm = document.createElement('span'); nm.textContent = u.icon + ' ' + u.name + ' — recherche…';
    const tm = document.createElement('span'); tm.className = 'lr-time';
    head.append(nm, tm);
    const bar = document.createElement('div'); bar.className = 'lr-bar';
    const fill = document.createElement('i'); bar.appendChild(fill);
    labResearch.append(head, bar);
    if (CT.Lab.isReady()) {
      tm.textContent = '✓ Prêt'; fill.style.width = '100%';
      const claim = document.createElement('button'); claim.className = 'lr-claim'; claim.textContent = 'RÉCUPÉRER';
      claim.addEventListener('click', () => { CT.Audio.ui(); CT.Lab.claim(); renderLab(); });
      labResearch.appendChild(claim);
    } else {
      tm.textContent = fmtTime(remaining);
      fill.style.width = (Math.min(1, 1 - remaining / r.durationMs) * 100) + '%';
    }
  }

  function renderList() {
    labList.innerHTML = '';
    const researching = !!CT.Lab.research();
    const w = CT.Lab.wallet();
    Object.keys(CT.Lab.UPGRADES).forEach((key) => {
      const u = CT.Lab.UPGRADES[key], l = CT.Lab.level(key);
      const card = document.createElement('div'); card.className = 'lab-up';
      const top = document.createElement('div'); top.className = 'lu-top';
      const ic = document.createElement('span'); ic.className = 'lu-icon'; ic.textContent = u.icon;
      const nm = document.createElement('span'); nm.className = 'lu-name'; nm.textContent = u.name;
      const lv = document.createElement('span'); lv.className = 'lu-lvl'; lv.textContent = 'Niv ' + l + '/' + u.max;
      top.append(ic, nm, lv);
      const desc = document.createElement('div'); desc.className = 'lu-desc';
      card.append(top, desc);
      if (l >= u.max) { card.classList.add('maxed'); desc.textContent = u.desc(l) + ' (max)'; labList.appendChild(card); return; }
      desc.textContent = 'Prochain : ' + u.desc(l + 1);
      const c = u.cost(l); const afford = w.bat >= c.bat && w.pts >= c.pts;
      const cost = document.createElement('div'); cost.className = 'lu-cost ' + (afford ? 'afford' : 'poor');
      cost.textContent = (c.bat ? '🔋 ' + c.bat + '   ' : '') + '⚡ ' + c.pts;   // 🔋 masqué si coût en pièces seules
      const tm = document.createElement('div'); tm.className = 'lu-time'; tm.textContent = '⏱ ' + fmtTime(u.time(l));
      const btn = document.createElement('button');
      btn.textContent = researching ? 'Labo occupé' : 'Rechercher';
      btn.disabled = researching || !afford;
      btn.addEventListener('click', () => { if (CT.Lab.startResearch(key).ok) { CT.Audio.ui(); renderLab(); } });
      card.append(cost, tm, btn);
      labList.appendChild(card);
    });
  }

  function renderLab() { renderWallet(); renderResearch(); renderList(); }

  const labResetBtn = document.getElementById('labResetBtn');
  let resetArmed = false, resetTimer = null;
  function disarmReset() {
    resetArmed = false; if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    labResetBtn.textContent = 'Réinitialiser le Labo'; labResetBtn.classList.remove('danger-armed');
  }
  labResetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      labResetBtn.textContent = '⚠️ Confirmer la remise à zéro';
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
      nm.textContent = q.name;
      if (q.medal) {
        const b = document.createElement('span'); b.className = 'ach-medal m-' + q.tier; b.textContent = q.medal;
        nm.appendChild(b);
      }
      const ds = document.createElement('div'); ds.className = 'ach-ds';
      ds.textContent = q.done
        ? 'Complété ✦ ' + q.valueFmt
        : 'Vers ' + q.nextMedal + ' : ' + q.valueFmt + ' / ' + q.nextDesc;
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
      { ic: '🎮', label: 'Parties jouées',    val: st.games || 0 },
      { ic: '🔋', label: 'Batteries (total)',  val: st.totalBat || 0 },
      { ic: '⚡', label: 'Power-ups (total)',  val: st.totalBonus || 0 },
      { ic: '🏆', label: 'Meilleur score',     val: (st.bestScore || 0).toLocaleString('fr-FR') },
      { ic: '🗺️', label: 'Niveau max',         val: st.maxLevel || 1 },
      { ic: '🔥', label: 'Combo max',          val: '×' + (st.maxCombo || 0) },
      { ic: '⏱️', label: 'Meilleure survie',   val: fmtDuration(st.maxDurationMs) },
      { ic: '🔬', label: 'Versé au Labo',      val: (st.bankedPts || 0).toLocaleString('fr-FR') + ' ⚡' },
      { ic: '🧱', label: 'Murs brisés',        val: (st.wallsSmashed || 0).toLocaleString('fr-FR') },
      { ic: '🏅', label: 'Quêtes (★)',         val: c.unlocked + '/' + c.total },
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
    const h = document.createElement('div'); h.className = 'at-h'; h.textContent = 'PALIER ATTEINT';
    const n = document.createElement('div'); n.className = 'at-n'; n.textContent = d.name;
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
