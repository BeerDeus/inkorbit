/* ── progress.js : niveau (1 à 999, volontairement long) et trophées ─────────────────────────────────────────────────────────────────
   Tout ce qui peut l'être vient des vraies données (collection, decks, échange, carte mystère, compte) : rétroactif, rien à rattraper, rien à fausser.
   Le reste (cartes scannées, parties de lore, liste partagée, jours d'utilisation) est compté au moment où ça arrive : save('prg', { c: { clé: n } }),
   par prgScan(n), prgLore(won), prgShared(), prgDay(). Badges à paliers (bronze, argent, or, diamant) ou uniques ; l'XP vient de l'activité et des paliers ;
   niveau L atteint à 40 × (L − 1)^2,25 XP (comme Mana Orbit). Paliers déjà vus : save('badges', { id: palier }) ; un nouveau palier est annoncé une seule fois
   (toast « Voir » + étincelles), jamais pour des données arrivées d'un autre appareil (synchro) ni au tout premier calcul. Interface : prgSheet(), prgHomeHtml(), prgRowHtml(). */
const PRG_MAX = 999;
const PRG = { c: null, t: 0, loud: false };
const prgTierName = i => [T('bronze'), T('argent'), T('or'), T('diamant')][i] || T('unique');
const PRG_CATS = () => [['coll', T('Collection')], ['ink', T('Encres')], ['rar', T('Raretés')], ['set', T('Extensions')], ['deck', T('Decks')], ['trade', T('Échange')], ['play', T('Jeux')], ['life', T('Fidélité')]];

/* ── Compteurs d'évènements ─────────────────────────────────────────────────────────────────── */
function prgC() { if (!PRG.c) { const o = load('prg', {}); PRG.c = o && typeof o.c === 'object' && o.c ? o.c : {}; } return PRG.c; }
function prgAdd(k, n = 1) { if (!(n > 0)) return; const c = prgC(); c[k] = Math.min(1e9, (c[k] || 0) + n); save('prg', { c }); prgSoon(true); }
/** Cartes ajoutées par le scan (scan.js, au moment de « Ajouter N cartes à ma collection »). */
const prgScan = n => prgAdd('sc', n);
/** Partie de lore terminée (lore.js, à la victoire) ; won : le joueur 1 (soi) a gagné. */
function prgLore(won) { prgAdd('lg'); if (won) prgAdd('lw'); }
/** Liste d'échange partagée (trade.js : lien copié, partagé ou QR affiché). */
const prgShared = () => prgAdd('sh');
/** Un jour d'utilisation de plus (une fois par jour, au lancement). */
function prgDay() { const c = prgC(), d = dayKey(); if (c.dl === d) return; c.dl = d; c.days = (c.days || 0) + 1; save('prg', { c }); }

