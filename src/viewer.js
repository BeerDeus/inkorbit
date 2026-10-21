/* ── viewer.js : vignettes de cartes, carte en grand (navigable), choix d'une carte, ajout à la collection ─────────────────────
   · thumbHtml(c, o) : vignette <button class="card-thumb" data-card="<id>"> (image Lorcast, quantité, foil, grisée si manquante).
     Un seul écouteur : toucher une vignette ouvre la carte en grand, précédente / suivante parmi les vignettes du même conteneur [data-cards].
   · openCard(id, ids) : la carte en grand (image, encres, coût, prix normal et foil, exemplaires possédés − n +, foil, « Je la cherche »).
   · pickCard({ title, onPick }) : feuille de recherche d'une carte (decks, souhaits, corrections du scan).
   · collAddCard(c, n, { foil, lang }) : ajoute à la collection avec « Annuler ». */

/** Pastilles d'encre d'une carte (symboles originaux d'Ink Orbit, icons.html). */
const inkPips = c => inksOf(c.ink).map(i => `<svg class="ink-sym" data-ink="${INK_KEYS[i]}" aria-label="${esc(INK_NAMES()[i])}"><use href="#ink-${INK_KEYS[i]}"/></svg>`).join('');
const rarLabel = c => `<span class="rar" data-rar="${RAR_KEYS[c.rar]}">${esc(RAR_NAMES()[c.rar])}</span>`;
/** Vignette. o : { qty, foil, missing, size ('small' | 'normal'), cap (légende sous la vignette) }. */
function thumbHtml(c, o = {}) {
  if (!c) return '';
  const src = cardImg(c, o.size || 'normal');
  return `<div class="ct-wrap"><button type="button" class="card-thumb${o.missing ? ' is-missing' : ''}" data-card="${c.id}" aria-label="${esc(fullName(c))}">`
    + (src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" width="244" height="341">` : `<span class="ct-ph">${esc(c.name)}</span>`)
    + (o.foil ? `<span class="foil" title="${esc(T('Foil'))}"><svg class="i"><use href="#i-sparkle"/></svg></span>` : '')
    + (o.qty ? `<span class="qty">${o.qty > 1 || o.showOne ? '×' + o.qty : '1'}</span>` : '')
    + `</button>${o.cap ? `<div class="card-cap">${o.cap}</div>` : ''}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.card-thumb[data-card]'); if (!b || b.closest('[data-pick]')) return;
  const box = b.closest('[data-cards]') || b.parentElement.parentElement;
  const ids = $$('.card-thumb[data-card]', box).map(x => +x.dataset.card);
  openCard(+b.dataset.card, ids);
});

/** Ajoute n exemplaires (n < 0 : retire) ; toast « Annuler ». */
function collAddCard(c, n = 1, { foil = false, lang = '', quiet = false } = {}) {
  const k = collKey(c.id, foil, lang), before = COLL.map[k] || 0;
  collAdd(COLL.map, k, n); collSave();
  if (!quiet) toast(n > 0 ? T('{name} ajoutée', { name: c.name }) + (foil ? ' ✦' : '') : T('{name} retirée', { name: c.name }), { action: T('Annuler'), onAction: () => { if (before) COLL.map[k] = before; else delete COLL.map[k]; collSave(); } });
}
/** Exemplaires d'une carte par finition (toutes langues) : { n, f }. */
function ownSplit(id) { let n = 0, f = 0; for (const [k, q] of Object.entries(COLL.map)) { const p = collParse(k); if (p && p.id === id) { if (p.foil) f += q; else n += q; } } return { n, f }; }

/* ── Carte en grand ─────────────────────────────────────────────────────────────────────────── */
function cardStats(c) {
  const bits = [];
  if (c.cost >= 0) bits.push(`<span class="cv-cost" title="${esc(T('Coût'))}">${c.cost}</span>`);
  bits.push(c.inkwell ? `<span class="cv-tag" title="${esc(T('Encrable'))}"><svg class="i"><use href="#i-inkwell"/></svg>${esc(T('Encrable'))}</span>` : `<span class="cv-tag dim">${esc(T('Non encrable'))}</span>`);
  if (c.str >= 0) bits.push(`<span class="cv-tag">${esc(T('Force'))} ${c.str}</span>`);
  if (c.wil >= 0) bits.push(`<span class="cv-tag">${esc(T('Volonté'))} ${c.wil}</span>`);
  if (c.lore >= 0) bits.push(`<span class="cv-tag">${esc(T('Lore'))} ${c.lore}</span>`);
  return bits.join('');
}
function cardBodyHtml(c) {
  const own = ownSplit(c.id), p = PRICES.p[c.id], cur = prefs().cur, want = COLL.wants[c.id] || 0;
  const px = (n, f) => `<div class="cv-px"><span>${esc(n)}</span><b class="num">${f ? fmtMoney(f, cur) : '—'}</b></div>`;
  const canN = c.foil & 1 || !c.foil, canF = c.foil & 2;
  return `<div class="cv">
    <div class="cv-img">${cardImg(c, 'large') ? `<img src="${esc(cardImg(c, 'large'))}" alt="${esc(fullName(c))}" width="488" height="681">` : ''}</div>
    <div class="cv-info">
      <div class="cv-head"><div><h3 class="cv-name">${esc(c.name)}</h3>${c.ver ? `<p class="cv-ver">${esc(c.ver)}</p>` : ''}</div><div class="cv-inks">${inkPips(c)}</div></div>
      <p class="cv-set muted small">${esc(setName(c.set))} · ${esc(T('n° {n}', { n: c.num }))} · ${rarLabel(c)} · ${esc(TYPE_NAMES()[c.type])}</p>
      <div class="cv-stats">${cardStats(c)}</div>
      <div class="cv-pxs">${canN ? px(T('Normale'), p && (cur === 'USD' ? p[2] : p[0])) : ''}${canF ? px(T('Foil'), p && (cur === 'USD' ? p[3] : p[1])) : ''}</div>
      <div class="cv-own">
        ${canN ? `<div class="cv-own-row"><span>${esc(T('Normale'))}</span><div class="stepper" data-own="0"><button type="button" data-d="-1" aria-label="${esc(T('Retirer'))}"><svg class="i"><use href="#i-minus"/></svg></button><span class="n">${own.n}</span><button type="button" data-d="1" aria-label="${esc(T('Ajouter'))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>` : ''}
        ${canF ? `<div class="cv-own-row"><span>${esc(T('Foil'))} ✦</span><div class="stepper" data-own="1"><button type="button" data-d="-1" aria-label="${esc(T('Retirer un foil'))}"><svg class="i"><use href="#i-minus"/></svg></button><span class="n">${own.f}</span><button type="button" data-d="1" aria-label="${esc(T('Ajouter un foil'))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>` : ''}
      </div>
      <button type="button" class="btn ${want ? 'btn-primary' : ''}" data-want aria-pressed="${want ? 'true' : 'false'}"><svg class="i"><use href="#i-heart"/></svg>${esc(want ? T('Dans mes recherches') : T('Je la cherche'))}</button>
      ${c.text ? `<details class="cv-text"><summary>${esc(T('Texte de la carte'))}</summary><p>${esc(c.text).replace(/\n/g, ' ')}</p>${c.sub ? `<p class="muted small">${esc(c.sub)}</p>` : ''}</details>` : ''}
      <p class="cv-src muted small">${esc(T('Image : Lorcast · Prix : Cardmarket (€), TCGplayer ($)'))}</p>
    </div></div>`;
}
function openCard(id, ids) {
  const list = ids && ids.length ? ids : [id];
  let i = Math.max(0, list.indexOf(id));
  const c0 = CARDS.byId.get(id); if (!c0) return;
  const el = openScreen({ title: c0.name, html: '<div class="cv-host"></div>', cls: 'card-screen' });
  const host = $('.cv-host', el), title = $('.screen-head h2', el);
  if (list.length > 1) $('.screen-head', el).insertAdjacentHTML('beforeend', `<button type="button" class="btn-icon" data-nav="-1" aria-label="${esc(T('Carte précédente'))}"><svg class="i flip"><use href="#i-chev"/></svg></button><button type="button" class="btn-icon" data-nav="1" aria-label="${esc(T('Carte suivante'))}"><svg class="i"><use href="#i-chev"/></svg></button>`);
  const paint = () => { const c = CARDS.byId.get(list[i]); host.innerHTML = cardBodyHtml(c); if (title) title.textContent = c.name; };
  const go = d => { i = (i + d + list.length) % list.length; paint(); };
  el.addEventListener('click', e => {
    const c = CARDS.byId.get(list[i]);
    const nav = e.target.closest('[data-nav]'); if (nav) { go(+nav.dataset.nav); return; }
    const st = e.target.closest('.stepper[data-own] [data-d]');
    if (st) { const foil = st.closest('[data-own]').dataset.own === '1', d = +st.dataset.d; if (d < 0 && !(foil ? ownSplit(c.id).f : ownSplit(c.id).n)) return; collRemoveOrAdd(c, d, foil); paint(); return; }
    if (e.target.closest('[data-want]')) { if (COLL.wants[c.id]) delete COLL.wants[c.id]; else COLL.wants[c.id] = 1; collSave(); paint(); }
  });
  el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); });
  let x0 = null;      // glisser à gauche / à droite sur l'image : carte suivante / précédente
  host.addEventListener('pointerdown', e => { if (e.target.closest('.cv-img')) x0 = e.clientX; });
  host.addEventListener('pointerup', e => { if (x0 != null && list.length > 1 && Math.abs(e.clientX - x0) > 60) go(e.clientX < x0 ? 1 : -1); x0 = null; });
  paint();
}
/** Retirer prend d'abord un exemplaire sans langue, puis n'importe quelle langue de la même finition. */
function collRemoveOrAdd(c, d, foil) {
  if (d > 0) { collAdd(COLL.map, collKey(c.id, foil), 1); collSave(); return; }
  const k = [collKey(c.id, foil), ...IO_LANGS.map(l => collKey(c.id, foil, l))].find(x => COLL.map[x] > 0);
  if (k) { collAdd(COLL.map, k, -1); collSave(); }
}

/* ── Choisir une carte ──────────────────────────────────────────────────────────────────────── */
/** Feuille de recherche : onPick(c) à chaque toucher (la feuille reste ouverte si keep). */
function pickCard({ title = T('Choisir une carte'), onPick, keep = false, q = '' } = {}) {
  const el = openSheet({ title, cls: 'pick-sheet', html: `<label class="search"><svg class="i"><use href="#i-search"/></svg><input class="input" type="search" placeholder="${esc(T('Nom de la carte ou numéro'))}" autocomplete="off" autofocus value="${esc(q)}"></label><div class="grid-cards" data-pick></div>` });
  const inp = $('input', el), grid = $('[data-pick]', el);
  const run = () => { const r = inp.value.trim() ? cardSearch(inp.value, {}, 60) : []; grid.innerHTML = r.length ? r.map(c => thumbHtml(c, { size: 'small', cap: esc(setLabel(c)) })).join('') : `<p class="muted small">${esc(inp.value.trim() ? T('Aucune carte') : T('Tape le nom d\'une carte'))}</p>`; };
  let t = 0; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  grid.addEventListener('click', e => { const b = e.target.closest('[data-card]'); if (!b) return; const c = CARDS.byId.get(+b.dataset.card); if (!keep) el.close(); onPick && onPick(c); });
  dataLoad().then(run, () => {});
  return el;
}
