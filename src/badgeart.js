/* ── badgeart.js : icônes SVG des badges (progress.js › PRG_BADGES), moteur repris de Mana Orbit, glyphes d'Ink Orbit ─────────────────────
   Médaillon 48 × 48 : cadre du palier (bronze, argent, or, diamant ; unique : écusson ; pas obtenu : gris) + glyphe propre au badge, en mini-langage
   (voir bdgEl). Badge à paliers : 4 calques, chaque palier ajoute le sien (bronze = le dessin, puis étincelles d'or et d'étoiles). Couleurs : css/badgeart.css. */
/** Calques ajoutés aux paliers argent, or et diamant : étincelles autour du dessin. */
const BDG_UP = ['as35.5 14 1.8', 'as12.5 15 1.5;as35.5 33.5 1.4', 'aS24 9.8 2;as12.5 33 1.2'];
const bdgTiers = base => [base, ...BDG_UP];
const BDG_G = {
  _: 'kS24 24 9',      // id inconnu : étoile
  co_copies: bdgTiers('kr15 14 14 19 2 -8;kr19 13 14 19 2;x21 15.5h6'),
  co_distinct: bdgTiers('k24 16c-3-2-7-2.5-10-1.5v17c3-1 7-.5 10 1.5z;k24 16c3-2 7-2.5 10-1.5v17c-3-1-7-.5-10 1.5z;p24 16v17'),
  co_value: bdgTiers('kc24 24 9;pc24 24 6.2;n22.5 20.5h3l1.5 3-1.5 3h-3l-1.5-3z'),
  co_foil: bdgTiers('ks24 24 10;bs24 24 4;x19 19.5l2 2'),
  ink_amber: bdgTiers('jc24 24 5.5;p24 12v3;p24 33v3;p12 24h3;p33 24h3;p15.5 15.5l2.1 2.1;p30.4 30.4l2.1 2.1;p15.5 32.5l2.1-2.1;p30.4 17.6l2.1-2.1'),
  ink_amethyst: bdgTiers('j29 14a10 10 0 1 0 5 15a8 8 0 1 1-5-15z;bs18 19 1.6'),
  ink_emerald: bdgTiers('j14 34c0-12 8-20 20-20 0 12-8 20-20 20z;p14 34l12-12;t19 25l3 3;t23 21l3 3'),
  ink_ruby: bdgTiers('j24 12c2 5 8 8 8 14a8 8 0 0 1-16 0c0-4 3-6 4-9 1 2 2 3 3 3 0-3 0-5 1-8z;b24 36a3.5 3.5 0 0 1-3.5-3.5c0-2 1.5-3 3.5-5 2 2 3.5 3 3.5 5a3.5 3.5 0 0 1-3.5 3.5z'),
  ink_sapphire: bdgTiers('j24 11c4 6 9 11 9 16a9 9 0 0 1-18 0c0-5 5-10 9-16z;b18.5 28c2-1.5 3.5-1.5 5.5 0s3.5 1.5 5.5 0'),
  ink_steel: bdgTiers('j24 12l10 3.5v8c0 6.5-4.5 10.5-10 12.5-5.5-2-10-6-10-12.5v-8z;p24 17v13;p19 22.5h10'),
  ra_legend: bdgTiers('k13 31l-1.5-13 6.5 5 6-8 6 8 6.5-5-1.5 13z;p13.5 34.5h21;nc11.5 17.5 1.3;nc24 14.5 1.3;nc36.5 17.5 1.3'),
  ra_enchant: bdgTiers('w15 34l12-12;ks31 17 6;bc31 17 1.2'),
  ra_epic: bdgTiers('k15 15h15a3 3 0 0 1 3 3v14a3 3 0 0 0 3 3h-15a3 3 0 0 1-3-3v-14a3 3 0 0 0-3-3z;p19 20h9;p19 24h9;p19 28h6'),
  ra_iconic: 'kS24 24 10;bS24 24 4.5;as35 13 1.6',
  se_half: bdgTiers('bc24 24 10;pc24 24 10;k24 15l3 9-3 9-3-9z;n24 15l3 9h-6z;nc24 24 1.3'),
  se_full: bdgTiers('kr15 12 18 24 2;p19 12v24;f27 34v6l2-1.5 2 1.5v-6;x22 16h7'),
  se_master: 'kr15 18 18 18 2;p19 18v18;k15 18l3-8 6 5 6-5 3 8z;nc18 10 1.2;nc30 10 1.2;as24 27 2.6',
  dk_count: bdgTiers('kr13 16 12 17 1.5 -14;kr18 14 12 17 1.5;kr23 16 12 17 1.5 14'),
  dk_valid: bdgTiers('kr17 12 14 20 2;p20.5 22.5l2.5 2.5 5-5;t20 29h8'),
  dk_built: bdgTiers('kr14 13 13 18 2;kr21 17 13 18 2;p24.5 26.5l2.5 2.5 5-5'),
  tr_wish: bdgTiers('k24 34c-7-4.5-11-8.5-11-13a5.5 5.5 0 0 1 11-1.5 5.5 5.5 0 0 1 11 1.5c0 4.5-4 8.5-11 13z;bs24 22.5 3'),
  tr_spare: bdgTiers('p14 19h17l-4-4;p34 29h-17l4 4;fc24 24 2'),
  tr_share: 'p21.5 26.5l5-5;p22 20l2-2a4 4 0 0 1 6 6l-2 2;p26 28l-2 2a4 4 0 0 1-6-6l2-2',
  sc_cards: bdgTiers('k12 24q12-12 24 0q-12 12-24 0z;fc24 24 5;nc24 24 2.2;bc22.3 22.3 .9'),
  lo_games: bdgTiers('k16 12h16v2c0 5-5 7-5 10s5 5 5 10v2h-16v-2c0-5 5-7 5-10s-5-5-5-10z;p15 12h18;p15 36h18;f20 33c1-2.5 2.5-3.5 4-3.5s3 1 4 3.5z'),
  lo_wins: bdgTiers('k17 13h14v6a7 7 0 0 1-14 0z;p17 15h-3a3 3 0 0 0 3 5;p31 15h3a3 3 0 0 1-3 5;p24 26v5;k19 35h10l-1.5-4h-7z'),
  my_found: bdgTiers('kr16 12 16 24 2;p21 20a3 3 0 1 1 4 3c-1 .5-1 1.5-1 3;nc24 30 1.2'),
  my_streak: bdgTiers('kr14 15 20 19 2;p14 20h20;p19 13v4;p29 13v4;n18 24h3v3h-3z;n22.5 24h3v3h-3z;a27 24h3v3h-3z'),
  my_one: 'bc24 24 10;pc24 24 10;fc24 24 6;nc24 24 2.5;p30 18l5-5;p33 13h2v2',
  fi_days: bdgTiers('kc24 24 10;p24 17v7l5 3;nc24 24 1.2'),
  ac_cloud: 'k17 31a5 5 0 0 1 0-10 7 7 0 0 1 13-2 5 5 0 0 1 1 12z;x17 25a2.5 2.5 0 0 1 2.5-2',
  fx_install: 'k14 23l10-9 10 9v12h-20z;f21 35v-7h6v7;p12 24l12-11 12 11',
};
const BDG_K = { p: 'bq-p', k: 'bq-k', f: 'bq-f', b: 'bq-b', i: 'bq-i', n: 'bq-n', z: 'bq-z', y: 'bq-y', x: 'bq-x', t: 'bq-t', w: 'bq-w', h: 'bq-h', j: 'bq-j', a: 'bq-a', K: 'bq-k bq-u', F: 'bq-f bq-u', B: 'bq-b bq-u', J: 'bq-j bq-u' };      // lettre → classe (badgeart.css) ; majuscule : contour fin
const BDG_F = {};      // cadres déjà construits (« @ » : id du dégradé)
let BDG_N = 0;      // dégradés : un id par icône

