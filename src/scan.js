/* ── scan.js : scanner des cartes (vue Scanner) ────────────────────────────────────────────────────────────────────
   · Caméra arrière dans un cadre, gabarit d'une carte (63:88) : la carte posée dans le gabarit est lue sur l'appareil (Tesseract.js, chargé à la demande
     depuis jsDelivr, version exacte ; un seul worker gardé). Jamais de caméra au lancement : bouton « Démarrer le scan » ; elle s'arrête dès qu'on quitte la vue
     ou l'appli. Sans caméra (permission refusée, ordinateur) : une photo choisie (champ fichier).
   · Lecture : la ligne du bas à gauche (« 123/204 • FR • 7 » : numéro, langue, extension) → la carte exacte et la langue de l'exemplaire (core.js › parseFootLine).
     Illisible (bouton « Lire » seulement) : la bande du nom (« ARIEL / Sur des jambes humaines ») comparée aux noms du catalogue (nameSim ≥ 0,75).
     « Auto » : la ligne du bas est relue en boucle tant que la vue est ouverte ; une même carte lue deux fois de suite en moins de 3 s ne compte qu'une fois.
   · Mode « Ajouter » : chaque carte lue arrive dans le lot (gardé sur l'appareil : inkorbit:scanlot) ; « Ajouter N cartes à ma collection ».
     Mode « Prix rapide » : la carte lue s'ouvre en grand, rien n'est ajouté. */
const TESS = { js: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1', lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int' };
/** Proportions d'une carte Lorcana (largeur / hauteur) et zones lues, en fractions de la carte (relevées sur les images officielles 1468 × 2048). */
const CARD_RATIO = 63 / 88;
const FOOT_BOX = { x: 0.02, y: 0.925, w: 0.44, h: 0.07 };      // nom de l'illustrateur puis « 1/204 • FR • 1 », blanc sur le bord noir (marge pour une carte mal cadrée)
const NAME_BOX = { x: 0.03, y: 0.54, w: 0.66, h: 0.085 };      // nom (capitales, blanc) et version, à gauche de la force et de la volonté
const NAME_SHIFTS = [0, -0.02, 0.02, -0.035, 0.035];
const BAND_TOP = 0.931;      // haut de la bande noire du bas, en fraction de la hauteur de la carte (mesuré sur les images officielles et Lorcast)      // décalages essayés (fractions de la hauteur de la carte)
const FOOT_CHARS = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcde.-•·';
/** Liste « large » : Tesseract.js garde la liste précédente quand on lui passe une chaîne vide, il en faut toujours une. */
const ANY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿßÆæŒœ0123456789/' + "'’-.,!?&:•·«»+ ";
const SC = { el: null, stream: null, video: null, mode: 'add', auto: true, busy: false, last: null, lot: typeof load === 'function' ? load('scanlot', []) : [], worker: null, wait: null, loop: 0, msg: '', session: 0 };

/* ── Logique pure (tests/test-scan.mjs) ─────────────────────────────────────────────────────────── */
/** Gabarit de la carte dans un cadre w × h : centré, fill de la hauteur (ou de la largeur si le cadre est étroit). */
function guideRect(w, h, fill = 0.84) {
  const ch = Math.min(h * fill, (w * fill) / CARD_RATIO), cw = ch * CARD_RATIO;
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
}
/** Vidéo affichée en object-fit: cover dans un cadre cw × ch : rectangle du cadre → rectangle de l'image vidéo (vw × vh). */
function coverMap(r, cw, ch, vw, vh) {
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  return { x: (r.x - ox) / s, y: (r.y - oy) / s, w: r.w / s, h: r.h / s };
}
/** Zone d'une carte (box en fractions) dans l'image, bornée à l'image. */
function subRect(card, box, iw = Infinity, ih = Infinity) {
  const x = Math.max(0, card.x + box.x * card.w), y = Math.max(0, card.y + box.y * card.h);
  return { x, y, w: Math.max(1, Math.min(iw - x, box.w * card.w)), h: Math.max(1, Math.min(ih - y, box.h * card.h)) };
}
/** Image entière : c'est la carte si elle en a les proportions (scan, image d'un site), sinon la carte est dans le gabarit. */
const photoCard = (w, h) => (Math.abs(w / h - CARD_RATIO) < 0.02 ? { x: 0, y: 0, w, h } : guideRect(w, h));
/** Ligne du bas lue → carte du catalogue. Promos (« 18/P1 • FR • 2 ») : le groupe P1 est l'extension de la carte ; quêtes (« 1/31 • EN • Q1 »). */
function footCard(f, ix) {
  if (!f || !ix) return null;
  const set = /^[PCD]\w+$/i.test(f.of) ? f.of : f.set;
  return ix.bySetNum.get(`${String(set).toLowerCase()}-${String(f.num).toLowerCase()}`) || null;
}
/** Texte lu dans la bande du nom → meilleure carte : { card, sim }. Compare le nom complet (nom + version) et le nom seul, dans la langue des cartes et en anglais.
 *  À ressemblance égale : l'impression la plus ancienne de base (ni Enchantée, ni promo). ponytail: balaie tout le catalogue (≈ 3 600 × distance d'édition, < 50 ms). */
