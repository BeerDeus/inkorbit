/* ── value.js : valeur de la collection dans le temps ──────────────────────────────────────────────────
   Un relevé par jour au plus (le jour où le fichier de prix change, ou la collection) : [jour, euros, dollars] en centimes, 400 jours au plus,
   dans localStorage (inkorbit:valhist). valueCurveSvg() dessine la courbe (accueil). */
const VAL = { hist: load('valhist', []) };
function valueNote() {
  if (!CARDS.ready) return;
  const day = dayKey(), eur = collValue(COLL.map, PRICES.p, 'EUR'), usd = collValue(COLL.map, PRICES.p, 'USD'), h = VAL.hist, last = h[h.length - 1];
  if (last && last[0] === day) { last[1] = eur; last[2] = usd; } else h.push([day, eur, usd]);
  if (h.length > 400) h.splice(0, h.length - 400);
  save('valhist', h);
}
document.addEventListener('io:data', valueNote);
onColl(() => { clearTimeout(VAL.t); VAL.t = setTimeout(valueNote, 800); });
/** Variation sur n jours (centimes) dans la devise des réglages, null si pas d'historique assez ancien. */
function valueDelta(days = 7) {
  const i = prefs().cur === 'USD' ? 2 : 1, h = VAL.hist; if (h.length < 2) return null;
  const since = dayKey(new Date(Date.now() - days * 864e5)), old = h.find(x => x[0] >= since) || h[0];
  return old === h[h.length - 1] ? null : h[h.length - 1][i] - old[i];
}
/** Courbe de la valeur (SVG, largeur 100 %) : 90 derniers jours ; une ligne plate tant qu'il n'y a qu'un relevé. */
function valueCurveSvg(w = 320, ht = 72) {
  const i = prefs().cur === 'USD' ? 2 : 1, pts = VAL.hist.slice(-90).map(x => x[i]);
  if (!pts.length) return '';
  if (pts.length === 1) pts.unshift(pts[0]);
  const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
  const xy = pts.map((v, k) => [(k / (pts.length - 1)) * w, ht - 6 - ((v - lo) / span) * (ht - 12)]);
  const d = xy.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return `<svg class="val-curve" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="vcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".35"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="${d}L${w} ${ht}L0 ${ht}Z" fill="url(#vcg)"/><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
