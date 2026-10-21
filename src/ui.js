/* ── ui.js : coque de l'appli (vues, barre du bas, surcouches, toasts, formats) ───────────────────────────────────────────────
   · Vues : <section class="view" id="v-<nom>"> de body.html ; showView(nom) en affiche une, onView(nom, fn) rend à la demande (fn(conteneur .view-in, première fois)).
     Vue gardée dans localStorage (inkorbit:view), sauf le scan (jamais la caméra au lancement) ; ?open=<vue> l'impose.
   · Surcouches empilées dans #layer : openSheet (fiche du haut sur téléphone : le clavier ne la recouvre jamais, hauteur bornée à la partie visible
     de l'écran (visualViewport, --vvh / --vvt) ; fenêtre centrée sur ordinateur), openScreen (plein écran).
     Chacune pousse une entrée d'historique : le Retour du téléphone ferme celle du dessus, comme Échap et le fond assombri.
     Accessibilité : role="dialog", aria-modal, focus dans la surcouche (Tab y reste), rendu à l'élément d'avant à la fermeture ; le reste de la page est inerte.
   · [data-act="<nom>"] : onAct(nom, fn) (un seul écouteur sur le document : Réglages, À propos…). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEWS = ['home', 'coll', 'scan', 'trade', 'decks'];
const UI = { view: '', hooks: {}, seen: new Set(), acts: {}, stack: [], scroll: {} };

function onView(name, fn) { (UI.hooks[name] = UI.hooks[name] || []).push(fn); if (UI.view === name) fn($('#v-' + name + ' .view-in'), false); }
const curView = () => UI.view;
function showView(name) {
  if (!VIEWS.includes(name)) name = 'home';
  const was = UI.view; UI.view = name;
  if (was && was !== name) UI.scroll[was] = window.scrollY;
  const app = $('#app'); if (app && was) app.dataset.dir = VIEWS.indexOf(name) < VIEWS.indexOf(was) ? 'l' : 'r';      // glissement selon le sens de la barre du bas
  for (const v of VIEWS) { const el = $('#v-' + v); if (el) el.hidden = v !== name; }
  $$('#nav [data-view]').forEach(b => b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  navInd();
  if (name !== 'scan') { try { localStorage.setItem('inkorbit:view', name); } catch (e) { /* stockage indisponible */ } }
  const first = !UI.seen.has(name); UI.seen.add(name);
  for (const fn of UI.hooks[name] || []) { try { fn($('#v-' + name + ' .view-in'), first); } catch (e) { console.error(e); } }
  if (was !== name) {      // défilement retrouvé en revenant sur une vue (après son rendu, puis une fois les données arrivées)
    const y = UI.scroll[name] || 0; window.scrollTo(0, y);
    if (y) { requestAnimationFrame(() => window.scrollTo(0, y)); setTimeout(() => { if (UI.view === name && window.scrollY < y) window.scrollTo(0, y); }, 400); }
  }
}
/** Indicateur doré sous l'onglet actif de la barre du bas (téléphone) : glisse d'un onglet à l'autre. */
function navInd() {
  const nav = $('#nav'); if (!nav) return;
  let ind = $('.nav-ind', nav); if (!ind) { ind = document.createElement('i'); ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true'); nav.appendChild(ind); }
  const b = $('[data-view][aria-current="page"]', nav);
  if (!b || b.classList.contains('nav-scan')) { ind.style.opacity = '0'; return; }
  const n = nav.getBoundingClientRect(), r = b.getBoundingClientRect();
  ind.style.opacity = '1'; ind.style.transform = `translateX(${(r.left - n.left + r.width / 2 - 12).toFixed(1)}px)`;
}
const onAct = (name, fn) => { UI.acts[name] = fn; };

/* ── Surcouches ─────────────────────────────────────────────────────────────────────────────────── */
function overlay(kind, { title = '', html = '', cls = '', onClose } = {}) {
  const ov = document.createElement('div'); ov.className = 'ov ov-' + kind;
  const id = 'ov' + Date.now().toString(36) + UI.stack.length;
  ov.innerHTML = kind === 'sheet'
    ? `<div class="ov-scrim"></div><div class="sheet ${esc(cls)}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><div class="sheet-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="btn-icon" data-close aria-label="${esc(T('Fermer'))}"><svg class="i"><use href="#i-close"/></svg></button></div><div class="sheet-body">${html}</div><div class="sheet-grip" aria-hidden="true"></div></div>`
    : `<div class="screen ${esc(cls)}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><div class="screen-head"><button type="button" class="btn-icon" data-close aria-label="${esc(T('Retour'))}"><svg class="i"><use href="#i-back"/></svg></button><h2 id="${id}">${esc(title)}</h2></div><div class="screen-body"><div class="screen-in">${html}</div></div></div>`;
  const panel = ov.lastElementChild, item = { ov, panel, onClose, back: document.activeElement };
  panel.close = () => closeOverlay(item);
  ov.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.classList.contains('ov-scrim')) closeOverlay(item); });
  if (kind === 'sheet') sheetDrag(item);
  $('#layer').appendChild(ov);
  UI.stack.push(item); layerChanged();
  histHold();
  requestAnimationFrame(() => (panel.querySelector('[autofocus]') || panel).focus({ preventScroll: true }));
  return panel;
}
const openSheet = o => overlay('sheet', o);
const openScreen = o => overlay('screen', o);
const closeTop = () => { const it = UI.stack[UI.stack.length - 1]; if (it) closeOverlay(it); };
/* Historique : UNE seule entrée pour toute la pile de surcouches (UI.hist), jamais une par surcouche. Le Retour du téléphone la consomme : popstate ferme
   la surcouche du dessus et, s'il en reste, remet une entrée. Fermée par l'appli : l'entrée n'est retirée (history.back) qu'au tour suivant et seulement si la
   pile est restée vide : « el.close() puis openSheet() » la réutilise. Un back() pas encore arrivé (UI.backing) : la surcouche ouverte entre-temps remettra
   son entrée au popstate (sinon back() emportait la nouvelle entrée et le Retour suivant quittait l'appli). */
