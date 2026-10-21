// Niveau et trophées (src/progress.js) et leurs icônes (src/badgeart.js), sous Node : badges calculés sur des états fabriqués, paliers, niveau,
// aucun palier annoncé deux fois ni au premier calcul, série de la carte mystère, glyphes SVG bien formés (un par badge, 4 calques ou unique).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');
Object.assign(globalThis, core, { RAR_KEYS: ['common', 'uncommon', 'rare', 'super', 'legendary', 'epic', 'enchanted', 'iconic', 'special'], fmtMoney: c => (c / 100).toFixed(2) + ' €', fmtNum: n => String(n) });      // dans la page : globales de core.js et ui.js
const P = require('../src/progress.js');
const { badgeSvg, bdgEl, BDG_G } = require('../src/badgeart.js');

const card = (id, ink, rar) => [id, { core: true, id, ink, rar, name: 'C' + id, ver: '', max: 0 }];
const byId = new Map([card(1, 1, 0), card(2, 1, 4), card(3, 2, 6), card(4, 2, 5), card(5, 4, 7), card(6, 1 | 2, 0)]);
const base = { c: {}, coll: {}, wants: {}, hold: {}, keep: 4, byId, sets: [], decks: [], mystery: {}, value: 0, cloud: false, inst: false };
const st = o => ({ ...base, ...o });
const tierOf = (s, id) => P.prgBadges(P.prgMetrics(s)).find(x => x.b.id === id).t;

test('collection, encres, raretés : paliers d\'après les vraies données', () => {
  const s = st({ coll: { 1: 40, '1*': 5, 2: 3, 3: 1, 4: 2, 5: 1, 6: 8 }, value: 12345 });
  const m = P.prgMetrics(s);
  assert.equal(m.copies, 60); assert.equal(m.distinct, 6); assert.equal(m.foil, 5);
  assert.deepEqual(m.ink.slice(0, 3), [56, 11, 1], 'carte bicolore : comptée dans ses deux encres');
  assert.equal(tierOf(s, 'co_copies'), 0); assert.equal(tierOf(s, 'co_foil'), 0); assert.equal(tierOf(s, 'ink_amber'), 1); assert.equal(tierOf(s, 'ink_amethyst'), 0);
  assert.equal(tierOf(s, 'ra_legend'), 0); assert.equal(tierOf(s, 'ra_enchant'), 0); assert.equal(tierOf(s, 'ra_iconic'), 0); assert.equal(tierOf(s, 'co_value'), 1);
  assert.equal(tierOf(st({}), 'co_copies'), -1, 'collection vide : rien');
});

test('extensions, decks, échange, compteurs', () => {
  const decks = [{ id: 'a', cards: { 1: 4, 2: 4, 6: 52 } }, { id: 'b', cards: { 1: 2 } }];
  const s = st({ coll: { 1: 9, 2: 4, 6: 52 }, wants: { 3: 1, 5: 2 }, decks, sets: [{ base: 10, baseOwn: 5, all: 12, allOwn: 5 }, { base: 10, baseOwn: 10, all: 10, allOwn: 10 }], c: { sc: 30, lg: 12, lw: 1, sh: 1, days: 8 }, cloud: true });
  const m = P.prgMetrics(s);
  assert.equal(m.half, 2); assert.equal(m.full, 1); assert.equal(m.master, 1);
  assert.equal(m.decks, 2); assert.equal(m.valid, 0, 'carte 6 en 52 exemplaires : au-delà de 4'); assert.equal(m.built, 0);
  byId.get(6).max = 99; const m2 = P.prgMetrics(s); byId.get(6).max = 0;
  assert.equal(m2.valid, 1); assert.equal(m2.built, 1, 'deck valide et toutes ses cartes possédées');
  assert.equal(m.wish, 2); assert.equal(m.spare, 5 + 48);
  for (const [id, t] of [['sc_cards', 0], ['lo_games', 1], ['lo_wins', 0], ['tr_share', 0], ['fi_days', 0], ['ac_cloud', 0], ['fx_install', -1], ['se_master', 0]]) assert.equal(tierOf(s, id), t, id);
});

test('carte mystère : trouvées, du premier coup, plus longue série', () => {
  const days = { '2026-10-01': [1, 3], '2026-10-02': [1, 1], '2026-10-03': [1, 2], '2026-10-04': [0, 6], '2026-10-05': [1, 4], '2026-10-31': [1, 2], '2026-11-01': [1, 2] };
  const m = P.prgMetrics(st({ mystery: days }));
  assert.equal(m.found, 6); assert.equal(m.one, 1); assert.equal(m.streak, 3);
  assert.equal(P.prgBestStreak({ '2026-10-30': [1, 1], '2026-11-02': [1, 1] }), 1, 'jours non consécutifs');
});

