/* ============================================================
   cinematics.js — animations de fin de niveau (mode cinématique).
   Dessine sur le canvas principal. Plusieurs variantes distinctes :
   express · confetti · pulse · turbo · totem · ville · reseau · aurora · galaxie
   Timeline (s) : enter(0→0.7) · connect(0.7→1.1) · charge(1.1→2.3) · celebrate(2.3→…)
   ============================================================ */
window.CT = window.CT || {};

CT.Cinematic = function (ctx) {
  this.ctx = ctx;
  this.W = 0; this.H = 0;
  this.t = 0;
  this.variant = 'express';
  this.level = 1;
  this.particles = [];
  this._cues = {};
};

(function () {
  const U = CT.util;
  const T = CT.CONFIG.theme;
  const proto = CT.Cinematic.prototype;

  // Bornes de phases
  const P = { enterEnd: 0.7, connectEnd: 1.1, chargeEnd: 2.3, ready: 2.6 };

  /* Paramètres propres à chaque variante */
  function variantSpec(v) {
    switch (v) {
      case 'confetti': return { accent: T.amber,  title: 'SOIRÉE RECHARGÉE',  from: 'top'    };
      case 'pulse':    return { accent: T.cyan,   title: 'PULSE NÉON',        from: 'zoom'   };
      case 'turbo':    return { accent: T.glow,   title: 'SURCHARGE TURBO',   from: 'right'  };
      case 'totem':    return { accent: T.teal,   title: 'TOTEM PIXEL',       from: 'pixel'  };
      case 'ville':    return { accent: T.glow,   title: 'LA VILLE SE RECHARGE', from: 'bottom' };
      case 'reseau':   return { accent: T.violet, title: 'LE RÉSEAU S’ALLUME',   from: 'top'    };
      case 'aurora':   return { accent: T.charge, title: 'AURORE ÉNERGÉTIQUE',   from: 'zoom'   };
      case 'galaxie':  return { accent: T.cyan,   title: 'VORTEX NÉON',          from: 'zoom'   };
      case 'comete':   return { accent: T.glow,   title: 'PLUIE DE COMÈTES',     from: 'right'  };
      case 'constellation': return { accent: T.glow, title: 'CONSTELLATION D’ÉNERGIE', from: 'top' };
      case 'express':
      default:         return { accent: T.blue,   title: 'RECHARGE EXPRESS',  from: 'left'   };
    }
  }

  proto.start = function (variant, level, W, H) {
    this.variant = variant;
    this.level = level;
    this.W = W; this.H = H;
    this.t = 0;
    this.particles = [];
    this._cues = {};
    this.spec = variantSpec(variant);
  };

  proto.isReady = function () { return this.t >= P.ready; };

  proto.resize = function (W, H) { this.W = W; this.H = H; };

  proto.update = function (dt) {
    this.t += dt;
    const A = CT.Audio;

    // Repères sonores (une seule fois chacun)
    if (!this._cues.connect && this.t >= P.enterEnd) { this._cues.connect = true; A.connect(); }
    if (!this._cues.charge && this.t >= P.connectEnd) { this._cues.charge = true; A.charge(); }
    if (!this._cues.level && this.t >= P.chargeEnd) { this._cues.level = true; A.levelup(); this._spawnCelebrate(); }

    // Particules
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.g || 0) * dt;
      p.rot = (p.rot || 0) + (p.vr || 0) * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    // Émission continue pendant la célébration
    if (this.t >= P.chargeEnd && Math.random() < dt * 18) this._emitCelebrate(1);
  };

  /* ----- particules ----- */
  proto._spawnCelebrate = function () { this._emitCelebrate(46); };

  proto._emitCelebrate = function (n) {
    const W = this.W, H = this.H, acc = this.spec.accent;
    for (let i = 0; i < n; i++) {
      const v = this.variant;
      if (v === 'confetti') {
        this.particles.push({
          x: W * (0.2 + Math.random() * 0.6), y: -10,
          vx: (Math.random() - 0.5) * 80, vy: 60 + Math.random() * 120, g: 120,
          size: 6 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8,
          life: 2.4, max: 2.4, kind: 'rect',
          color: [T.amber, T.cyan, T.charge, T.danger, T.glow][(Math.random() * 5) | 0],
        });
      } else if (v === 'turbo') {
        this.particles.push({
          x: W + 10, y: H * (0.2 + Math.random() * 0.6),
          vx: -(300 + Math.random() * 500), vy: (Math.random() - 0.5) * 40, g: 0,
          size: 30 + Math.random() * 60, life: 0.6, max: 0.6, kind: 'streak', color: acc,
        });
      } else if (v === 'pulse') {
        this.particles.push({ x: W / 2, y: H * 0.46, r: 10, vr: 220, life: 1.2, max: 1.2, kind: 'ring', color: acc });
      } else if (v === 'ville') {        // étincelles qui montent depuis la ville
        this.particles.push({
          x: Math.random() * W, y: H * 0.92,
          vx: (Math.random() - 0.5) * 36, vy: -(70 + Math.random() * 150), g: 50,
          size: 3 + Math.random() * 5, rot: 0, vr: (Math.random() - 0.5) * 4,
          life: 1.7, max: 1.7, kind: 'rect',
          color: [acc, T.charge, T.glow, T.amber][(Math.random() * 4) | 0],
        });
      } else if (v === 'aurora') {       // poussière scintillante qui s'élève doucement
        this.particles.push({
          x: Math.random() * W, y: H * (0.45 + Math.random() * 0.5),
          vx: (Math.random() - 0.5) * 26, vy: -(35 + Math.random() * 80), g: -6,
          size: 2 + Math.random() * 4, rot: 0, vr: 0,
          life: 1.9, max: 1.9, kind: 'rect',
          color: [T.charge, T.cyan, T.violet, T.glow][(Math.random() * 4) | 0],
        });
      } else { // express / totem → carrés pixel (motif logo)
        const cx = W / 2, cy = H * 0.46;
        const ang = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 260;
        this.particles.push({
          x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40, g: 160,
          size: 5 + Math.random() * 9, rot: 0, vr: (Math.random() - 0.5) * 6,
          life: 1.4, max: 1.4, kind: 'rect',
          color: [acc, T.cyan, T.glow, T.charge][(Math.random() * 4) | 0],
        });
      }
    }
  };

  proto._drawParticles = function () {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const a = U.clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      if (p.kind === 'ring') {
        const rr = p.r + (p.max - p.life) * p.vr;
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.shadowColor = p.color; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.shadowColor = p.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.size, p.y); ctx.stroke();
      } else { // rect (pixel / confetti)
        ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 10;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  };

  /* ----- arrière-plans par variante ----- */
  proto._drawBackground = function () {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.t, acc = this.spec.accent;
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#06343a');
    g.addColorStop(0.5, T.bg1);
    g.addColorStop(1, T.bg0);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (this.variant === 'express') {            // éclairs
      ctx.globalAlpha = 0.16; ctx.strokeStyle = acc; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const seed = i * 1.7 + Math.floor(t * 6) * 0.5;
        ctx.beginPath();
        let x = (W * ((Math.sin(seed) + 1) / 2)); let y = 0;
        ctx.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (Math.sin(seed + s) ) * 26; y += H / 6; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    } else if (this.variant === 'turbo') {        // lignes de vitesse
      ctx.globalAlpha = 0.12; ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const y = (i / 14) * H + ((t * 600) % (H / 14));
        const len = 60 + (i % 3) * 50;
        ctx.beginPath(); ctx.moveTo(W - ((t * 900 + i * 90) % (W + 200)), y); ctx.lineTo(W - ((t * 900 + i * 90) % (W + 200)) + len, y); ctx.stroke();
      }
    } else if (this.variant === 'pulse') {        // halos concentriques
      ctx.globalAlpha = 0.10; ctx.strokeStyle = acc; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const r = ((t * 120 + i * 80) % 420);
        ctx.beginPath(); ctx.arc(W / 2, H * 0.46, r, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (this.variant === 'totem') {        // grille pixel
      ctx.globalAlpha = 0.06; ctx.fillStyle = acc;
      const s = 18;
      for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s)
        if ((Math.sin(x * 0.3 + y * 0.2 + t * 2) > 0.7)) ctx.fillRect(x, y, s - 3, s - 3);
    } else if (this.variant === 'ville') {        // skyline : les fenêtres s'allument avec la charge
      ctx.globalAlpha = 1;
      const base = H, maxBH = H * 0.20;
      // les fenêtres s'allument au rythme de la charge du téléphone (sur le thème « rechargez la ville »)
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      let x = 0, bi = 0;
      while (x < W) {
        const bw = 30 + ((bi * 37) % 26);
        const bh = maxBH * (0.4 + ((bi * 53) % 60) / 100);
        const bx = x, by = base - bh;
        ctx.fillStyle = '#03141a';
        ctx.fillRect(bx, by, bw - 4, bh);
        ctx.strokeStyle = 'rgba(43,240,216,0.10)'; ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 5, bh);
        const cols = 3, rows = Math.max(2, (bh / 16) | 0);
        for (let wy = 0; wy < rows; wy++) for (let wx = 0; wx < cols; wx++) {
          const on = (((bi * 7 + wx * 3 + wy * 5) % 10) / 10) < litFrac;
          ctx.fillStyle = on ? acc : 'rgba(255,255,255,0.05)';
          ctx.fillRect(bx + 6 + wx * (bw - 14) / cols, by + 7 + wy * 14, 4, 6);
        }
        x += bw; bi++;
      }
    } else if (this.variant === 'reseau') {       // réseau de stations : nœuds + liens s'allument avec la charge
      ctx.globalAlpha = 1;
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      const N = 10;
      const nodes = [];
      for (let i = 0; i < N; i++) {
        // positions déterministes (pas de jitter image par image)
        const nx = W * (0.10 + ((i * 67 + 13) % 80) / 100);
        const ny = H * (0.10 + ((i * 41 + 7) % 70) / 100);
        nodes.push({ x: nx, y: ny, on: ((i + 0.5) / N) <= litFrac });
      }
      // liens entre stations proches (maillage)
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d > Math.min(W, H) * 0.42) continue;
        const lit = nodes[i].on && nodes[j].on;
        ctx.globalAlpha = lit ? 0.55 : 0.16;
        ctx.strokeStyle = lit ? acc : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = lit ? 2 : 1;
        ctx.shadowColor = acc; ctx.shadowBlur = lit ? 8 : 0;
        ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // stations (nœuds Cryptotem)
      for (const nd of nodes) {
        const s = nd.on ? 9 : 6;
        ctx.globalAlpha = nd.on ? 1 : 0.4;
        ctx.fillStyle = nd.on ? acc : 'rgba(255,255,255,0.18)';
        ctx.shadowColor = acc; ctx.shadowBlur = nd.on ? 16 : 0;
        U.rr(ctx, nd.x - s / 2, nd.y - s / 2, s, s, 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    } else if (this.variant === 'aurora') {       // aurore boréale : rideaux de lumière qui ondulent et s'intensifient avec la charge
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      // étoiles (fond) qui scintillent
      ctx.fillStyle = '#bfeef0';
      for (let i = 0; i < 36; i++) {
        const sx = ((i * 97 + 11) % 100) / 100 * W;
        const sy = ((i * 53 + 7) % 100) / 100 * H * 0.5;
        ctx.globalAlpha = 0.12 + 0.22 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.fillRect(sx, sy, 2, 2);
      }
      // rideaux additifs (couleurs néon qui défilent)
      ctx.globalCompositeOperation = 'lighter';
      const cols = [T.charge, T.cyan, T.violet, T.glow];
      for (let b = 0; b < 4; b++) {
        const col = cols[b % cols.length];
        const baseY = H * (0.14 + b * 0.10);
        const amp = H * 0.05;
        const phase = t * (0.5 + b * 0.18) + b * 1.3;
        ctx.globalAlpha = 0.08 + 0.16 * litFrac;
        const grad = ctx.createLinearGradient(0, baseY - amp - H * 0.12, 0, baseY + H * 0.16);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.45, col);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 14) {
          const y = baseY + Math.sin(x * 0.012 + phase) * amp + Math.sin(x * 0.031 - phase * 1.7) * amp * 0.45;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    } else if (this.variant === 'galaxie') {      // vortex d'énergie : spirale qui tourne et s'étend avec la charge
      ctx.globalAlpha = 1;
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      const cx = W / 2, cy = H * 0.46;
      const arms = 2, perArm = 64;
      ctx.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < arms; arm++) {
        for (let k = 0; k < perArm; k++) {
          const frac = k / perArm;
          const ang = frac * 6.0 + arm * Math.PI + t * (1.0 + litFrac * 1.6);   // spirale qui tourne
          const rad = frac * Math.min(W, H) * 0.5 * (0.22 + 0.78 * litFrac);     // s'étend avec la charge
          const x = cx + Math.cos(ang) * rad;
          const y = cy + Math.sin(ang) * rad * 0.72;                            // léger aplatissement
          ctx.globalAlpha = (1 - frac) * (0.22 + 0.55 * litFrac);
          const s = 2 + (1 - frac) * 3.5;
          ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 8;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    } else if (this.variant === 'comete') {      // comètes : traînées lumineuses qui filent, densité ↑ avec la charge
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      // étoiles de fond qui scintillent
      ctx.fillStyle = '#bfeef0';
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 73 + 17) % 100) / 100 * W;
        const sy = ((i * 39 + 5) % 100) / 100 * H;
        ctx.globalAlpha = 0.1 + 0.24 * Math.abs(Math.sin(t * 2 + i));
        ctx.fillRect(sx, sy, 2, 2);
      }
      // comètes additives qui filent (haut-droite → bas-gauche), de plus en plus nombreuses
      ctx.globalCompositeOperation = 'lighter';
      const N = 8;
      for (let i = 0; i < N; i++) {
        const speed = 0.32 + (i % 3) * 0.12;
        const prog = (t * speed + i / N) % 1;                  // 0→1 le long de la diagonale
        const x = W * (1.18 - prog * 1.36);
        const y = H * (-0.18 + prog * 1.36) + ((i * 53) % 46) - 23;
        const len = 56 + (i % 4) * 28;
        // les comètes « tardives » n'apparaissent qu'à mesure que la charge monte
        const active = (i / N) <= litFrac + 0.25;
        ctx.globalAlpha = (active ? 1 : 0.25) * (0.22 + 0.55 * litFrac);
        const grad = ctx.createLinearGradient(x, y, x + len, y - len);
        grad.addColorStop(0, acc); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = grad; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.shadowColor = acc; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len); ctx.stroke();
        ctx.fillStyle = acc;                                   // tête de la comète
        ctx.beginPath(); ctx.arc(x, y, 2.4 + 1.6 * litFrac, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    } else if (this.variant === 'constellation') {  // constellation : un éclair d'étoiles s'illumine étoile par étoile avec la charge
      const litFrac = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
      // étoiles de fond scintillantes (positions déterministes)
      ctx.fillStyle = '#bfeef0';
      for (let i = 0; i < 34; i++) {
        const sx = ((i * 83 + 13) % 100) / 100 * W;
        const sy = ((i * 47 + 9) % 100) / 100 * H;
        ctx.globalAlpha = 0.10 + 0.22 * Math.abs(Math.sin(t * 1.7 + i));
        ctx.fillRect(sx, sy, 2, 2);
      }
      // éclair-constellation (large zigzag descendant, motif énergie Cryptotem ; débordant du
      // premier plan pour rester visible autour du téléphone/power bank)
      const shape = [[0.66, 0.10], [0.34, 0.34], [0.62, 0.42], [0.28, 0.62], [0.60, 0.70], [0.26, 0.90]];
      const pts = shape.map((p) => [p[0] * W, p[1] * H]);
      const litN = litFrac * (pts.length - 1);   // nb de segments allumés (tracé progressif)
      ctx.lineCap = 'round';
      for (let i = 0; i < pts.length - 1; i++) {
        const lit = i < litN;
        ctx.globalAlpha = lit ? 0.6 : 0.14;
        ctx.strokeStyle = lit ? acc : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = lit ? 2.4 : 1;
        ctx.shadowColor = acc; ctx.shadowBlur = lit ? 12 : 0;
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      // étoiles (nœuds) : dot + rayons en croix pour les allumées
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0], y = pts[i][1];
        const lit = (i / (pts.length - 1)) <= litFrac + 0.001;
        const tw = 0.85 + 0.3 * Math.abs(Math.sin(t * 3 + i * 1.3));   // scintillement
        ctx.globalAlpha = lit ? 1 : 0.4;
        ctx.fillStyle = lit ? acc : 'rgba(255,255,255,0.3)';
        ctx.shadowColor = acc; ctx.shadowBlur = lit ? 16 : 0;
        const s = (lit ? 4.5 : 2.5) * tw;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
        if (lit) {
          ctx.strokeStyle = acc; ctx.lineWidth = 1.2;
          const ray = s * 2.4;
          ctx.beginPath();
          ctx.moveTo(x - ray, y); ctx.lineTo(x + ray, y);
          ctx.moveTo(x, y - ray); ctx.lineTo(x, y + ray);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
    ctx.restore();
  };

  /* ----- téléphone ----- */
  proto._drawPhone = function (cx, cy, h, pct, glow) {
    const ctx = this.ctx, acc = this.spec.accent;
    const w = h * 0.5, r = h * 0.10;
    ctx.save();
    // corps
    ctx.shadowColor = glow ? acc : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = glow ? 40 * glow : 18;
    ctx.fillStyle = '#0b1418';
    U.rr(ctx, cx - w / 2, cy - h / 2, w, h, r); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    U.rr(ctx, cx - w / 2, cy - h / 2, w, h, r); ctx.stroke();

    // écran
    const sx = cx - w / 2 + w * 0.08, sy = cy - h / 2 + h * 0.07;
    const sw = w * 0.84, sh = h * 0.86;
    const screen = ctx.createLinearGradient(0, sy, 0, sy + sh);
    const lit = U.clamp(pct / 100, 0, 1);
    screen.addColorStop(0, `rgba(${glow ? '20,60,64' : '8,20,22'},1)`);
    screen.addColorStop(1, '#06181c');
    ctx.fillStyle = screen;
    U.rr(ctx, sx, sy, sw, sh, r * 0.7); ctx.fill();

    // remplissage de charge (de bas en haut)
    const fillH = sh * lit;
    const fg = ctx.createLinearGradient(0, sy + sh - fillH, 0, sy + sh);
    const low = pct < 25;
    fg.addColorStop(0, low ? T.danger : T.charge);
    fg.addColorStop(1, low ? '#7a1f2a' : acc);
    ctx.save();
    U.rr(ctx, sx, sy, sw, sh, r * 0.7); ctx.clip();
    ctx.fillStyle = fg; ctx.globalAlpha = 0.9;
    ctx.fillRect(sx, sy + sh - fillH, sw, fillH);
    ctx.restore();

    // éclair + pourcentage
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.95;
    ctx.font = `800 ${Math.round(h * 0.14)}px ${ '-apple-system, system-ui, sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct) + '%', cx, cy - h * 0.04);
    ctx.font = `${Math.round(h * 0.16)}px sans-serif`;
    ctx.fillText('⚡', cx, cy + h * 0.16);
    ctx.restore();
  };

  /* ----- power bank Cryptotem ----- */
  proto._drawPowerBank = function (cx, cy, h, alpha, scale) {
    const ctx = this.ctx, acc = this.spec.accent;
    const w = h * 0.62; const r = h * 0.16;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(cx, cy); ctx.scale(scale || 1, scale || 1);
    // corps
    ctx.shadowColor = acc; ctx.shadowBlur = 26;
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#0e1a1e'); body.addColorStop(1, '#1b2a2f');
    ctx.fillStyle = body;
    U.rr(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = acc; ctx.globalAlpha *= 0.6;
    U.rr(ctx, -w / 2, -h / 2, w, h, r); ctx.stroke();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    // « T » lumineux
    ctx.fillStyle = T.cyan; ctx.shadowColor = T.cyan; ctx.shadowBlur = 16;
    const tw = w * 0.5, tt = h * 0.1;
    ctx.fillRect(-tw / 2, -h * 0.22, tw, tt);                 // barre du T
    ctx.fillRect(-tt / 2, -h * 0.22, tt, h * 0.4);            // pied du T
    ctx.shadowBlur = 0;
    // LED de charge
    ctx.fillStyle = T.charge;
    for (let i = 0; i < 3; i++) ctx.fillRect(-w * 0.18 + i * w * 0.16, h * 0.28, w * 0.10, h * 0.04);
    ctx.restore();
  };

  /* ----- câble USB-C reliant power bank → téléphone ----- */
  proto._drawCable = function (x0, y0, x1, y1, frac) {
    const ctx = this.ctx, acc = this.spec.accent;
    const mx = (x0 + x1) / 2;
    // point courant le long d'une courbe quadratique
    const ex = U.lerp(x0, x1, frac), ey = U.lerp(y0, y1, frac);
    ctx.save();
    ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.strokeStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, Math.max(y0, y1) + 40, ex, ey);
    ctx.stroke();
    // embout USB-C
    ctx.fillStyle = '#cfe9ea';
    U.rr(ctx, ex - 7, ey - 5, 14, 10, 3); ctx.fill();
    ctx.restore();
  };

  /* ----- texte de fin ----- */
  proto._drawTitle = function () {
    const ctx = this.ctx, W = this.W, H = this.H;
    const a = U.clamp((this.t - P.chargeEnd) / 0.4, 0, 1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = T.text; ctx.shadowColor = this.spec.accent; ctx.shadowBlur = 24;
    ctx.font = `900 ${Math.round(Math.min(W, H) * 0.085)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText('NIVEAU ' + this.level + ' TERMINÉ', W / 2, H * 0.16);
    ctx.shadowBlur = 12; ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = this.spec.accent;
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.038)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(this.spec.title, W / 2, H * 0.16 + Math.min(W, H) * 0.075);
    ctx.restore();
  };

  /* ----- rendu principal ----- */
  proto.draw = function () {
    const ctx = this.ctx, W = this.W, H = this.H, t = this.t;
    const scale = Math.min(W, H);
    const ph = scale * 0.36;
    const phoneX = W / 2 + ph * 0.18, phoneY = H * 0.46;
    const dockX = W / 2 - ph * 0.62, dockY = H * 0.62;

    this._drawBackground();

    // pourcentage de charge
    const chargeT = U.clamp((t - P.connectEnd) / (P.chargeEnd - P.connectEnd), 0, 1);
    const pct = U.lerp(11, 100, U.easeInOut(chargeT));
    const glow = U.clamp((t - P.connectEnd) / 0.4, 0, 1) * (0.6 + 0.4 * Math.sin(t * 6));

    // ports de connexion
    const pbPortX = dockX + ph * 0.34, pbPortY = dockY - ph * 0.30;
    const phonePortX = phoneX, phonePortY = phoneY + ph * 0.5;

    // câble (apparaît pendant connect, reste ensuite)
    if (t >= P.enterEnd) {
      const cf = U.clamp((t - P.enterEnd) / (P.connectEnd - P.enterEnd), 0, 1);
      this._drawCable(pbPortX, pbPortY, phonePortX, phonePortY, U.ease(cf));
    }

    // téléphone (apparaît dès le début)
    const phoneIn = U.clamp(t / 0.4, 0, 1);
    ctx.save(); ctx.globalAlpha = phoneIn;
    this._drawPhone(phoneX, phoneY, ph, t < P.connectEnd ? 11 : pct, glow);
    ctx.restore();

    // power bank — entrée selon la variante
    const e = U.ease(U.clamp(t / P.enterEnd, 0, 1));
    let pbx = dockX, pby = dockY, alpha = 1, sc = 1;
    switch (this.spec.from) {
      case 'left':  pbx = U.lerp(-ph, dockX, e); break;
      case 'right': pbx = U.lerp(W + ph, dockX, e); break;
      case 'bottom': pby = U.lerp(H + ph, dockY, e); break;
      case 'top':   pby = U.lerp(-ph, dockY, e) + (e >= 1 ? Math.sin(t * 14) * 4 * Math.max(0, 1 - (t - P.enterEnd) * 3) : 0); break;
      case 'zoom':  sc = U.lerp(0.2, 1, e); alpha = e; break;
      case 'pixel': alpha = e; sc = U.lerp(0.85, 1, e); break;
    }
    this._drawPowerBank(pbx, pby, ph * 0.9, alpha, sc);

    // particules + titre
    this._drawParticles();
    this._drawTitle();
  };
})();