function bestName(text, cards) {
  const lines = String(text || '').split(/\n+/).map(normName).filter(l => l.replace(/ /g, '').length >= 3);
  if (!lines.length) return { card: null, sim: 0 };
  // La bande peut aussi attraper la ligne des classifications ou un bout d'illustration : chaque paire de lignes voisines (nom + version) et chaque ligne seule.
  const pairs = lines.slice(0, -1).map((l, i) => l + ' ' + lines[i + 1]);
  const sim1 = (t, k) => (Math.abs(t.length - k.length) > Math.max(t.length, k.length) * 0.4 ? 0 : nameSim(t, k));      // longueurs trop différentes : inutile de calculer
  let best = null, sim = 0; const byName = new Map();
  for (const c of cards) {
    const ks = c._scanK || (c._scanK = [[c.name, c.ver], [c.nameEn, c.verEn]].filter(([n]) => n).map(([n, v]) => [normName(n), v ? normName(`${n} ${v}`) : '']));
    let s = 0;
    for (const [nn, full] of ks) {
      if (full) for (const p of pairs) s = Math.max(s, sim1(p, full));
      for (const l of lines) s = Math.max(s, sim1(l, nn) * (full ? 0.9 : 1));      // nom seul : moins sûr quand la carte a une version
    }
    const fk = ks[0] ? ks[0][1] || ks[0][0] : ''; if (s > (byName.get(fk) || 0)) byName.set(fk, s);
    if (s > sim + 1e-9 || (best && Math.abs(s - sim) < 1e-9 && (c.rar >= 6) < (best.rar >= 6))) { sim = s; best = c; }
  }
  // gap : avance sur la meilleure carte d'un autre nom complet (« Elsa » seul ressemble autant à toutes les Elsa : gap 0, refusé par readCard)
  const bk = best && best._scanK[0] ? best._scanK[0][1] || best._scanK[0][0] : '';
  let second = 0; for (const [k, v] of byName) if (k !== bk && v > second) second = v;
  return { card: best, sim, gap: sim - second };
}
/** Séparateurs mal lus (« 1/204 + FR « 1 ») → « • », que parseFootLine attend. */
const footClean = t => String(t || '').replace(/[«»+©®~=]/g, ' • ').replace(/(?<=\d)V(?=\d)/g, '/')      // « 1V204 » : la barre lue V
  .replace(/(\d{1,3}[a-e]?\s*\/\s*\d{2,3})\s*[•·.\-–,*°]?\s*(?:1T|17|lT|I7|1I|\|T)\s*[•·.\-–,*°]\s*(\d{1,2})\b/g, '$1 • IT • $2')      // « IT » lu « 17 », « 1T »
  .replace(/(?<=\d)(?=(?:EN|FR|DE|IT)\b)/g, ' ');      // « 204IT » : sinon le I collé aux chiffres devient un 1 (parseFootLine)
/** Ligne du bas illisible en entier : langue, extension et chiffres collés (« 205204 », « 11204 ») lus quand même. */
function footLoose(t) {
  const m = /(\d[\d/]{0,7})\W{0,4}(?<![A-Z])(FR|EN|DE|IT)(?![A-Z])\W{0,4}(\d{1,2}|Q\d)\b/.exec(footClean(t).replace(/(?<=\d)[|lI]|[|lI](?=\d)/g, '1').replace(/V(?=\d)/g, '/'));      // « l » ou « I » collés aux chiffres : 1 ; « V204 » : /204 (jamais le I de « IT »)
  const lang = (/(?<![A-Z])(FR|EN|DE|IT)(?![A-Z])/.exec(t || '') || [])[1];
  return { lang: lang ? lang.toLowerCase() : '', set: m ? m[3] : '', digits: m ? m[1].replace(/\D/g, '') : '' };
}
/** Impression d'un nom reconnu : parmi les cartes du même nom complet, celle de l'extension lue dont le numéro ouvre les chiffres lus. */
function namePrint(card, loose, cards) {
  const k = normName(fullName(card)), same = cards.filter(c => normName(fullName(c)) === k);
  if (same.length < 2 || !loose.set) return card;
  const inSet = same.filter(c => c.set === loose.set || c.pset === loose.set);
  const byNum = inSet.filter(c => loose.digits && loose.digits.startsWith(String(c.num).replace(/\D/g, ''))).sort((a, b) => String(b.num).length - String(a.num).length);
  return byNum[0] || inSet[0] || card;
}
/** Impressions possibles d'un nom reconnu : une seule quand l'extension et le numéro lus en bas départagent, sinon toutes celles qui restent
 *  (normale et Enchantée de la même extension, numéro illisible) : l'utilisateur choisit, on ne devine pas. */
function printChoices(card, loose, cards) {
  const k = normName(fullName(card)), same = cards.filter(c => normName(fullName(c)) === k);
  if (same.length < 2) return [card];
  const inSet = loose.set ? same.filter(c => c.set === loose.set || c.pset === loose.set) : [], pool = inSet.length ? inSet : same;
  const byNum = pool.filter(c => loose.digits && loose.digits.startsWith(String(c.num).replace(/\D/g, ''))).sort((a, b) => String(b.num).length - String(a.num).length);
  return byNum.length ? [byNum[0]] : pool.slice().sort((a, b) => a.id - b.id);
}
/** Même carte lue deux fois de suite en moins de 3 s : une seule fois. */
const isDupe = (last, id, now) => !!last && last.id === id && now - last.t < 3000;
/** Ajoute au lot (même carte, finition et langue : +n), la plus récente en haut. */
function lotPush(lot, it) {
  const i = lot.findIndex(x => x.id === it.id && !!x.foil === !!it.foil && (x.lang || '') === (it.lang || ''));
  if (i >= 0) { const [x] = lot.splice(i, 1); x.n += it.n || 1; lot.unshift(x); return lot; }
  lot.unshift({ id: it.id, foil: !!it.foil, lang: it.lang || '', n: it.n || 1 });
  return lot;
}
/** Niveaux de gris, contraste étiré, texte clair sur fond sombre inversé (Tesseract lit mieux du noir sur blanc). Agit sur un tableau RGBA.
 *  force : true / false impose l'inversion (le nom est toujours écrit en blanc, même sur une illustration claire). */
