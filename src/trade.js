/* ── trade.js : vue « Échange » (à échanger · je cherche · partager) et page publique d'une liste (?p=) ─────────────────────────
   · À échanger : les exemplaires au-delà de « Garder N » (réglage keep, 4 par défaut = un jeu complet), sauf les cartes gardées à la main (COLL.hold).
   · Je cherche : les souhaits (COLL.wants) moins ce qui est possédé (manquantes des decks, masterset, ajout à la main).
   · Partager : aucun serveur. La liste est compressée (deflate) dans le lien lui-même : https://<site>/?p=<base64url> ; QR code (qr.js) tant qu'il tient.
   · Un lien ?p= ouvert : la liste de l'autre joueur, et ce qui correspond à ma collection (il a ce que je cherche, je peux lui donner ce qu'il cherche). */
const TV = { tab: 'have', mode: load('tradeMode', 'grid'), el: null };
onView('trade', el => { TV.el = el; dataLoad().then(tradePaint, () => collFail(el)); if (!CARDS.ready) el.innerHTML = skeletonCards(6); });
onColl(() => { if (curView() === 'trade' && TV.el) tradePaint(); });
const myLists = () => tradeLists(COLL.map, prefs().keep, COLL.hold, COLL.wants);
const listValue = (l, cur) => l.reduce((s, x) => s + x.n * priceFor(PRICES.p, x.id, x.foil >= x.n, cur), 0);