/* ── Mesures ──────────────────────────────────────────────────────────────────────────────── */
/** Série la plus longue de jours gagnés à la carte mystère (jours consécutifs à Paris). */
function prgBestStreak(days) {
  let best = 0, run = 0, prev = '';
  for (const d of Object.keys(days || {}).sort()) {
    const next = prev && new Date(Date.parse(prev + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    run = days[d][0] ? (prev && d === next && run ? run + 1 : 1) : 0; if (run > best) best = run; prev = d;
  }
  return best;
}
/** Tout ce que les badges regardent. st : état injecté (tests) ; sinon lu dans l'appli. */
function prgMetrics(st) {
  const s = st || prgState(), c = s.c || {}, m = { sc: c.sc || 0, lg: c.lg || 0, lw: c.lw || 0, sh: c.sh || 0, days: c.days || 0, cloud: s.cloud ? 1 : 0, inst: s.inst ? 1 : 0 };
  let copies = 0, foil = 0; const ink = INK_KEYS.map(() => 0), rar = RAR_KEYS.map(() => 0), own = collById(s.coll || {});
  for (const [id, o] of own) { copies += o.n; foil += o.foil; const k = s.byId.get(id); if (!k) continue; for (const i of inksOf(k.ink)) ink[i] += o.n; rar[k.rar] += o.n; }
  Object.assign(m, { copies, foil, distinct: own.size, ink, legend: rar[4], epic: rar[5], enchant: rar[6], iconic: rar[7], value: s.value || 0 });
  m.half = s.sets.filter(p => p.base && p.baseOwn * 2 >= p.base).length;
  m.full = s.sets.filter(p => p.base && p.baseOwn >= p.base).length;
  m.master = s.sets.filter(p => p.all && p.allOwn >= p.all).length;
  m.decks = s.decks.length;
  m.valid = s.decks.filter(d => deckCheck(d.cards || {}, s.byId, d.fmt).ok).length;
  m.built = s.decks.filter(d => deckCheck(d.cards || {}, s.byId, d.fmt).ok && !deckMissing(d.cards || {}, s.coll || {}).length).length;
  const L = tradeLists(s.coll || {}, s.keep || 4, s.hold || {}, s.wants || {});
  m.wish = L.want.length; m.spare = L.have.reduce((a, x) => a + x.n, 0);
  const days = s.mystery || {}, won = Object.values(days).filter(x => x[0]);
  m.found = won.length; m.one = won.some(x => x[1] === 1) ? 1 : 0; m.streak = prgBestStreak(days);
  return m;
}
/** État de l'appli lu pour prgMetrics (rien quand le catalogue n'est pas prêt : les badges ne bougent pas). */
function prgState() {
  const ready = typeof CARDS !== 'undefined' && CARDS.ready, p = prefs();
  const sets = ready && typeof setProgress === 'function' ? CARDS.sets.filter(x => x.type === 'expansion' || x.type === 'quest').map(x => setProgress(x.code)) : [];
  return { c: prgC(), coll: ready ? COLL.map : {}, wants: COLL.wants, hold: COLL.hold, keep: p.keep, byId: ready ? CARDS.byId : new Map(), sets, decks: load('decks', []),
    mystery: (load('mystery', {}) || {}).days || {}, value: ready ? collValue(COLL.map, PRICES.p, p.cur) : 0,
    cloud: typeof syncMeta === 'function' && !!syncMeta().uid, inst: typeof PWA !== 'undefined' && PWA.standalone() };
}

/* ── Badges ───────────────────────────────────────────────────────────────────────────────── */
/* { id, cat, t (nom), d ([singulier, pluriel] de « {n} … ») ou money (seuil en centimes) ou one (unique), tiers, names (argent, or, diamant), v (mesure), ink? } */
const INK_BADGE_NAMES = { amber: ['Lueur d\'ambre', 'Éclat d\'ambre', 'Cœur d\'ambre', 'Soleil d\'ambre'], amethyst: ['Lueur d\'améthyste', 'Éclat d\'améthyste', 'Cœur d\'améthyste', 'Lune d\'améthyste'],
  emerald: ['Lueur d\'émeraude', 'Éclat d\'émeraude', 'Cœur d\'émeraude', 'Forêt d\'émeraude'], ruby: ['Lueur de rubis', 'Éclat de rubis', 'Cœur de rubis', 'Brasier de rubis'],
  sapphire: ['Lueur de saphir', 'Éclat de saphir', 'Cœur de saphir', 'Océan de saphir'], steel: ['Lueur d\'acier', 'Éclat d\'acier', 'Cœur d\'acier', 'Rempart d\'acier'] };
const INK_BADGE_D = { amber: ['{n} carte Ambre', '{n} cartes Ambre'], amethyst: ['{n} carte Améthyste', '{n} cartes Améthyste'], emerald: ['{n} carte Émeraude', '{n} cartes Émeraude'],
  ruby: ['{n} carte Rubis', '{n} cartes Rubis'], sapphire: ['{n} carte Saphir', '{n} cartes Saphir'], steel: ['{n} carte Acier', '{n} cartes Acier'] };
const PRG_BADGES = [
  { id: 'co_copies', cat: 'coll', t: 'Petit grimoire', names: ['Bibliothèque', 'Grande bibliothèque', 'Archives infinies'], d: ['{n} carte', '{n} cartes'], tiers: [50, 500, 2000, 10000], v: m => m.copies },
  { id: 'co_distinct', cat: 'coll', t: 'Curieux', names: ['Érudit', 'Encyclopédiste', 'Mémoire du monde'], d: ['{n} carte différente', '{n} cartes différentes'], tiers: [25, 250, 1000, 3000], v: m => m.distinct },
  { id: 'co_value', cat: 'coll', t: 'Bourse d\'or', names: ['Coffre enchanté', 'Salle au trésor', 'Trésor des étoiles'], money: 'Une collection de {p} ou plus', tiers: [1000, 10000, 100000, 1000000], v: m => m.value },
  { id: 'co_foil', cat: 'coll', t: 'Reflet', names: ['Scintillant', 'Éblouissant', 'Aurore boréale'], d: ['{n} foil', '{n} foils'], tiers: [5, 50, 250, 1000], v: m => m.foil },
  ...INK_KEYS.map((k, i) => ({ id: 'ink_' + k, cat: 'ink', ink: k, t: INK_BADGE_NAMES[k][0], names: INK_BADGE_NAMES[k].slice(1), d: INK_BADGE_D[k], tiers: [10, 50, 150, 400], v: m => m.ink[i] })),
  { id: 'ra_legend', cat: 'rar', t: 'Conteur de légendes', names: ['Mythe vivant', 'Panthéon', 'Ciel des légendes'], d: ['{n} carte Légendaire', '{n} cartes Légendaires'], tiers: [1, 10, 30, 100], v: m => m.legend },
  { id: 'ra_epic', cat: 'rar', t: 'Épopée', names: ['Saga', 'Grande épopée', 'Chant éternel'], d: ['{n} carte Épique', '{n} cartes Épiques'], tiers: [1, 5, 15, 50], v: m => m.epic },
  { id: 'ra_enchant', cat: 'rar', t: 'Sortilège', names: ['Enchanteur', 'Grand enchanteur', 'Magie pure'], d: ['{n} carte Enchantée', '{n} cartes Enchantées'], tiers: [1, 5, 15, 50], v: m => m.enchant },
  { id: 'ra_iconic', cat: 'rar', t: 'Étoile rare', one: 'Une carte Iconique', tiers: [1], v: m => m.iconic },
  { id: 'se_half', cat: 'set', t: 'Mi-chemin', names: ['Voyageur', 'Arpenteur', 'Cartographe des mondes'], d: ['{n} extension à moitié (cartes de base)', '{n} extensions à moitié (cartes de base)'], tiers: [1, 3, 6, 12], v: m => m.half },
  { id: 'se_full', cat: 'set', t: 'Livre complet', names: ['Saga complète', 'Bibliothèque complète', 'Gardien des livres'], d: ['{n} extension complète (cartes de base)', '{n} extensions complètes (cartes de base)'], tiers: [1, 2, 5, 10], v: m => m.full },
  { id: 'se_master', cat: 'set', t: 'Masterset', one: 'Une extension complète, Enchantées comprises', tiers: [1], v: m => m.master },
  { id: 'dk_count', cat: 'deck', t: 'Apprenti conteur', names: ['Conteur', 'Maître conteur', 'Grand narrateur'], d: ['{n} deck', '{n} decks'], tiers: [1, 5, 15, 40], v: m => m.decks },
  { id: 'dk_valid', cat: 'deck', t: 'Prêt à jouer', names: ['Stratège', 'Tacticien', 'Grand stratège'], d: ['{n} deck valide (60 cartes, 2 encres)', '{n} decks valides (60 cartes, 2 encres)'], tiers: [1, 3, 10, 25], v: m => m.valid },
  { id: 'dk_built', cat: 'deck', t: 'Artisan', names: ['Forgeron d\'encre', 'Maître artisan', 'Atelier des merveilles'], d: ['{n} deck complet dans ta collection', '{n} decks complets dans ta collection'], tiers: [1, 3, 10, 25], v: m => m.built },
  { id: 'tr_wish', cat: 'trade', t: 'Rêveur', names: ['Quêteur', 'Chasseur d\'étoiles', 'Attrapeur de rêves'], d: ['{n} carte recherchée', '{n} cartes recherchées'], tiers: [5, 25, 100, 400], v: m => m.wish },
  { id: 'tr_spare', cat: 'trade', t: 'Généreux', names: ['Marchand', 'Négociant', 'Prince des échanges'], d: ['{n} carte à échanger', '{n} cartes à échanger'], tiers: [10, 50, 200, 1000], v: m => m.spare },
  { id: 'tr_share', cat: 'trade', t: 'Vitrine', one: 'Une liste d\'échange partagée', tiers: [1], v: m => m.sh },
  { id: 'sc_cards', cat: 'play', t: 'Œil d\'encre', names: ['Lecteur', 'Œil de lynx', 'Regard des étoiles'], d: ['{n} carte scannée', '{n} cartes scannées'], tiers: [25, 250, 1000, 5000], v: m => m.sc },
  { id: 'lo_games', cat: 'play', t: 'Conteur de table', names: ['Joueur', 'Habitué', 'Légende des tables'], d: ['{n} partie de lore', '{n} parties de lore'], tiers: [1, 10, 50, 200], v: m => m.lg },
  { id: 'lo_wins', cat: 'play', t: 'Première victoire', names: ['Champion', 'Conquérant', 'Étoile du soir'], d: ['{n} victoire', '{n} victoires'], tiers: [1, 10, 50, 200], v: m => m.lw },
  { id: 'my_found', cat: 'play', t: 'Devin', names: ['Voyant', 'Oracle', 'Lecteur d\'étoiles'], d: ['{n} carte mystère trouvée', '{n} cartes mystère trouvées'], tiers: [1, 10, 50, 200], v: m => m.found },
  { id: 'my_streak', cat: 'play', t: 'Assidu', names: ['Régulier', 'Rituel', 'Étoile fidèle'], d: ['{n} jour d\'affilée', '{n} jours d\'affilée'], tiers: [3, 7, 30, 100], v: m => m.streak },
  { id: 'my_one', cat: 'play', t: 'Coup d\'œil', one: 'Une carte mystère trouvée du premier coup', tiers: [1], v: m => m.one },
  { id: 'fi_days', cat: 'life', t: 'Habitué', names: ['Familier', 'Pilier', 'Gardien du livre'], d: ['{n} jour avec Ink Orbit', '{n} jours avec Ink Orbit'], tiers: [7, 30, 100, 365], v: m => m.days },
  { id: 'ac_cloud', cat: 'life', t: 'Mémoire des nuages', one: 'Un compte connecté', tiers: [1], v: m => m.cloud },
  { id: 'fx_install', cat: 'life', t: 'Chez soi', one: 'Ink Orbit installée sur l\'écran d\'accueil', tiers: [1], v: m => m.inst },
];
const prgName = (b, t) => T(t >= 1 && b.names ? b.names[t - 1] : b.t);
/** Palier atteint : -1 (aucun), 0 (bronze) … 3 (diamant) ; unique : 0. */
const prgTier = (b, v) => { let t = -1; b.tiers.forEach((x, i) => { if (v >= x) t = i; }); return t; };
function prgLabel(b, x) {
  if (b.money) return T(b.money, { p: fmtMoney(x).replace(/[,.]00(?=\D*$)/, '') });
  if (b.one) return T(b.one);
  return TN(x, b.d[0], b.d[1]);
}
/** Badges du moment : [{ b, v, t, next }]. */
const prgBadges = (m = prgMetrics()) => PRG_BADGES.map(b => { const v = Math.max(0, Number(b.v(m)) || 0), t = prgTier(b, v); return { b, v, t, next: b.tiers[t + 1] ?? null }; });

/* ── XP et niveau ─────────────────────────────────────────────────────────────────────────── */
const PRG_W = { copies: 1, distinct: 2, decks: 25, valid: 60, sc: 3, lg: 30, lw: 60, found: 40, days: 15 };
const prgTierXp = (b, t) => (t < 0 ? 0 : b.tiers.length === 1 ? 500 : [100, 500, 2500, 12500].slice(0, t + 1).reduce((a, x) => a + x, 0));
function prgXp(m, bs) { let xp = 0; for (const [k, w] of Object.entries(PRG_W)) xp += (Number(m[k]) || 0) * w; for (const x of bs) xp += prgTierXp(x.b, x.t); return Math.round(xp); }
const prgXpFor = L => Math.round(40 * Math.pow(Math.max(0, L - 1), 2.25));
function prgLevel(xp) {
  let lo = 1, hi = PRG_MAX; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prgXpFor(mid) <= xp) lo = mid; else hi = mid - 1; }
  return { lv: lo, xp, cur: prgXpFor(lo), nxt: lo >= PRG_MAX ? null : prgXpFor(lo + 1) };
}
function prgNow(st) { const m = prgMetrics(st), bs = prgBadges(m); return { m, bs, ...prgLevel(prgXp(m, bs)) }; }