function histHold() {
  clearTimeout(UI.backT);
  if (UI.hist) return;
  if (UI.backing) { UI.rehold = true; return; }
  try { history.pushState({ io: 1 }, ''); UI.hist = true; } catch (e) { /* historique indisponible (aperçu) */ }
}
function histRelease() {
  clearTimeout(UI.backT);
  UI.backT = setTimeout(() => { if (UI.stack.length || !UI.hist) return; UI.hist = false; UI.backing = true; try { history.back(); } catch (e) { UI.backing = false; } }, 0);
}
/** Ferme une surcouche (et celles posées dessus). */
function closeOverlay(item) {
  const i = UI.stack.indexOf(item); if (i < 0) return;
  const gone = UI.stack.splice(i);
  for (const it of gone.reverse()) dropOverlay(it);
  if (!UI.stack.length) histRelease();
  layerChanged();
}
function dropOverlay(it) {
  it.ov.classList.add('closing');
  setTimeout(() => it.ov.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230);
  if (it.back && it.back.isConnected) try { it.back.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  if (it.onClose) try { it.onClose(); } catch (e) { console.error(e); }
}
function layerChanged() {
  const open = UI.stack.length > 0;
  document.body.classList.toggle('locked', open);
  for (const sel of ['#app', '#nav', '#bar']) { const el = $(sel); if (el) el.inert = open; }
  UI.stack.forEach((it, k) => { it.ov.inert = k < UI.stack.length - 1; });
}
/** Fiche du haut (téléphone) : la tirer vers le haut (poignée ou en-tête) la ferme au-delà de 90 px ou d'un geste rapide. */
function sheetDrag(item) {
  const sh = item.panel; let y0 = 0, t0 = 0, dy = 0, on = false;
  const start = e => { if (e.button > 0 || matchMedia('(min-width:1024px)').matches || e.target.closest('button')) return; on = true; y0 = e.clientY; t0 = Date.now(); dy = 0; sh.style.transition = 'none'; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { if (!on) return; const d = e.clientY - y0; dy = d < 0 ? d : Math.min(24, d / 4); sh.style.transform = `translateY(${dy}px)`; };      // vers le bas : un peu d'élasticité
  const end = () => { if (!on) return; on = false; sh.style.transition = 'transform .22s ease'; if (dy < -90 || (dy < -36 && -dy / (Date.now() - t0) > .6)) closeOverlay(item); else sh.style.transform = ''; };
  for (const h of [$('.sheet-grip', sh), $('.sheet-head', sh)]) { h.addEventListener('pointerdown', start); h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); }
}

/* ── Toasts ─────────────────────────────────────────────────────────────────────────────────────── */
/** Message court. icon : id d'icône (« i-check » par défaut, « i-sparkle » quand il y a une action) ; une barre montre le temps qui reste. */
function toast(msg, { action, onAction, ms = 3600, icon } = {}) {
  const box = $('#toasts'); if (!box) return null;
  while (box.children.length >= 3) box.firstElementChild.remove();
  const life = action ? Math.max(ms, 6000) : ms;
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.style.setProperty('--life', life + 'ms');
  el.innerHTML = `<svg class="i toast-i" aria-hidden="true"><use href="#${esc(icon || (action ? 'i-sparkle' : 'i-check'))}"/></svg><span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '') + '<i class="toast-bar" aria-hidden="true"></i>';
  const bye = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  if (action) el.querySelector('button').addEventListener('click', () => { bye(); if (onAction) onAction(); });
  box.appendChild(el); setTimeout(bye, life);
  return el;
}
/** Squelettes de chargement : n vignettes de cartes dans une grille. */
const skeletonCards = (n = 6) => `<div class="grid-cards" aria-hidden="true">${'<div class="sk sk-card"></div>'.repeat(n)}</div>`;

/* ── Formats ────────────────────────────────────────────────────────────────────────────────────── */
const uiLoc = () => (typeof LOC === 'function' ? LOC() : 'fr-FR');
function prefCur() {
  try { const p = JSON.parse(localStorage.getItem('inkorbit:prefs') || '{}'); if (p.cur === 'EUR' || p.cur === 'USD') return p.cur; } catch (e) { /* ignore */ }
  return typeof I18N !== 'undefined' && I18N.lang === 'en' ? 'USD' : 'EUR';
}
/** Centimes → « 12,34 € » / « $12.34 » (devise des réglages, sinon celle de la langue). cur : imposer une devise. */
const fmtMoney = (cents, cur) => new Intl.NumberFormat(uiLoc(), { style: 'currency', currency: cur || prefCur() }).format((Number(cents) || 0) / 100);
const fmtNum = n => new Intl.NumberFormat(uiLoc()).format(Number(n) || 0);

/* ── Démarrage ──────────────────────────────────────────────────────────────────────────────────── */
function uiInit() {
  if (typeof i18nDom === 'function') i18nDom(document.body);
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (v) { e.preventDefault(); if (UI.stack.length) closeOverlay(UI.stack[0]); showView(v.dataset.view); return; }      // depuis une surcouche : tout se ferme d'abord
    const a = e.target.closest('[data-act]');
    if (a && UI.acts[a.dataset.act]) { e.preventDefault(); UI.acts[a.dataset.act](a, e); }
  });
  const bs = $('#btnSettings'); if (bs && !bs.dataset.act) bs.dataset.act = 'settings';
  document.addEventListener('keydown', e => {
    const top = UI.stack[UI.stack.length - 1]; if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay(top); return; }
    if (e.key !== 'Tab') return;      // Tab reste dans la surcouche du dessus
    const f = $$('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])', top.panel).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === top.panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // Retour du téléphone (ou du navigateur) : ferme les surcouches au-dessus de l'entrée d'historique atteinte.
  window.addEventListener('popstate', () => {
    if (UI.backing) { UI.backing = false; if (UI.rehold && UI.stack.length) { UI.rehold = false; histHold(); } UI.rehold = false; return; }      // notre propre back()
    UI.hist = false;
    const it = UI.stack.pop(); if (it) dropOverlay(it);
    if (UI.stack.length) histHold();
    layerChanged();
  });
  // Clavier du téléphone : la partie visible de l'écran (--vvh, --vvt) borne les fiches ; le champ actif d'une fiche reste à l'écran.
  const vv = window.visualViewport, root = document.documentElement;
  const vvSet = () => {
    root.style.setProperty('--vvh', (vv ? vv.height : innerHeight) + 'px'); root.style.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px');
    const a = document.activeElement; if (a && a.closest && a.closest('.sheet-body') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) a.scrollIntoView({ block: 'nearest' });
  };
  vvSet(); if (vv) { vv.addEventListener('resize', vvSet); vv.addEventListener('scroll', vvSet); } else window.addEventListener('resize', vvSet);
  window.addEventListener('resize', navInd);
  // En-tête du téléphone : réduit et ombré dès que la page défile.
  const bar = $('#bar'); let barOn = false;
  window.addEventListener('scroll', () => { const on = window.scrollY > 8; if (bar && on !== barOn) { barOn = on; bar.classList.toggle('scrolled', on); } }, { passive: true });
  let start = '';
  try { start = new URLSearchParams(location.search).get('open') || localStorage.getItem('inkorbit:view') || ''; } catch (e) { /* ignore */ }
  showView(VIEWS.includes(start) ? start : 'home');
}

/** Confirmation dans une fiche (au lieu de confirm(), bloquant et hors de la DA) : → Promise<boolean>. danger : bouton rouge. */
function askSheet({ title, text = '', ok = T('Confirmer'), cancel = T('Annuler'), danger = false }) {
  return new Promise(res => {
    let done = false;
    const el = openSheet({ title, cls: 'ask-sheet', onClose: () => { if (!done) res(false); }, html: `${text ? `<p>${esc(text)}</p>` : ''}<div class="btn-row ask-row"><button type="button" class="btn" data-no>${esc(cancel)}</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes autofocus>${esc(ok)}</button></div>` });
    el.addEventListener('click', e => { const y = e.target.closest('[data-yes]'), n = e.target.closest('[data-no]'); if (!y && !n) return; done = true; res(!!y); el.close(); });
  });
}
