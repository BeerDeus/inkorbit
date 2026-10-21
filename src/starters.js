/* ── starters.js : decks de démarrage officiels (Decks › « À monter », section [data-starters] ; decks.js appelle starterMount) ─────────────
   Données : data/starters.json (gen-starters.mjs, depuis les decks préconstruits de LorcanaJSON) : { v, src, decks: [{ id, set, name, inks, cards }] }.
   Chaque deck : ses encres, son nom, son extension, sa carte la plus chère, « X/60 dans ta collection » et le prix de ce qui manque ; au toucher, la liste
   (manquantes grisées), « Copier dans mes decks » (decks.js › dkCreate, dkOpen) et « Ajouter les manquantes à mes recherches ». */
const ST = { data: null, wait: null, el: null, ink: '', sort: load('stSort', 'recent') };
function starterLoad() {
  return ST.wait || (ST.wait = fetch('data/starters.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(j => { ST.data = j; return j; }).catch(e => { ST.wait = null; throw e; }));
}
const starterName = d => d.name[I18N.lang] || d.name.en || d.id;
/** Cartes du deck déjà dans la collection (toutes finitions), au plus le nombre demandé par carte. */
function starterOwned(d, map) { const miss = deckMissing(d.cards, map).reduce((s, m) => s + m.need, 0); return 60 - miss; }

function starterMount(el) {
  ST.el = el;
  el.innerHTML = `<div class="da-rule"><span>${esc(T('Decks de démarrage'))}</span></div><div class="sk" style="height:110px"></div>`;
  Promise.all([starterLoad(), dataLoad()]).then(() => starterPaint(), () => { if (ST.el === el) el.innerHTML = `<div class="da-rule"><span>${esc(T('Decks de démarrage'))}</span></div><p class="muted small">${esc(T('Decks de démarrage indisponibles : vérifie ta connexion.'))}</p>`; });
}
onColl(() => { if (ST.el && ST.el.isConnected && ST.data && CARDS.ready) starterPaint(); });

function starterPaint() {
  const el = ST.el, cur = prefs().cur;
  let decks = ST.data.decks.filter(d => ST.ink === '' || d.inks.includes(+ST.ink)).map(d => ({ d, own: starterOwned(d, COLL.map), v: deckValue(d.cards, CARDS.byId, PRICES.p, cur, COLL.map) }));
  decks.sort(ST.sort === 'easy' ? (a, b) => b.own - a.own || a.v.missingValue - b.v.missingValue : (a, b) => (+b.d.set - +a.d.set) || a.d.id.localeCompare(b.d.id));
  el.innerHTML = `<div class="da-rule"><span>${esc(T('Decks de démarrage'))}</span></div>
    <div class="st-tools"><div class="chips" role="group" aria-label="${esc(T('Encre'))}"><button type="button" class="chip" data-st-ink="" aria-pressed="${ST.ink === ''}">${esc(T('Toutes'))}</button>${INK_KEYS.map((k, i) => `<button type="button" class="chip" data-st-ink="${i}" aria-pressed="${ST.ink === String(i)}" aria-label="${esc(INK_NAMES()[i])}"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg></button>`).join('')}</div>
    <div class="seg" role="group" aria-label="${esc(T('Trier'))}"><button type="button" data-st-sort="recent" aria-pressed="${ST.sort === 'recent'}">${esc(T('Plus récents'))}</button><button type="button" data-st-sort="easy" aria-pressed="${ST.sort === 'easy'}">${esc(T('Plus faciles à monter'))}</button></div></div>
    <div class="dk-cards">${decks.map(({ d, own, v }) => { const cover = deckCover(d.cards, CARDS.byId, PRICES.p, cur), img = cover && cardImg(cover, 'normal');
      return `<article class="dk-card st-card"><button type="button" class="dk-card-open" data-st-open="${esc(d.id)}" aria-label="${esc(starterName(d))}">
        <span class="dk-cover">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</span>
        <span class="dk-card-main"><span class="dk-card-name">${esc(starterName(d))}</span>
          <span class="dk-card-meta"><span class="dk-inks">${dkInkPips(d.inks)}</span><span>${esc(setName(d.set))}</span></span>
          <span class="st-bar" aria-hidden="true"><i style="width:${(own / 60 * 100).toFixed(1)}%"></i></span>
          <span class="dk-card-own ${v.missing ? '' : 'ok'}">${v.missing ? esc(T('{a}/60 dans ta collection', { a: own })) + (v.missingValue ? ` · ${esc(T('manque {v}', { v: fmtMoney(v.missingValue, cur) }))}` : '') : esc(T('Toutes les cartes sont dans ta collection'))}</span>
        </span></button></article>`; }).join('') || `<p class="muted small">${esc(T('Aucun deck de démarrage pour cette encre.'))}</p>`}</div>
    <p class="muted small">${esc(T('Listes officielles des decks de démarrage, d\'après LorcanaJSON.'))}</p>`;
  el.onclick = e => {
    const i = e.target.closest('[data-st-ink]'); if (i) { ST.ink = i.dataset.stInk; starterPaint(); return; }
    const s = e.target.closest('[data-st-sort]'); if (s) { ST.sort = s.dataset.stSort; save('stSort', ST.sort); starterPaint(); return; }
    const o = e.target.closest('[data-st-open]'); if (o) starterOpen(o.dataset.stOpen);
  };
}

function starterOpen(id) {
  const d = ST.data.decks.find(x => x.id === id); if (!d) return;
  const byId = CARDS.byId, cur = prefs().cur, own = collById(COLL.map);
  const ids = Object.keys(d.cards).map(Number).filter(x => byId.get(x)).sort((a, b) => { const x = byId.get(a), y = byId.get(b); return x.cost - y.cost || x.name.localeCompare(y.name) || a - b; });
  const el = openSheet({ title: starterName(d), cls: 'st-sheet', html: '<div class="st-host"></div>' }), host = $('.st-host', el);
  const paint = () => {
    const miss = deckMissing(d.cards, COLL.map), missN = miss.reduce((s, m) => s + m.need, 0), v = deckValue(d.cards, byId, PRICES.p, cur, COLL.map);
    const wantsOk = miss.every(m => (COLL.wants[m.id] || 0) >= d.cards[m.id]);
    let lastCost = -1;
    host.innerHTML = `<p class="muted small">${dkInkPips(d.inks)} ${esc(setName(d.set))} · ${esc(T('{a}/60 dans ta collection', { a: 60 - missN }))} · ${fmtMoney(v.value, cur)}</p>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-st-copy><svg class="i"><use href="#i-copy"/></svg>${esc(T('Copier dans mes decks'))}</button>
      ${missN ? `<button type="button" class="btn" data-st-wants ${wantsOk ? 'disabled' : ''}><svg class="i"><use href="#i-heart"/></svg>${esc(wantsOk ? T('Déjà dans mes recherches') : TN(missN, 'Ajouter la manquante à mes recherches', 'Ajouter les {n} manquantes à mes recherches'))}</button>` : ''}</div>
      <div class="dk-lines" data-cards>${ids.map(x => { const c = byId.get(x), n = d.cards[x], short = Math.max(0, n - ((own.get(x) || { n: 0 }).n)), h = c.cost !== lastCost ? `<h4 class="dk-gh">${esc(T('Coût {n}', { n: c.cost }))}</h4>` : ''; lastCost = c.cost;
        return `${h}<div class="dk-line${short ? ' is-short' : ''}">${thumbHtml(c, { size: 'small', missing: short > 0 })}<div class="row-main"><span class="row-title">${n} × ${esc(c.name)}</span><span class="row-sub">${esc(c.ver || '')}${c.ver ? ' · ' : ''}${esc(setLabel(c))}</span>${short ? `<span class="dk-line-meta"><span class="dk-short">${esc(T('manque {n}', { n: short }))}</span></span>` : ''}</div></div>`; }).join('')}</div>`;
  };
  host.addEventListener('click', e => {
    if (e.target.closest('[data-st-copy]')) { const nd = dkCreate(starterName(d), { ...d.cards }); el.close(); dkListPaint(); dkOpen(nd.id); toast(T('Deck copié dans « Mes decks »')); return; }
    if (e.target.closest('[data-st-wants]')) {
      const before = { ...COLL.wants };
      for (const m of deckMissing(d.cards, COLL.map)) COLL.wants[m.id] = Math.max(COLL.wants[m.id] || 0, d.cards[m.id]);
      collSave(); paint();
      toast(T('Manquantes ajoutées à tes recherches'), { action: T('Annuler'), onAction: () => { COLL.wants = before; collSave(); } });
    }
  });
  paint();
}