/* ── Nouveaux paliers ─────────────────────────────────────────────────────────────────────── */
/** Paliers nouveaux par rapport à seen ({ id: palier }) : { seen (à garder), fresh ([{ b, t }] à annoncer) }. Premier calcul (seen absent) : tout est acquis sans annonce. */
function prgDiff(bs, seen) {
  const first = !seen || typeof seen !== 'object', keep = { ...(seen || {}) }, fresh = [];
  for (const x of bs) { if (x.t < 0 || (keep[x.b.id] != null && keep[x.b.id] >= x.t)) continue; keep[x.b.id] = x.t; if (!first) fresh.push(x); }
  return { seen: keep, fresh: fresh.sort((a, b) => b.t - a.t) };
}
/** Recalcul doux (1,5 s) ; loud : annoncer les nouveaux paliers (sinon acquis sans bruit : données arrivées d'un autre appareil). */
function prgSoon(loud = true) { if (loud && !(typeof CLOUD !== 'undefined' && CLOUD.applying)) PRG.loud = true; clearTimeout(PRG.t); PRG.t = setTimeout(prgCheck, 1500); }
function prgCheck() {
  const loud = PRG.loud; PRG.t = 0; PRG.loud = false; if (typeof CARDS === 'undefined' || !CARDS.ready) return;
  const { bs } = prgNow(), d = prgDiff(bs, load('badges', null));
  save('badges', d.seen);
  if (curView() === 'home' && typeof homePaint === 'function') homePaint();
  if (!loud || !d.fresh.length) return;
  const x = d.fresh[0], more = d.fresh.length - 1, head = x.b.tiers.length === 1 || x.t === 0 ? T('Nouveau trophée') : T('Palier {tier}', { tier: prgTierName(x.t) });
  toast(`${head} : ${prgName(x.b, x.t)}${more > 0 ? ' · ' + TN(more, '+{n} autre', '+{n} autres') : ''}`, { action: T('Voir'), onAction: () => prgSheet(x.b.id) });
  try { if (typeof sparkle === 'function') sparkle(document.querySelector('#toasts .toast:last-child') || document.body); if (typeof haptic === 'function') haptic('ok'); } catch (e) { /* animations facultatives */ }
}
if (typeof document !== 'undefined') { onColl(() => prgSoon(true)); document.addEventListener('io:data', () => { prgDay(); prgSoon(false); }); }

