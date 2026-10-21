/* ── decks.js : « Mes decks » (vue Decks), éditeur de deck, import d'une decklist, « Prix d'une liste » ─────────────────────────────
   Stockage : load('decks') = [{ id, name, cards: { <id de carte>: n }, at }] (localStorage, inkorbit:decks). Pas de decks méta externes :
   seulement ceux de l'utilisateur, plus deux liens sortants pour trouver des idées.
   · Liste : chaque deck en carte (illustration = sa carte la plus chère, encres, n/60, valeur, cartes à trouver contre la collection).
   · Éditeur (plein écran) : onglets Deck · Ajouter · Collection ; règles du format (deckCheck) affichées en continu ; courbe des coûts,
     part encrable, types ; manquantes en grisé → « Ajouter à mes recherches » ; export texte. Ordinateur : deck à gauche, recherche à droite.
   Fonctions pures (deckCurve, deckCanAdd, deckValue) : tests/test-decks.mjs. */

/* ── Logique pure ─────────────────────────────────────────────────────────────────────────────── */
/** Clé « même carte » pour la limite d'exemplaires : nom complet (anglais s'il est chargé, comme deckCheck). */
const deckNameKey = c => normName(c.nameEn ? `${c.nameEn} ${c.verEn || ''}` : fullName(c));
/** Courbe des coûts (cases 1 à 7+ : indices 1 à 7, un coût 0 compte dans la case 1), encrables, types. */
function deckCurve(deck, byId) {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0], types = [0, 0, 0, 0]; let inkable = 0, total = 0;
  for (const [id, n] of Object.entries(deck)) {
    const c = byId.get(+id); if (!c || !(n > 0)) continue;
    total += n; curve[Math.min(Math.max(c.cost, 1), 7)] += n; types[c.type] = (types[c.type] || 0) + n; if (c.inkwell) inkable += n;
  }
  return { curve, types, inkable, total };
}
/** Peut-on ajouter un exemplaire de c ? (4 au plus d'un même nom complet, toutes impressions, sauf exception imprimée c.max). */
function deckCanAdd(deck, byId, c) {
  const k = deckNameKey(c); let n = 0;
  for (const [id, q] of Object.entries(deck)) { const x = byId.get(+id); if (x && deckNameKey(x) === k) n += q; }
  return n < (c.max || DECK_COPIES);
}
/** Valeur du deck et de ce qui manque (centimes, prix normal ; repli foil). */
function deckValue(deck, byId, prices, cur, map) {
  let value = 0, missingValue = 0, missing = 0;
  for (const [id, n] of Object.entries(deck)) if (byId.get(+id)) value += n * priceFor(prices, +id, false, cur);
  for (const m of deckMissing(deck, map)) { missing += m.need; missingValue += m.need * priceFor(prices, m.id, false, cur); }
  return { value, missing, missingValue };
}
/** Carte de couverture : la plus chère du deck (sinon la première). */
function deckCover(deck, byId, prices, cur) {
  let best = null, bp = -1;
  for (const id of Object.keys(deck)) { const c = byId.get(+id); if (!c) continue; const p = priceFor(prices, +id, false, cur); if (p > bp) { bp = p; best = c; } }
  return best;
}
/** Decklist analysée (parseDeck) → { <id>: n }. */
const deckFromParsed = parsed => { const d = {}; for (const [c, n] of parsed.cards) d[c.id] = (d[c.id] || 0) + n; return d; };

if (typeof module !== 'undefined' && module.exports) module.exports = { deckNameKey, deckCurve, deckCanAdd, deckValue, deckCover, deckFromParsed };

/* ── Interface ────────────────────────────────────────────────────────────────────────────────── */
const DK = { list: null, el: null, ed: null };
const dkList = () => DK.list || (DK.list = load('decks', []));
function dkSave() { save('decks', dkList()); }
const dkFind = id => dkList().find(d => d.id === id);
const dkNewId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dkCur = () => prefs().cur;
const dkInkPips = inks => inks.map(i => `<svg class="ink-sym" data-ink="${INK_KEYS[i]}" aria-label="${esc(INK_NAMES()[i])}"><use href="#ink-${INK_KEYS[i]}"/></svg>`).join('');

