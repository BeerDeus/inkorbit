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
const NAME_SHIFTS = [0, -0.02, 0.02, -0.035, 0.035];      // décalages essayés (fractions de la hauteur de la carte)
const FOOT_CHARS = '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcde.-•·';
/** Liste « large » : Tesseract.js garde la liste précédente quand on lui passe une chaîne vide, il en faut toujours une. */
const ANY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸàâäçéèêëîïôöùûüÿßÆæŒœ0123456789/' + "'’-.,!?&:•·«»+ ";
const SC = { el: null, stream: null, video: null, mode: 'add', auto: true, busy: false, last: null, lot: typeof load === 'function' ? load('scanlot', []) : [], worker: null, wait: null, loop: 0, msg: '' };

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
  let best = null, sim = 0;
  for (const c of cards) {
    const ks = c._scanK || (c._scanK = [[c.name, c.ver], [c.nameEn, c.verEn]].filter(([n]) => n).map(([n, v]) => [normName(n), v ? normName(`${n} ${v}`) : '']));
    let s = 0;
    for (const [nn, full] of ks) {
      if (full) for (const p of pairs) s = Math.max(s, sim1(p, full));
      for (const l of lines) s = Math.max(s, sim1(l, nn) * (full ? 0.9 : 1));      // nom seul : moins sûr quand la carte a une version
    }
    if (s > sim + 1e-9 || (best && Math.abs(s - sim) < 1e-9 && (c.rar >= 6) < (best.rar >= 6))) { sim = s; best = c; }
  }
  return { card: best, sim };
}
/** Séparateurs mal lus (« 1/204 + FR « 1 ») → « • », que parseFootLine attend. */
const footClean = t => String(t || '').replace(/[«»+©®~=]/g, ' • ').replace(/(?<=\d)V(?=\d)/g, '/');      // « 1V204 » : la barre lue V
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
/** Zone r de la source (vidéo, image) → toile agrandie (hauteur ≈ h px) et préparée pour l'OCR. */
function cropCanvas(src, r, h, inv) {
  const k = h / r.h, cv = document.createElement('canvas'); cv.width = Math.round(r.w * k); cv.height = Math.round(h);
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.imageSmoothingQuality = 'high';
  cx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
  const im = cx.getImageData(0, 0, cv.width, cv.height); prepPixels(im.data, inv); cx.putImageData(im, 0, 0);
  return cv;
}
async function ocr(cv, psm, chars) {
  const w = await tessLoad();
  await w.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: chars || ANY_CHARS });
  return (await w.recognize(cv)).data.text || '';
}
/** Lit la carte posée dans le rectangle card de src : { card, lang, how } ou null.
 *  1. Bande du bas (nom de l'illustrateur + « 1/204 • FR • 1 »), lue deux fois (sans puis avec liste de caractères) : la ligne exacte suffit.
 *  2. Sinon la bande du nom (ressemblance ≥ minSim ; 0 : pas de repli), puis l'impression parmi celles du même nom grâce à ce qui a été lu en bas
 *     (Tesseract perd souvent la barre : « 205204 » → la 205, pas la 5). */
