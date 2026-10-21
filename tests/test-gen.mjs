// Générateurs de données (gen-cards.mjs, gen-prices.mjs) : fonctions pures sur de petites données fabriquées ici (aucun réseau).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../gen-cards.mjs';
import * as P from '../gen-prices.mjs';

const RB = 'https://api.lorcana.ravensburger.com/images/';
const lj = (over) => ({ id: 1, setCode: '1', number: 1, fullIdentifier: '1/204 • EN • 1', name: 'Ariel', version: 'On Human Legs', color: 'Amber', cost: 4, inkwell: true,
  type: 'Character', rarity: 'Uncommon', strength: 3, willpower: 4, lore: 2, foilTypes: ['None', 'Silver'], allowedInFormats: { Core: { allowed: true } },
  images: { thumbnail: RB + 'en/set1/1_abc.jpg' }, externalLinks: { cardmarketId: 101, tcgPlayerId: 201 }, ...over });
const CARDS = [
  lj({}),
  lj({ id: 2, number: 2, fullIdentifier: '2/204 • EN • 1', name: 'Rhino', color: 'Amber-Steel', colors: ['Amber', 'Steel'], type: 'Item', rarity: 'Rare', strength: undefined, willpower: undefined, lore: undefined,
    allowedInFormats: { Core: { allowed: false } }, externalLinks: { cardmarketId: 102 } }),
  lj({ id: 3, number: 4, fullIdentifier: '4a/204 • EN • 3', setCode: '3', name: 'Dalmatian Puppy', maxCopiesInDeck: 99, externalLinks: {} }),       // variante « a », sans identifiants : jointure tcgcsv par numéro
  lj({ id: 4, number: 205, fullIdentifier: '205/204 • EN • 1', name: 'Hades', rarity: 'Enchanted', foilTypes: ['Lava'], externalLinks: { cardmarketId: 104, tcgPlayerId: 204 } }),
  lj({ id: 5, number: 18, fullIdentifier: '1 TFC • EN • 18/P1', promoGrouping: 'P1', name: 'Mickey Mouse', rarity: 'Special', foilTypes: ['Satin'], externalLinks: { cardmarketId: 105 } }),
  lj({ id: 6, setCode: 'Q1', fullIdentifier: '1/31 • EN • Q1', name: 'Anna', color: '', rarity: 'Special', images: { thumbnail: RB + 'en/quest1/1_dc3.jpg' }, externalLinks: { cardmarketId: 106 } }),
];
const lc = (set, num, hex) => ({ set: { code: set }, collector_number: num, image_uris: { digital: { small: `https://cards.lorcast.io/card/digital/small/crd_${hex}.avif?1709690747` } } });

test('petites fonctions de gen-cards', () => {
  assert.equal(G.joinKey('P1', '4A'), 'p1-4a');
  assert.equal(G.printedNum(CARDS[0]), '1');
  assert.equal(G.printedNum(CARDS[2]), '4a', 'variante');
  assert.equal(G.printedNum(CARDS[3]), '205', 'Enchantée au-delà de la base');
  assert.equal(G.printedNum(CARDS[4]), '18', 'promo « 1 TFC • EN • 18/P1 »');
  assert.equal(G.printedNum({ number: 7, fullIdentifier: '' }), '7', 'sans identifiant imprimé : le numéro');
  assert.equal(G.inkMask(CARDS[0]), 1, 'Ambre');
  assert.equal(G.inkMask(CARDS[1]), 1 | 32, 'Ambre + Acier (colors)');
  assert.equal(G.inkMask({ color: 'Ruby-Sapphire' }), 8 | 16, 'encre double sans colors');
  assert.equal(G.inkMask(CARDS[5]), 0, 'sans encre');
  assert.equal(G.lcToken('https://cards.lorcast.io/card/digital/small/crd_d9f3b86a.avif?1709690747'), 'd9f3b86a?1709690747');
  assert.equal(G.lcToken('https://cards.lorcast.io/card/digital/small/crd_d9f3b86a.avif'), 'd9f3b86a');
  assert.equal(G.lcToken('https://exemple.com/x.jpg'), '');
  assert.equal(G.rbImg(CARDS[5]), 'r:en/quest1/1_dc3.jpg');
  assert.equal(G.rbImg({ images: {} }), '');
});

test('row : ligne compacte', () => {
  const r = G.row(CARDS[0], 'tok');
  assert.deepEqual(r, [1, '1', '1', 1, 4, 1, 0, 1, 3, 4, 2, 3, 'tok', 1, 0, '1']);
  const it = G.row(CARDS[1], '');
  assert.equal(it[6], G.TYPES.indexOf('Item')); assert.deepEqual(it.slice(8, 11), [-1, -1, -1], 'objet : pas de force, volonté, lore'); assert.equal(it[13], 0, 'hors format Core');
  const en = G.row(CARDS[3], '');
  assert.equal(en[11], 2, 'Enchantée : foil seulement'); assert.equal(en[7], G.RARITIES.indexOf('Enchanted'));
  assert.equal(G.row(CARDS[2], '')[14], 99, 'exemplaires max');
  const pr = G.row(CARDS[4], '');
  assert.equal(pr[1], 'P1', 'promo : son groupe'); assert.equal(pr[15], '1', 'et son extension'); assert.equal(pr[7], G.RARITIES.indexOf('Special'));
});

