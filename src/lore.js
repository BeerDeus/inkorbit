/* ── lore.js : compteur de lore (partie sur une table, tout est local : aucun jeu en ligne) ──────────────────────────────────────
   · openLore() : écran plein. 2 joueurs face à face (la moitié du haut tournée de 180°), ou 3-4 joueurs (rangée du haut tournée).
     Toucher la moitié droite d'un joueur : +1, la gauche : −1 ; appui long : ±5, répété tant que le doigt reste.
   · Objectif réglable (20 par défaut) ; victoire : étincelles et « Revanche ». Annuler (n'importe quelle action), tour et joueur actif.
   · État gardé (inkorbit:lore) et repris ; écran gardé allumé (Wake Lock) ; vibration courte.
   La logique (loreNew, loreAct, loreNext, loreUndo) est pure : tests/test-games.mjs. */

const LORE_MAX = 99, LORE_LOG = 300;
/** Nouvelle partie ; prev : partie d'avant (noms, encres, objectif gardés : « Revanche »). */
function loreNew(n = 2, goal = 20, prev) {
  const inks = [4, 3, 1, 2];
  const players = Array.from({ length: Math.min(4, Math.max(2, n)) }, (_, i) => {
    const p = prev && prev.players[i];
    return { name: p ? p.name : (typeof T === 'function' ? T('Joueur {n}', { n: i + 1 }) : 'Joueur ' + (i + 1)), ink: p ? p.ink : inks[i], lore: 0 };
  });
  return { goal: Math.min(LORE_MAX, Math.max(1, goal | 0 || 20)), players, turn: 1, cur: 0, log: [], winner: -1 };
}
const loreCopy = s => ({ ...s, players: s.players.map(p => ({ ...p })), log: s.log.slice() });
const loreWinner = s => s.players.findIndex(p => p.lore >= s.goal);
/** Joueur p gagne (d > 0) ou perd (d < 0) du lore, borné de 0 à 99. Rien après la victoire. */
function loreAct(s, p, d) {
  if (s.winner >= 0 || !s.players[p] || !d) return s;
  const o = loreCopy(s), pl = o.players[p], v = Math.min(LORE_MAX, Math.max(0, pl.lore + d));
  if (v === pl.lore) return s;
  o.log.push({ p, d: v - pl.lore }); if (o.log.length > LORE_LOG) o.log.shift();
  pl.lore = v; o.winner = loreWinner(o);
  return o;
}
/** Joueur suivant ; retour au premier : tour suivant. */
function loreNext(s) {
  if (s.winner >= 0) return s;
  const o = loreCopy(s); o.log.push({ t: 1, cur: o.cur });
  o.cur = (o.cur + 1) % o.players.length; if (o.cur === 0) o.turn++;
  return o;
}
function loreUndo(s) {
  if (!s.log.length) return s;
  const o = loreCopy(s), a = o.log.pop();
  if (a.t) { if (o.cur === 0) o.turn = Math.max(1, o.turn - 1); o.cur = a.cur; }
  else o.players[a.p].lore -= a.d;
  o.winner = loreWinner(o);
  return o;
}

/* ── Interface ──────────────────────────────────────────────────────────────────────────────── */
const LORE = { s: null, el: null, lock: null };
function loreSave() { save('lore', LORE.s); }
function loreSet(s, buzz) {
  if (s === LORE.s) return;
  const won = LORE.s && LORE.s.winner < 0 && s.winner >= 0;
  LORE.s = s; loreSave(); lorePaint();
  if (won && typeof prgLore === 'function') prgLore(s.winner === 0);      // trophées (progress.js) : le joueur 1 est le propriétaire du téléphone
  if (buzz) try { navigator.vibrate && navigator.vibrate(won ? [40, 60, 120] : 12); } catch (e) { /* ignore */ }
}
async function loreWake() {
  try { if (navigator.wakeLock && !LORE.lock && document.visibilityState === 'visible') { LORE.lock = await navigator.wakeLock.request('screen'); LORE.lock.addEventListener('release', () => { LORE.lock = null; }); } } catch (e) { /* refusé : l'écran pourra s'éteindre */ }
}
const loreVis = () => { if (LORE.el && document.visibilityState === 'visible') loreWake(); };

