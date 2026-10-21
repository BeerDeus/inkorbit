/* ── pubdecks.js : decks de la communauté (onglet Decks › « À monter », section [data-pub]) ─────────────────────────────────
   Sans serveur : tout passe par Firestore et ses règles (firestore.rules › pubdecks, pubreports ; tests/rules-test.mjs).
   · Publier : depuis l'éditeur d'un deck (decks.js › pubDeckButtonHtml), compte connecté, deck valide pour son format, 10 decks publiés au plus.
     pubdecks/{id} = { uid, author, name, desc, fmt, inks, cards, at, v: 1, reports } ; id = 10 premiers caractères de l'uid + « _ » + id du deck local ;
     le deck local garde d.pub = id (« Mettre à jour », « Retirer »).
   · Parcourir : lecture publique (même sans compte), les plus récents d'abord, 20 par page ; filtres encre et format et tri « plus faciles à monter »
     appliqués aux pages chargées (calcul local contre la collection) ; détail : copier dans mes decks, manquantes → recherches, signaler.
   · Modération : pubreports/{deckId}_{uid} (un par compte et par deck) créé dans le même lot que reports + 1 (vérifié par les règles) ;
     masqué ici dès PUB_HIDE signalements ; noms et descriptions grossiers refusés (liste courte FR/EN). */
const PUB = { el: null, docs: [], last: null, end: false, busy: false, err: '', ink: '', fmt: '', sort: 'recent', mine: new Set(load('pubReported', [])) };
const PUB_MAX = 10, PUB_HIDE = 3, PUB_PAGE = 20;
const PUB_BAD = /\b(merde|putain|connard|connasse|salope|encule|pute|batard|nique|fuck\w*|shit\w*|bitch\w*|cunt|asshole|nigg\w*|fag\w*)\b/;
const pubClean = s => !PUB_BAD.test(normName(s));
const pubId = (uid, d) => `${uid.slice(0, 10)}_${d.id}`;

