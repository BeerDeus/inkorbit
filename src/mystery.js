/* ── mystery.js : « Carte mystère », la carte du jour à deviner (tout est sur l'appareil : ni serveur, ni classement) ───────────────
   · Même carte pour tout le monde le même jour (jour à Paris, dayKey) : tirée parmi les cartes ayant une image Lorcast, hors promos.
   · 6 essais : l'image se dévoile pixelisée puis de plus en plus nette (canvas : dessinée toute petite puis agrandie sans lissage ;
     l'image vient d'un autre site, la toile est « teintée » : on ne lit jamais ses pixels), avec un indice de plus à chaque erreur.
   · Trouvée ou 6 essais : la carte en grand, score, série de jours, « Partager », compte à rebours jusqu'à minuit à Paris.
   Logique pure (mysPool, mysCard, mysGuess, mysScore, mysStreak, mysShare, mysUntilMidnight) : tests/test-games.mjs. */

const MYS_TRIES = 6;
/** Largeur (en pixels de l'image tirée) de chaque étape ; 0 : l'image nette. */
const MYS_PIX = [7, 11, 17, 26, 40, 64];
const mysPool = cards => cards.filter(c => c.img && !c.img.startsWith('r:') && c.rar !== 8);
function mysCard(cards, day) { const pool = mysPool(cards); return pool.length ? pool[seedPick('io-' + day, pool.length)] : null; }
const mysNew = day => ({ day, tries: [], done: false, won: false });
/** Une réponse : ok si c'est la carte (même nom complet, quelle que soit l'impression). */
function mysGuess(st, guessId, ok) {
  if (st.done) return st;
  const o = { ...st, tries: st.tries.concat(guessId) };
  if (ok) { o.done = true; o.won = true; } else if (o.tries.length >= MYS_TRIES) o.done = true;
  return o;
}
/** Étape affichée (0 à 5) : une de plus par erreur ; partie finie : 6 (nette). */
const mysStep = st => (st.done ? MYS_TRIES : Math.min(MYS_TRIES - 1, st.tries.length));
const mysScore = st => (st.won ? MYS_TRIES + 1 - st.tries.length : 0);
const dayBefore = d => new Date(Date.parse(d + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
/** Série : jours gagnés d'affilée jusqu'à aujourd'hui (ou hier, si la carte du jour n'est pas encore jouée). days : { jour: [gagné 0|1, essais] }. */
function mysStreak(days, today) {
  let d = days[today] ? today : dayBefore(today), n = 0;
  while (days[d] && days[d][0]) { n++; d = dayBefore(d); }
  return n;
}
function mysShare(st, url) {
  const sq = Array.from({ length: MYS_TRIES }, (_, i) => (i < st.tries.length ? (st.won && i === st.tries.length - 1 ? '🟩' : '🟪') : '⬛')).join('');
  return `${T('Carte mystère')} ${st.day} · ${st.won ? `${st.tries.length}/${MYS_TRIES}` : `X/${MYS_TRIES}`}\n${sq}${url ? '\n' + url : ''}`;
}
/** Secondes jusqu'à minuit à Paris (prochaine carte). */
function mysUntilMidnight(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, +x.value]));
  return 86400 - (p.hour * 3600 + p.minute * 60 + p.second);
}

