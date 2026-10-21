/* ── ui.js : coque de l'appli (vues, barre du bas, surcouches, toasts, formats) ───────────────────────────────────────────────
   · Vues : <section class="view" id="v-<nom>"> de body.html ; showView(nom) en affiche une, onView(nom, fn) rend à la demande (fn(conteneur .view-in, première fois)).
     Vue gardée dans localStorage (inkorbit:view), sauf le scan (jamais la caméra au lancement) ; ?open=<vue> l'impose.
   · Surcouches empilées dans #layer : openSheet (feuille du bas sur téléphone, fenêtre centrée sur ordinateur), openScreen (plein écran).
     Chacune pousse une entrée d'historique : le Retour du téléphone ferme celle du dessus, comme Échap et le fond assombri.
     Accessibilité : role="dialog", aria-modal, focus dans la surcouche (Tab y reste), rendu à l'élément d'avant à la fermeture ; le reste de la page est inerte.
   · [data-act="<nom>"] : onAct(nom, fn) (un seul écouteur sur le document : Réglages, À propos…). */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEWS = ['home', 'coll', 'scan', 'trade', 'decks'];
const UI = { view: '', hooks: {}, seen: new Set(), acts: {}, stack: [] };

function onView(name, fn) { (UI.hooks[name] = UI.hooks[name] || []).push(fn); if (UI.view === name) fn($('#v-' + name + ' .view-in'), false); }
const curView = () => UI.view;
function showView(name) {
  if (!VIEWS.includes(name)) name = 'home';
  const was = UI.view; UI.view = name;
  for (const v of VIEWS) { const el = $('#v-' + v); if (el) el.hidden = v !== name; }
  $$('#nav [data-view]').forEach(b => b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (name !== 'scan') { try { localStorage.setItem('inkorbit:view', name); } catch (e) { /* stockage indisponible */ } }
  if (was !== name) window.scrollTo(0, 0);
  const first = !UI.seen.has(name); UI.seen.add(name);
  for (const fn of UI.hooks[name] || []) { try { fn($('#v-' + name + ' .view-in'), first); } catch (e) { console.error(e); } }
}
const onAct = (name, fn) => { UI.acts[name] = fn; };

/* ── Surcouches ─────────────────────────────────────────────────────────────────────────────────── */
function overlay(kind, { title = '', html = '', cls = '', onClose } = {}) {
  const ov = document.createElement('div'); ov.className = 'ov';
  const id = 'ov' + Date.now().toString(36) + UI.stack.length;
  ov.innerHTML = kind === 'sheet'
    ? `<div class="ov-scrim"></div><div class="sheet ${esc(cls)}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><div class="sheet-grip" aria-hidden="true"></div><div class="sheet-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="btn-icon" data-close aria-label="${esc(T('Fermer'))}"><svg class="i"><use href="#i-close"/></svg></button></div><div class="sheet-body">${html}</div></div>`
    : `<div class="screen ${esc(cls)}" role="dialog" aria-modal="true" aria-labelledby="${id}" tabindex="-1"><div class="screen-head"><button type="button" class="btn-icon" data-close aria-label="${esc(T('Retour'))}"><svg class="i"><use href="#i-back"/></svg></button><h2 id="${id}">${esc(title)}</h2></div><div class="screen-body"><div class="screen-in">${html}</div></div></div>`;
  const panel = ov.lastElementChild, item = { ov, panel, onClose, back: document.activeElement };
  panel.close = () => closeOverlay(item);
  ov.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.classList.contains('ov-scrim')) closeOverlay(item); });
  if (kind === 'sheet') sheetDrag(item);
  $('#layer').appendChild(ov);
  UI.stack.push(item); layerChanged();
  try { history.pushState({ io: UI.stack.length }, ''); item.hist = true; } catch (e) { /* historique indisponible (aperçu) */ }
  requestAnimationFrame(() => (panel.querySelector('[autofocus]') || panel).focus({ preventScroll: true }));
  return panel;
}
const openSheet = o => overlay('sheet', o);
const openScreen = o => overlay('screen', o);
const closeTop = () => { const it = UI.stack[UI.stack.length - 1]; if (it) closeOverlay(it); };
/** Ferme une surcouche (et celles posées dessus). Fermée par l'appli : l'entrée d'historique est retirée par history.back(), popstate ne refermera rien de plus. */
function closeOverlay(item) {
  const i = UI.stack.indexOf(item); if (i < 0) return;
  const gone = UI.stack.splice(i);
  const hist = gone.filter(x => x.hist).length;
  if (hist) { UI.skipPop = (UI.skipPop || 0) + 1; history.go(-hist); }
  for (const it of gone.reverse()) dropOverlay(it);
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
/** Feuille du bas : la tirer vers le bas (poignée ou en-tête) la ferme au-delà de 110 px ou d'un geste rapide. */
function sheetDrag(item) {
  const sh = item.panel; let y0 = 0, t0 = 0, dy = 0, on = false;
  const start = e => { if (e.button > 0 || matchMedia('(min-width:1024px)').matches || e.target.closest('button')) return; on = true; y0 = e.clientY; t0 = Date.now(); dy = 0; sh.style.transition = 'none'; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = e => { if (!on) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (!on) return; on = false; sh.style.transition = 'transform .22s ease'; if (dy > 110 || (dy > 40 && dy / (Date.now() - t0) > .6)) closeOverlay(item); else sh.style.transform = ''; };
  for (const h of [$('.sheet-grip', sh), $('.sheet-head', sh)]) { h.addEventListener('pointerdown', start); h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); }
}

/* ── Toasts ─────────────────────────────────────────────────────────────────────────────────────── */
function toast(msg, { action, onAction, ms = 3600 } = {}) {
  const box = $('#toasts'); if (!box) return null;
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action)}</button>` : '');
  const bye = () => { if (!el.isConnected) return; el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  if (action) el.querySelector('button').addEventListener('click', () => { bye(); if (onAction) onAction(); });
  box.appendChild(el); setTimeout(bye, action ? Math.max(ms, 6000) : ms);
  return el;
}

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
  window.addEventListener('popstate', e => {
    if (UI.skipPop) { UI.skipPop--; return; }
    const depth = (e.state && e.state.io) || 0;
    while (UI.stack.length > depth) { const it = UI.stack.pop(); it.hist = false; dropOverlay(it); }
    layerChanged();
  });
  let start = '';
  try { start = new URLSearchParams(location.search).get('open') || localStorage.getItem('inkorbit:view') || ''; } catch (e) { /* ignore */ }
  showView(VIEWS.includes(start) ? start : 'home');
}