/* ── Publier ────────────────────────────────────────────────────────────────────────────────── */
/** Boutons de l'éditeur (rangée d'actions de decks.js). */
function pubDeckButtonHtml(d) {
  return `<span class="pub-zone" data-pub-zone="${esc(d.id)}">${d.pub
    ? `<button type="button" class="btn" data-pub-publish="${esc(d.id)}"><svg class="i"><use href="#i-share"/></svg>${esc(T('Mettre à jour'))}</button><button type="button" class="btn btn-ghost" data-pub-remove="${esc(d.id)}">${esc(T('Retirer de la communauté'))}</button>`
    : `<button type="button" class="btn" data-pub-publish="${esc(d.id)}"><svg class="i"><use href="#i-share"/></svg>${esc(T('Publier'))}</button>`}</span>`;
}
const pubZoneRefresh = d => { for (const z of $$(`[data-pub-zone="${CSS.escape(d.id)}"]`)) z.outerHTML = pubDeckButtonHtml(d); };
/** Enregistre (création ou mise à jour) ; rejette { code: 'limit' | 'invalid' | 'words' } ou une erreur Firestore. */
async function pubPublish(d, { name, desc = '', author }) {
  await cloudLoad();
  const u = CLOUD.user; if (!u) throw Object.assign(new Error('signin'), { code: 'signin' });
  const chk = deckCheck(d.cards, CARDS.byId, d.fmt);
  if (!chk.ok) throw Object.assign(new Error('invalid'), { code: 'invalid' });
  name = String(name || d.name).trim().slice(0, 60); desc = String(desc).trim().slice(0, 280); author = String(author || '').trim().slice(0, 30) || T('Anonyme');
  if (!pubClean(name) || !pubClean(desc) || !pubClean(author)) throw Object.assign(new Error('words'), { code: 'words' });
  const { fs } = CLOUD.m, id = d.pub || pubId(u.uid, d), ref = fs.doc(CLOUD.db, 'pubdecks', id);
  const old = await fs.getDoc(ref);
  if (!old.exists()) {      // ponytail: limite de 10 tenue par l'appli seulement (les règles ne savent pas compter) ; Cloud Function si quelqu'un la contourne
    const mine = await fs.getDocs(fs.query(fs.collection(CLOUD.db, 'pubdecks'), fs.where('uid', '==', u.uid), fs.limit(PUB_MAX)));
    if (mine.size >= PUB_MAX) throw Object.assign(new Error('limit'), { code: 'limit' });
  }
  const cards = Object.fromEntries(Object.entries(d.cards).filter(([, n]) => n > 0));
  await fs.setDoc(ref, { v: 1, uid: u.uid, author, name, desc, fmt: d.fmt === 'infinity' ? 'infinity' : 'core', inks: chk.inks, cards, at: Date.now(), reports: old.exists() ? old.data().reports || 0 : 0 });
  d.pub = id; d.pubDesc = desc; dkTouch(d); setPref('name', author);
  return id;
}
async function pubRemove(d) {
  await cloudLoad();
  if (d.pub && CLOUD.user) await CLOUD.m.fs.deleteDoc(CLOUD.m.fs.doc(CLOUD.db, 'pubdecks', d.pub));
  delete d.pub; dkTouch(d);
}
function pubPublishSheet(d) {
  const chk = deckCheck(d.cards, CARDS.byId, d.fmt);
  if (!chk.ok) { toast(T('Termine ton deck avant de le publier : {p}', { p: chk.problems[0] })); return; }
  cloudLoad().catch(() => {}).then(() => {
    if (!CLOUD.user) {
      openSheet({ title: T('Publier ce deck'), html: `<p>${esc(T('Connecte-toi pour partager tes decks avec la communauté.'))}</p><button type="button" class="btn btn-primary btn-block" data-act="signin">${esc(T('Se connecter'))}</button>` });
      return;
    }
    const el = openSheet({ title: d.pub ? T('Mettre à jour le deck publié') : T('Publier ce deck'), cls: 'pub-sheet', html: `
      <p class="muted small">${esc(T('Ton deck sera visible par tous dans « À monter ». Tu peux le retirer quand tu veux.'))}</p>
      <div class="field"><label for="pubName">${esc(T('Nom du deck'))}</label><input id="pubName" class="input" maxlength="60" value="${esc(d.name)}"></div>
      <div class="field"><label for="pubDesc">${esc(T('Description (facultatif)'))}</label><textarea id="pubDesc" class="input" maxlength="280" rows="3" placeholder="${esc(T('Plan de jeu, cartes clés…'))}">${esc(d.pubDesc || '')}</textarea></div>
      <div class="field"><label for="pubAuthor">${esc(T('Ton pseudo'))}</label><input id="pubAuthor" class="input" maxlength="30" value="${esc(prefs().name || CLOUD.user.displayName || '')}"></div>
      <p class="bad small" data-err role="alert"></p>
      <button type="button" class="btn btn-primary btn-block" data-go>${esc(d.pub ? T('Mettre à jour') : T('Publier'))}</button>` });
    const err = $('[data-err]', el), go = $('[data-go]', el);
    go.addEventListener('click', async () => {
      err.textContent = ''; go.disabled = true;
      try {
        await pubPublish(d, { name: $('#pubName', el).value, desc: $('#pubDesc', el).value, author: $('#pubAuthor', el).value });
        el.close(); pubZoneRefresh(d); toast(T('Deck publié dans la communauté')); if (typeof sparkle === 'function') sparkle(innerWidth / 2, innerHeight / 3);
        PUB.docs = []; PUB.last = null; PUB.end = false;
      } catch (e) {
        go.disabled = false;
        err.textContent = { limit: T('Tu as déjà publié {n} decks : retires-en un pour en publier un autre.', { n: PUB_MAX }), words: T('Ce texte contient un mot refusé.'), invalid: T('Ce deck n\'est pas valide pour son format.') }[e.code] || T('Publication impossible : vérifie ta connexion.');
      }
    });
  });
}
document.addEventListener('click', e => {
  const p = e.target.closest('[data-pub-publish]'); if (p) { const d = dkFind(p.dataset.pubPublish); if (d) pubPublishSheet(d); return; }
  const r = e.target.closest('[data-pub-remove]');
  if (r) { const d = dkFind(r.dataset.pubRemove); if (!d) return;
    askSheet({ title: T('Retirer ce deck de la communauté ?'), text: T('Il reste dans tes decks.'), ok: T('Retirer'), danger: true })
      .then(yes => yes && pubRemove(d).then(() => { pubZoneRefresh(d); toast(T('Deck retiré de la communauté')); PUB.docs = []; PUB.last = null; PUB.end = false; }, () => toast(T('Impossible pour l\'instant : vérifie ta connexion.')))); }
});