function dkCreate(name, cards = {}) {
  const d = { id: dkNewId(), name: String(name || '').trim().slice(0, 60) || T('Nouveau deck'), cards, at: Date.now() };
  dkList().unshift(d); dkSave(); return d;
}
function dkTouch(d) { d.at = Date.now(); dkSave(); }

/** Vue « Decks » : la liste. */
function dkListPaint() {
  const el = DK.el; if (!el) return;
  if (!CARDS.ready) { el.innerHTML = `<div class="sk" style="height:120px"></div><div class="sk" style="height:120px"></div>`; return; }
  const list = dkList(), cur = dkCur();
  const cardsHtml = list.map(d => {
    const chk = deckCheck(d.cards, CARDS.byId), v = deckValue(d.cards, CARDS.byId, PRICES.p, cur, COLL.map), cover = deckCover(d.cards, CARDS.byId, PRICES.p, cur);
    const img = cover && cardImg(cover, 'normal');
    return `<article class="dk-card" data-deck="${esc(d.id)}">
      <button type="button" class="dk-card-open" data-dk-open="${esc(d.id)}" aria-label="${esc(T('Ouvrir le deck {name}', { name: d.name }))}">
        <span class="dk-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</span>
        <span class="dk-card-main">
          <span class="dk-card-name">${esc(d.name)}</span>
          <span class="dk-card-meta"><span class="dk-inks">${dkInkPips(chk.inks)}</span><span class="num${chk.total >= DECK_MIN ? '' : ' warn'}">${esc(T('{n}/60 cartes', { n: chk.total }))}</span>${v.value ? `<span class="num">${fmtMoney(v.value, cur)}</span>` : ''}</span>
          <span class="dk-card-own ${v.missing ? '' : 'ok'}">${v.missing ? esc(TN(v.missing, '{n} carte à trouver', '{n} cartes à trouver')) + (v.missingValue ? ` · ${fmtMoney(v.missingValue, cur)}` : '') : chk.total ? esc(T('Toutes les cartes sont dans ta collection')) : esc(T('Deck vide'))}</span>
        </span>
      </button>
      <button type="button" class="btn-icon dk-more" data-dk-more="${esc(d.id)}" aria-label="${esc(T('Actions du deck {name}', { name: d.name }))}"><svg class="i"><use href="#i-more"/></svg></button>
    </article>`;
  }).join('');
  el.innerHTML = `<div class="dk-top"><h1 class="da-title">${esc(T('Mes decks'))}</h1><span class="muted small">${esc(TN(list.length, '{n} deck', '{n} decks'))}</span></div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-dk-new><svg class="i"><use href="#i-plus"/></svg>${esc(T('Nouveau deck'))}</button>
    <button type="button" class="btn" data-dk-import><svg class="i"><use href="#i-upload"/></svg>${esc(T('Importer une liste'))}</button>
    <button type="button" class="btn btn-ghost" data-dk-price><svg class="i"><use href="#i-chart"/></svg>${esc(T('Prix d\'une liste'))}</button></div>
    ${list.length ? `<div class="dk-cards">${cardsHtml}</div>` : `<div class="empty"><svg class="i"><use href="#i-deck"/></svg><h3>${esc(T('Aucun deck pour l\'instant'))}</h3><p>${esc(T('Crée un deck de 60 cartes à une ou deux encres, ou colle une liste trouvée ailleurs.'))}</p></div>`}
    <div class="dk-ideas"><div class="da-rule"><span>${esc(T('Trouver des idées de decks'))}</span></div>
    <p class="small muted"><a href="https://inkdecks.com/" target="_blank" rel="noopener">inkdecks.com</a> · <a href="https://lorcana.gg/" target="_blank" rel="noopener">lorcana.gg</a> — ${esc(T('copie une liste puis « Importer une liste »'))}</p></div>`;
}