function tradePaint() {
  const el = TV.el; if (!el) return;
  const L = myLists(), cur = prefs().cur, keep = prefs().keep;
  el.innerHTML = `<div class="coll-head"><h1>${esc(T('Échange'))}</h1><p class="muted">${esc(TN(L.have.reduce((s, x) => s + x.n, 0), '{n} carte à échanger', '{n} cartes à échanger'))} · ${esc(TN(L.want.length, '{n} recherchée', '{n} recherchées'))}</p></div>
    <div class="tabs" role="tablist">${[['have', T('À échanger')], ['want', T('Je cherche')], ['share', T('Partager')]].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${TV.tab === k}">${esc(l)}</button>`).join('')}</div><div class="trade-body"></div>`;
  const body = $('.trade-body', el);
  if (TV.tab === 'have') {
    body.innerHTML = `<div class="trade-tools"><div class="seg" role="group" aria-label="${esc(T('Exemplaires gardés'))}">${[1, 2, 4].map(k => `<button type="button" data-keep="${k}" aria-pressed="${keep === k}">${esc(T('Garder {n}', { n: k }))}</button>`).join('')}</div>${modeSeg()}</div>
      <p class="muted small">${esc(T('Au-delà de {n} exemplaires, tes cartes sont proposées à l\'échange. Touche « Garder » sur une carte pour la retirer de la liste.', { n: keep }))}</p>
      <div class="trade-list">${tradeItemsHtml(L.have, 'have')}</div>
      <p class="muted small">${esc(T('Valeur : {v}', { v: fmtMoney(listValue(L.have, cur), cur) }))}</p>
      ${Object.keys(COLL.hold).length ? `<button type="button" class="btn btn-ghost" data-unhold>${esc(TN(Object.keys(COLL.hold).length, 'Remettre {n} carte gardée', 'Remettre {n} cartes gardées'))}</button>` : ''}`;
  } else if (TV.tab === 'want') {
    body.innerHTML = `<div class="trade-tools"><button type="button" class="btn btn-primary" data-wantadd><svg class="i"><use href="#i-plus"/></svg>${esc(T('Ajouter une carte cherchée'))}</button>${modeSeg()}</div>
      <div class="trade-list">${tradeItemsHtml(L.want, 'want')}</div><p class="muted small">${esc(T('Valeur : {v}', { v: fmtMoney(listValue(L.want, cur), cur) }))}</p>`;
  } else tradeShareTab(body, L);
  el.onclick = e => {
    const t = e.target.closest('[data-tab]'); if (t) { TV.tab = t.dataset.tab; tradePaint(); return; }
    const k = e.target.closest('[data-keep]'); if (k) { setPref('keep', +k.dataset.keep); tradePaint(); return; }
    const m = e.target.closest('[data-mode]'); if (m) { TV.mode = m.dataset.mode; save('tradeMode', TV.mode); tradePaint(); return; }
    const h = e.target.closest('[data-hold]'); if (h) { COLL.hold[h.dataset.hold] = 1; collSave(); toast(T('Carte gardée'), { action: T('Annuler'), onAction: () => { delete COLL.hold[h.dataset.hold]; collSave(); } }); return; }
    const u = e.target.closest('[data-unwant]'); if (u) { const id = u.dataset.unwant, n = COLL.wants[id]; delete COLL.wants[id]; collSave(); toast(T('Retirée de tes recherches'), { action: T('Annuler'), onAction: () => { COLL.wants[id] = n; collSave(); } }); return; }
    if (e.target.closest('[data-unhold]')) { COLL.hold = {}; collSave(); return; }
    if (e.target.closest('[data-wantadd]')) pickCard({ title: T('Carte cherchée'), keep: true, onPick: c => { COLL.wants[c.id] = (COLL.wants[c.id] || 0) + 1; collSave(); toast(T('{name} ajoutée à tes recherches', { name: c.name })); } });
  };
}
const modeSeg = () => `<div class="seg seg-icons" role="group" aria-label="${esc(T('Affichage'))}"><button type="button" data-mode="grid" aria-pressed="${TV.mode === 'grid'}" aria-label="${esc(T('Grille'))}"><svg class="i"><use href="#i-grid"/></svg></button><button type="button" data-mode="binder" aria-pressed="${TV.mode === 'binder'}" aria-label="${esc(T('Classeur'))}"><svg class="i"><use href="#i-binder"/></svg></button><button type="button" data-mode="list" aria-pressed="${TV.mode === 'list'}" aria-label="${esc(T('Liste'))}"><svg class="i"><use href="#i-list"/></svg></button></div>`;
/** Cartes d'une liste d'échange selon l'affichage choisi (grille, classeur, liste avec actions). kind : have | want | pub. */
function tradeItemsHtml(items, kind, mode = TV.mode) {
  const cur = prefs().cur, cards = items.map(x => ({ x, c: CARDS.byId.get(x.id) })).filter(o => o.c);
  if (!cards.length) return `<div class="empty"><svg class="i"><use href="#i-${kind === 'want' ? 'heart' : 'trade'}"/></svg><p>${esc(kind === 'want' ? T('Aucune carte cherchée. Ajoute les manquantes d\'un deck ou d\'une extension, ou une carte à la main.') : kind === 'have' ? T('Rien à échanger pour l\'instant : tes doubles apparaîtront ici.') : T('Liste vide'))}</p></div>`;
  if (mode === 'binder' && typeof binderHtml === 'function') return binderHtml(cards.map(o => ({ c: o.c, n: o.x.n, foil: o.x.foil })));
  if (mode === 'list') return `<div class="list" data-cards>${cards.map(({ x, c }) => `<div class="row">${thumbHtml(c, { size: 'small' })}<span class="row-main"><span class="row-title">${x.n > 1 ? `${x.n} × ` : ''}${esc(fullName(c))}${x.foil ? ' ✦' : ''}</span><span class="row-sub">${esc(setLabel(c))} · ${fmtMoney(priceFor(PRICES.p, c.id, x.foil >= x.n, cur), cur)}</span></span>${kind === 'have' ? `<button type="button" class="btn btn-ghost" data-hold="${c.id}">${esc(T('Garder'))}</button>` : kind === 'want' ? `<button type="button" class="btn-icon" data-unwant="${c.id}" aria-label="${esc(T('Retirer'))}"><svg class="i"><use href="#i-close"/></svg></button>` : ''}</div>`).join('')}</div>`;
  return `<div class="grid-cards" data-cards>${cards.map(({ x, c }) => thumbHtml(c, { qty: x.n, foil: x.foil > 0, cap: `<b class="num">${fmtMoney(priceFor(PRICES.p, c.id, x.foil >= x.n, cur), cur)}</b>` })).join('')}</div>`;
}

/* ── Partager ───────────────────────────────────────────────────────────────────────────────── */
async function deflate(text) { const s = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function inflate(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Response(s).text(); }
const siteUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
async function tradeLink(L) { return `${siteUrl()}?p=${b64u(await deflate(tradePack({ name: prefs().name, cur: prefs().cur, have: L.have, want: L.want })))}`; }
function tradeShareTab(body, L) {
  body.innerHTML = `<div class="panel">
      <div class="field"><label for="trName">${esc(T('Ton pseudo (affiché sur ta liste)'))}</label><input id="trName" class="input" maxlength="40" value="${esc(prefs().name)}" placeholder="${esc(T('Ex. Martin'))}"></div>
      <div class="tr-qr" aria-live="polite"><div class="sk" style="width:220px;height:220px"></div></div>
      <div class="btn-row"><button type="button" class="btn btn-primary" data-share><svg class="i"><use href="#i-share"/></svg>${esc(T('Partager le lien'))}</button><button type="button" class="btn" data-copy><svg class="i"><use href="#i-copy"/></svg>${esc(T('Copier'))}</button></div>
      <p class="muted small">${esc(T('Le lien contient toute ta liste (à échanger et recherchées) : rien n\'est envoyé sur un serveur. Partage-le à nouveau quand ta collection change.'))}</p></div>`;
  let link = '';
  const make = async () => {
    link = await tradeLink(L);
    let qr = ''; try { qr = qrSvg(link).svg; } catch (e) { qr = `<p class="muted small">${esc(T('Liste trop longue pour un QR code : partage le lien.'))}</p>`; }
    $('.tr-qr', body).innerHTML = qr;
  };
  $('#trName', body).addEventListener('change', e => { setPref('name', e.target.value.trim()); make(); });
  body.addEventListener('click', async e => {
    if (!link) return;
    if (e.target.closest('[data-copy],[data-share]') && typeof prgShared === 'function') prgShared();      // trophée « Vitrine » (progress.js)
    if (e.target.closest('[data-copy]')) { try { await navigator.clipboard.writeText(link); toast(T('Lien copié')); } catch (err) { prompt(T('Copie ce lien'), link); } }
    if (e.target.closest('[data-share]')) { try { await navigator.share({ title: T('Ma liste d\'échange Ink Orbit'), url: link }); } catch (err) { if (err && err.name !== 'AbortError') { try { await navigator.clipboard.writeText(link); toast(T('Lien copié')); } catch (e2) { /* ignore */ } } } }
  });
  make().catch(() => { $('.tr-qr', body).innerHTML = `<p class="bad">${esc(T('Ton navigateur ne sait pas compresser la liste.'))}</p>`; });
}

/* ── Page publique (?p=…) ───────────────────────────────────────────────────────────────────── */
async function openPublicTrade(p) {
  let L = null;
  try { L = tradeUnpack(await inflate(unb64u(p))); } catch (e) { L = null; }
  if (!L) { toast(T('Ce lien d\'échange est abîmé.')); return; }
  await dataLoad();
  const m = tradeMatch(myLists(), L), mine = Object.keys(COLL.map).length > 0;
  let tab = m.forMe.length ? 'match' : 'have';
  const el = openScreen({ title: L.name ? T('Liste d’échange · {name}', { name: L.name }) : T('Liste d\'échange'), cls: 'pub-screen', html: '<div class="pub-host"></div>' });
  const host = $('.pub-host', el);
  const paint = () => {
    host.innerHTML = `${mine ? `<div class="panel da-frame pub-match"><p><b>${esc(TN(m.forMe.length, '{n} carte que tu cherches', '{n} cartes que tu cherches'))}</b> · ${esc(TN(m.forThem.length, '{n} carte que tu peux lui proposer', '{n} cartes que tu peux lui proposer'))}</p></div>` : ''}
      <div class="tabs" role="tablist">${[...(mine ? [['match', T('Pour moi')], ['give', T('Je peux donner')]] : []), ['have', T('À échanger')], ['want', T('Cherche')]].map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${tab === k}">${esc(l)}</button>`).join('')}</div>
      <div>${tradeItemsHtml(tab === 'match' ? m.forMe : tab === 'give' ? m.forThem : tab === 'have' ? L.have : L.want, 'pub', 'grid')}</div>`;
  };
  host.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; paint(); } });
  paint();
}
