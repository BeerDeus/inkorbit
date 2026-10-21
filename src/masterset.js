/* ── masterset.js : extensions et masterset ──────────────────────────────────────────────────────────
   · msListHtml() : les extensions (la plus récente d'abord) avec la progression de la collection (cartes de base différentes possédées / taille de l'extension).
   · openSet(code) : toutes les cartes de l'extension dans l'ordre des numéros (possédées en couleur, manquantes grisées), progression de base et complète
     (Enchantées, Épiques, Iconiques comprises), en foil si demandé ; filtres Toutes / Possédées / Manquantes et rareté ; souhaiter les manquantes. */
const setCards = code => CARDS.list.filter(c => c.set === code).sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10) || String(a.num).localeCompare(String(b.num)));
/** Progression d'une extension : { base, baseOwn, all, allOwn, miss (centimes de ce qui manque, normales) }. foil : ne compter que les foils. */
function setProgress(code, foil = false) {
  const own = collById(COLL.map), s = CARDS.setsByCode.get(code), base = (s && s.base) || 0, cur = prefs().cur;
  let baseOwn = 0, all = 0, allOwn = 0, miss = 0;
  for (const c of setCards(code)) {
    const o = own.get(c.id), has = o && (foil ? o.foil : o.n) > 0, isBase = parseInt(c.num, 10) <= base && !/[a-z]$/.test(c.num);
    all++; if (has) allOwn++; if (isBase && has) baseOwn++;
    if (!has) miss += priceFor(PRICES.p, c.id, foil, cur);
  }
  return { base: base || all, baseOwn, all, allOwn, miss };
}
const ringSvg = p => `<svg class="ms-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" class="ms-ring-bg"/>${p > 0 ? `<circle cx="18" cy="18" r="15.5" class="ms-ring-fg" stroke-dasharray="${(p * 97.4).toFixed(1)} 97.4"/>` : ''}</svg>`;
function msListHtml() {
  const sets = CARDS.sets.filter(s => s.type === 'expansion' || s.type === 'quest').slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="list ms-list">${sets.map(s => { const p = setProgress(s.code), r = p.base ? p.baseOwn / p.base : 0; return `<button type="button" class="row" data-set="${esc(s.code)}">
    <span class="ms-ring-w">${ringSvg(r)}<b class="num">${Math.round(r * 100)}</b></span>
    <span class="row-main"><span class="row-title">${esc(s.name)}</span><span class="row-sub">${esc(s.type === 'quest' ? T('Quête des Illumineurs') : T('Extension {n}', { n: s.code }))} · ${fmtNum(p.baseOwn)}/${fmtNum(p.base)}</span></span>
    <svg class="i"><use href="#i-chev"/></svg></button>`; }).join('')}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (b && !b.closest('.ms-screen')) openSet(b.dataset.set); });

const MS = { f: 'all', rar: '', foil: false };
function openSet(code) {
  const s = CARDS.setsByCode.get(code); if (!s) return;
  const el = openScreen({ title: s.name, cls: 'ms-screen', html: '<div class="ms-host"></div>' });
  const host = $('.ms-host', el);
  const paint = () => {
    const own = collById(COLL.map), p = setProgress(code, MS.foil), cur = prefs().cur;
    const has = c => { const o = own.get(c.id); return !!o && (MS.foil ? o.foil : o.n) > 0; };
    const cards = setCards(code).filter(c => (MS.rar === '' || c.rar === +MS.rar) && (MS.f === 'all' || (MS.f === 'own') === has(c)));
    const rars = [...new Set(setCards(code).map(c => c.rar))].sort((a, b) => a - b);
    const missing = setCards(code).filter(c => !has(c));
    host.innerHTML = `<div class="ms-head da-frame">
        <div class="ms-big">${ringSvg(p.base ? p.baseOwn / p.base : 0)}<div><b class="num">${fmtNum(p.baseOwn)}<small>/${fmtNum(p.base)}</small></b><span class="muted small">${esc(T('cartes de base'))}</span></div></div>
        <p class="muted small">${esc(T('Complète : {a}/{b} avec les Enchantées, Épiques et Iconiques', { a: fmtNum(p.allOwn), b: fmtNum(p.all) }))}${p.miss ? ' · ' + esc(T('Ce qui manque : {v}', { v: fmtMoney(p.miss, cur) })) : ''}</p>
      </div>
      <div class="seg" role="group">${[['all', T('Toutes')], ['own', T('Possédées')], ['miss', T('Manquantes')]].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${MS.f === k}">${esc(l)}</button>`).join('')}</div>
      <div class="chips"><button type="button" class="chip" data-rar="" aria-pressed="${MS.rar === ''}">${esc(T('Toutes raretés'))}</button>${rars.map(r => `<button type="button" class="chip" data-rar="${r}" aria-pressed="${MS.rar === String(r)}"><i class="rar-dot" data-rar="${RAR_KEYS[r]}"></i>${esc(RAR_NAMES()[r])}</button>`).join('')}</div>
      <label class="switch"><input type="checkbox" data-foil${MS.foil ? ' checked' : ''}><span>${esc(T('Masterset foil'))} ✦</span></label>
      <div class="grid-cards" data-cards>${cards.map(c => { const o = own.get(c.id); return thumbHtml(c, { missing: !has(c), qty: o ? (MS.foil ? o.foil : o.n) : 0, foil: o && o.foil > 0, cap: `${esc(c.num)} · <b class="num">${fmtMoney(priceFor(PRICES.p, c.id, MS.foil, cur), cur)}</b>` }); }).join('') || `<p class="muted">${esc(T('Aucune carte'))}</p>`}</div>
      ${missing.length ? `<button type="button" class="btn btn-block" data-wish><svg class="i"><use href="#i-heart"/></svg>${esc(TN(missing.length, 'Ajouter la carte manquante à mes recherches', 'Ajouter les {n} cartes manquantes à mes recherches'))}</button>` : `<p class="good">${esc(T('Extension complète ✦'))}</p>`}`;
  };
  host.addEventListener('click', e => {
    const f = e.target.closest('[data-f]'); if (f) { MS.f = f.dataset.f; paint(); return; }
    const r = e.target.closest('.chip[data-rar]'); if (r) { MS.rar = r.dataset.rar; paint(); return; }
    if (e.target.closest('[data-wish]')) {
      const own = collById(COLL.map), before = { ...COLL.wants }; let n = 0;
      for (const c of setCards(code)) { const o = own.get(c.id); if (!(o && (MS.foil ? o.foil : o.n) > 0) && !COLL.wants[c.id]) { COLL.wants[c.id] = 1; n++; } }
      collSave(); toast(TN(n, '{n} carte ajoutée à tes recherches', '{n} cartes ajoutées à tes recherches'), { action: T('Annuler'), onAction: () => { COLL.wants = before; collSave(); } });
    }
  });
  host.addEventListener('change', e => { if (e.target.matches('[data-foil]')) { MS.foil = e.target.checked; paint(); } });
  const off = () => paint(); collSubs.add(off);
  const close = el.close; el.close = () => { collSubs.delete(off); close(); };
  paint();
}