/* ── Affichage ────────────────────────────────────────────────────────────────────────────── */
const prgIc = (b, t) => `<span class="prg-ic"${b.ink ? ` style="--bq-ink:var(--${b.ink})"` : ''} aria-hidden="true">${badgeSvg(b.id, t)}</span>`;
const prgPct = L => (L.nxt ? Math.max(0, Math.min(100, ((L.xp - L.cur) / (L.nxt - L.cur)) * 100)) : 100);
/** Dernier palier obtenu (le plus haut, puis le plus récent dans l'ordre du catalogue). */
const prgBest = bs => bs.filter(x => x.t >= 0).sort((a, b) => b.t - a.t || prgTierXp(b.b, b.t) - prgTierXp(a.b, a.t))[0];
/** Encart de l'accueil : niveau, barre d'XP, meilleur trophée. */
function prgHomeHtml() {
  if (typeof CARDS === 'undefined' || !CARDS.ready) return '';
  const L = prgNow(), best = prgBest(L.bs), got = L.bs.filter(x => x.t >= 0).length;
  return `<button type="button" class="panel prg-home" data-act="trophies" aria-label="${esc(T('Niveau {n} : niveau et trophées', { n: L.lv }))}">
    <span class="prg-lvring" style="--p:${prgPct(L).toFixed(1)}"><b>${L.lv}</b></span>
    <span class="prg-home-t"><small>${esc(T('Niveau'))}</small><b>${esc(best ? prgName(best.b, best.t) : T('Ton premier trophée t\'attend'))}</b><span class="muted small">${esc(TN(got, '{n} trophée sur {t}', '{n} trophées sur {t}', { t: L.bs.length }))}</span></span>
    ${best ? prgIc(best.b, best.t) : ''}</button>`;
}
/** Ligne des Réglages (sous le compte). */
function prgRowHtml() {
  if (typeof CARDS === 'undefined' || !CARDS.ready) return '';
  const L = prgNow();
  return `<button type="button" class="row prg-row" data-act="trophies"><span class="prg-lvring sm" style="--p:${prgPct(L).toFixed(1)}"><b>${L.lv}</b></span><span class="row-main"><span class="row-title">${esc(T('Niveau et trophées'))}</span><span class="row-sub">${esc(TN(L.bs.filter(x => x.t >= 0).length, '{n} trophée obtenu', '{n} trophées obtenus'))}</span></span><svg class="i"><use href="#i-chev"/></svg></button>`;
}
if (typeof document !== 'undefined') onAct('trophies', () => prgSheet());
/** Fiche « Niveau et trophées » ; focus : badge à montrer (toast d'un nouveau palier). */
function prgSheet(focus) {
  const L = prgNow(), got = L.bs.reduce((a, x) => a + (x.t + 1), 0), all = L.bs.reduce((a, x) => a + x.b.tiers.length, 0);
  const val = (b, v) => (b.money ? fmtMoney(v).replace(/[,.]00(?=\D*$)/, '') : fmtNum(v));
  const tile = x => {
    const b = x.b, uniq = b.tiers.length === 1, prev = x.t >= 0 ? b.tiers[x.t] : 0, p = x.next == null ? 100 : Math.max(0, Math.min(100, ((x.v - prev) / (x.next - prev)) * 100));
    const steps = uniq ? '' : `<ol class="prg-steps">${b.tiers.map((th, i) => `<li class="${i <= x.t ? 'on' : ''}"><span>${esc(prgTierName(i))} · ${esc(prgName(b, i))}</span><small>${esc(prgLabel(b, th))}</small></li>`).join('')}</ol>`;
    return `<button type="button" class="prg-b ${x.t < 0 ? 'off' : uniq ? 'tu' : 't' + x.t}" data-b="${b.id}" aria-expanded="false">${prgIc(b, x.t)}<b>${esc(prgName(b, x.t))}</b>
      <small>${esc(x.t >= 0 ? prgLabel(b, b.tiers[x.t]) : prgLabel(b, b.tiers[0]))}</small>
      ${x.next != null && !uniq ? `<span class="prg-mini" aria-hidden="true"><i style="width:${p.toFixed(1)}%"></i></span><small class="prg-nx num">${esc(val(b, x.v))} / ${esc(val(b, x.next))}</small>` : x.t >= 0 ? `<small class="prg-ok">${esc(uniq ? T('Obtenu') : T('Palier maximum'))}</small>` : ''}
      <span class="prg-more">${steps}</span></button>`;
  };
  const el = openSheet({ title: T('Niveau et trophées'), cls: 'prg-sheet', html: `
    <div class="prg-head da-frame"><span class="prg-lvring lg" style="--p:${prgPct(L).toFixed(1)}"><b>${L.lv}</b></span>
      <div class="prg-xp"><small>${esc(T('Niveau'))}</small><span class="prg-bar" aria-hidden="true"><i style="width:${prgPct(L).toFixed(1)}%"></i></span>
      <small class="num">${esc(L.nxt ? T('{xp} XP · encore {d} XP avant le niveau {n}', { xp: fmtNum(L.xp), d: fmtNum(L.nxt - L.xp), n: L.lv + 1 }) : T('{xp} XP · niveau maximum', { xp: fmtNum(L.xp) }))}</small></div></div>
    <p class="muted small">${esc(TN(got, '{n} palier obtenu sur {t}', '{n} paliers obtenus sur {t}', { t: all }))}</p>
    ${PRG_CATS().map(([c, h]) => { const xs = L.bs.filter(x => x.b.cat === c); return xs.length ? `<div class="da-rule"><span>${esc(h)}</span></div><div class="prg-grid">${xs.map(tile).join('')}</div>` : ''; }).join('')}
    <details class="prg-how"><summary>${esc(T('Comment gagner de l\'XP ?'))}</summary><p class="muted small">${esc(T('Tout compte : ajouter et scanner des cartes, compléter des extensions, construire des decks, préparer tes échanges, jouer au compteur de lore et à la carte mystère, revenir chaque jour. Chaque palier de trophée rapporte beaucoup d\'XP. Rien n\'est classé ni montré à d\'autres.'))}</p></details>` });
  el.addEventListener('click', e => { const b = e.target.closest('.prg-b'); if (!b) return; const on = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', on); b.classList.toggle('open', on); });
  if (focus) setTimeout(() => { const b = el.querySelector(`.prg-b[data-b="${focus}"]`); if (!b) return; b.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); b.classList.add('hl'); }, 380);
  return el;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PRG_BADGES, prgMetrics, prgBadges, prgTier, prgLevel, prgXpFor, prgXp, prgDiff, prgBestStreak, prgLabel, prgName };