/** Étoile à 4 branches (étincelle) ou à 5 branches, centrée en (x, y), de rayon r. */
function bdgStar(x, y, r, five) {
  const f = v => +v.toFixed(2);
  if (!five) { const q = r * 0.2; return `M${f(x)} ${f(y - r)}Q${f(x + q)} ${f(y - q)} ${f(x + r)} ${f(y)}Q${f(x + q)} ${f(y + q)} ${f(x)} ${f(y + r)}Q${f(x - q)} ${f(y + q)} ${f(x - r)} ${f(y)}Q${f(x - q)} ${f(y - q)} ${f(x)} ${f(y - r)}Z`; }
  let d = ''; for (let k = 0; k < 10; k++) { const a = (k * 36 - 90) * Math.PI / 180, s = k % 2 ? r * 0.45 : r; d += (k ? 'L' : 'M') + f(x + s * Math.cos(a)) + ' ' + f(y + s * Math.sin(a)); }
  return d + 'Z';
}
/** Un élément du mini-langage → SVG. Une lettre de style : p trait, k volume clair, f volume moyen, b fond (blanc), i plein foncé, n plein foncé sans trait,
 *  z ombre (aplat moyen), y aplat clair, x reflet, t trait fin, w trait épais, h trait de couleur, j volume de couleur, a aplat de couleur (K F B J : contour fin). Puis la forme :
 *  un chemin SVG sans son « M » ; c « cx cy r » ; e « cx cy rx ry » ; r « x y l h rayon [angle [px py]] » (tourné autour de px py, par défaut le milieu du bas) ;
 *  s étincelle, S étoile à 5 branches « x y r ». Un « _ » devant : placé derrière ce qui est déjà dessiné. */