test('build : jointure Lorcast, image de secours, langues', () => {
  const en = { metadata: { generatedOn: '2026-10-16' }, sets: { 1: { name: 'The First Chapter', type: 'expansion', hasAllCards: true, releaseDate: '2023-08-18', cardCounts: { base: 204, total: 245 } },
    15: { name: 'Into the Inkdark', type: 'expansion', hasAllCards: false, cardCounts: { base: 0 } }, Q1: { name: 'Deep Trouble', type: 'quest', hasAllCards: true, cardCounts: { base: 31, total: 31 } } }, cards: CARDS };
  const fr = { sets: { 1: { name: 'Premier Chapitre' } }, cards: [{ ...CARDS[0], name: 'Ariel', version: 'Sur des jambes humaines' }] };
  const { cat, texts, withImg } = G.build({ en, fr }, [lc('1', '1', 'aa'), lc('3', '4a', 'bb'), lc('1', '205', 'cc'), lc('P1', '18', 'dd')]);
  assert.equal(cat.v, '2026-10-16');
  assert.deepEqual(cat.sets.map(s => s.c), ['1', 'Q1'], 'extension sans cartes écartée');
  assert.deepEqual(cat.sets[0].n, { en: 'The First Chapter', fr: 'Premier Chapitre', de: 'The First Chapter', it: 'The First Chapter' });
  assert.equal(cat.sets[0].b, 204);
  const img = Object.fromEntries(cat.cards.map(r => [r[0], r[12]]));
  assert.deepEqual(img, { 1: 'aa?1709690747', 2: 'r:en/set1/1_abc.jpg', 3: 'bb?1709690747', 4: 'cc?1709690747', 5: 'dd?1709690747', 6: 'r:en/quest1/1_dc3.jpg' });
  assert.equal(withImg, 4, 'images de secours non comptées');
  assert.deepEqual(cat.cards.map(r => r[0]), [1, 2, 3, 4, 5, 6], 'triées par id');
  assert.equal(texts.fr[0][2], 'Sur des jambes humaines', 'nom traduit');
  assert.equal(texts.fr[1][1], 'Rhino', 'absente en français : l\'anglais');
  assert.equal(texts.de.length, CARDS.length, 'langue absente : tout en anglais');
});

test('petites fonctions de gen-prices', () => {
  assert.equal(P.cents('0.05'), 5); assert.equal(P.cents(2.6), 260); assert.equal(P.cents(0), 0); assert.equal(P.cents(null), 0); assert.equal(P.cents('x'), 0); assert.equal(P.cents(-1), 0);
  assert.equal(P.tcNum('042/204'), '42'); assert.equal(P.tcNum('4A'), '4a'); assert.equal(P.tcNum(''), ''); assert.equal(P.tcNum(undefined), '');
  assert.deepEqual(P.priceOf({ trend: 2.6, 'trend-foil': 53.45 }, { Normal: 4.73, 'Cold Foil': 66.98 }, false), [260, 5345, 473, 6698]);
  assert.deepEqual(P.priceOf({ trend: 0, avg7: 1.2, 'trend-foil': 0 }, null, false), [120, 0, 0, 0], 'tendance à 0 : moyenne 7 jours ; foil sans vente : pas de prix');
  assert.deepEqual(P.priceOf({ trend: 773.87, 'trend-foil': 0 }, { Holofoil: 952.84 }, true), [0, 77387, 0, 95284], 'Enchantée : prix non foil rangé en foil, Holofoil seul');
  assert.deepEqual(P.priceOf(null, null, false), [0, 0, 0, 0]);
});

test('build : jointure par identifiants, puis par numéro', () => {
  const cmGuide = { priceGuides: [{ idProduct: 101, trend: 2.6, 'trend-foil': 53.45 }, { idProduct: 102, trend: 0, avg7: 0 }, { idProduct: 104, trend: 773.87, 'trend-foil': 0 }, { idProduct: 105, trend: 1.5 }] };
  const tcGroups = [
    { abbr: '1', prices: [{ productId: 201, subTypeName: 'Normal', marketPrice: 4.73 }, { productId: 201, subTypeName: 'Cold Foil', marketPrice: 66.98 }, { productId: 204, subTypeName: 'Holofoil', marketPrice: 952.84 }],
      products: new Map([[201, { num: '1' }], [204, { num: '205' }]]) },
    { abbr: '3', prices: [{ productId: 301, subTypeName: 'Normal', marketPrice: 0.25 }], products: new Map([[301, { num: '4a' }]]) },
  ];
  const { p, n } = P.build(CARDS, cmGuide, tcGroups);
  assert.deepEqual(p[1], [260, 5345, 473, 6698]);
  assert.equal(p[2], undefined, 'Cardmarket à 0 partout : pas de prix');
  assert.deepEqual(p[3], [0, 0, 25, 0], 'sans identifiant : tcgcsv par extension + numéro (4a)');
  assert.deepEqual(p[4], [0, 77387, 0, 95284]);
  assert.deepEqual(p[5], [0, 150, 0, 0], 'promo seulement en foil');
  assert.equal(p[6], undefined);
  assert.equal(n, 4);
});