async function readCard(src, card, iw, ih, minSim) {
  const cv = cropCanvas(src, subRect(card, FOOT_BOX, iw, ih), 130); let foot = '';
  for (const wl of [ANY_CHARS, FOOT_CHARS]) {
    const t = await ocr(cv, 6, wl); foot += '\n' + t;
    const f = parseFootLine(footClean(t)), c = footCard(f, CARDS.ix);
    if (c) return { card: c, lang: IO_LANGS.includes(f.lang) ? f.lang : '', how: 'foot' };
  }
  if (!minSim) return null;
  let b = { card: null, sim: 0 };
  // Bande étroite (une bande plus haute attrape l'illustration et Tesseract ne lit plus rien) : décalée vers le haut puis le bas si la carte est mal cadrée.
  for (const dy of NAME_SHIFTS) {
    const r = bestName(await ocr(cropCanvas(src, subRect(card, { ...NAME_BOX, y: NAME_BOX.y + dy }, iw, ih), 150, true), 6, ANY_CHARS), CARDS.list);
    if (r.sim > b.sim) b = r; if (b.sim >= 0.9) break;
  }
  if (!b.card || b.sim < minSim) return null;
  const loose = footLoose(foot);
  return { card: namePrint(b.card, loose, CARDS.list), lang: loose.lang, how: 'name' };
}
/** Une carte reconnue : lot (ou carte en grand en mode Prix rapide), vibration, son. */
function scanHit(r) {
  const now = Date.now(); if (isDupe(SC.last, r.card.id, now)) { SC.last.t = now; return false; }
  SC.last = { id: r.card.id, t: now };
  try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* ignore */ }
  if (prefs().scanSound !== false) scanBeep();
  if (SC.mode === 'price') { openCard(r.card.id); return true; }
  lotPush(SC.lot, { id: r.card.id, foil: !!(r.card.foil & 2) && !(r.card.foil & 1), lang: r.lang, n: 1 });      // Enchantée, Épique… : n'existent qu'en foil save('scanlot', SC.lot);
  scanStatus(T('{name} lue', { name: r.card.name }));
  scanPaintLot(r.card.id);
  return true;
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
  try { await dataLoad(); const r = await readCard(SC.video, camCard(), SC.video.videoWidth, SC.video.videoHeight, withName ? 0.75 : 0.85); if (r) scanHit(r); else if (withName) scanStatus(T('Carte non reconnue : rapproche-la, évite les reflets'), true); return r; }
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
/** Photo choisie : la carte entière, ou la carte dans le gabarit. */
async function scanFile(file) {
  if (!file) return;
  scanStatus(T('Lecture de la photo…'));
  let img;
  try { img = await createImageBitmap(file); } catch (e) { scanStatus(T('Image illisible'), true); return; }
  try { await dataLoad(); const r = await readCard(img, photoCard(img.width, img.height), img.width, img.height, 0.75); if (r) scanHit(r); else scanStatus(T('Carte non reconnue : rapproche-la, évite les reflets'), true); }
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
  toast(TN(n, '{n} carte ajoutée à ta collection', '{n} cartes ajoutées à ta collection'), { action: T('Annuler'), onAction: () => { COLL.map = before; collSave(); SC.lot = lot; save('scanlot', lot); scanPaintLot(); } });
}
function scanMount(el) {
  SC.el = el;
  el.innerHTML = `<div class="sc">
    <div class="sc-top"><h1 class="da-title">${esc(T('Scanner'))}</h1>
      <div class="seg" role="radiogroup" aria-label="${esc(T('Mode'))}"><button type="button" role="radio" data-mode="add">${esc(T('Ajouter'))}</button><button type="button" role="radio" data-mode="price">${esc(T('Prix rapide'))}</button></div></div>
    <div class="sc-main">
      <div class="sc-left">
        <div class="sc-cam"><video playsinline muted autoplay aria-label="${esc(T('Aperçu de la caméra'))}"></video><div class="sc-guide" aria-hidden="true"><i class="sc-foot"></i></div>
          <div class="sc-idle"><svg class="i"><use href="#i-camera"/></svg><p>${esc(T('Pose la carte bien à plat, la ligne du bas (« 12/204 • FR • 7 ») bien visible.'))}</p></div></div>
        <p class="sc-status" role="status" aria-live="polite"></p>
        <div class="sc-ctl">
          <button type="button" class="btn btn-primary sc-start"><svg class="i"><use href="#i-camera"/></svg>${esc(T('Démarrer le scan'))}</button>
          <button type="button" class="sc-read" aria-label="${esc(T('Lire la carte'))}" hidden><i></i></button>
          <div class="sc-side">
            <label class="switch sc-auto"><input type="checkbox"${SC.auto ? ' checked' : ''}><span>${esc(T('Auto'))}</span></label>
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

if (typeof module !== 'undefined' && module.exports) module.exports = { guideRect, coverMap, subRect, photoCard, footCard, footClean, footLoose, namePrint, bestName, isDupe, lotPush, prepPixels, FOOT_BOX, NAME_BOX, CARD_RATIO };
