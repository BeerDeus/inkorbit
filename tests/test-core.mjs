// Logique pure de src/core.js : collection, imports CSV et decklists, règles des decks, échange (texte compact, correspondances), ligne du bas du scan, jour à Paris.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../src/core.js');

const card = (id, set, num, name, ver, o = {}) => ({ id, set, num: String(num), name, ver, nameEn: o.en || name, verEn: o.ven ?? ver, ink: o.ink ?? 1, rar: o.rar ?? 0, max: o.max || 0, foil: 3, ...o });
const CARDS = [card(1, '1', 1, 'Ariel', 'Sur des jambes humaines', { en: 'Ariel', ven: 'On Human Legs' }), card(42, '1', 42, 'Elsa', 'Esprit de l\'hiver', { en: 'Elsa', ven: 'Spirit of Winter', ink: 2 }),
  card(207, '1', 207, 'Elsa', 'Esprit de l\'hiver', { en: 'Elsa', ven: 'Spirit of Winter', ink: 2, rar: 6 }), card(436, '3', '4a', 'Dalmatien', 'Puppy', { ink: 1, max: 99 }),
  card(700, 'P3', 57, 'Stitch', 'Promo', { ink: 8 }), card(9, '2', 9, 'Maléfique', 'Sorcière', { ink: 16 })];
const byId = new Map(CARDS.map(c => [c.id, c]));
const ix = C.cardIndex(CARDS, CARDS.map(c => [c, c.nameEn, c.verEn]));

test('collection : clés, ajout, retrait, totaux, valeur', () => {
  assert.deepEqual(C.collParse('42*@fr'), { id: 42, foil: true, lang: 'fr' });
  assert.equal(C.collParse('abc'), null);
  const m = {};
  C.collAdd(m, C.collKey(42), 3); C.collAdd(m, C.collKey(42, true), 1); C.collAdd(m, C.collKey(1, false, 'de'), 2);
  assert.equal(C.collAdd(m, C.collKey(1, false, 'de'), -5), 0); assert.ok(!('1@de' in m));
  assert.deepEqual(C.collById(m).get(42), { n: 4, foil: 1 });
  const prices = { 42: [260, 5345, 473, 6698] };
  assert.equal(C.collValue(m, prices, 'EUR'), 3 * 260 + 5345);
  assert.equal(C.priceFor({ 7: [0, 900, 0, 0] }, 7, false, 'EUR'), 900, 'carte seulement en foil : prix foil');
});

test('import CSV Dreamborn et en-têtes libres', () => {
  const r = C.parseCsv('Set Number,Card Number,Variant,Count,Name\n001,42,foil,2,Elsa\n3,4a,normal,1,\n,57/P3,normal,1,\n1,999,normal,1,Inconnue\n', ix);
  assert.deepEqual(r.lines.map(l => [l.card.id, l.foil, l.qty]), [[42, true, 2], [436, false, 1], [700, false, 1]]);
  assert.equal(r.bad.length, 1);
  const t = C.parseCsv('Nom;Quantité;Langue\nElsa - Spirit of Winter;3;French\n', ix);
  assert.equal(t.lines[0].card.id, 42, 'nom anglais : impression de base, pas l\'Enchantée'); assert.equal(t.lines[0].lang, 'fr');
  const back = C.parseCsv(C.collToCsv({ '42*': 2, '436@de': 1 }, byId), ix);
  assert.deepEqual(back.lines.map(l => [l.card.id, l.foil, l.qty, l.lang]), [[42, true, 2, ''], [436, false, 1, 'de']]);
});

test('decklists : formats, noms français ou anglais, lignes inconnues', () => {
  const d = C.parseDeck('4 Elsa - Spirit of Winter\n2x Ariel - Sur des jambes humaines\nMaléfique - Sorcière x3\n// commentaire\nPersonnages:\n1 Personne - Inconnue', ix);
  assert.deepEqual([...d.cards].map(([c, n]) => [c.id, n]), [[42, 4], [1, 2], [9, 3]]);
  assert.deepEqual(d.bad, ['1 Personne - Inconnue']);
  assert.match(C.deckToText({ 42: 4 }, byId), /^4 Elsa - Spirit of Winter$/);
});

test('règles des decks : 60 cartes, 2 encres, 4 exemplaires par nom complet', () => {
  let r = C.deckCheck({ 42: 3, 207: 2, 436: 55 }, byId);
  assert.equal(r.total, 60); assert.deepEqual(r.over, ['Elsa - Esprit de l\'hiver'], 'normale + Enchantée = même nom complet');
  r = C.deckCheck({ 436: 48, 1: 4, 42: 4, 9: 4 }, byId);
  assert.ok(r.problems.some(p => /encres : 2 au plus/.test(p))); assert.deepEqual(r.over, [], 'exception imprimée : 99 exemplaires');
  r = C.deckCheck({ 1: 4, 42: 4, 436: 52 }, byId);
  assert.ok(r.ok, r.problems.join());
  assert.deepEqual(C.deckMissing({ 42: 4, 1: 1 }, { 42: 1, '42*': 1, 1: 3 }), [{ id: 42, need: 2 }]);
});