function bdgEl(s) {
  const c = BDG_K[s[0]], sh = s[1]; if (!c || !sh) return '';
  if (!/[a-zA-Z]/.test(sh)) return `<path class="${c}" d="M${s.slice(1)}"/>`;
  const n = s.slice(2).trim().split(/[\s,]+/).map(Number);
  if (sh === 'c') return `<circle class="${c}" cx="${n[0]}" cy="${n[1]}" r="${n[2]}"/>`;
  if (sh === 'e') return `<ellipse class="${c}" cx="${n[0]}" cy="${n[1]}" rx="${n[2]}" ry="${n[3]}"/>`;
  if (sh === 'r') return `<rect class="${c}" x="${n[0]}" y="${n[1]}" width="${n[2]}" height="${n[3]}" rx="${n[4] || 0}"${n[5] ? ` transform="rotate(${n[5]} ${n[6] ?? n[0] + n[2] / 2} ${n[7] ?? n[1] + n[3]})"` : ''}/>`;
  if (sh === 's' || sh === 'S') return `<path class="${c}" d="${bdgStar(n[0], n[1], n[2], sh === 'S')}"/>`;
  return '';
}
/** Cadre du palier : o (pas obtenu), b (bronze : médaille), a (argent : bord cranté et ruban), g (or : lauriers et rivets), d (diamant : gemme facettée
 *  et étincelles), u (unique : écusson hexagonal à rivets), x (unique pas obtenu). Métal en dégradé (url(#@)), liseré intérieur, reflet. */