/* ── Parcourir ──────────────────────────────────────────────────────────────────────────────── */
async function pubMore() {
  if (PUB.busy || PUB.end) return;
  PUB.busy = true; PUB.err = ''; pubPaint();
  try {
    await cloudLoad();
    const { fs } = CLOUD.m, parts = [fs.collection(CLOUD.db, 'pubdecks'), fs.orderBy('at', 'desc')];
    if (PUB.last) parts.push(fs.startAfter(PUB.last));
    parts.push(fs.limit(PUB_PAGE));
    const snap = await fs.getDocs(fs.query(...parts));
    PUB.docs.push(...snap.docs.map(x => ({ id: x.id, ...x.data() })));
    PUB.last = snap.docs[snap.docs.length - 1] || PUB.last; PUB.end = snap.size < PUB_PAGE;
  } catch (e) { PUB.err = navigator.onLine === false ? T('Hors ligne : les decks de la communauté reviendront avec le réseau.') : T('Decks de la communauté indisponibles pour l\'instant.'); }
  PUB.busy = false; pubPaint();
}
/** Decks visibles, filtrés et triés, avec ce qui manque dans ma collection. */
function pubList() {
  const cur = prefs().cur;
  const out = PUB.docs.filter(x => (x.reports || 0) < PUB_HIDE && !PUB.mine.has(x.id) && (PUB.ink === '' || (x.inks || []).includes(+PUB.ink)) && (!PUB.fmt || x.fmt === PUB.fmt))
    .map(x => { const cards = Object.fromEntries(Object.entries(x.cards || {}).filter(([id]) => CARDS.byId.has(+id))); return { ...x, cards, val: deckValue(cards, CARDS.byId, PRICES.p, cur, COLL.map) }; });
  if (PUB.sort === 'easy') out.sort((a, b) => a.val.missing - b.val.missing || a.val.missingValue - b.val.missingValue);
  return out;
}
function pubMount(el) {
  PUB.el = el;
  if (!el.dataset.pubOn) { el.dataset.pubOn = 1; el.addEventListener('click', pubClick); el.addEventListener('change', pubClick); }
  pubPaint();
  if (!PUB.docs.length && !PUB.end) pubMore();
}
function pubPaint() {
  const el = PUB.el; if (!el || !el.isConnected) return;
  const cur = prefs().cur, list = pubList(), me = CLOUD.user && CLOUD.user.uid;
  el.innerHTML = `<div class="da-rule"><span>${esc(T('Decks de la communauté'))}</span></div>
    <div class="pub-tools"><div class="chips" role="group" aria-label="${esc(T('Encre'))}"><button type="button" class="chip" data-pub-ink="" aria-pressed="${PUB.ink === ''}">${esc(T('Toutes'))}</button>${INK_KEYS.map((k, i) => `<button type="button" class="chip" data-pub-ink="${i}" aria-pressed="${PUB.ink === String(i)}" aria-label="${esc(INK_NAMES()[i])}"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg></button>`).join('')}</div>
      <div class="pub-sel"><select class="select" data-pub-fmt aria-label="${esc(T('Format'))}"><option value="">${esc(T('Tous formats'))}</option><option value="core"${PUB.fmt === 'core' ? ' selected' : ''}>Core</option><option value="infinity"${PUB.fmt === 'infinity' ? ' selected' : ''}>Infinity</option></select>
      <select class="select" data-pub-sort aria-label="${esc(T('Trier'))}"><option value="recent">${esc(T('Les plus récents'))}</option><option value="easy"${PUB.sort === 'easy' ? ' selected' : ''}>${esc(T('Les plus faciles à monter'))}</option></select></div></div>
    ${list.length ? `<div class="dk-cards">${list.map(x => { const cover = deckCover(x.cards, CARDS.byId, PRICES.p, cur), img = cover && cardImg(cover, 'normal'), total = Object.values(x.cards).reduce((s, n) => s + n, 0);
      return `<article class="dk-card pub-card"><button type="button" class="dk-card-open" data-pub-open="${esc(x.id)}" aria-label="${esc(T('Voir le deck {name}', { name: x.name }))}">
        <span class="dk-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</span>
        <span class="dk-card-main"><span class="dk-card-name">${esc(x.name)}</span>
          <span class="dk-card-meta"><span class="dk-inks">${dkInkPips(x.inks || [])}</span><span class="muted">${esc(x.uid === me ? T('par toi') : T('par {a}', { a: x.author }))}</span>${x.fmt === 'infinity' ? '<span class="chip-mini">Infinity</span>' : ''}</span>
          <span class="dk-card-own ${x.val.missing ? '' : 'ok'}">${x.val.missing ? esc(T('{h}/{t} dans ta collection', { h: total - x.val.missing, t: total })) + (x.val.missingValue ? ` · ${esc(T('manque {v}', { v: fmtMoney(x.val.missingValue, cur) }))}` : '') : esc(T('Toutes les cartes sont dans ta collection'))}</span>
        </span></button></article>`; }).join('')}</div>`
      : PUB.busy ? skeletonCards(2) : `<div class="empty"><svg class="i"><use href="#i-deck"/></svg><p>${esc(PUB.err || (PUB.docs.length ? T('Aucun deck ne correspond.') : T('Aucun deck publié pour l\'instant. Publie le tien depuis son éditeur !')))}</p></div>`}
    ${PUB.err && list.length ? `<p class="bad small">${esc(PUB.err)}</p>` : ''}
    ${!PUB.end && PUB.docs.length && !PUB.busy ? `<button type="button" class="btn btn-block" data-pub-more>${esc(T('Charger plus'))}</button>` : ''}`;
}
function pubClick(e) {
  const t = e.target;
  if (e.type === 'change') { if (t.matches('[data-pub-fmt]')) PUB.fmt = t.value; else if (t.matches('[data-pub-sort]')) PUB.sort = t.value; else return; pubPaint(); return; }
  const ink = t.closest('[data-pub-ink]'); if (ink) { PUB.ink = ink.dataset.pubInk; pubPaint(); return; }
  if (t.closest('[data-pub-more]')) { pubMore(); return; }
  const o = t.closest('[data-pub-open]'); if (o) { const x = pubList().find(y => y.id === o.dataset.pubOpen); if (x) pubOpen(x); }
}
function pubOpen(x) {
  const cur = prefs().cur, own = collById(COLL.map), me = CLOUD.user && CLOUD.user.uid;
  const ids = Object.keys(x.cards).map(Number).sort((a, b) => CARDS.byId.get(a).cost - CARDS.byId.get(b).cost || a - b);
  const el = openScreen({ title: x.name, cls: 'pub-detail', html: `
    <p class="muted">${esc(x.uid === me ? T('par toi') : T('par {a}', { a: x.author }))} · ${dkInkPips(x.inks || [])} · ${x.fmt === 'infinity' ? 'Infinity' : 'Core'}</p>
    ${x.desc ? `<p class="pub-desc">${esc(x.desc)}</p>` : ''}
    <p>${x.val.missing ? esc(TN(x.val.missing, '{n} carte à trouver', '{n} cartes à trouver')) + (x.val.missingValue ? ' · ' + fmtMoney(x.val.missingValue, cur) : '') : esc(T('Toutes les cartes sont dans ta collection'))}</p>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-pa="copy"><svg class="i"><use href="#i-copy"/></svg>${esc(T('Copier dans mes decks'))}</button>
      ${x.val.missing ? `<button type="button" class="btn" data-pa="wants"><svg class="i"><use href="#i-heart"/></svg>${esc(T('Manquantes → mes recherches'))}</button>` : ''}</div>
    <div class="grid-cards" data-cards>${ids.map(id => { const c = CARDS.byId.get(id), have = (own.get(id) || { n: 0 }).n; return thumbHtml(c, { qty: x.cards[id], showOne: true, missing: have < x.cards[id], size: 'small', cap: esc(setLabel(c)) }); }).join('')}</div>
    ${x.uid !== me ? `<button type="button" class="btn btn-ghost pub-report" data-pa="report"><svg class="i"><use href="#i-info"/></svg>${esc(T('Signaler ce deck'))}</button>` : ''}` });
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-pa]'); if (!a) return;
    if (a.dataset.pa === 'copy') { el.close(); const d = dkCreate(x.name, { ...x.cards }); d.fmt = x.fmt; dkTouch(d); toast(T('Deck copié dans tes decks')); dkOpen(d.id); }
    else if (a.dataset.pa === 'wants') { const miss = deckMissing(x.cards, COLL.map); for (const m of miss) COLL.wants[m.id] = Math.max(COLL.wants[m.id] || 0, x.cards[m.id]); collSave(); toast(TN(miss.length, '{n} carte ajoutée à tes recherches', '{n} cartes ajoutées à tes recherches')); }
    else if (a.dataset.pa === 'report') pubReportSheet(x, el);
  });
}
function pubReportSheet(x, detail) {
  if (!CLOUD.user) { openSheet({ title: T('Signaler ce deck'), html: `<p>${esc(T('Connecte-toi pour signaler un deck.'))}</p><button type="button" class="btn btn-primary btn-block" data-act="signin">${esc(T('Se connecter'))}</button>` }); return; }
  const why = [['words', T('Nom ou description inappropriés')], ['spam', T('Spam ou deck sans intérêt')], ['other', T('Autre raison')]];
  const el = openSheet({ title: T('Signaler ce deck'), html: `<div class="list">${why.map(([k, l]) => `<button type="button" class="row" data-why="${k}"><span class="row-main"><span class="row-title">${esc(l)}</span></span></button>`).join('')}</div>` });
  el.addEventListener('click', async e => {
    const w = e.target.closest('[data-why]'); if (!w) return;
    try { await pubReport(x.id, w.dataset.why); el.close(); if (detail) detail.close(); toast(T('Merci : le deck est signalé')); pubPaint(); }
    catch (err) { toast(T('Signalement impossible (déjà signalé ?)')); }
  });
}
/** Signalement : pubreports/{id}_{uid} et reports + 1, dans un seul lot (les règles refusent l'un sans l'autre). */
async function pubReport(id, why) {
  await cloudLoad();
  const { fs } = CLOUD.m, u = CLOUD.user, b = fs.writeBatch(CLOUD.db);
  b.set(fs.doc(CLOUD.db, 'pubreports', `${id}_${u.uid}`), { deck: id, uid: u.uid, why: String(why).slice(0, 20), at: Date.now() });
  b.update(fs.doc(CLOUD.db, 'pubdecks', id), { reports: fs.increment(1) });
  await b.commit();
  PUB.mine.add(id); save('pubReported', [...PUB.mine].slice(-500));
}
onColl(() => { if (PUB.el && PUB.el.isConnected) pubPaint(); });
setTimeout(() => onCloud(() => { if (PUB.el && PUB.el.isConnected) pubPaint(); }), 0);      // cloud.js se charge après ce fichier