/* ── Interface ──────────────────────────────────────────────────────────────────────────────── */
const MYS = { el: null, card: null, img: null, tick: 0 };
const mysKey = c => normName(fullName(c));
/** Partie du jour (gardée) : { day, tries, done, won }, pour la tuile de l'accueil. */
function mysteryState() { const day = dayKey(), m = load('mystery', {}); return m.cur && m.cur.day === day ? m.cur : mysNew(day); }
function mysSave(st) {
  const m = load('mystery', {}), days = m.days || {};
  if (st.done) days[st.day] = [st.won ? 1 : 0, st.tries.length];
  for (const d of Object.keys(days).sort().slice(0, -400)) delete days[d];      // 400 jours au plus
  save('mystery', { cur: st, days });
}
function mysHints(c, step) {
  const h = [];
  if (step >= 1) h.push([T('Encre'), inksOf(c.ink).map(i => INK_NAMES()[i]).join(' · ') || '—']);
  if (step >= 2) h.push([T('Coût'), String(c.cost)]);
  if (step >= 3) h.push([T('Type'), TYPE_NAMES()[c.type]]);
  if (step >= 4) h.push([T('Extension'), setName(c.pset || c.set)]);
  if (step >= 5) h.push([T('Première lettre'), c.name.charAt(0).toUpperCase()]);
  return h;
}
function openMystery() {
  MYS.el = openScreen({ title: T('Carte mystère'), cls: 'mys-screen', html: `<div class="mys"><p class="muted">${esc(T('Chargement…'))}</p></div>`, onClose: () => { clearInterval(MYS.tick); MYS.el = null; } });
  MYS.el.addEventListener('click', mysClick);
  dataLoad().then(() => {
    MYS.card = mysCard(CARDS.list, dayKey());
    if (!MYS.card || !MYS.el) return;
    MYS.img = new Image(); MYS.img.decoding = 'async';
    MYS.img.onload = () => mysDraw();
    MYS.img.src = cardImg(MYS.card, 'normal');
    mysPaint();
  }, () => { if (MYS.el) $('.mys', MYS.el).innerHTML = `<p class="muted">${esc(T('Catalogue indisponible : réessaie avec du réseau.'))}</p>`; });
  return MYS.el;
}
function mysPaint() {
  const el = MYS.el; if (!el || !MYS.card) return;
  const st = mysteryState(), c = MYS.card, step = mysStep(st), box = $('.mys', el);
  const tries = st.tries.map(id => CARDS.byId.get(id)).filter(Boolean);
  const days = (load('mystery', {}).days) || {};
  box.innerHTML = `
    <div class="mys-stage da-frame"><canvas class="mys-cv" width="315" height="440" role="img" aria-label="${esc(st.done ? fullName(c) : T('Carte à deviner, étape {n} sur 6', { n: step + 1 }))}"></canvas>
      <div class="mys-steps" aria-hidden="true">${Array.from({ length: MYS_TRIES }, (_, i) => `<i class="${i < st.tries.length ? (st.won && i === st.tries.length - 1 ? 'ok' : 'ko') : ''}"></i>`).join('')}</div></div>
    ${st.done ? `<div class="mys-end">
        <p class="mys-res da-title">${esc(st.won ? T('Trouvée en {n} !', { n: st.tries.length }) : T('Perdu… c\'était'))}</p>
        <p class="mys-name">${esc(fullName(c))}</p>
        <p class="muted small">${esc(T('Score {s} · Série {n}', { s: mysScore(st), n: mysStreak(days, st.day) }))}</p>
        <div class="btn-row"><button type="button" class="btn btn-primary" data-mys="share"><svg class="i"><use href="#i-share"/></svg>${esc(T('Partager'))}</button><button type="button" class="btn" data-mys="card">${esc(T('Voir la carte'))}</button></div>
        <p class="mys-next muted small">${esc(T('Prochaine carte dans'))} <b class="num" data-mys-clock></b></p></div>`
      : `<p class="mys-q">${esc(T('Quelle est cette carte ?'))} <span class="muted small">${esc(TN(MYS_TRIES - st.tries.length, '{n} essai restant', '{n} essais restants'))}</span></p>
        <div class="mys-in"><label class="search"><svg class="i"><use href="#i-search"/></svg><input class="input" type="search" autocomplete="off" placeholder="${esc(T('Nom de la carte'))}" aria-label="${esc(T('Nom de la carte'))}"></label><div class="mys-sug" role="listbox"></div></div>`}
    ${mysHints(c, st.done ? 5 : step).length ? `<dl class="mys-hints">${mysHints(c, st.done ? 5 : step).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${tries.length ? `<ol class="mys-tries">${tries.map((t, i) => `<li class="${st.won && i === tries.length - 1 ? 'ok' : 'ko'}">${esc(fullName(t))}</li>`).join('')}</ol>` : ''}`;
  mysDraw();
  const inp = $('.mys-in input', box);
  if (inp) {
    const sug = $('.mys-sug', box);
    const run = () => {
      const seen = new Set(), r = [];
      for (const x of inp.value.trim().length >= 2 ? cardSearch(inp.value, {}, 60) : []) { const k = mysKey(x); if (seen.has(k)) continue; seen.add(k); r.push(x); if (r.length >= 7) break; }
      sug.innerHTML = r.map(x => `<button type="button" role="option" class="mys-opt" data-guess="${x.id}">${esc(x.name)}${x.ver ? ` <span class="muted">· ${esc(x.ver)}</span>` : ''}</button>`).join('');
    };
    inp.addEventListener('input', run);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('[data-guess]', sug); if (b) { e.preventDefault(); mysTry(+b.dataset.guess); } } });
  }
  clearInterval(MYS.tick);
  if (st.done) { const clk = () => { const s = mysUntilMidnight(), b = MYS.el && $('[data-mys-clock]', MYS.el); if (!b) return; b.textContent = [s / 3600, s / 60 % 60, s % 60].map(x => String(Math.floor(x)).padStart(2, '0')).join(':'); if (s <= 1) setTimeout(() => { if (MYS.el) { MYS.card = mysCard(CARDS.list, dayKey()); MYS.img.src = cardImg(MYS.card, 'normal'); mysPaint(); } }, 1500); }; clk(); MYS.tick = setInterval(clk, 1000); }
}
/** Dessine l'étape : l'image réduite à MYS_PIX[étape] pixels de large, puis agrandie sans lissage ; finie : nette. */
function mysDraw() {
  const cv = MYS.el && $('.mys-cv', MYS.el), img = MYS.img;
  if (!cv || !img || !img.complete || !img.naturalWidth) return;
  const ctx = cv.getContext('2d'), step = mysStep(mysteryState()), W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (step >= MYS_TRIES) { ctx.imageSmoothingEnabled = true; ctx.drawImage(img, 0, 0, W, H); return; }
  const w = MYS_PIX[step], h = Math.round(w * 88 / 63), tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d'); t.imageSmoothingEnabled = true; t.drawImage(img, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, w, h, 0, 0, W, H);
}
function mysTry(id) {
  const g = CARDS.byId.get(id), st = mysteryState(); if (!g || st.done || st.tries.includes(id)) return;
  const n = mysGuess(st, id, mysKey(g) === mysKey(MYS.card));
  mysSave(n); mysPaint();
  try { navigator.vibrate && navigator.vibrate(n.won ? [30, 50, 90] : 20); } catch (e) { /* ignore */ }
  if (!n.done) { const inp = MYS.el && $('.mys-in input', MYS.el); if (inp) inp.focus(); toast(T('Ce n\'est pas elle')); }
}
async function mysClick(e) {
  const g = e.target.closest('[data-guess]'); if (g) { mysTry(+g.dataset.guess); return; }
  const b = e.target.closest('[data-mys]'); if (!b) return;
  if (b.dataset.mys === 'card') openCard(MYS.card.id);
  else if (b.dataset.mys === 'share') {
    const text = mysShare(mysteryState(), location.origin + location.pathname);
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (err) { if (err && err.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast(T('Copié : colle-le où tu veux')); } catch (err) { toast(T('Copie impossible')); }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { MYS_TRIES, mysPool, mysCard, mysNew, mysGuess, mysStep, mysScore, mysStreak, mysShare, mysUntilMidnight, dayBefore };