function prepPixels(d, force) {
  let lo = 255, hi = 0, sum = 0; const n = d.length / 4, g = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000 | 0; g[i] = v; sum += v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const inv = force != null ? force : sum / n < 128, k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) { let v = (g[i] - lo) * k; if (inv) v = 255 - v; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  return inv;
}

/** Niveaux de gris (0 à 255) d'un tableau RGBA. */
function toGray(d) { const g = new Uint8Array(d.length / 4); for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; return g; }
/** Seuil d'Otsu d'une image en gris : celui qui sépare le mieux le texte du fond. */
function otsu(g) {
  const hist = new Float64Array(256); for (const v of g) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sb = 0, wb = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) { wb += hist[i]; if (!wb) continue; const wf = g.length - wb; if (!wf) break; sb += i * hist[i]; const mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) ** 2; if (v > best) { best = v; t = i; } }
  return t;
}
/** Inclinaison (degrés, sens horaire) des lignes d'une image en gris w × h : les pixels contrastés (bords du texte, bord de la carte) projetés le long de chaque
 *  angle ; l'angle le plus « piqué » (somme des carrés des colonnes de l'histogramme) gagne. Rapide sur une petite image (≈ 260 px de large). */
function skewAngle(g, w, h, max = 7, step = 0.5) {
  const pts = [];
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { const i = y * w + x; if (Math.abs(g[i] - g[i + 1]) + Math.abs(g[i] - g[i + w]) > 60) pts.push(x, y); }
  let best = 0, bs = -1;
  for (let a = -max; a <= max + 1e-9; a += step) {
    const t = Math.tan(a * Math.PI / 180), off = Math.ceil(w * Math.abs(t)) + 1, bins = new Float64Array(h + 2 * off + 2);
    for (let i = 0; i < pts.length; i += 2) bins[Math.round(pts[i + 1] - pts[i] * t) + off]++;
    let s = 0; for (const b of bins) s += b * b;
    if (s > bs + 1e-9 || (Math.abs(s - bs) < 1e-9 && Math.abs(a) < Math.abs(best))) { bs = s; best = a; }
  }
  return Math.round(best * 10) / 10;
}
/** Haut de la bande noire du bas de la carte (nom de l'illustrateur, « 1/204 • FR • 1 ») : première ligne, à partir de from, où au moins frac des pixels
 *  de x0 à x1 sont plus sombres que thr pendant run lignes de suite. −1 si aucune. */
function darkBand(g, w, h, x0, x1, run, thr = 90, frac = 0.5, from = 0) {
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(w, Math.round(x1)); let n = 0;
  for (let y = Math.max(0, from); y < h; y++) {
    let d = 0; for (let x = x0, i = y * w + x0; x < x1; x++, i++) if (g[i] < thr) d++;
    n = d >= frac * (x1 - x0) ? n + 1 : 0;
    if (n >= run) return y - run + 1;
  }
  return -1;
}
/** Bande noire trouvée (top) : son bas (première ligne de nouveau claire) et son bord gauche (première colonne sombre sur toute la bande) → la taille et la
 *  place de la carte. −1 quand on ne les voit pas (tapis de jeu sombre : la bande se confond avec la table). */
function bandEdges(g, w, h, x0, x1, top, run, thr = 90, frac = 0.5) {
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(w, Math.round(x1)); let end = -1;
  for (let y = top + run; y < h; y++) { let d = 0; for (let x = x0, i = y * w + x0; x < x1; x++, i++) if (g[i] < thr) d++; if (d < frac * (x1 - x0)) { end = y; break; } }
  const y1 = end > 0 ? end : Math.min(h, top + run * 2); let left = -1;
  for (let x = 0; x < w && y1 > top; x++) { let d = 0; for (let y = top; y < y1; y++) if (g[y * w + x] < thr) d++; if (d >= 0.6 * (y1 - top)) { left = x; break; } }
  return { end, left: left > 0 ? left : -1 };
}
const clipRect = (r, iw, ih) => { const x = Math.max(0, r.x), y = Math.max(0, r.y); return { x, y, w: Math.max(1, Math.min(iw, r.x + r.w) - x), h: Math.max(1, Math.min(ih, r.y + r.h) - y) }; };
/** Ligne du bas cohérente avec la carte trouvée : taille de l'extension lue proche de celle du catalogue (204…, à 4 près), langue imprimée connue. Une lecture qui a perdu
 *  ou inventé un chiffre de la taille (« 1/24 », « 1/2044 ») est refusée ; un numéro mal lu qui tombe sur une autre carte de la même extension passe encore. */
const footOk = (f, c, base) => !!c && /^(en|fr|de|it|ja|jp|zh|cn)$/.test(f.lang) && (!base || !/^\d+$/.test(f.of) || Math.abs(+f.of - base) <= 4);      // la base du catalogue compte parfois les variantes (208 pour « /204 »)

