/* ── motion.js : mouvement et retours au toucher (modèle : Mana Orbit) ───────────────────────────────────────────────────────
   · Carte en grand : elle part de la vignette touchée et y revient en se fermant (flipFrom / flipTo, Web Animations).
   · .tilt (carte en grand) : inclinaison 3D et reflet holographique qui suivent le doigt ou la souris ; .is-foil ajoute le voile irisé.
   · sparkle(el | x, y) : gerbe d'étincelles dorées (ajout à la collection, extension complète, victoire). countUp(el, de, à) : montant qui défile.
   · haptic('tap' | 'success' | 'warn') : vibration courte (Android ; ignorée ailleurs).
   Tout passe par transform / opacity (compositeur) ; « réduire les animations » coupe tout sauf l'état final. Vignettes en cascade : css/motion.css. */
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const motionOff = () => reduceMotion() || typeof Element === 'undefined' || !Element.prototype.animate;
const MO = { press: null, at: 0, tilt: null, raf: 0, pt: null };

/* ── Vignette touchée : origine de la carte en grand et des étincelles ── */
document.addEventListener('pointerdown', e => {
  const el = e.target && e.target.closest && e.target.closest('.card-thumb, .stepper button, .btn');
  if (el) { MO.press = el; MO.at = performance.now(); }
}, { capture: true, passive: true });
/** Rectangle de l'élément touché il y a moins de 900 ms (sélecteur facultatif), encore affiché ; null sinon. */
function pressOrigin(sel) {
  const el = MO.press; if (!el || !el.isConnected || performance.now() - MO.at > 900 || (sel && !el.matches(sel))) return null;
  const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 ? r : null;
}
/** Anime el depuis le rectangle from jusqu'à sa place (léger dépassement : la carte « se pose »). */
function flipFrom(el, from, ms = 460) {
  if (!el || !from || motionOff()) return false;
  const to = el.getBoundingClientRect(); if (!to.width) return false;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2), s = from.width / to.width;
  el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: .6 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.22,1.12,.36,1)' });
  return true;
}
/** Retour vers le rectangle to (fermeture). */
function flipTo(el, to, ms = 280) {
  if (!el || !to || motionOff()) return false;
  const r = el.getBoundingClientRect(); if (!r.width) return false;
  const dx = to.left + to.width / 2 - (r.left + r.width / 2), dy = to.top + to.height / 2 - (r.top + r.height / 2), s = to.width / r.width;
  el.animate([{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) scale(${s})` }], { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  return true;
}

/* ── Inclinaison et reflet ── */
function tiltReset(el) { if (!el) return; for (const p of ['--rx', '--ry']) el.style.removeProperty(p); el.classList.remove('tilting'); }
function tiltPaint() {
  MO.raf = 0; const el = MO.tilt, p = MO.pt; if (!el || !p) return;
  const r = el.getBoundingClientRect(); if (!r.width) return;
  const x = Math.min(1, Math.max(0, (p.x - r.left) / r.width)), y = Math.min(1, Math.max(0, (p.y - r.top) / r.height));
  el.style.setProperty('--rx', ((.5 - y) * 10).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - .5) * 12).toFixed(2) + 'deg');
  el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  el.classList.add('tilting');
}
function tiltMove(e) {
  if (motionOff()) return;
  const el = e.target && e.target.closest && e.target.closest('.tilt');
  if (el !== MO.tilt) { tiltReset(MO.tilt); MO.tilt = el; }
  if (!el) return;
  MO.pt = { x: e.clientX, y: e.clientY };
  if (!MO.raf) MO.raf = requestAnimationFrame(tiltPaint);
}
document.addEventListener('pointermove', tiltMove, { passive: true });
document.addEventListener('pointerdown', tiltMove, { passive: true });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'scroll']) document.addEventListener(ev, e => { if (ev !== 'pointerup' || e.pointerType !== 'mouse') { tiltReset(MO.tilt); MO.tilt = null; } }, { passive: true, capture: ev === 'scroll' });

/* ── Étincelles ── */
/** Gerbe d'étincelles dorées au centre de el (élément ou rectangle), ou au point (x, y). n : nombre (14 par défaut). */
function sparkle(a, b, n = 14) {
  if (motionOff() || typeof document === 'undefined') return;
  let x = a, y = b;
  if (a && typeof a === 'object') { const r = a.getBoundingClientRect ? a.getBoundingClientRect() : a; x = r.left + r.width / 2; y = r.top + r.height / 2; n = typeof b === 'number' ? b : n; }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const box = document.createElement('div'); box.className = 'spk'; box.style.left = x + 'px'; box.style.top = y + 'px'; box.setAttribute('aria-hidden', 'true');
  document.body.appendChild(box);
  let left = n;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'), ang = (i / n) * Math.PI * 2 + Math.random() * .5, d = 34 + Math.random() * 46, z = .5 + Math.random() * .8;
    s.style.setProperty('--z', z.toFixed(2)); if (i % 3 === 0) s.className = 'w';
    box.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(0) rotate(0)', opacity: 1 }, { transform: `translate(calc(-50% + ${(Math.cos(ang) * d).toFixed(1)}px),calc(-50% + ${(Math.sin(ang) * d).toFixed(1)}px)) scale(${z.toFixed(2)}) rotate(90deg)`, opacity: 1, offset: .55 },
      { transform: `translate(calc(-50% + ${(Math.cos(ang) * d * 1.25).toFixed(1)}px),calc(-50% + ${(Math.sin(ang) * d * 1.25 + 14).toFixed(1)}px)) scale(0) rotate(160deg)`, opacity: 0 }],
    { duration: 620 + Math.random() * 380, easing: 'cubic-bezier(.2,.8,.3,1)', delay: Math.random() * 60 }).onfinish = () => { if (--left <= 0) box.remove(); };
  }
}

/* ── Montants qui défilent ── */
/** Fait défiler le texte de el de from à to (centimes par défaut, fmt = fmtMoney) ; état final immédiat si les animations sont coupées. */
function countUp(el, from, to, fmt = fmtMoney, ms = 800) {
  if (!el) return;
  if (motionOff() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), tick = t => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ── Vibration ── */
const HAPTIC = { tap: 8, success: [12, 40, 18], warn: [30, 40, 30] };
function haptic(kind = 'tap') { try { if (navigator.vibrate) navigator.vibrate(HAPTIC[kind] || 8); } catch (e) { /* ignore */ } }

/* ── Arrivée en cascade ── */
/** Grilles et listes nouvellement posées dans la page : leurs premiers éléments arrivent l'un après l'autre (css/motion.css › .stg).
 *  Seulement à l'insertion du conteneur (vue, onglet, écran) ; la classe part ensuite : une recherche qui remplace le contenu ne rejoue rien. */
const STG_SEL = '.grid-cards, .list, .hm-tiles, .hm-sets';
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(muts => {
    if (motionOff()) return;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      const els = n.matches(STG_SEL) ? [n] : [...n.querySelectorAll(STG_SEL)];
      for (const el of els) { el.classList.add('stg'); setTimeout(() => el.classList.remove('stg'), 1000); }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
