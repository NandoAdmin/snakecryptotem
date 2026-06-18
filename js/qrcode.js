/* ============================================================
   qrcode.js — générateur de QR code AUTONOME (zéro dépendance).
   Mode octet (UTF-8), niveau de correction d'erreur M, versions 1→10
   (largement suffisant pour une URL). Sert la « charge publicitaire »
   Cryptotem sur l'écran de fin → scanner pour trouver une borne.

   API navigateur :  CT.QR.generate(text) → { size, modules, version, mask }
                     CT.QR.render(canvas, text, opts)
   Partagé Node (test) : module.exports (cf. vérif round-trip jsQR).

   Algorithme standard (Reed-Solomon GF(256), masquage, BCH format/version),
   vérifié par DÉCODAGE réel (jsQR) → QR garanti scannable. NE PAS « optimiser »
   sans relancer la vérif de décodage.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;            // Node
  if (typeof window !== 'undefined') { window.CT = window.CT || {}; window.CT.QR = api; } // navigateur
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- GF(256), primitif 0x11D (polynôme QR) ---- */
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* Polynôme générateur Reed-Solomon de degré `deg` (coeff de tête en [0]). */
  function rsGenerator(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= gmul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  /* Codewords de correction d'erreur (reste de data·x^ecLen mod générateur). */
  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const b of data) {
      const factor = b ^ res[0];
      res.shift(); res.push(0);
      if (factor !== 0) for (let i = 0; i < ecLen; i++) res[i] ^= gmul(gen[i + 1], factor);
    }
    return res;
  }

  /* ---- Tables (niveau M uniquement) ----
     EC_M[version] = [ ecCodewordsParBloc, [ [nbBlocs, dataCodewordsParBloc], ... ] ] */
  const EC_M = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]],
  };
  /* Centres des motifs d'alignement par version. */
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  function dataCount(version) { let s = 0; for (const [n, d] of EC_M[version][1]) s += n * d; return s; }

  /* Plus petite version (≤10) où le texte tient (mode octet). */
  function chooseVersion(len) {
    for (let v = 1; v <= 10; v++) {
      const ccBits = v < 10 ? 8 : 16;
      const avail = Math.floor((dataCount(v) * 8 - 4 - ccBits) / 8);
      if (len <= avail) return v;
    }
    throw new Error('Texte trop long pour un QR (version ≤ 10) : ' + len + ' octets');
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
    const out = []; // repli manuel
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    return out;
  }

  /* Suite de codewords de données (avec en-tête, terminateur et bourrage). */
  function encodeData(bytes, version) {
    const cap = dataCount(version);
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(0b0100, 4);                       // mode octet
    put(bytes.length, version < 10 ? 8 : 16); // indicateur de longueur
    for (const b of bytes) put(b, 8);
    for (let i = 0; i < 4 && bits.length < cap * 8; i++) bits.push(0); // terminateur
    while (bits.length % 8 !== 0) bits.push(0);                         // alignement octet
    const out = [];
    for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; out.push(v); }
    const pads = [0xEC, 0x11];
    for (let i = 0; out.length < cap; i++) out.push(pads[i % 2]);       // octets de bourrage
    return out;
  }

  /* Découpe en blocs, calcule l'EC, puis entrelace (data puis EC). */
  function buildCodewords(dataCW, version) {
    const [ecLen, groups] = EC_M[version];
    const blocks = []; let idx = 0;
    for (const [n, dlen] of groups) {
      for (let i = 0; i < n; i++) {
        const d = dataCW.slice(idx, idx + dlen); idx += dlen;
        blocks.push({ d, ec: rsEncode(d, ecLen) });
      }
    }
    const maxData = Math.max(...blocks.map((b) => b.d.length));
    const result = [];
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.d.length) result.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) result.push(b.ec[i]);
    return result;
  }

  /* ---- Construction de la matrice ---- */
  function newGrid(size, val) { return Array.from({ length: size }, () => new Array(size).fill(val)); }

  function drawTiming(m, fn, size) {
    for (let i = 0; i < size; i++) {
      if (!fn[6][i]) { m[6][i] = (i % 2 === 0); fn[6][i] = true; }
      if (!fn[i][6]) { m[i][6] = (i % 2 === 0); fn[i][6] = true; }
    }
  }
  function placeFinder(m, fn, r0, c0, size) {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      let dark = false;
      if (inside) {
        const border = (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const center = (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        dark = border || center;
      }
      m[r][c] = dark; fn[r][c] = true;
    }
  }
  function drawAlignment(m, fn, version, size) {
    const ap = ALIGN[version]; if (!ap.length) return;
    const last = size - 7;
    for (const r of ap) for (const c of ap) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue; // chevauche un finder
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        m[r + dr][c + dc] = dark; fn[r + dr][c + dc] = true;
      }
    }
  }
  /* Cellules occupées par l'information de format (deux copies) + module sombre.
     Copie 1 : L autour du finder haut-gauche. Copie 2 : ligne 8 (côté droit) +
     colonne 8 (bas-gauche). Vérifié cellule par cellule contre un encodeur de
     référence (cf. /tmp round-trip jsQR). */
  const FMT_C1 = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  function reserveFormat(fn, size) {
    for (const [r, c] of FMT_C1) fn[r][c] = true;
    for (let i = 0; i < 8; i++) fn[8][size - 1 - i] = true;   // copie 2 : ligne 8
    for (let i = 8; i < 15; i++) fn[size - 15 + i][8] = true; // copie 2 : colonne 8
    fn[size - 8][8] = true;                                   // module sombre
  }
  function formatBits(mask) {
    const data = (0b00 << 3) | mask;        // niveau M (0b00) + masque
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10 | rem) ^ 0x5412) & 0x7FFF;
  }
  function drawFormat(m, size, mask) {
    const bits = formatBits(mask);
    const gb = (i) => ((bits >> i) & 1) === 1;
    // Copie 1 : bit de poids fort en tête le long du chemin (gb(14 - position)).
    for (let p = 0; p < 15; p++) m[FMT_C1[p][0]][FMT_C1[p][1]] = gb(14 - p);
    // Copie 2 : bits 0-7 sur la ligne 8 (droite→gauche), bits 8-14 sur la colonne 8.
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = gb(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i][8] = gb(i);
    m[size - 8][8] = true;                  // module sombre permanent
  }
  function drawVersion(m, fn, version, size) {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      m[a][b] = bit; fn[a][b] = true;
      m[b][a] = bit; fn[b][a] = true;
    }
  }
  function placeData(m, fn, data, size) {
    let i = 0; const totalBits = data.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;            // saute la colonne de timing
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const col = right - j;
          const upward = ((right + 1) & 2) === 0;
          const row = upward ? size - 1 - vert : vert;
          if (!fn[row][col]) {
            let bit = false;
            if (i < totalBits) { bit = ((data[i >> 3] >> (7 - (i & 7))) & 1) === 1; i++; }
            m[row][col] = bit;
          }
        }
      }
    }
  }
  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
  }
  /* Pénalité standard (4 règles) → on garde le masque le moins pénalisé. */
  const PAT = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  function penalty(m, size) {
    let p = 0;
    for (let r = 0; r < size; r++) {
      let col = m[r][0], run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === col) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { col = m[r][c]; run = 1; }
      }
    }
    for (let c = 0; c < size; c++) {
      let col = m[0][c], run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === col) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { col = m[r][c]; run = 1; }
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    for (let r = 0; r < size; r++) for (let c = 0; c <= size - 11; c++)
      for (const pat of PAT) { let ok = true; for (let k = 0; k < 11; k++) if (m[r][c + k] !== pat[k]) { ok = false; break; } if (ok) p += 40; }
    for (let c = 0; c < size; c++) for (let r = 0; r <= size - 11; r++)
      for (const pat of PAT) { let ok = true; for (let k = 0; k < 11; k++) if (m[r + k][c] !== pat[k]) { ok = false; break; } if (ok) p += 40; }
    let dark = 0; for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark++;
    p += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
    return p;
  }

  /* Matrice avec motifs de fonction + données placées (NON masquée). */
  function buildBase(text) {
    const bytes = utf8(text);
    const version = chooseVersion(bytes.length);
    const size = 17 + 4 * version;
    const all = buildCodewords(encodeData(bytes, version), version);

    const m = newGrid(size, false), fn = newGrid(size, false);
    drawTiming(m, fn, size);
    placeFinder(m, fn, 0, 0, size);
    placeFinder(m, fn, 0, size - 7, size);
    placeFinder(m, fn, size - 7, 0, size);
    drawAlignment(m, fn, version, size);
    m[size - 8][8] = true; fn[size - 8][8] = true; // module sombre
    reserveFormat(fn, size);
    drawVersion(m, fn, version, size);
    placeData(m, fn, all, size);
    return { size, m, fn, version };
  }

  function generate(text) {
    const { size, m, fn, version } = buildBase(text);

    let best = 0, bestPen = Infinity, bestMatrix = null;
    for (let mask = 0; mask < 8; mask++) {
      const t = m.map((row) => row.slice());
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fn[r][c] && maskFn(mask, r, c)) t[r][c] = !t[r][c];
      drawFormat(t, size, mask);
      const pen = penalty(t, size);
      if (pen < bestPen) { bestPen = pen; best = mask; bestMatrix = t; }
    }
    return { size, modules: bestMatrix, version, mask: best };
  }

  /* Dessine le QR sur un <canvas> (fond clair + zone de silence → scannable). */
  function render(canvas, text, opts) {
    opts = opts || {};
    const quiet = opts.quiet == null ? 4 : opts.quiet;
    const darkCol = opts.dark || '#04161a';
    const lightCol = opts.light || '#ffffff';
    const { size, modules } = generate(text);
    const total = size + 2 * quiet;
    const scale = opts.scale || Math.max(2, Math.floor((opts.px || 160) / total));
    const px = total * scale;
    canvas.width = px; canvas.height = px;
    const c = canvas.getContext('2d');
    c.fillStyle = lightCol; c.fillRect(0, 0, px, px);
    c.fillStyle = darkCol;
    for (let r = 0; r < size; r++) for (let col = 0; col < size; col++)
      if (modules[r][col]) c.fillRect((col + quiet) * scale, (r + quiet) * scale, scale, scale);
    return { size, px };
  }

  return { generate, render };
});