/* ── Lecture (navigateur) ─────────────────────────────────────────────────────────────────────── */
function tessLoad() {
  if (SC.wait) return SC.wait;
  SC.wait = (async () => {
    if (typeof Tesseract === 'undefined') await new Promise((ok, no) => { const s = document.createElement('script'); s.src = TESS.js; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => no(new Error('tesseract')); document.head.appendChild(s); });
    SC.worker = await Tesseract.createWorker('eng', 1, { workerPath: TESS.worker, corePath: TESS.core, langPath: TESS.lang });
    return SC.worker;
  })().catch(e => { SC.wait = null; throw e; });
  return SC.wait;
}
/** Zone r de la source, tournée de −deg degrés autour de son centre (redressement), agrandie k fois → toile. Les coins découverts : gris moyen. */
function rotCanvas(src, r, k, deg) {
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(r.w * k)); cv.height = Math.max(1, Math.round(r.h * k));
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high'; cx.fillStyle = '#808080'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.translate(cv.width / 2, cv.height / 2); cx.rotate(-deg * Math.PI / 180); cx.drawImage(src, r.x, r.y, r.w, r.h, -cv.width / 2, -cv.height / 2, cv.width, cv.height);
  return cv;
}
const canvasGray = cv => toGray(cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data);
/** Partie (x, y, w, h) d'une toile, préparée pour l'OCR : niveaux de gris, contraste, inversion (inv), noir et blanc (seuil d'Otsu) si bin. */
function prepCrop(cv, x, y, w, h, inv, bin) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.max(1, Math.min(cv.width - x, Math.round(w))); h = Math.max(1, Math.min(cv.height - y, Math.round(h)));
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  const ox = o.getContext('2d', { willReadFrequently: true }); ox.drawImage(cv, x, y, w, h, 0, 0, w, h);
  const im = ox.getImageData(0, 0, w, h); prepPixels(im.data, inv);
  if (bin) { const g = toGray(im.data), t = otsu(g); for (let i = 0; i < g.length; i++) { const v = g[i] > t ? 255 : 0; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; } }
  ox.putImageData(im, 0, 0);
  return o;
}
async function ocr(cv, psm, chars) {
  const w = await tessLoad();
  await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: chars || ANY_CHARS });
  return (await w.recognize(cv)).data.text || '';
}
/** Ligne du bas (« 1/204 • FR • 1 ») de la carte posée dans card (rectangle de src) : { card, lang, angle, text }.
 *  Fenêtre large autour du coin bas gauche attendu (la carte peut être décalée, plus petite que le gabarit), redressée (skewAngle), puis la bande noire
 *  du bas (darkBand) découpée, inversée, passée en noir et blanc et lue deux fois (sans puis avec liste de caractères). Le numéro doit être cohérent (footOk).
 *  quick : un seul angle (lecture auto, à chaque image) ; sinon l'angle estimé puis ±2,5°. */
async function readFoot(src, card, iw, ih, quick) {
  const u = Math.max(card.w, card.h), k = Math.min(3, 1600 / u);
  const win = clipRect({ x: card.x - 0.05 * u, y: card.y + card.h - 0.24 * u, w: 0.58 * u, h: 0.33 * u }, iw, ih);
  const sm = rotCanvas(src, win, Math.min(1, 260 / win.w), 0), a0 = skewAngle(canvasGray(sm), sm.width, sm.height);
  let text = '', bandY = -1, geo = null;
  for (const a of quick ? [a0] : [a0, a0 + 2.5, a0 - 2.5]) {
    const R = rotCanvas(src, win, k, a), g = canvasGray(R), W = R.width, H = R.height, uk = u * k;
    const top = darkBand(g, W, H, W * 0.2, W * 0.8, Math.round(0.018 * uk), 90, 0.5, Math.round(H * 0.2));
    if (top >= 0 && bandY < 0) {      // la bande noire dans l'image (angle négligé) : recale la carte (place, taille) pour lire son nom
      const e = bandEdges(g, W, H, W * 0.2, W * 0.8, top, Math.round(0.018 * uk)), bh = e.end > 0 ? (e.end - top) / k / (1 - BAND_TOP) : 0;
      bandY = win.y + top / k; geo = { y: bandY, h: bh > card.h * 0.6 && bh < card.h * 1.25 ? bh : card.h, x: e.left > 0 ? win.x + e.left / k : -1 };
    }
    const tries = top >= 0 ? [[0, Math.max(0, top - 0.006 * uk), W, 0.085 * uk, true, true], [0, Math.max(0, top - 0.006 * uk), W, 0.085 * uk, true, false]] : [[0, H * 0.45, W, H * 0.55, null, false]];
    for (const [x, y, w, h, inv, bin] of tries) {
      const cv = prepCrop(R, x, y, w, h, inv, bin);
      for (const wl of [ANY_CHARS, FOOT_CHARS]) {
        const t = await ocr(cv, 6, wl); text += '\n' + t;
        const f = parseFootLine(footClean(t)), c = footCard(f, CARDS.ix);
        if (c && footOk(f, c, setBase(c))) return { card: c, lang: IO_LANGS.includes(f.lang) ? f.lang : '', angle: a, text, geo };
      }
    }
  }
  return { card: null, angle: a0, text, geo };
}
/** Taille de base de l'extension d'une carte (204…) ; 0 : promo, inconnue. */
const setBase = c => { const s = CARDS.setsByCode.get(String(c.set)) || CARDS.setsByCode.get(String(c.pset)); return s && c.set === s.code ? s.base : 0; };
/** Image d'une carte posée à l'horizontale (lieu) tenue en portrait : la carte tournée d'un quart de tour (dir : 1 horaire, −1 antihoraire), en toile. */
function quarterCanvas(src, card, dir) {
  const cv = document.createElement('canvas'); cv.width = Math.round(card.h); cv.height = Math.round(card.w);
  const cx = cv.getContext('2d'); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(dir * Math.PI / 2); cx.drawImage(src, card.x, card.y, card.w, card.h, -card.w / 2, -card.h / 2, card.w, card.h);
  return cv;
}
/** Lit la carte posée dans le rectangle card de src : { card, lang, how } ou null.
 *  1. Ligne du bas (readFoot) : la ligne exacte suffit. Photo et bouton « Lire » : aussi la carte tournée d'un quart de tour (lieux, imprimés à l'horizontale).
 *  2. Sinon la bande du nom, redressée du même angle (ressemblance ≥ minSim ; 0 : pas de repli, lecture auto), sans ambiguïté entre deux cartes
 *     (bestName › gap), puis l'impression parmi celles du même nom grâce à ce qui a été lu en bas (« 205204 » → la 205, pas la 5). */