function openLore() {
  const saved = load('lore', null);
  LORE.s = saved && Array.isArray(saved.players) && saved.players.length >= 2 ? { ...loreNew(saved.players.length, saved.goal, saved), ...saved, log: saved.log || [] } : loreNew();
  LORE.el = openScreen({ title: T('Compteur de lore'), cls: 'lore-screen', html: '<div class="lore-board"></div><div class="lore-bar"></div>', onClose: () => {
    LORE.el = null; document.removeEventListener('visibilitychange', loreVis); if (LORE.unhold) LORE.unhold();
    if (LORE.lock) { LORE.lock.release().catch(() => {}); LORE.lock = null; }
  } });
  $('.screen-head', LORE.el).insertAdjacentHTML('beforeend', `<button type="button" class="btn-icon" data-lore="set" aria-label="${esc(T('Réglages de la partie'))}"><svg class="i"><use href="#i-gear"/></svg></button>`);
  LORE.el.addEventListener('click', loreClick);
  loreHold($('.lore-board', LORE.el));
  document.addEventListener('visibilitychange', loreVis); loreWake();
  lorePaint();
  return LORE.el;
}
function lorePaint() {
  const el = LORE.el; if (!el) return;
  const s = LORE.s, n = s.players.length, board = $('.lore-board', el);
  board.dataset.n = n;
  board.innerHTML = s.players.map((p, i) => {
    const flip = n === 2 ? i === 0 : i < 2, k = INK_KEYS[p.ink] || 'amber';
    return `<div class="lore-p${flip ? ' flip' : ''}${s.cur === i && s.winner < 0 ? ' is-cur' : ''}${s.winner === i ? ' is-win' : ''}" data-p="${i}" data-ink="${k}" style="--c:var(--${k})">
      <div class="lore-in">
        <div class="lore-zone" data-d="-1" aria-hidden="true"><svg class="i"><use href="#i-minus"/></svg></div>
        <div class="lore-mid">
          <div class="lore-name"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg><span>${esc(p.name)}</span></div>
          <output class="lore-n" aria-live="polite" aria-label="${esc(T('{name} : {n} lore', { name: p.name, n: p.lore }))}">${p.lore}</output>
          <div class="lore-goal">${esc(T('sur {n}', { n: s.goal }))}</div>
          <div class="lore-track" aria-hidden="true"><i style="width:${Math.min(100, p.lore / s.goal * 100)}%"></i></div>
        </div>
        <div class="lore-zone" data-d="1" aria-hidden="true"><svg class="i"><use href="#i-plus"/></svg></div>
        <button type="button" class="lore-sr" data-sr="-1">${esc(T('Retirer un lore à {name}', { name: p.name }))}</button>
        <button type="button" class="lore-sr" data-sr="1">${esc(T('Ajouter un lore à {name}', { name: p.name }))}</button>
      </div>
      ${s.winner === i ? `<div class="lore-win"><div class="lore-sparks" aria-hidden="true">${'<i></i>'.repeat(14)}</div><p class="lore-win-t">${esc(T('{name} gagne !', { name: p.name }))}</p><button type="button" class="btn btn-primary" data-lore="again">${esc(T('Revanche'))}</button></div>` : ''}
    </div>`;
  }).join('');
  $('.lore-bar', el).innerHTML = `
    <button type="button" class="btn-icon" data-lore="undo" aria-label="${esc(T('Annuler'))}" ${s.log.length ? '' : 'disabled'}><svg class="i"><use href="#i-undo"/></svg></button>
    <button type="button" class="btn lore-turn" data-lore="next"><span>${esc(T('Tour {n}', { n: s.turn }))}</span><b>${esc(T('À {name}', { name: s.players[s.cur].name }))}</b><svg class="i"><use href="#i-chev"/></svg></button>
    <button type="button" class="btn-icon" data-lore="reset" aria-label="${esc(T('Nouvelle partie'))}"><svg class="i"><use href="#i-refresh"/></svg></button>`;
}
/** Appui sur une zone − / + : toucher = ±1 au relâchement ; appui long (450 ms) = ±5 tout de suite, puis toutes les 350 ms. */
function loreHold(board) {
  let t = 0, fired = false, cur = null;
  const stop = () => { clearTimeout(t); clearInterval(t); t = 0; };
  board.addEventListener('pointerdown', e => {
    const z = e.target.closest('.lore-zone'); if (!z || e.button > 0) return;
    cur = { p: +z.closest('[data-p]').dataset.p, d: +z.dataset.d, z }; fired = false; z.classList.add('on');
    stop(); t = setTimeout(() => { fired = true; loreSet(loreAct(LORE.s, cur.p, 5 * cur.d), true); t = setInterval(() => loreSet(loreAct(LORE.s, cur.p, 5 * cur.d), true), 350); }, 450);
  });
  const end = e => {
    if (!cur) return; stop(); cur.z.classList.remove('on');
    if (!fired && e.type === 'pointerup') loreSet(loreAct(LORE.s, cur.p, cur.d), true);
    cur = null;
  };
  // Relâchement écouté sur la fenêtre : chaque ±5 redessine le plateau, la zone touchée n'est alors plus dans la page.
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); board.addEventListener('pointerleave', end);
  LORE.unhold = () => { stop(); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  board.addEventListener('contextmenu', e => { if (e.target.closest('.lore-zone')) e.preventDefault(); });
}
function loreClick(e) {
  const sr = e.target.closest('[data-sr]'); if (sr) { loreSet(loreAct(LORE.s, +sr.closest('[data-p]').dataset.p, +sr.dataset.sr), true); return; }
  const b = e.target.closest('[data-lore]'); if (!b) return;
  const a = b.dataset.lore, s = LORE.s;
  if (a === 'undo') loreSet(loreUndo(s));
  else if (a === 'next') loreSet(loreNext(s), true);
  else if (a === 'again') loreSet(loreNew(s.players.length, s.goal, s));
  else if (a === 'reset') { const old = s; loreSet(loreNew(s.players.length, s.goal, s)); toast(T('Nouvelle partie'), { action: T('Annuler'), onAction: () => loreSet(old) }); }
  else if (a === 'set') loreSettings();
}
function loreSettings() {
  const s = LORE.s, names = INK_NAMES();
  const el = openSheet({ title: T('Réglages de la partie'), html: `
    <div class="field"><span class="label">${esc(T('Joueurs'))}</span><div class="seg" role="radiogroup">${[2, 3, 4].map(n => `<button type="button" data-n="${n}" aria-pressed="${s.players.length === n}">${n}</button>`).join('')}</div></div>
    <div class="field"><label for="loreGoal">${esc(T('Objectif de lore'))}</label><input id="loreGoal" class="input" type="number" inputmode="numeric" min="1" max="99" value="${s.goal}"></div>
    <div class="lore-set-players">${s.players.map((p, i) => `<div class="field"><label for="loreName${i}">${esc(T('Joueur {n}', { n: i + 1 }))}</label>
      <input id="loreName${i}" class="input" maxlength="20" value="${esc(p.name)}" data-name="${i}">
      <div class="lore-inks" role="radiogroup" aria-label="${esc(T('Encre'))}">${INK_KEYS.map((k, j) => `<button type="button" class="lore-ink" data-pl="${i}" data-ink="${j}" aria-pressed="${p.ink === j}" aria-label="${esc(names[j])}" style="--c:var(--${k})"><svg class="ink-sym" data-ink="${k}"><use href="#ink-${k}"/></svg></button>`).join('')}</div></div>`).join('')}</div>
    <button type="button" class="btn btn-primary btn-block" data-close>${esc(T('OK'))}</button>` });
  const upd = f => { const o = loreCopy(LORE.s); f(o); LORE.s = o; loreSave(); lorePaint(); };
  el.addEventListener('click', e => {
    const n = e.target.closest('[data-n]');
    if (n) { const k = +n.dataset.n; if (k !== LORE.s.players.length) { const before = LORE.s; el.close(); loreSet(loreNew(k, LORE.s.goal, LORE.s)); loreSettings(); if (before.log.length) toast(T('Nouvelle partie à {n} joueurs', { n: k }), { action: T('Annuler'), onAction: () => loreSet(before) }); } return; }
    const ink = e.target.closest('[data-pl]');
    if (ink) { upd(o => { o.players[+ink.dataset.pl].ink = +ink.dataset.ink; }); $$(`[data-pl="${ink.dataset.pl}"]`, el).forEach(x => x.setAttribute('aria-pressed', x === ink)); }
  });
  el.addEventListener('input', e => {
    if (e.target.dataset.name != null) { const v = e.target.value.trim().slice(0, 20); upd(o => { o.players[+e.target.dataset.name].name = v || T('Joueur {n}', { n: +e.target.dataset.name + 1 }); }); }
    if (e.target.id === 'loreGoal') { const g = parseInt(e.target.value, 10); if (g >= 1 && g <= LORE_MAX) upd(o => { o.goal = g; o.winner = loreWinner(o); }); }
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { loreNew, loreAct, loreNext, loreUndo };
