// Jeux (Node, node:test) : logique du compteur de lore (src/lore.js) et de la carte mystère (src/mystery.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');
Object.assign(globalThis, { T: core.T, TN: core.TN, LOC: core.LOC, seedPick: core.seedPick, I18N: core.I18N });      // dans la page, ces fonctions sont globales
const L = require('../src/lore.js'), M = require('../src/mystery.js');

test('lore : +1, −1, bornes, annuler', () => {
  let s = L.loreNew();
  assert.equal(s.players.length, 2); assert.equal(s.goal, 20);
  s = L.loreAct(s, 0, 1); s = L.loreAct(s, 0, 1); s = L.loreAct(s, 1, 5);
  assert.deepEqual(s.players.map(p => p.lore), [2, 5]);
  assert.equal(L.loreAct(L.loreNew(), 0, -1).players[0].lore, 0, 'jamais sous 0');
  assert.equal(L.loreAct(L.loreNew(), 0, -1).log.length, 0, 'action sans effet : rien au journal');
  s = L.loreUndo(s); assert.deepEqual(s.players.map(p => p.lore), [2, 0]);
  s = L.loreUndo(L.loreUndo(s)); assert.deepEqual(s.players.map(p => p.lore), [0, 0]);
  assert.equal(L.loreUndo(s), s, 'rien à annuler');
});
test('lore : victoire, objectif, revanche', () => {
  let s = L.loreNew(2, 7);
  s = L.loreAct(s, 1, 5); assert.equal(s.winner, -1);
  s = L.loreAct(s, 1, 5); assert.equal(s.winner, 1); assert.equal(s.players[1].lore, 10, '±5 peut dépasser l\'objectif');
  assert.equal(L.loreAct(s, 0, 1), s, 'plus rien après la victoire');
  s = L.loreUndo(s); assert.equal(s.winner, -1, 'annuler retire la victoire');
  const r = L.loreNew(2, s.goal, { ...s, players: s.players.map((p, i) => ({ ...p, name: 'P' + i, ink: i })) });
  assert.deepEqual(r.players.map(p => [p.name, p.ink, p.lore]), [['P0', 0, 0], ['P1', 1, 0]], 'revanche : noms et encres gardés');
  assert.equal(L.loreNew(2, 500).goal, 99); assert.equal(L.loreNew(2, 0).goal, 20);
  assert.equal(L.loreNew(9).players.length, 4); assert.equal(L.loreNew(1).players.length, 2);
});
test('lore : tours et joueur actif, annulables', () => {
  let s = L.loreNew(3);
  s = L.loreNext(s); assert.deepEqual([s.cur, s.turn], [1, 1]);
  s = L.loreNext(L.loreNext(s)); assert.deepEqual([s.cur, s.turn], [0, 2]);
  s = L.loreUndo(s); assert.deepEqual([s.cur, s.turn], [2, 1]);
});

const cards = [
  ...Array.from({ length: 50 }, (_, i) => ({ id: i + 1, img: 'abc' + i, rar: i % 7, name: 'Carte ' + i, ver: '' })),
  { id: 100, img: 'r:en/quest1/x.jpg', rar: 0, name: 'Quête' }, { id: 101, img: '', rar: 1, name: 'Sans image' }, { id: 102, img: 'abc', rar: 8, name: 'Promo' },
];
test('mystère : même carte pour un jour, jamais promo ni sans image Lorcast', () => {
  assert.equal(M.mysPool(cards).length, 50);
  const a = M.mysCard(cards, '2026-10-21'), b = M.mysCard(cards.slice(), '2026-10-21');
  assert.equal(a.id, b.id);
  const seen = new Set();
  for (let d = 1; d <= 60; d++) { const c = M.mysCard(cards, `2026-11-${String(d).padStart(2, '0')}`); assert.ok(c.id <= 50); seen.add(c.id); }
  assert.ok(seen.size > 20, 'les jours varient : ' + seen.size);
  assert.equal(M.mysCard([], '2026-10-21'), null);
});
test('mystère : essais, étapes, score', () => {
  let st = M.mysNew('2026-10-21');
  assert.equal(M.mysStep(st), 0);
  st = M.mysGuess(st, 3, false); st = M.mysGuess(st, 4, false);
  assert.equal(M.mysStep(st), 2); assert.equal(st.done, false);
  st = M.mysGuess(st, 9, true);
  assert.deepEqual([st.done, st.won, st.tries.length, M.mysStep(st), M.mysScore(st)], [true, true, 3, 6, 4]);
  assert.equal(M.mysGuess(st, 10, false), st, 'partie finie');
  let lost = M.mysNew('2026-10-21'); for (let i = 0; i < 6; i++) lost = M.mysGuess(lost, i, false);
  assert.deepEqual([lost.done, lost.won, M.mysScore(lost), M.mysStep(lost)], [true, false, 0, 6]);
  assert.equal(M.mysScore(M.mysGuess(M.mysNew('x'), 1, true)), 6, 'du premier coup : 6');
  assert.match(M.mysShare(st, 'https://x'), /3\/6\n🟪🟪🟩⬛⬛⬛\nhttps:\/\/x$/);
  assert.match(M.mysShare(lost), /X\/6\n🟪{6}$/u);
});
test('mystère : série de jours, minuit à Paris', () => {
  const days = { '2026-10-19': [1, 2], '2026-10-20': [1, 4], '2026-10-18': [0, 6], '2026-10-17': [1, 1] };
  assert.equal(M.mysStreak(days, '2026-10-21'), 2, 'aujourd\'hui pas encore joué : série jusqu\'à hier');
  assert.equal(M.mysStreak({ ...days, '2026-10-21': [1, 3] }, '2026-10-21'), 3);
  assert.equal(M.mysStreak({ ...days, '2026-10-21': [0, 6] }, '2026-10-21'), 0);
  assert.equal(M.dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(M.mysUntilMidnight(new Date('2026-10-21T21:59:00Z')), 60, '23:59 à Paris (heure d\'été)');
  assert.equal(M.mysUntilMidnight(new Date('2026-12-21T22:59:30Z')), 30, '23:59:30 à Paris (heure d\'hiver)');
});

test('carte mystère : une extension qui sort aujourd\'hui ne change pas la carte du jour', () => {
  const base = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, img: 'x' + i, rar: 0, name: 'C' + i, ver: '', pset: 'A' }));
  const fresh = Array.from({ length: 30 }, (_, i) => ({ id: 1000 + i, img: 'y' + i, rar: 0, name: 'N' + i, ver: '', pset: 'B' }));
  const date = c => ({ A: '2026-01-01', B: '2026-10-21' })[c.pset];
  const day = '2026-10-21';
  assert.equal(M.mysCard([...fresh, ...base], day, date).id, M.mysCard(base, day, date).id);
  assert.ok(M.mysCard([...fresh, ...base], '2026-10-22', date), 'le lendemain, la nouvelle extension entre dans le tirage');
});
