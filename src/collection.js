/* ── collection.js : vue « Collection » (onglets Cartes · Extensions · Stats), ajout manuel, import / export CSV ─────────────────
   Source de vérité : COLL.map (data.js), { "<id>[*][@langue]": n } dans localStorage. Les extensions (masterset) : masterset.js › msListHtml / openSet. */
const CV = { tab: 'cards', q: '', ink: '', sort: 'set', show: 300, el: null };
const SORTS = () => [['set', T('Extension')], ['name', T('Nom')], ['price', T('Prix')], ['cost', T('Coût')], ['qty', T('Quantité')]];

onView('coll', el => { CV.el = el; dataLoad().then(collPaint, () => collFail(el)); if (!CARDS.ready) el.innerHTML = skeletonCards(6); });
onColl(() => { if (curView() === 'coll' && CV.el) collPaint(); });
function collFail(el) { el.innerHTML = `<div class="empty"><svg class="i"><use href="#i-offline"/></svg><h3>${esc(T('Catalogue indisponible'))}</h3><p>${esc(T('Connecte-toi une première fois pour télécharger les cartes.'))}</p></div>`; }

/** Lignes de la collection groupées par carte : [{ c, n, f }] (n : total, f : dont foil). */
function collRows() {
  const out = [];
  for (const [id, o] of collById(COLL.map)) { const c = CARDS.byId.get(id); if (c) out.push({ c, n: o.n, f: o.foil }); }
  return out;
}
function collSorted() {
  const words = normName(CV.q), cur = prefs().cur;
  let rows = collRows().filter(r => (!words || words.split(' ').every(w => r.c.key.includes(w))) && (CV.ink === '' || (r.c.ink >> CV.ink) & 1));
  const px = r => priceFor(PRICES.p, r.c.id, r.f > 0 && r.f === r.n, cur);
  const by = { set: (a, b) => a.c.id - b.c.id, name: (a, b) => a.c.name.localeCompare(b.c.name, I18N.lang) || a.c.id - b.c.id, price: (a, b) => px(b) - px(a), cost: (a, b) => a.c.cost - b.c.cost || a.c.id - b.c.id, qty: (a, b) => b.n - a.n || a.c.id - b.c.id }[CV.sort];
  return rows.sort(by);
}
function collPaint() {
  const el = CV.el; if (!el) return;
  const all = collRows(), total = all.reduce((s, r) => s + r.n, 0), cur = prefs().cur;
  el.innerHTML = `<div class="coll-head"><h1>${esc(T('Ma collection'))}</h1><p class="muted">${esc(TN(total, '{n} carte', '{n} cartes'))} · ${esc(TN(all.length, '{n} différente', '{n} différentes'))} · <b class="num">${fmtMoney(collValue(COLL.map, PRICES.p, cur))}</b></p></div>
    <div class="tabs" role="tablist">${[['cards', T('Cartes')], ['sets', T('Extensions')], ['stats', T('Stats')]].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${CV.tab === k}">${esc(l)}</button>`).join('')}</div>
    <div class="coll-body"></div>`;
  el.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { CV.tab = b.dataset.tab; collPaint(); } });
  const body = $('.coll-body', el);
  if (CV.tab === 'sets') { body.innerHTML = typeof msListHtml === 'function' ? msListHtml() : ''; return; }
  if (CV.tab === 'stats') { body.innerHTML = collStatsHtml(all); return; }
  collCardsTab(body, all.length);
}
function collCardsTab(body, n) {
  body.innerHTML = `<div class="coll-tools">
      <label class="search"><svg class="i"><use href="#i-search"/></svg><input class="input" type="search" placeholder="${esc(T('Chercher dans ma collection'))}" aria-label="${esc(T('Chercher dans ma collection'))}" value="${esc(CV.q)}" data-q></label>
      <div class="chips" role="group" aria-label="${esc(T('Encre'))}"><button type="button" class="chip" data-ink="" aria-pressed="${CV.ink === ''}">${esc(T('Toutes'))}</button>${INK_KEYS.map((k, i) => `<button type="button" class="chip" data-ink="${i}" aria-pressed="${CV.ink === i}" aria-label="${esc(INK_NAMES()[i])}"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg></button>`).join('')}</div>
      <div class="coll-actions"><select class="select" data-sort aria-label="${esc(T('Trier'))}">${SORTS().map(([k, l]) => `<option value="${k}"${CV.sort === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(T('Ajouter'))}</button>
      <button type="button" class="btn-icon" data-more aria-label="${esc(T('Importer, exporter'))}"><svg class="i"><use href="#i-more"/></svg></button></div>
    </div><div class="grid-cards coll-grid" data-cards></div><div class="coll-more"></div>`;
  const grid = $('.coll-grid', body), more = $('.coll-more', body);
  const paintGrid = () => {
    const rows = collSorted();
    grid.innerHTML = rows.slice(0, CV.show).map(r => thumbHtml(r.c, { qty: r.n, foil: r.f > 0, showOne: true, cap: esc(setLabel(r.c)) })).join('');
    more.innerHTML = rows.length > CV.show ? `<button type="button" class="btn btn-block" data-show>${esc(T('Afficher plus ({n})', { n: rows.length - CV.show }))}</button>` : '';
    if (!n) grid.outerHTML = `<div class="empty"><svg class="i"><use href="#i-cards"/></svg><h3>${esc(T('Ta collection est vide'))}</h3><p>${esc(T('Scanne tes cartes, ajoute-les une par une ou importe un fichier CSV (Dreamborn…).'))}</p><div class="btn-row"><button type="button" class="btn btn-primary" data-view="scan"><svg class="i"><use href="#i-scan"/></svg>${esc(T('Scanner'))}</button><button type="button" class="btn" data-import>${esc(T('Importer'))}</button></div></div>`;
    else if (!rows.length) grid.innerHTML = `<p class="muted">${esc(T('Aucune carte ne correspond.'))}</p>`;
  };
  let t = 0;
  body.addEventListener('input', e => { if (e.target.matches('[data-q]')) { CV.q = e.target.value; CV.show = 300; clearTimeout(t); t = setTimeout(paintGrid, 120); } });
  body.addEventListener('change', e => { if (e.target.matches('[data-sort]')) { CV.sort = e.target.value; paintGrid(); } });
  body.addEventListener('click', e => {
    const ink = e.target.closest('[data-ink]');
    if (ink && ink.classList.contains('chip')) { CV.ink = ink.dataset.ink === '' ? '' : +ink.dataset.ink; $$('.chip[data-ink]', body).forEach(b => b.setAttribute('aria-pressed', b === ink)); paintGrid(); return; }
    if (e.target.closest('[data-show]')) { CV.show += 300; paintGrid(); return; }
    if (e.target.closest('[data-add]')) { openAddCards(); return; }
    if (e.target.closest('[data-import]')) { openImport(); return; }
    if (e.target.closest('[data-more]')) openCollMenu();
  });
  paintGrid();
}

/* ── Ajouter des cartes une par une ─────────────────────────────────────────────────────────── */
function openAddCards() {
  const el = pickCard({ title: T('Ajouter des cartes'), keep: true, onPick: c => {
    const foil = c.foil === 2 || (!!$('[data-foil]', el).checked && !!(c.foil & 2));      // foil === 2 : n'existe qu'en foil (Enchantée…)
    collAddCard(c, 1, { foil, lang: $('[data-lang]', el).value });
    const b = $(`.card-thumb[data-card="${c.id}"]`, el); if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  } });
  $('.sheet-body', el).insertAdjacentHTML('afterbegin', `<div class="add-opts"><label class="switch"><input type="checkbox" data-foil><span>${esc(T('Foil'))} ✦</span></label>
    <select class="select" data-lang aria-label="${esc(T('Langue des cartes'))}"><option value="">${esc(T('Langue ?'))}</option>${IO_LANGS.map(l => `<option value="${l}">${l.toUpperCase()}</option>`).join('')}</select></div>
    <p class="muted small">${esc(T('Touche une carte pour en ajouter un exemplaire.'))}</p>`);
}

/* ── Import / export ────────────────────────────────────────────────────────────────────────── */
function openCollMenu() {
  const el = openSheet({ title: T('Ma collection'), html: `<div class="list">
    <button type="button" class="row" data-a="import"><svg class="i"><use href="#i-upload"/></svg><span class="row-main"><span class="row-title">${esc(T('Importer un fichier CSV'))}</span><span class="row-sub">${esc(T('Dreamborn, TCGplayer, tableur, Ink Orbit'))}</span></span></button>
    <button type="button" class="row" data-a="csv"><svg class="i"><use href="#i-download"/></svg><span class="row-main"><span class="row-title">${esc(T('Exporter en CSV'))}</span><span class="row-sub">${esc(T('Relu par Ink Orbit et Dreamborn'))}</span></span></button>
    <button type="button" class="row" data-a="wipe"><svg class="i"><use href="#i-trash"/></svg><span class="row-main"><span class="row-title">${esc(T('Vider la collection'))}</span></span></button></div>` });
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'import') { el.close(); openImport(); }
    else if (a.dataset.a === 'csv') { dataEn().catch(() => {}).then(() => downloadText(`ink-orbit-collection-${dayKey()}.csv`, collToCsv(COLL.map, CARDS.byId), 'text/csv')); }
    else if (a.dataset.a === 'wipe') askSheet({ title: T('Vider la collection ?'), text: T('Toutes tes cartes sont retirées. Les decks et les recherches sont gardés.'), ok: T('Vider'), danger: true }).then(yes => { if (!yes) return; const before = COLL.map; COLL.map = {}; collSave(); el.close(); toast(T('Collection vidée'), { action: T('Annuler'), onAction: () => { COLL.map = before; collSave(); } }); });
  });
}
function downloadText(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function openImport() {
  const el = openSheet({ title: T('Importer des cartes'), html: `<p class="muted">${esc(T('Fichier CSV avec les colonnes extension et numéro (Dreamborn : « Set Number, Card Number, Variant, Count ») ou le nom des cartes. Tu peux aussi coller une liste « 4 Elsa - Snow Queen ».'))}</p>
    <input type="file" accept=".csv,.txt,text/csv,text/plain" class="input" data-file>
    <textarea class="input" data-text placeholder="${esc(T('…ou colle ici le contenu'))}"></textarea>
    <label class="switch"><input type="checkbox" data-replace><span>${esc(T('Remplacer ma collection (sinon : ajouter)'))}</span></label>
    <button type="button" class="btn btn-primary btn-block" data-go>${esc(T('Importer'))}</button><div class="imp-out"></div>` });
  $('[data-file]', el).addEventListener('change', async e => { const f = e.target.files[0]; if (f) $('[data-text]', el).value = await f.text(); });
  $('[data-go]', el).addEventListener('click', async () => {
    const text = $('[data-text]', el).value, out = $('.imp-out', el);
    if (!text.trim()) return;
    out.innerHTML = `<p class="muted">${esc(T('Lecture…'))}</p>`;
    try { await dataEn(); } catch (e) { /* noms anglais indisponibles : extension et numéro suffisent */ }
    let r = parseCsv(text, CARDS.ix);
    if (!r.lines.length) { const d = parseDeck(text, CARDS.ix); r = { lines: [...d.cards].map(([card, qty]) => ({ card, qty, foil: false, lang: '' })), bad: d.bad }; }
    if (!r.lines.length) { out.innerHTML = `<p class="bad">${esc(T('Aucune carte reconnue.'))}</p>`; return; }
    const before = { ...COLL.map };
    if ($('[data-replace]', el).checked) COLL.map = {};
    let n = 0; for (const l of r.lines) { collAdd(COLL.map, collKey(l.card.id, l.foil, l.lang), l.qty); n += l.qty; }
    collSave();
    const capped = r.lines.filter(l => l.capped).length;
    out.innerHTML = `<p class="good">${esc(TN(n, '{n} carte importée', '{n} cartes importées'))}</p>` + (capped ? `<p class="muted small">${esc(TN(capped, '{n} quantité ramenée à 999', '{n} quantités ramenées à 999'))}</p>` : '') + (r.bad.length ? `<details><summary>${esc(TN(r.bad.length, '{n} ligne non reconnue', '{n} lignes non reconnues'))}</summary><pre class="imp-bad">${esc(r.bad.slice(0, 200).join('\n'))}</pre></details>` : '');
    toast(TN(n, '{n} carte importée', '{n} cartes importées'), { action: T('Annuler'), onAction: () => { COLL.map = before; collSave(); } });
  });
}

/* ── Stats ──────────────────────────────────────────────────────────────────────────────────── */
function collStatsHtml(rows) {
  if (!rows.length) return `<p class="muted">${esc(T('Ajoute des cartes pour voir tes statistiques.'))}</p>`;
  const cur = prefs().cur, ink = INK_KEYS.map(() => 0), rar = RAR_KEYS.map(() => 0);
  let foil = 0, total = 0;
  for (const r of rows) { total += r.n; foil += r.f; for (const i of inksOf(r.c.ink)) ink[i] += r.n; rar[r.c.rar] += r.n; }
  const bars = (vals, names, keys, cls) => { const max = Math.max(1, ...vals); return `<div class="bars">${vals.map((v, i) => v ? `<div class="bar-row"><span class="bar-l">${cls === 'ink' ? `<svg class="ink-sym" data-ink="${keys[i]}"><use href="#ink-${keys[i]}"/></svg>` : ''}${esc(names[i])}</span><span class="bar-t"><i style="width:${(v / max * 100).toFixed(1)}%;background:var(--${cls === 'ink' ? keys[i] : 'r-' + keys[i]})"></i></span><b class="num">${fmtNum(v)}</b></div>` : '').join('')}</div>`; };
  const top = rows.map(r => ({ ...r, px: priceFor(PRICES.p, r.c.id, r.f > 0, cur) })).sort((a, b) => b.px - a.px).slice(0, 12);
  return `<div class="panel"><h3>${esc(T('Encres'))}</h3>${bars(ink, INK_NAMES(), INK_KEYS, 'ink')}</div>
    <div class="panel"><h3>${esc(T('Raretés'))}</h3>${bars(rar, RAR_NAMES(), RAR_KEYS, 'rar')}<p class="muted small">${esc(TN(foil, '{n} foil', '{n} foils'))} · ${esc(TN(total, '{n} carte', '{n} cartes'))}</p></div>
    <div class="panel"><h3>${esc(T('Les plus chères'))}</h3><div class="grid-cards" data-cards>${top.map(r => thumbHtml(r.c, { qty: r.n, foil: r.f > 0, size: 'small', cap: `<b class="num">${fmtMoney(r.px, cur)}</b>` })).join('')}</div></div>`;
}