function bdgFrame(f) {
  if (BDG_F[f]) return BDG_F[f];
  const r1 = v => +v.toFixed(1), P = (r, a) => [r1(24 + r * Math.cos(a * Math.PI / 180)), r1(24 + r * Math.sin(a * Math.PI / 180))];
  const poly = pts => 'M' + pts.map(p => p.join(' ')).join('L') + 'Z';
  const sheen = '<path class="bq-sh" d="M8.1 16.6A17.5 17.5 0 0 1 16.6 8.1"/>';
  const medal = rim => rim + '<circle class="bq-bv" cx="24" cy="24" r="17.6"/><circle class="bq-fc" cx="24" cy="24" r="16.2"/>' + sheen;
  const disc = '<circle class="bq-rm" cx="24" cy="24" r="18.8" fill="url(#@)"/>';
  let s = '';
  if (f === 'o' || f === 'b') s = medal(disc);
  else if (f === 'a') {
    const rib = '<path class="bq-rb" d="M17.5 36.5l-4.5 10 3.8-1.4 2.7 2.9 4.3-10.2zM30.5 36.5l4.5 10-3.8-1.4-2.7 2.9-4.3-10.2z"/><path class="bq-rs" d="M15.6 41.3l4.4 1.6M32.4 41.3l-4.4 1.6"/>';
    const teeth = []; for (let i = 0; i < 64; i++) teeth.push(P(i % 2 ? 18.6 : 20, i * 5.625));
    s = rib + medal(`<path class="bq-rm" fill="url(#@)" d="${poly(teeth)}"/>`);
  } else if (f === 'g') {
    let lv = '';
    for (const m of [1, -1]) {
      const X = x => r1(m > 0 ? x : 48 - x);
      let br = ''; for (let a = 106; a <= 214; a += 6) { const [x, y] = P(21.2, a); br += (br ? 'L' : 'M') + X(x) + ' ' + y; }
      lv += `<path class="bq-br" d="${br}"/>`;
      [112, 128, 144, 160, 176, 192, 206].forEach((a, k) => {
        const [x, y] = P(21.2, a), t = a + 90 + (k === 6 ? 0 : k % 2 ? 30 : -30), rot = r1(m > 0 ? t : 180 - t);
        lv += `<path class="bq-lf" fill="url(#@)" transform="rotate(${rot} ${X(x)} ${y})" d="M${X(x)} ${y}q3-2.6 6.6 0q-3.6 2.6-6.6 0z"/>`;
      });
    }
    let rv = ''; for (let k = 0; k < 8; k++) { const [x, y] = P(17.5, k * 45 + 22.5); rv += `<circle class="bq-rv" cx="${x}" cy="${y}" r=".8"/>`; }
    s = lv + disc + rv + '<circle class="bq-fc" cx="24" cy="24" r="16.2"/>' + sheen;
  } else if (f === 'd') {
    const V = k => P(22.6, 22.5 + k * 45), I = k => P(18.4, k * 45);
    s = `<path class="bq-rm" fill="url(#@)" d="${poly([0, 1, 2, 3, 4, 5, 6, 7].map(V))}"/>`;
    for (let k = 0; k < 8; k++) s += `<path class="bq-fa" d="${poly([V(k - 1), V(k), I(k)])}"/><path class="bq-fb" d="${poly([I(k), V(k), I(k + 1)])}"/>`;
    s += '<circle class="bq-fc" cx="24" cy="24" r="16.2"/>' + sheen;
    s += `<path class="bq-sp" d="${bdgStar(41, 7, 4.6)}"/><circle class="bq-sc" cx="41" cy="7" r=".9"/><path class="bq-sp" d="${bdgStar(6.8, 41.2, 3.4)}"/><path class="bq-sp" d="${bdgStar(7.2, 7.4, 2.2)}"/>`;
  } else if (f === 'u' || f === 'x') {
    const H = r => poly([0, 1, 2, 3, 4, 5].map(k => P(r, -90 + k * 60)));
    s = `<path class="bq-rm" fill="url(#@)" d="${H(20.8)}"/><path class="bq-fc" d="${H(18.2)}"/>`;
    for (let k = 0; k < 6; k++) { const [x, y] = P(19.5, -60 + k * 60); s += `<circle class="bq-rv" cx="${x}" cy="${y}" r=".9"/>`; }
    s += '<path class="bq-sh" d="M8.6 15.2L22 7.5"/>';
  }
  return (BDG_F[f] = s);
}
/** Icône d'un badge : id de PRG_BADGES, palier -1 (pas obtenu), 0 bronze, 1 argent, 2 or, 3 diamant (badge unique : 0 = obtenu). */
function badgeSvg(id, tier) {
  const g = Object.prototype.hasOwnProperty.call(BDG_G, id) ? BDG_G[id] : BDG_G._, uniq = typeof g === 'string';
  let t = Math.floor(Number(tier)); if (!(t >= 0)) t = -1; t = Math.min(t, uniq ? 0 : 3);
  const back = [], front = [];
  for (const L of uniq ? [g] : g.slice(0, t + 1 || 1)) {
    const b = []; for (const s of L.split(';')) { if (!s) continue; if (s[0] === '_') b.push(bdgEl(s.slice(1))); else front.push(bdgEl(s)); }
    back.unshift(...b);
  }
  const cls = t < 0 ? 't-1' : uniq ? 'tu' : 't' + t, fr = uniq ? (t < 0 ? 'x' : 'u') : t < 0 ? 'o' : 'bagd'[t], gid = 'bq' + (++BDG_N).toString(36);
  return `<svg viewBox="0 0 48 48" class="bdg-svg ${cls}" aria-hidden="true"><defs><linearGradient id="${gid}" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" class="bq-s1"/><stop offset="1" class="bq-s2"/></linearGradient></defs>`
    + `<g class="bq-fr">${bdgFrame(fr).replace(/@/g, gid)}</g><g class="bq-gl" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${back.join('')}${front.join('')}</g></svg>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { badgeSvg, bdgEl, BDG_G };