function dkMount(el) {
  if (DK.el === el) { dkListPaint(); return; }
  DK.el = el;
  el.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-dk-new]')) { dkNameSheet(T('Nouveau deck'), '', name => dkOpen(dkCreate(name).id)); return; }
    if (t.closest('[data-dk-import]')) { dkImportSheet(); return; }
    if (t.closest('[data-dk-price]')) { dkPriceSheet(); return; }
    const o = t.closest('[data-dk-open]'); if (o) { dkOpen(o.dataset.dkOpen); return; }
    const m = t.closest('[data-dk-more]'); if (m) dkMoreSheet(m.dataset.dkMore);
  });
  dkListPaint();
  dataLoad().then(dkListPaint, () => { el.innerHTML = `<div class="empty"><svg class="i"><use href="#i-offline"/></svg><h3>${esc(T('Catalogue indisponible'))}</h3><p>${esc(T('Vérifie ta connexion puis réessaie.'))}</p></div>`; });
}

/* ── Feuilles : nom, actions, import, prix d'une liste ─────────────────────────────────────────── */
function dkNameSheet(title, value, done) {
  const el = openSheet({ title, html: `<form class="dk-form"><div class="field"><label for="dkName">${esc(T('Nom du deck'))}</label><input id="dkName" class="input" maxlength="60" autocomplete="off" autofocus value="${esc(value)}" placeholder="${esc(T('Ambre-Améthyste chansons'))}"></div><button class="btn btn-primary btn-block" type="submit">${esc(T('Enregistrer'))}</button></form>` });
  $('form', el).addEventListener('submit', e => { e.preventDefault(); const v = $('#dkName', el).value; el.close(); done(v); });
}
function dkMoreSheet(id) {
  const d = dkFind(id); if (!d) return;
  const el = openSheet({ title: d.name, html: `<div class="list">
    <button type="button" class="row" data-a="open"><svg class="i"><use href="#i-edit"/></svg><span class="row-main"><span class="row-title">${esc(T('Modifier'))}</span></span></button>
    <button type="button" class="row" data-a="rename"><svg class="i"><use href="#i-book"/></svg><span class="row-main"><span class="row-title">${esc(T('Renommer'))}</span></span></button>
    <button type="button" class="row" data-a="dup"><svg class="i"><use href="#i-copy"/></svg><span class="row-main"><span class="row-title">${esc(T('Dupliquer'))}</span></span></button>
    <button type="button" class="row" data-a="export"><svg class="i"><use href="#i-share"/></svg><span class="row-main"><span class="row-title">${esc(T('Exporter la liste'))}</span></span></button>
    <button type="button" class="row dk-danger" data-a="del"><svg class="i"><use href="#i-trash"/></svg><span class="row-main"><span class="row-title">${esc(T('Supprimer'))}</span></span></button></div>` });
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a; el.close();
    if (act === 'open') dkOpen(id);
    else if (act === 'rename') dkNameSheet(T('Renommer'), d.name, v => { d.name = String(v).trim().slice(0, 60) || d.name; dkTouch(d); dkListPaint(); });
    else if (act === 'dup') { dkCreate(T('{name} (copie)', { name: d.name }), { ...d.cards }); dkListPaint(); toast(T('Deck dupliqué')); }
    else if (act === 'export') dkExport(d);
    else if (act === 'del') dkDeleteSheet(d);
  });
}
function dkDeleteSheet(d) {
  const el = openSheet({ title: T('Supprimer ce deck ?'), html: `<p>${esc(T('« {name} » sera supprimé de cet appareil. Ta collection ne change pas.', { name: d.name }))}</p><div class="btn-row"><button type="button" class="btn btn-danger" data-yes>${esc(T('Supprimer'))}</button><button type="button" class="btn btn-ghost" data-close>${esc(T('Annuler'))}</button></div>` });
  $('[data-yes]', el).addEventListener('click', () => {
    const list = dkList(), i = list.indexOf(d); if (i >= 0) list.splice(i, 1); dkSave(); el.close(); dkListPaint();
    toast(T('Deck supprimé'), { action: T('Annuler'), onAction: () => { list.splice(Math.min(i, list.length), 0, d); dkSave(); dkListPaint(); } });
  });
}
async function dkExport(d) {
  try { await dataEn(); } catch (e) { /* hors ligne : noms de la langue des cartes */ }
  const text = deckToText(d.cards, CARDS.byId);
  if (navigator.share) { try { await navigator.share({ title: d.name, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast(T('Liste copiée')); } catch (e) {
    const el = openSheet({ title: T('Exporter la liste'), html: `<textarea class="input" readonly rows="12">${esc(text)}</textarea>` }); $('textarea', el).select();
  }
}
/** Lignes non reconnues d'une decklist. */
const dkBadHtml = bad => (bad.length ? `<div class="dk-bad"><p class="small"><b>${esc(TN(bad.length, '{n} ligne non reconnue', '{n} lignes non reconnues'))}</b></p><ul>${bad.slice(0, 30).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : '');
async function dkParse(text) { await dataLoad(); try { await dataEn(); } catch (e) { /* noms anglais indisponibles hors ligne */ } return parseDeck(text, CARDS.ix); }
function dkImportSheet() {
  const el = openSheet({ title: T('Importer une liste'), html: `<form class="dk-form">
    <div class="field"><label for="dkImpName">${esc(T('Nom du deck'))}</label><input id="dkImpName" class="input" maxlength="60" autocomplete="off" placeholder="${esc(T('Deck importé'))}"></div>
    <div class="field"><label for="dkImpText">${esc(T('Liste (une carte par ligne)'))}</label><textarea id="dkImpText" class="input" rows="10" placeholder="4 Elsa - Snow Queen&#10;4 Ariel - On Human Legs" autofocus></textarea></div>
    <div class="dk-imp-out"></div><button class="btn btn-primary btn-block" type="submit">${esc(T('Importer'))}</button></form>` });
  $('form', el).addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', el); btn.disabled = true;
    const r = await dkParse($('#dkImpText', el).value).catch(() => null); btn.disabled = false;
    if (!r) { toast(T('Catalogue indisponible')); return; }
    if (!r.cards.size) { $('.dk-imp-out', el).innerHTML = `<p class="dk-warn">${esc(T('Aucune carte reconnue. Format attendu : « 4 Nom - Version ».'))}</p>` + dkBadHtml(r.bad); return; }
    const d = dkCreate($('#dkImpName', el).value || T('Deck importé'), deckFromParsed(r));
    el.close(); dkListPaint(); dkOpen(d.id);
    if (r.bad.length) toast(TN(r.bad.length, '{n} ligne non reconnue', '{n} lignes non reconnues'));
  });
}
function dkPriceSheet() {
  const el = openSheet({ title: T('Prix d\'une liste'), html: `<p class="muted small">${esc(T('Colle une liste pour voir son prix et ce qui manque à ta collection, sans l\'enregistrer.'))}</p>
    <textarea class="input" rows="8" placeholder="4 Elsa - Snow Queen" autofocus></textarea><button type="button" class="btn btn-primary" data-go>${esc(T('Calculer'))}</button><div class="dk-px-out"></div>` });
  let last = null;
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-save]') && last) { const d = dkCreate(T('Deck importé'), last); el.close(); dkListPaint(); dkOpen(d.id); return; }
    if (!e.target.closest('[data-go]')) return;
    const r = await dkParse($('textarea', el).value).catch(() => null), out = $('.dk-px-out', el);
    if (!r) { toast(T('Catalogue indisponible')); return; }
    last = deckFromParsed(r);
    const cur = dkCur(), v = deckValue(last, CARDS.byId, PRICES.p, cur, COLL.map), chk = deckCheck(last, CARDS.byId), miss = deckMissing(last, COLL.map);
    out.innerHTML = !r.cards.size ? `<p class="dk-warn">${esc(T('Aucune carte reconnue.'))}</p>${dkBadHtml(r.bad)}` : `<div class="dk-sum">
      <div><span class="muted small">${esc(T('Prix de la liste'))}</span><b class="num">${fmtMoney(v.value, cur)}</b><span class="muted small">${esc(TN(chk.total, '{n} carte', '{n} cartes'))}</span></div>
      <div><span class="muted small">${esc(T('Ce qui te manque'))}</span><b class="num">${fmtMoney(v.missingValue, cur)}</b><span class="muted small">${esc(TN(v.missing, '{n} carte', '{n} cartes'))}</span></div></div>
      ${miss.length ? `<div class="grid-cards dk-grid" data-cards>${miss.map(m => thumbHtml(CARDS.byId.get(m.id), { size: 'small', qty: m.need, showOne: true, missing: true })).join('')}</div>` : `<p class="dk-ok">${esc(T('Tu as déjà toutes ces cartes'))}</p>`}
      ${dkBadHtml(r.bad)}<button type="button" class="btn" data-save><svg class="i"><use href="#i-plus"/></svg>${esc(T('Enregistrer comme deck'))}</button>`;
  });
}

/* ── Éditeur ──────────────────────────────────────────────────────────────────────────────────── */
function dkOpen(id) {
  const d = dkFind(id); if (!d) return;
  const st = { d, tab: 'deck', group: load('dkGroup', 'cost'), q: '', ink: '', cost: '', type: '' };
  const el = openScreen({ title: d.name, cls: 'dk-screen', onClose: () => { DK.ed = null; dkListPaint(); }, html: `<div class="dk-head"></div>
    <div class="tabs dk-tabs" role="tablist">
      <button type="button" role="tab" data-tab="deck" aria-selected="true">${esc(T('Deck'))}</button>
      <button type="button" role="tab" data-tab="add" aria-selected="false">${esc(T('Ajouter'))}</button>
      <button type="button" role="tab" data-tab="coll" aria-selected="false">${esc(T('Collection'))}</button></div>
    <div class="dk-ed" data-cur="deck">
      <div class="dk-pane on" data-pane="deck"></div>
      <div class="dk-pane" data-pane="add"><div class="dk-filters"></div><div class="grid-cards dk-grid" data-cards></div></div>
      <div class="dk-pane" data-pane="coll"><div class="dk-filters"></div><div class="grid-cards dk-grid" data-cards></div></div>
    </div>` });
  st.el = el;
  const paint = () => { dkHeadPaint(st); dkDeckPaint(st); if (st.tab !== 'deck' || matchMedia('(min-width:1024px)').matches) dkSearchPaint(st, st.tab === 'coll' ? 'coll' : 'add'); };
  st.paint = paint; DK.ed = st;
  el.addEventListener('click', e => dkEdClick(st, e));
  el.addEventListener('input', e => {
    const f = e.target.closest('[data-f]'); if (!f) return;
    st[f.dataset.f] = f.value; clearTimeout(st.t); st.t = setTimeout(() => dkSearchPaint(st, st.tab === 'coll' ? 'coll' : 'add'), f.type === 'search' ? 140 : 0);
  });
  paint();
}
/** Bandeau : total, encres, valeur, règles. */
function dkHeadPaint(st) {
  const d = st.d, chk = deckCheck(d.cards, CARDS.byId), cur = dkCur(), v = deckValue(d.cards, CARDS.byId, PRICES.p, cur, COLL.map);
  $('.dk-head', st.el).innerHTML = `<div class="dk-head-row">
      <div class="dk-count${chk.total >= DECK_MIN ? ' ok' : ''}"><b class="num">${chk.total}</b><span>/60</span></div>
      <div class="dk-inks">${dkInkPips(chk.inks) || `<span class="muted small">${esc(T('Aucune encre'))}</span>`}</div>
      <div class="dk-val"><b class="num">${fmtMoney(v.value, cur)}</b>${v.missing ? `<span class="muted small">${esc(T('manque {v}', { v: fmtMoney(v.missingValue, cur) }))}</span>` : ''}</div>
    </div>
    ${chk.ok ? `<p class="dk-ok"><svg class="i"><use href="#i-check"/></svg>${esc(T('Deck valide (format Core)'))}</p>` : `<ul class="dk-problems">${chk.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`}`;
}
/** Volet « Deck » : stats, cartes groupées, manquantes, actions. */
function dkDeckPaint(st) {
  const d = st.d, byId = CARDS.byId, pane = $('[data-pane="deck"]', st.el), own = collById(COLL.map);
  const ids = Object.keys(d.cards).map(Number).filter(id => byId.get(id) && d.cards[id] > 0);
  if (!ids.length) { pane.innerHTML = `<div class="empty"><svg class="i"><use href="#i-cards"/></svg><h3>${esc(T('Deck vide'))}</h3><p>${esc(T('Ajoute des cartes depuis l\'onglet « Ajouter » ou ta collection.'))}</p><button type="button" class="btn btn-primary" data-tab="add">${esc(T('Ajouter des cartes'))}</button></div>`; return; }
  const s = deckCurve(d.cards, byId), max = Math.max(1, ...s.curve.slice(1)), cur = dkCur();
  const key = c => (st.group === 'type' ? c.type : Math.min(Math.max(c.cost, 1), 7));
  const label = k => (st.group === 'type' ? TYPE_NAMES()[k] : k === 7 ? T('Coût 7+') : T('Coût {n}', { n: k }));
  ids.sort((a, b) => { const x = byId.get(a), y = byId.get(b); return key(x) - key(y) || x.cost - y.cost || x.name.localeCompare(y.name) || a - b; });
  const groups = []; for (const id of ids) { const k = key(byId.get(id)); let g = groups[groups.length - 1]; if (!g || g.k !== k) groups.push(g = { k, ids: [] }); g.ids.push(id); }
  const miss = deckMissing(d.cards, COLL.map), missN = miss.reduce((a, m) => a + m.need, 0);
  const wantsOk = miss.every(m => (COLL.wants[m.id] || 0) >= d.cards[m.id]);
  pane.innerHTML = `<div class="panel dk-stats">
      <div class="dk-curve" role="img" aria-label="${esc(T('Courbe des coûts'))}">${s.curve.slice(1).map((n, i) => `<div class="dk-bar"><span class="dk-bar-n num">${n || ''}</span><i style="height:${Math.round(n / max * 100)}%"></i><span class="dk-bar-k">${i === 6 ? '7+' : i + 1}</span></div>`).join('')}</div>
      <div class="dk-facts"><span><svg class="i"><use href="#i-inkwell"/></svg>${esc(T('{n} encrables ({p} %)', { n: s.inkable, p: s.total ? Math.round(s.inkable / s.total * 100) : 0 }))}</span>
      ${s.types.map((n, i) => (n ? `<span>${esc(TYPE_NAMES()[i])} <b class="num">${n}</b></span>` : '')).join('')}</div></div>
    <div class="dk-group-by"><span class="muted small">${esc(T('Grouper par'))}</span><div class="seg" role="radiogroup"><button type="button" data-group="cost" aria-pressed="${st.group === 'cost'}">${esc(T('Coût'))}</button><button type="button" data-group="type" aria-pressed="${st.group === 'type'}">${esc(T('Type'))}</button></div></div>
    <div class="dk-lines" data-cards>${groups.map(g => `<h4 class="dk-gh">${esc(label(g.k))} <span class="muted num">${g.ids.reduce((a, id) => a + d.cards[id], 0)}</span></h4>${g.ids.map(id => dkLine(byId.get(id), d.cards[id], (own.get(id) || { n: 0 }).n, cur, d)).join('')}`).join('')}</div>
    ${missN ? `<div class="panel dk-miss"><p><b>${esc(TN(missN, '{n} carte manque à ta collection', '{n} cartes manquent à ta collection'))}</b></p>
      <button type="button" class="btn${wantsOk ? '' : ' btn-primary'}" data-wants ${wantsOk ? 'disabled' : ''}><svg class="i"><use href="#i-heart"/></svg>${esc(wantsOk ? T('Déjà dans mes recherches') : TN(missN, 'Ajouter la manquante à mes recherches', 'Ajouter les {n} manquantes à mes recherches'))}</button></div>` : ''}
    <div class="btn-row"><button type="button" class="btn" data-export><svg class="i"><use href="#i-share"/></svg>${esc(T('Exporter la liste'))}</button><button type="button" class="btn btn-ghost" data-rename><svg class="i"><use href="#i-edit"/></svg>${esc(T('Renommer'))}</button></div>`;
}
function dkLine(c, n, have, cur, d) {
  const short = Math.max(0, n - have), can = deckCanAdd(d.cards, CARDS.byId, c), p = cardPrice(c, false);
  return `<div class="dk-line${short ? ' is-short' : ''}">${thumbHtml(c, { size: 'small', missing: short > 0 })}
    <div class="row-main"><span class="row-title">${esc(c.name)}</span><span class="row-sub">${esc(c.ver || '')}${c.ver ? ' · ' : ''}${esc(setLabel(c))}</span>
    <span class="dk-line-meta"><span class="dk-cost num" title="${esc(T('Coût'))}">${c.cost}</span>${inkPips(c)}${p ? `<span class="num muted small">${fmtMoney(p, cur)}</span>` : ''}${short ? `<span class="dk-short">${esc(T('manque {n}', { n: short }))}</span>` : ''}</span></div>
    <div class="stepper"><button type="button" data-step="-1" data-id="${c.id}" aria-label="${esc(T('Retirer {name}', { name: c.name }))}"><svg class="i"><use href="#i-minus"/></svg></button><span class="n">${n}</span><button type="button" data-step="1" data-id="${c.id}" ${can ? '' : 'disabled'} aria-label="${esc(T('Ajouter {name}', { name: c.name }))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>`;
}
/** Volets « Ajouter » (tout le catalogue) et « Collection » (mes cartes) : filtres + grille. */
function dkSearchPaint(st, kind) {
  const pane = $(`[data-pane="${kind}"]`, st.el), d = st.d, chk = deckCheck(d.cards, CARDS.byId), lock = chk.inks.length === DECK_INKS ? chk.inks : null;
  const fBox = $('.dk-filters', pane);
  if (!fBox.dataset.ok) {
    fBox.dataset.ok = '1';
    fBox.innerHTML = `<label class="search"><svg class="i"><use href="#i-search"/></svg><input class="input" type="search" data-f="q" placeholder="${esc(T('Nom de la carte ou numéro'))}" autocomplete="off"></label>
      <div class="chips dk-ink-chips">${INK_KEYS.map((k, i) => `<button type="button" class="chip" data-ink="${i}" aria-pressed="false" aria-label="${esc(INK_NAMES()[i])}"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg></button>`).join('')}</div>
      <div class="dk-selects"><select class="select" data-f="cost" aria-label="${esc(T('Coût'))}"><option value="">${esc(T('Tous les coûts'))}</option>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}">${esc(T('Coût {n}', { n }))}</option>`).join('')}<option value="9">${esc(T('Coût 9+'))}</option></select>
      <select class="select" data-f="type" aria-label="${esc(T('Type'))}"><option value="">${esc(T('Tous les types'))}</option>${TYPE_NAMES().map((t, i) => `<option value="${i}">${esc(t)}</option>`).join('')}</select></div>
      <p class="dk-lock small muted"></p>`;
  }
  for (const b of $$('[data-ink]', fBox)) { const i = +b.dataset.ink; b.setAttribute('aria-pressed', String(st.ink === String(i))); b.disabled = !!lock && !lock.includes(i); }
  $('[data-f="q"]', fBox).value = st.q; $('[data-f="cost"]', fBox).value = st.cost; $('[data-f="type"]', fBox).value = st.type;
  $('.dk-lock', fBox).textContent = lock ? T('Deck à deux encres : seules les cartes de ces encres sont proposées.') : '';
  const fits = c => !lock || inksOf(c.ink).every(i => lock.includes(i));
  const f = { ink: st.ink, cost: st.cost, type: st.type };
  let res;
  if (kind === 'coll') {
    const own = collById(COLL.map), words = normName(st.q).split(' ').filter(Boolean);
    res = cardSearch('', f, 100000).filter(c => own.has(c.id) && fits(c) && words.every(w => c.key.includes(w)));
    if (st.q && !words.length) res = [];
  } else res = cardSearch(st.q, f, 1500).filter(fits);
  const shown = res.slice(0, 120), grid = $('.dk-grid', pane);
  if (!shown.length) { grid.innerHTML = `<p class="muted small dk-none">${esc(kind === 'coll' && !Object.keys(COLL.map).length ? T('Ta collection est vide.') : T('Aucune carte'))}</p>`; return; }
  const own = collById(COLL.map);
  grid.innerHTML = shown.map(c => { const n = d.cards[c.id] || 0, can = deckCanAdd(d.cards, CARDS.byId, c); return `<div class="dk-pick">${thumbHtml(c, { size: 'normal', qty: n, cap: esc(setLabel(c)) + (own.get(c.id) ? ` · ${esc(T('×{n} à toi', { n: own.get(c.id).n }))}` : '') })}
    <div class="dk-pick-act"><button type="button" class="btn-icon" data-step="-1" data-id="${c.id}" ${n ? '' : 'disabled'} aria-label="${esc(T('Retirer {name}', { name: c.name }))}"><svg class="i"><use href="#i-minus"/></svg></button><button type="button" class="btn-icon dk-plus" data-step="1" data-id="${c.id}" ${can ? '' : 'disabled'} aria-label="${esc(T('Ajouter {name}', { name: c.name }))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>`; }).join('')
    + (res.length > shown.length ? `<p class="muted small dk-none">${esc(T('{n} cartes de plus : précise la recherche', { n: res.length - shown.length }))}</p>` : '');
}
function dkEdClick(st, e) {
  const t = e.target, d = st.d;
  const tab = t.closest('[data-tab]');
  if (tab) {
    st.tab = tab.dataset.tab; $('.dk-ed', st.el).dataset.cur = st.tab;
    for (const b of $$('.dk-tabs [data-tab]', st.el)) b.setAttribute('aria-selected', String(b.dataset.tab === st.tab));
    for (const p of $$('.dk-pane', st.el)) p.classList.toggle('on', p.dataset.pane === st.tab);
    if (st.tab !== 'deck') dkSearchPaint(st, st.tab); else if (matchMedia('(min-width:1024px)').matches) dkSearchPaint(st, 'add');
    return;
  }
  const step = t.closest('[data-step]');
  if (step) {
    const c = CARDS.byId.get(+step.dataset.id), dir = +step.dataset.step; if (!c) return;
    if (dir > 0 && !deckCanAdd(d.cards, CARDS.byId, c)) { toast(T('{name} : 4 exemplaires au plus', { name: c.name })); return; }
    const n = Math.max(0, (d.cards[c.id] || 0) + dir); if (n) d.cards[c.id] = n; else delete d.cards[c.id];
    dkTouch(d); st.paint(); return;
  }
  const ink = t.closest('.dk-ink-chips [data-ink]'); if (ink) { st.ink = st.ink === ink.dataset.ink ? '' : ink.dataset.ink; dkSearchPaint(st, st.tab === 'coll' ? 'coll' : 'add'); return; }
  const g = t.closest('[data-group]'); if (g) { st.group = g.dataset.group; save('dkGroup', st.group); dkDeckPaint(st); return; }
  if (t.closest('[data-wants]')) {
    const miss = deckMissing(d.cards, COLL.map);
    for (const m of miss) COLL.wants[m.id] = Math.max(COLL.wants[m.id] || 0, d.cards[m.id]);
    collSave(); toast(TN(miss.length, '{n} carte ajoutée à tes recherches', '{n} cartes ajoutées à tes recherches')); st.paint(); return;
  }
  if (t.closest('[data-export]')) { dkExport(d); return; }
  if (t.closest('[data-rename]')) dkNameSheet(T('Renommer'), d.name, v => { d.name = String(v).trim().slice(0, 60) || d.name; dkTouch(d); const h = $('.screen-head h2', st.el); if (h) h.textContent = d.name; });
}

if (typeof document !== 'undefined' && typeof onView === 'function') {
  onView('decks', el => dkMount(el));
  onColl(() => { if (DK.ed) DK.ed.paint(); else if (curView() === 'decks') dkListPaint(); });
  document.addEventListener('io:data', () => { if (curView() === 'decks') dkListPaint(); });
}
