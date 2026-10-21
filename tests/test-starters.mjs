// Decks de démarrage (public/data/starters.json, gen-starters.mjs) : chaque deck se résout dans le catalogue, fait 60 cartes, ses cartes sont de ses
// 2 encres, 4 exemplaires au plus par nom complet ; deckRow écarte un deck incomplet ou une carte inconnue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckRow } from '../gen-starters.mjs';

const rd = f => JSON.parse(readFileSync(new URL('../public/data/' + f, import.meta.url), 'utf8'));
const st = rd('starters.json'), cat = rd('cards.json'), en = rd('cards-en.json');
const byId = new Map(cat.cards.map(r => [r[0], { ink: r[3], max: r[14] }])), names = new Map(en.cards.map(r => [r[0], `${r[1]} - ${r[2]}`]));

test('fichier : source, date, au moins 20 decks aux identifiants uniques', () => {
  assert.match(st.src, /LorcanaJSON/); assert.ok(st.v);
  assert.ok(st.decks.length >= 20, st.decks.length + ' decks');
  assert.equal(new Set(st.decks.map(d => d.id)).size, st.decks.length);
});

test('chaque deck : 60 cartes connues, 2 encres, cartes de ses encres, 4 exemplaires au plus', () => {
  for (const d of st.decks) {
    const total = Object.values(d.cards).reduce((s, n) => s + n, 0);
    assert.equal(total, 60, d.id);
    assert.equal(d.inks.length, 2, d.id + ' : 2 encres');
    assert.ok(d.name.en, d.id + ' : nom');
    const mask = d.inks.reduce((m, i) => m | (1 << i), 0), per = new Map();
    for (const [id, n] of Object.entries(d.cards)) {
      const c = byId.get(+id); assert.ok(c, `${d.id} : carte ${id} inconnue`);
      assert.equal(c.ink & ~mask, 0, `${d.id} : carte ${id} hors de ses encres`);
      const k = names.get(+id); per.set(k, (per.get(k) || 0) + n);
      assert.ok(per.get(k) <= (c.max || 4), `${d.id} : ${k} ×${per.get(k)}`);
    }
  }
});

test('deckRow : deck de démarrage gardé, deck incomplet ou carte inconnue écartés', () => {
  const ids = new Set([1, 2, 3]);
  const ok = deckRow('S1-1', { deckGroup: 'S1', name: 'A', colors: ['Amber', 'Steel'], cards: [{ id: 1, amount: 30 }, { id: 2, amount: 20 }, { id: 2, amount: 10 }] }, { fr: 'B' }, ids);
  assert.deepEqual(ok.deck, { id: 'S1-1', set: '1', name: { en: 'A', fr: 'B' }, inks: [0, 5], cards: { 1: 30, 2: 30 } });
  assert.match(deckRow('S1-2', { cards: [{ id: 1, amount: 30 }] }, {}, ids).skip, /30 cartes/);
  assert.match(deckRow('S1-3', { cards: [{ id: 9, amount: 60 }] }, {}, ids).skip, /inconnues 9/);
});