/** Bande du nom de la carte, redressée de angle, lue une fois (décalage dy en fraction de la hauteur). */
async function nameText(src, card, angle, dy = 0) {
  const R = rotCanvas(src, card, Math.min(3, 1500 / card.h), angle);
  return ocr(prepCrop(R, NAME_BOX.x * R.width, (NAME_BOX.y + dy) * R.height, NAME_BOX.w * R.width, NAME_BOX.h * R.height, true, false), 6, ANY_CHARS);
}
/** Contrôle d'une ligne du bas lue : le nom imprimé doit ressembler à celui de la carte trouvée. Un chiffre perdu ou mal lu (« 19/204 » pour « 209/204 »)
 *  tombe sur une autre carte de l'extension : le nom le dément. → la carte (celle du bas, ou celle du nom dans la même extension), ou null si rien ne colle.
 *  Nom illisible (reflet, illustration claire) : la ligne du bas fait foi. */
function footVerify(fc, text, cards) {
  if (String(text || '').replace(/[^A-Za-zÀ-ÿ]/g, '').length < 4 || bestName(text, [fc]).sim >= 0.5) return fc;
  // Le nom lu désigne-t-il franchement un autre personnage ? (le nom seul : « BUZZ L'ÉCLAIR » vaut pour toutes ses versions)
  const lines = String(text).split(/\n+/).map(normName).filter(l => l.replace(/ /g, '').length >= 3);
  let key = '', sim = 0;
  for (const c of cards) for (const n of [c.name, c.nameEn]) { if (!n) continue; const k = normName(n); for (const l of lines) { const v = nameSim(l, k); if (v > sim) { sim = v; key = k; } } }
  if (sim < 0.8) return fc;
  const same = cards.filter(c => (normName(c.name) === key || normName(c.nameEn || '') === key) && (c.set === fc.set || c.pset === fc.set));
  return same.length === 1 ? same[0] : null;      // plusieurs versions de ce personnage dans l'extension : on ne devine pas
}
/** Carte recalée sur la bande noire trouvée (geo : haut de la bande, hauteur estimée de la carte, bord gauche ou −1) : posée plus haut, plus bas,
 *  plus petite que le gabarit. Bord gauche inconnu : la carte reste centrée sur le gabarit. */