test('échange : listes, texte compact, correspondances, base64url', () => {
  const m = { 42: 5, '42*': 1, 1: 2, 9: 6 };
  const L = C.tradeLists(m, 4, { 9: 1 }, { 1: 3, 700: 1 });
  assert.deepEqual(L.have, [{ id: 42, n: 2, foil: 1 }]);
  assert.deepEqual(L.want, [{ id: 1, n: 1 }, { id: 700, n: 1 }]);
  const s = C.tradePack({ name: 'Mar|tin', cur: 'USD', ...L });
  assert.equal(s, 'v1|Mar tin|USD|42.2*|1,700');
  assert.deepEqual(C.tradeUnpack(s), { name: 'Mar tin', cur: 'USD', have: [{ id: 42, n: 2, foil: 1 }], want: [{ id: 1, n: 1, foil: 0 }, { id: 700, n: 1, foil: 0 }] });
  assert.equal(C.tradeUnpack('v2|x'), null);
  const mt = C.tradeMatch({ have: [{ id: 700, n: 3 }], want: [{ id: 42, n: 1 }] }, { have: [{ id: 42, n: 1 }], want: [{ id: 700, n: 1 }] });
  assert.deepEqual(mt, { forMe: [{ id: 42, n: 1 }], forThem: [{ id: 700, n: 1 }] });
  const b = new Uint8Array([0, 250, 251, 255, 62, 63]);
  assert.deepEqual([...C.unb64u(C.b64u(b))], [...b]); assert.ok(!/[+/=]/.test(C.b64u(b)));
});

test('scan : ligne du bas lue par l\'OCR', () => {
  assert.deepEqual(C.parseFootLine('Illus. X 123/204 • FR • 7'), { num: '123', of: '204', lang: 'fr', set: '7' });
  assert.deepEqual(C.parseFootLine('l23/2O4 . EN - 11'), { num: '123', of: '204', lang: 'en', set: '11' });
  assert.deepEqual(C.parseFootLine('4a/204 • DE • 3'), { num: '4a', of: '204', lang: 'de', set: '3' });
  assert.deepEqual(C.parseFootLine('18/P1 · IT · 2'), { num: '18', of: 'P1', lang: 'it', set: '2' });
  assert.equal(C.parseFootLine('Disney Lorcana © Disney'), null);
});

test('noms, ressemblance, jour à Paris, tirage reproductible', () => {
  assert.equal(C.normName('Stitch – Rock Star!'), 'stitch rock star');
  assert.equal(C.normName('Maléfique, l\'Œil'), 'malefique loeil');
  assert.ok(C.nameSim('ariel on human legs', 'arlel on human lcgs') > .85);
  assert.equal(C.dayKey(new Date('2026-10-21T22:30:00Z')), '2026-10-22', 'minuit passé à Paris');
  assert.equal(C.seedPick('io-2026-10-21', 3556), C.seedPick('io-2026-10-21', 3556));
  assert.notEqual(C.seedPick('io-2026-10-21', 3556), C.seedPick('io-2026-10-22', 3556));
});

test('synchro : fusion de deux appareils sans perdre de carte', () => {
  const a = { coll: { 42: 2, '1*': 1 }, wants: { 9: 1 }, hold: { 42: 1 }, decks: [{ id: 'd1', at: 5, name: 'A' }, { id: 'd2', at: 1, name: 'vieux' }], prefs: { cur: 'USD' } };
  const b = { coll: { 42: 3, 700: 1 }, wants: { 9: 2 }, hold: { 1: 1 }, decks: [{ id: 'd2', at: 9, name: 'récent' }, { id: 'd3', at: 2, name: 'B' }], prefs: { cur: 'EUR', keep: 2 } };
  const m = C.mergeDocs(a, b);
  assert.deepEqual(m.coll, { 42: 3, '1*': 1, 700: 1 });
  assert.deepEqual(m.wants, { 9: 2 }); assert.deepEqual(m.hold, { 42: 1, 1: 1 });
  assert.deepEqual(m.decks.map(d => d.name).sort(), ['A', 'B', 'récent']);
  assert.deepEqual(m.prefs, { cur: 'USD', keep: 2 }, 'réglages de l\'appareil d\'abord');
  assert.ok(!C.hasData({ coll: {}, decks: [], wants: {} })); assert.ok(C.hasData({ coll: { 1: 1 } }));
});
