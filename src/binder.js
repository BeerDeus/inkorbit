/* ── binder.js : classeur d'échange (pages de 3 × 3 pochettes, comme un vrai classeur) ─────────────────────────────────────
   Pages côte à côte, défilement horizontal aimanté (scroll-snap : le doigt tourne les pages, rien à programmer) ; numéro de page en bas.
   Une pochette par carte (quantité en badge) ; foil : liseré irisé. */
function binderHtml(items) {
  const pages = [];
  for (let i = 0; i < items.length; i += 9) pages.push(items.slice(i, i + 9));
  return `<div class="binder" data-cards>${pages.map((p, k) => `<div class="bnd-page" aria-label="${esc(T('Page {n} sur {m}', { n: k + 1, m: pages.length }))}"><div class="bnd-grid">${p.map(o => `<div class="bnd-pocket${o.foil ? ' is-foil' : ''}">${thumbHtml(o.c, { qty: o.n })}</div>`).join('')}${'<div class="bnd-pocket is-empty"></div>'.repeat(9 - p.length)}</div><p class="bnd-no muted small">${k + 1} / ${pages.length}</p></div>`).join('')}</div>`;
}