const cardOnBand = (card, geo) => { if (!geo) return card; const h = geo.h, w = h * CARD_RATIO; return { x: geo.x >= 0 ? geo.x : card.x + (card.w - w) / 2, y: geo.y - BAND_TOP * h, w, h }; };
async function readCard(src, card0, iw, ih, minSim) {
  const quick = !minSim, f = await readFoot(src, card0, iw, ih, quick), card = cardOnBand(card0, f.geo);
  if (f.card) {      // le nom confirme (ou dément) la ligne du bas ; la carte peut être décalée par rapport au gabarit : jusqu'à 3 hauteurs de bande
    let nt = '';
    for (const dy of [0, -0.035, 0.035]) { const t = await nameText(src, card, f.angle, dy); nt += '\n' + t; if (bestName(t, [f.card]).sim >= 0.5) break; }
    const c = footVerify(f.card, nt, CARDS.list); return c ? { card: c, lang: f.lang, how: c === f.card ? 'foot' : 'foot+nom' } : null;
  }
  if (quick) return null;
  let foot = f.text;
  for (const dir of [1, -1]) {
    const q = quarterCanvas(src, card0, dir), r = await readFoot(q, { x: 0, y: 0, w: q.width, h: q.height }, q.width, q.height, dir < 0);      // sens horaire (le plus courant) : tous les angles
    if (r.card && r.card.type === 3) return { card: r.card, lang: r.lang, how: 'foot' };      // seuls les lieux sont imprimés à l'horizontale
    foot += r.text;
  }
  const R = rotCanvas(src, card, Math.min(3, 1500 / card.h), f.angle), uk = R.height;
  let b = { card: null, sim: 0, gap: 0 };
  // Bande étroite (une bande plus haute attrape l'illustration et Tesseract ne lit plus rien) : décalée vers le haut puis le bas si la carte est mal cadrée.
  for (const dy of NAME_SHIFTS) {
    const cv = prepCrop(R, NAME_BOX.x * R.width, (NAME_BOX.y + dy) * uk, NAME_BOX.w * R.width, NAME_BOX.h * uk, true, false);
    const r = bestName(await ocr(cv, 6, ANY_CHARS), CARDS.list);
    if (r.sim > b.sim) b = r; if (b.sim >= 0.92 && b.gap >= 0.08) break;
  }
  if (!b.card || b.sim < minSim || b.gap < 0.06) return null;
  const loose = footLoose(foot), ch = printChoices(b.card, loose, CARDS.list);
  return ch.length === 1 ? { card: ch[0], lang: loose.lang, how: 'name' } : { card: null, choices: ch.slice(0, 6), lang: loose.lang, how: 'name' };
}
/** Lecture aboutie : la carte, ou plusieurs impressions possibles du même nom (« Quelle version ? » : l'utilisateur touche la bonne). */
function scanResult(r) {
  if (r.card) return scanHit(r);
  const el = openSheet({ title: T('Quelle version ?'), cls: 'sc-choose', html: `<p class="muted small">${esc(T('Le numéro de la carte est illisible : touche la bonne version.'))}</p><div class="grid-cards" data-pick>${r.choices.map(c => thumbHtml(c, { size: 'normal', cap: esc(setLabel(c)) + ' · ' + esc(RAR_NAMES()[c.rar]) })).join('')}</div>` });
  $('[data-pick]', el).addEventListener('click', e => { const b = e.target.closest('[data-card]'); if (!b) return; el.close(); scanHit({ card: CARDS.byId.get(+b.dataset.card), lang: r.lang, how: 'choix' }); });
  return true;
}
/** Une carte reconnue : lot (ou carte en grand en mode Prix rapide), vibration, son. */
function scanHit(r) {
  const now = Date.now(); if (isDupe(SC.last, r.card.id, now)) { SC.last.t = now; return false; }
  SC.last = { id: r.card.id, t: now };
  if (typeof haptic === 'function') haptic('success'); else try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* ignore */ }
  if (prefs().scanSound !== false) scanBeep();
  if (SC.mode === 'price') { openCard(r.card.id); return true; }
  lotPush(SC.lot, { id: r.card.id, foil: !!(r.card.foil & 2) && !(r.card.foil & 1), lang: r.lang, n: 1 });      // Enchantée, Épique… : n'existent qu'en foil
  save('scanlot', SC.lot);
  SC.session++;
  scanStatus(T('{name} lue', { name: r.card.name }));
  scanPaintLot(r.card.id);
  scanCheer(r.card);
  return true;
}
/** Retour visuel d'une carte lue : le gabarit s'illumine, la vignette part du gabarit vers le lot, étincelles (motion.js), compteur de la session. */
function scanCheer(c) {
  const el = SC.el; if (!el) return;
  const n = $('.sc-sess', el); if (n) { n.textContent = TN(SC.session, '{n} carte lue', '{n} cartes lues'); n.hidden = false; }
  const g = $('.sc-guide', el); if (g) { g.classList.remove('hit'); void g.offsetWidth; g.classList.add('hit'); }
  if (typeof motionOff === 'function' && motionOff()) return;
  const to = $('.sc-item.sc-new .card-thumb', el), from = SC.stream ? g : $('.sc-cam', el), src = cardImg(c, 'small');
  if (to && from && src) {
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), fly = document.createElement('img');
    fly.src = src; fly.alt = ''; fly.className = 'sc-fly'; Object.assign(fly.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    document.body.appendChild(fly);
    const dx = b.left - a.left, dy = b.top - a.top, k = b.width / a.width;
    fly.animate([{ transform: 'none', opacity: 0.95 }, { transform: `translate(${dx}px,${dy}px) scale(${k})`, opacity: 0.6 }], { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)' }).finished.then(() => fly.remove(), () => fly.remove());
  }
  if (typeof sparkle === 'function' && g) sparkle(g, 10);
}
let scanAudio = null;
function scanBeep() {
  try { scanAudio = scanAudio || new (window.AudioContext || window.webkitAudioContext)(); const o = scanAudio.createOscillator(), g = scanAudio.createGain();
    o.frequency.value = 1320; g.gain.setValueAtTime(0.05, scanAudio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, scanAudio.currentTime + 0.12);
    o.connect(g).connect(scanAudio.destination); o.start(); o.stop(scanAudio.currentTime + 0.13); } catch (e) { /* pas de son */ }
}

/* ── Caméra ───────────────────────────────────────────────────────────────────────────────────── */
async function camStart() {
  if (SC.stream) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { scanStatus(T('Pas de caméra ici : choisis une photo.'), true); return; }
  try {
    SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (e) { scanStatus(T('Caméra refusée ou indisponible : choisis une photo.'), true); return; }
  if (curView() !== 'scan') { camStop(); return; }      // la vue a été quittée pendant la demande d'autorisation
  SC.video.srcObject = SC.stream; await SC.video.play().catch(() => {});
  scanPaint(); scanStatus(T('Place la carte dans le cadre'));
  dataLoad().catch(() => {}); tessLoad().catch(() => scanStatus(T('Lecture indisponible (hors ligne ?)'), true));
  scanLoop();
}
function camStop() {
  clearTimeout(SC.loop); SC.loop = 0;
  if (SC.stream) { for (const t of SC.stream.getTracks()) t.stop(); SC.stream = null; }
  if (SC.video) SC.video.srcObject = null;
  if (SC.el) scanPaint();
}
/** Rectangle de la carte dans l'image vidéo (gabarit du cadre ramené aux pixels de la vidéo). */
function camCard() {
  const v = SC.video, box = v.getBoundingClientRect();
  return coverMap(guideRect(box.width, box.height), box.width, box.height, v.videoWidth, v.videoHeight);
}
async function scanOnce(withName) {
  if (withName) for (let i = 0; SC.busy && i < 50; i++) await new Promise(r => setTimeout(r, 60));      // « Lire » pendant une lecture auto : après elle
  if (SC.busy || !SC.stream || !SC.video.videoWidth) return null;
  SC.busy = true;
  try { await dataLoad(); const r = await readCard(SC.video, camCard(), SC.video.videoWidth, SC.video.videoHeight, withName ? 0.75 : 0); if (r) scanResult(r); else if (withName) scanStatus(T('Carte non reconnue : rapproche-la, évite les reflets'), true); return r; }
  catch (e) { scanStatus(T('Lecture indisponible (hors ligne ?)'), true); return null; }
  finally { SC.busy = false; }
}
function scanLoop() {
  clearTimeout(SC.loop);
  SC.loop = setTimeout(async () => {
    if (!SC.stream) return;
    if (SC.auto && !UI.stack.length && document.visibilityState === 'visible') await scanOnce(false);
    scanLoop();
  }, 450);
}
/** Une image (photo choisie, banc d'essai) → carte lue ou null. */
async function scanImage(img, minSim = 0.75) { await dataLoad(); return readCard(img, photoCard(img.width, img.height), img.width, img.height, minSim); }
/** Photo choisie : la carte entière, ou la carte dans le gabarit. */
async function scanFile(file) {
  if (!file) return;
  scanStatus(T('Lecture de la photo…'));
  let img;
  try { img = await createImageBitmap(file); } catch (e) { scanStatus(T('Image illisible'), true); return; }
  try { const r = await scanImage(img); if (r) scanResult(r); else scanStatus(T('Carte non reconnue : rapproche-la, évite les reflets'), true); }
  catch (e) { scanStatus(T('Lecture indisponible (hors ligne ?)'), true); }
  finally { img.close && img.close(); }
}

/* ── Interface ────────────────────────────────────────────────────────────────────────────────── */
function scanStatus(msg, bad) { SC.msg = msg; const s = SC.el && $('.sc-status', SC.el); if (s) { s.textContent = msg; s.classList.toggle('bad', !!bad); } }
function scanPaint() {
  const el = SC.el; if (!el) return;
  const on = !!SC.stream;
  el.classList.toggle('sc-on', on);
  $('.sc-start', el).hidden = on; $('.sc-read', el).hidden = !on; $('.sc-stop', el).hidden = !on;
  const g = $('.sc-guide', el), cam = $('.sc-cam', el);
  if (g && cam) { const b = cam.getBoundingClientRect(), r = guideRect(b.width, b.height); Object.assign(g.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
}
function scanPaintLot(flash) {
  const box = SC.el && $('.sc-lot', SC.el); if (!box) return;
  const items = SC.lot.filter(x => CARDS.byId.get(x.id)), n = items.reduce((s, x) => s + x.n, 0);
  $('.sc-lot-n', SC.el).textContent = n ? TN(n, '{n} carte', '{n} cartes') : '';
  $('.sc-add', SC.el).hidden = !n || SC.mode !== 'add';
  $('.sc-add', SC.el).textContent = TN(n, 'Ajouter {n} carte à ma collection', 'Ajouter {n} cartes à ma collection');
  $('.sc-clear', SC.el).hidden = !n;
  box.innerHTML = items.length ? items.map((x, i) => { const c = CARDS.byId.get(x.id), canF = c.foil & 2, canN = c.foil & 1 || !c.foil;
    return `<div class="row sc-item${x.id === flash && i === 0 ? ' sc-new' : ''}" data-i="${SC.lot.indexOf(x)}">
      ${thumbHtml(c, { size: 'small', foil: x.foil })}
      <div class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${esc(c.ver)}${c.ver ? ' · ' : ''}${esc(setLabel(c))}${x.lang ? ' · ' + esc(x.lang.toUpperCase()) : ''}</span>
        <span class="sc-acts">${canF && canN ? `<label class="sc-foil"><input type="checkbox" data-foil${x.foil ? ' checked' : ''}> ${esc(T('Foil'))}</label>` : ''}<button type="button" class="link" data-fix>${esc(T('Pas la bonne ?'))}</button></span></div>
      <div class="row-end"><div class="stepper"><button type="button" data-d="-1" aria-label="${esc(T('Retirer'))}"><svg class="i"><use href="#i-${x.n > 1 ? 'minus' : 'trash'}"/></svg></button><span class="n">${x.n}</span><button type="button" data-d="1" aria-label="${esc(T('Ajouter'))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>
    </div>`; }).join('')
    : `<p class="muted small sc-empty">${esc(SC.mode === 'add' ? T('Les cartes lues arrivent ici. Rien n\'est ajouté à ta collection avant de valider.') : T('Mode Prix rapide : la carte lue s\'ouvre en grand, rien n\'est ajouté.'))}</p>`;
}
function scanCommit() {
  const items = SC.lot.filter(x => CARDS.byId.get(x.id)); if (!items.length) return;
  const before = { ...COLL.map }, lot = SC.lot.slice(), n = items.reduce((s, x) => s + x.n, 0);
  for (const x of items) collAdd(COLL.map, collKey(x.id, x.foil, x.lang), x.n);
  collSave(); SC.lot = []; save('scanlot', SC.lot); scanPaintLot();
  if (typeof prgScan === 'function') prgScan(n);      // niveau et badges (progress.js)
  toast(TN(n, '{n} carte ajoutée à ta collection', '{n} cartes ajoutées à ta collection'), { action: T('Annuler'), onAction: () => { COLL.map = before; collSave(); SC.lot = lot; save('scanlot', lot); scanPaintLot(); } });
}
function scanMount(el) {
  SC.el = el;
  el.innerHTML = `<div class="sc">
    <div class="sc-top"><h1 class="da-title">${esc(T('Scanner'))}</h1>
      <div class="seg" role="radiogroup" aria-label="${esc(T('Mode'))}"><button type="button" role="radio" data-mode="add">${esc(T('Ajouter'))}</button><button type="button" role="radio" data-mode="price">${esc(T('Prix rapide'))}</button></div></div>
    <div class="sc-main">
      <div class="sc-left">
        <div class="sc-cam"><video playsinline muted autoplay aria-label="${esc(T('Aperçu de la caméra'))}"></video><div class="sc-guide" aria-hidden="true"><i class="sc-corner"></i><i class="sc-corner r"></i><i class="sc-foot"><b>12/204 • FR • 7</b></i></div>
          <div class="sc-idle"><svg class="i"><use href="#i-camera"/></svg><p>${esc(T('Pose la carte bien à plat, la ligne du bas (« 12/204 • FR • 7 ») bien visible.'))}</p></div></div>
        <p class="sc-tips muted small">${esc(T('Lumière douce, sans reflet sur le bas de la carte · la carte dans le cadre, sa ligne du bas dans la zone dorée'))}</p>
        <div class="sc-line"><p class="sc-status" role="status" aria-live="polite"></p><p class="sc-sess chip" hidden></p></div>
        <div class="sc-ctl">
          <button type="button" class="btn btn-primary sc-start"><svg class="i"><use href="#i-camera"/></svg>${esc(T('Démarrer le scan'))}</button>
          <button type="button" class="sc-read" aria-label="${esc(T('Lire la carte'))}" hidden><i></i></button>
          <div class="sc-side">
            <label class="switch sc-auto"><input type="checkbox"${SC.auto ? ' checked' : ''}><span>${esc(T('Auto'))}</span></label>
            <label class="switch sc-auto sc-snd"><input type="checkbox"${prefs().scanSound !== false ? ' checked' : ''}><span>${esc(T('Son'))}</span></label>
            <button type="button" class="btn btn-ghost sc-stop" hidden>${esc(T('Arrêter'))}</button>
            <label class="btn btn-ghost sc-file"><svg class="i"><use href="#i-upload"/></svg>${esc(T('Photo'))}<input type="file" accept="image/*" capture="environment" hidden></label>
          </div>
        </div>
      </div>
      <div class="sc-right">
        <div class="panel-head"><h2>${esc(T('Lot du scan'))} <span class="sc-lot-n muted small"></span></h2><button type="button" class="btn btn-ghost sc-clear" hidden>${esc(T('Vider'))}</button></div>
        <div class="list sc-lot"></div>
        <button type="button" class="btn btn-primary btn-block sc-add" hidden></button>
      </div>
    </div></div>`;
  SC.video = $('video', el);
  const seg = () => $$('[data-mode]', el).forEach(b => b.setAttribute('aria-checked', b.dataset.mode === SC.mode ? 'true' : 'false'));
  seg();
  el.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-mode]')) { SC.mode = t.closest('[data-mode]').dataset.mode; seg(); scanPaintLot(); return; }
    if (t.closest('.sc-start')) { camStart(); return; }
    if (t.closest('.sc-stop')) { camStop(); scanStatus(''); return; }
    if (t.closest('.sc-read')) { scanStatus(T('Lecture…')); scanOnce(true); return; }
    if (t.closest('.sc-add')) { scanCommit(); return; }
    if (t.closest('.sc-clear')) { const lot = SC.lot; SC.lot = []; save('scanlot', SC.lot); scanPaintLot(); toast(T('Lot vidé'), { action: T('Annuler'), onAction: () => { SC.lot = lot; save('scanlot', lot); scanPaintLot(); } }); return; }
    const row = t.closest('.sc-item'); if (!row) return;
    const x = SC.lot[+row.dataset.i]; if (!x) return;
    const d = t.closest('[data-d]');
    if (d) { x.n += +d.dataset.d; if (x.n <= 0) SC.lot.splice(SC.lot.indexOf(x), 1); save('scanlot', SC.lot); scanPaintLot(); return; }
    if (t.closest('[data-fix]')) pickCard({ title: T('La bonne carte'), q: (CARDS.byId.get(x.id) || {}).name || '', onPick: c => { x.id = c.id; if (!(c.foil & 2)) x.foil = false; if (c.foil && !(c.foil & 1)) x.foil = true; save('scanlot', SC.lot); scanPaintLot(); } });
  });
  el.addEventListener('change', e => {
    if (e.target.matches('.sc-snd input')) { setPref('scanSound', e.target.checked); return; }
    if (e.target.matches('.sc-auto input')) { SC.auto = e.target.checked; return; }
    if (e.target.matches('[data-foil]')) { const x = SC.lot[+e.target.closest('.sc-item').dataset.i]; if (x) { x.foil = e.target.checked; save('scanlot', SC.lot); scanPaintLot(); } return; }
    if (e.target.matches('.sc-file input')) { const f = e.target.files && e.target.files[0]; e.target.value = ''; scanFile(f); }
  });
  // La vue quittée (attribut hidden posé par showView) ou l'appli en arrière-plan : caméra coupée.
  new MutationObserver(() => { if ($('#v-scan').hidden) camStop(); }).observe($('#v-scan'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') camStop(); });
  window.addEventListener('resize', () => { if (SC.el) scanPaint(); });
  document.addEventListener('io:data', () => scanPaintLot());
}
if (typeof document !== 'undefined' && typeof onView === 'function') onView('scan', (el, first) => {
  if (first || !SC.el) scanMount(el);
  scanPaint(); scanStatus(SC.msg || '');
  dataLoad().then(() => scanPaintLot(), () => scanPaintLot());
});

if (typeof module !== 'undefined' && module.exports) module.exports = { printChoices, bandEdges, cardOnBand, BAND_TOP, footVerify, toGray, otsu, skewAngle, darkBand, clipRect, footOk, guideRect, coverMap, subRect, photoCard, footCard, footClean, footLoose, namePrint, bestName, isDupe, lotPush, prepPixels, FOOT_BOX, NAME_BOX, CARD_RATIO };
