/* ── home.js : accueil et démarrage de l'appli (appInit, appelée par main.js) ─────────────────────────────────────────────
   · Orbe « Ma collection » : valeur (devise des réglages), variation sur 7 jours, courbe, nombre de cartes.
   · Raccourcis : Scanner, Ajouter, Compteur de lore, Carte mystère du jour (lore.js, mystery.js), Chercher une carte.
   · Dernières extensions avec la progression de la collection (masterset.js › openSet). Bannière d'installation (pwa.js). */
const HV = { el: null };
onView('home', el => { HV.el = el; homePaint(); dataLoad().then(homePaint, () => homePaint()); });
onColl(() => { if (curView() === 'home') homePaint(); });
function homePaint() {
  const el = HV.el; if (!el) return;
  const cur = prefs().cur, ready = CARDS.ready;
  let n = 0; for (const q of Object.values(COLL.map)) n += q > 0 ? q : 0;      // sans le catalogue aussi (hors ligne au premier lancement)
  const stale = ready && PRICES.v && (Date.now() - Date.parse(PRICES.v)) / 864e5 > 3;
  const val = ready ? collValue(COLL.map, PRICES.p, cur) : 0, d = ready ? valueDelta(7) : null;
  const ms = typeof mysteryState === 'function' && ready ? mysteryState() : null;
  const sets = ready ? CARDS.sets.filter(s => s.type === 'expansion').slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4) : [];
  const inst = typeof PWA !== 'undefined' && !load('installX', 0) ? PWA.state() : '';
  const tile = (act, icon, title, sub, cls = '') => `<button type="button" class="hm-tile ${cls}" ${act}><svg class="i"><use href="#${icon}"/></svg><span class="hm-tile-t">${esc(title)}</span>${sub ? `<span class="hm-tile-s">${esc(sub)}</span>` : ''}</button>`;
  el.innerHTML = `<section class="hm-orb da-frame da-sky" aria-label="${esc(T('Ma collection'))}">
      <p class="hm-kicker">${esc(T('Ma collection'))}</p>
      <p class="hm-val num">${ready ? fmtMoney(val, cur) : '<span class="sk" style="display:inline-block;width:160px;height:40px"></span>'}</p>
      <p class="hm-sub">${esc(TN(n, '{n} carte', '{n} cartes'))}${d != null && d !== 0 ? ` · <span class="${d > 0 ? 'good' : 'bad'} num">${d > 0 ? '+' : '−'}${fmtMoney(Math.abs(d), cur)}</span> <span class="muted">${esc(T('en 7 jours'))}</span>` : ''}</p>
      <div class="hm-curve">${ready && VAL.hist.length >= 2 ? valueCurveSvg() : `<p class="hm-curve-wait muted small">${esc(n ? T('La courbe de ta collection démarre demain.') : T('Ajoute des cartes : leur valeur s’affiche ici, jour après jour.'))}</p>`}</div>
      ${stale ? `<p class="hm-stale small">${esc(T('Prix du {d} : la mise à jour quotidienne a du retard.', { d: new Date(PRICES.v).toLocaleDateString(LOC()) }))}</p>` : ''}${!ready && CARDS.wait === null && n ? `<p class="hm-stale small">${esc(T('Catalogue indisponible : la valeur reviendra avec le réseau.'))}</p>` : ''}
      <div class="btn-row"><button type="button" class="btn btn-primary" data-view="coll">${esc(T('Voir ma collection'))}</button></div>
    </section>
    ${inst === 'ready' || inst === 'ios' ? `<div class="panel hm-install"><svg class="i"><use href="#i-download"/></svg><div><b>${esc(T('Installe Ink Orbit'))}</b><p class="muted small">${esc(inst === 'ios' ? T('Bouton Partager, puis « Sur l\'écran d\'accueil » : elle s\'ouvrira comme une appli, même hors ligne.') : T('Comme une appli, sur ton écran d\'accueil, même hors ligne.'))}</p></div><button type="button" class="btn btn-primary" data-install>${esc(inst === 'ios' ? T('Voir comment') : T('Installer'))}</button><button type="button" class="btn-icon" data-installx aria-label="${esc(T('Plus tard'))}"><svg class="i"><use href="#i-close"/></svg></button></div>` : ''}
    ${typeof prgHomeHtml === 'function' ? prgHomeHtml() : ''}
    <div class="hm-tiles">
      ${tile('data-view="scan"', 'i-scan', T('Scanner'), T('Ajoute tes cartes à la caméra'), 'hm-tile-gold')}
      ${tile('data-hm="add"', 'i-plus', T('Ajouter'), T('Une par une'))}
      ${tile('data-hm="lore"', 'i-lore', T('Compteur de lore'), T('Partie à 2, jusqu\'à 20'))}
      ${tile('data-hm="mystery"', 'i-mystery', T('Carte mystère'), ms ? (ms.done ? (ms.won ? T('Trouvée aujourd\'hui ✦') : T('Reviens demain')) : T('À deviner aujourd\'hui')) : T('Le jeu du jour'), ms && !ms.done ? 'hm-tile-new' : '')}
      ${tile('data-hm="search"', 'i-search', T('Chercher une carte'), T('Prix et détails'))}
      ${tile('data-view="decks"', 'i-deck', T('Mes decks'), T('Construire, compléter'))}
    </div>
    ${sets.length ? `<div class="panel"><div class="panel-head"><h3>${esc(T('Dernières extensions'))}</h3><button type="button" class="btn btn-ghost" data-hm="sets">${esc(T('Toutes'))}</button></div><div class="hm-sets">${sets.map(s => { const p = setProgress(s.code); return `<button type="button" class="hm-set" data-set="${esc(s.code)}">${ringSvg(p.base ? p.baseOwn / p.base : 0)}<span class="hm-set-n">${esc(s.name)}</span><span class="muted small num">${fmtNum(p.baseOwn)}/${fmtNum(p.base)}</span></button>`; }).join('')}</div></div>` : ''}`;
  const hv = $('.hm-val', el);
  if (ready && HV.last != null && HV.last !== val && hv && typeof countUp === 'function') countUp(hv, HV.last, val);
  if (ready) HV.last = val;
  el.onclick = e => {
    const h = e.target.closest('[data-hm]'); if (!h) { if (e.target.closest('[data-install]')) PWA.install(); else if (e.target.closest('[data-installx]')) { save('installX', Date.now()); homePaint(); } return; }
    const a = h.dataset.hm;
    if (a === 'add') dataLoad().then(openAddCards);
    else if (a === 'lore' && typeof openLore === 'function') openLore();
    else if (a === 'mystery' && typeof openMystery === 'function') dataLoad().then(openMystery);
    else if (a === 'search') pickCard({ title: T('Chercher une carte'), onPick: c => openCard(c.id) });
    else if (a === 'sets') { CV.tab = 'sets'; showView('coll'); }
  };
}
function appInit() {
  cloudInit();
  PWA.on(() => { if (curView() === 'home') homePaint(); });
  dataLoad().catch(() => toast(T('Catalogue indisponible : vérifie ta connexion.')));
  let q = null; try { q = new URLSearchParams(location.search); } catch (e) { /* ignore */ }
  const p = q && q.get('p');
  if (p) { openPublicTrade(p); try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* ignore */ } }
}
