// Decks : logique pure de core.js (parseDeck, deckCheck, deckMissing, deckToText) et de decks.js (deckCurve, deckCanAdd, deckValue, deckCover).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');
Object.assign(globalThis, core, { DECK_MIN: 60, DECK_COPIES: 4, DECK_INKS: 2 });      // decks.js lit ces fonctions et constantes comme des globales (scripts concaténés dans la page)
const dk = require('../src/decks.js');

// Petit catalogue : Elsa (Améthyste, 2 impressions : base + Enchantée), Ariel (Ambre), Stitch (Ambre-Acier), Chiot (Ambre, 99 exemplaires permis), Gaston (Rubis).
const mk = (id, name, ver, ink, cost, o = {}) => ({ core: true, id, set: '1', num: String(id), name, ver, nameEn: name, verEn: ver, ink, cost, inkwell: o.inkwell ?? true, type: o.type ?? 0, rar: o.rar ?? 0, max: o.max || 0 });
const cards = [mk(1, 'Elsa', 'Snow Queen', 2, 4), mk(2, 'Ariel', 'On Human Legs', 1, 4, { inkwell: false }), mk(3, 'Stitch', 'Rock Star', 1 | 32, 6, { type: 1 }),
  mk(4, 'Dalmatian Puppy', 'Tail Wagger', 1, 1, { max: 99 }), mk(5, 'Gaston', 'Baritone Bully', 8, 9, { type: 2 }), mk(6, 'Elsa', 'Snow Queen', 2, 4, { rar: 6 })];
const byId = new Map(cards.map(c => [c.id, c]));
const ix = core.cardIndex(cards);

test('parseDeck : formats « 4 Nom », « 4x Nom », « Nom x3 », titres et lignes inconnues', () => {
  const r = core.parseDeck('Characters:\n4 Elsa - Snow Queen\n4x Ariel - On Human Legs\nStitch - Rock Star x3\n\n// note\n2 Inconnue - Carte\n1 elsa snow queen', ix);
  const got = Object.fromEntries([...r.cards].map(([c, n]) => [c.id, n]));
  assert.deepEqual(got, { 1: 5, 2: 4, 3: 3 });      // l'impression de base d'Elsa, pas l'Enchantée ; « elsa snow queen » la rejoint
  assert.deepEqual(r.bad, ['2 Inconnue - Carte']);
  assert.deepEqual(dk.deckFromParsed(r), { 1: 5, 2: 4, 3: 3 });
});

test('deckCheck : 60 cartes, 2 encres, 4 exemplaires par nom complet (toutes impressions), exception imprimée', () => {
  let c = core.deckCheck({ 1: 4, 2: 4 }, byId);
  assert.equal(c.total, 8); assert.deepEqual(c.inks, [0, 1]); assert.equal(c.ok, false); assert.match(c.problems[0], /52/);
  c = core.deckCheck({ 1: 3, 6: 2, 4: 55 }, byId);      // 3 + 2 Elsa (deux impressions) = 5 : trop ; 55 chiots : permis
  assert.deepEqual(c.over, ['Elsa - Snow Queen']); assert.equal(c.total, 60);
  c = core.deckCheck({ 1: 4, 3: 1, 4: 55 }, byId);      // Améthyste + Ambre-Acier : 3 encres
  assert.equal(c.inks.length, 3); assert.ok(c.problems.some(p => /3 encres/.test(p)));
  assert.equal(core.deckCheck({ 2: 4, 4: 56 }, byId).ok, true);
});

test('deckMissing et deckValue contre la collection (toutes finitions)', () => {
  const map = { '1': 1, '1*': 1, '2@fr': 4 };
  assert.deepEqual(core.deckMissing({ 1: 4, 2: 4, 5: 2 }, map), [{ id: 1, need: 2 }, { id: 5, need: 2 }]);
  const prices = { 1: [100, 900, 120, 1000], 5: [0, 500, 0, 600] };      // Gaston : prix foil seulement → repli
  const v = dk.deckValue({ 1: 4, 2: 4, 5: 2 }, byId, prices, 'EUR', map);
  assert.deepEqual(v, { value: 4 * 100 + 2 * 500, missing: 4, missingValue: 2 * 100 + 2 * 500 });
  assert.equal(dk.deckValue({ 1: 1 }, byId, prices, 'USD', {}).value, 120);
  assert.equal(dk.deckCover({ 1: 4, 5: 1 }, byId, prices, 'EUR').id, 5);
  assert.equal(dk.deckCover({}, byId, prices, 'EUR'), null);
});

test('deckCanAdd : limite par nom complet, toutes impressions', () => {
  assert.equal(dk.deckCanAdd({ 1: 3 }, byId, byId.get(6)), true);
  assert.equal(dk.deckCanAdd({ 1: 3, 6: 1 }, byId, byId.get(1)), false);
  assert.equal(dk.deckCanAdd({ 4: 60 }, byId, byId.get(4)), true);
});

test('deckCurve : cases 1 à 7+, encrables, types', () => {
  const s = dk.deckCurve({ 1: 4, 2: 2, 3: 1, 4: 3, 5: 2, 999: 4 }, byId);      // 999 : carte inconnue ignorée
  assert.deepEqual(s.curve, [0, 3, 0, 0, 6, 0, 1, 2]);
  assert.equal(s.total, 12); assert.equal(s.inkable, 10); assert.deepEqual(s.types, [9, 1, 2, 0]);
});

test('deckToText : noms anglais, relu tel quel par parseDeck', () => {
  const t = core.deckToText({ 1: 4, 3: 2 }, byId);
  assert.equal(t, '4 Elsa - Snow Queen\n2 Stitch - Rock Star');
  assert.deepEqual(dk.deckFromParsed(core.parseDeck(t, ix)), { 1: 4, 3: 2 });
});