test('nouveaux paliers : rien au premier calcul, chacun une seule fois, jamais revu à la baisse', () => {
  const bs = s => P.prgBadges(P.prgMetrics(s));
  const a = st({ coll: { 1: 60 } });
  const first = P.prgDiff(bs(a), null);
  assert.equal(first.fresh.length, 0); assert.equal(first.seen.co_copies, 0);
  const again = P.prgDiff(bs(a), first.seen); assert.equal(again.fresh.length, 0, 'même état : rien de neuf');
  const b = st({ coll: { 1: 600, 2: 1 } }), up = P.prgDiff(bs(b), again.seen);
  assert.deepEqual(up.fresh.map(x => [x.b.id, x.t]).sort(), [['co_copies', 1], ['ink_amber', 3], ['ra_legend', 0], ['tr_spare', 2]].sort());
  assert.equal(up.fresh[0].t, 3, 'le palier le plus haut d\'abord');
  const down = P.prgDiff(bs(a), up.seen); assert.equal(down.fresh.length, 0); assert.equal(down.seen.co_copies, 1, 'cartes retirées : le palier vu reste');
});

test('niveau : 1 à 999, XP croissante', () => {
  assert.deepEqual([P.prgLevel(0).lv, P.prgLevel(39).lv, P.prgLevel(40).lv], [1, 1, 2]);
  assert.equal(P.prgLevel(1e12).lv, 999); assert.equal(P.prgLevel(1e12).nxt, null);
  for (let L = 2; L < 999; L += 97) assert.ok(P.prgXpFor(L + 1) > P.prgXpFor(L));
  const lo = P.prgXp(P.prgMetrics(st({})), P.prgBadges(P.prgMetrics(st({}))));
  const s = st({ coll: { 1: 100 } }), hi = P.prgXp(P.prgMetrics(s), P.prgBadges(P.prgMetrics(s)));
  assert.equal(lo, 0); assert.ok(hi > 100);
});

test('catalogue : identifiants uniques, paliers croissants, textes', () => {
  const ids = new Set();
  for (const b of P.PRG_BADGES) {
    assert.ok(!ids.has(b.id), b.id); ids.add(b.id);
    assert.ok(b.tiers.every((x, i) => i === 0 || x > b.tiers[i - 1]), b.id + ' : paliers croissants');
    assert.ok(b.tiers.length === 1 ? !!b.one : b.names && b.names.length === 3 && (b.d || b.money), b.id + ' : noms et texte');
    assert.ok(!/illumin|disney|lorcana/i.test(b.t + (b.names || []).join()), b.id + ' : aucun nom protégé');
    assert.ok(P.prgLabel(b, b.tiers[0]).length > 2);
  }
  assert.ok(P.PRG_BADGES.length >= 30, P.PRG_BADGES.length + ' badges');
});

const balanced = svg => { const s = []; for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) { if (m[3]) continue; if (!m[1]) s.push(m[2]); else if (s.pop() !== m[2]) return false; } return !s.length; };
test('icônes : un glyphe par badge, 4 calques ou unique, SVG bien formés, différents à chaque palier', () => {
  const seen = new Map();
  for (const b of P.PRG_BADGES) {
    const g = BDG_G[b.id]; assert.ok(g, b.id + ' : glyphe manquant');
    if (b.tiers.length === 1) assert.equal(typeof g, 'string', b.id); else assert.ok(Array.isArray(g) && g.length === 4, b.id);
    const k = JSON.stringify(g); assert.ok(!seen.has(k), `${b.id} : même dessin que ${seen.get(k)}`); seen.set(k, b.id);
    let prev = '';
    for (const t of b.tiers.length === 1 ? [-1, 0] : [-1, 0, 1, 2, 3]) {
      const svg = badgeSvg(b.id, t), at = b.id + ' palier ' + t;
      assert.ok(svg.startsWith('<svg viewBox="0 0 48 48" class="bdg-svg '), at); assert.ok(balanced(svg), at + ' : balises');
      assert.doesNotMatch(svg, /NaN|undefined|Infinity|<text|<image|href=/, at);
      const gl = svg.slice(svg.indexOf('<g class="bq-gl"')); if (t > 0) assert.notEqual(gl, prev, at + ' : change de palier en palier'); prev = gl;
    }
  }
  for (const [id, g] of Object.entries(BDG_G)) for (const L of [].concat(g)) for (const s of L.split(';')) assert.match(bdgEl(s.replace(/^_/, '')), /^<(path|circle|ellipse|rect) class="bq-[a-z]( bq-u)?" [^<>]+\/>$/, `${id} : « ${s} »`);
});
