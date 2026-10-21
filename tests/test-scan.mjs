// Scan (src/scan.js) : logique pure, sans navigateur ni OCR : gabarit, zones lues, ligne du bas → carte, nom lu → carte, lot, doublons, préparation des pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../src/core.js');
Object.assign(globalThis, core);      // scan.js appelle normName, nameSim… comme dans la page
const S = require('../src/scan.js');

const cards = [
  { id: 1, set: '1', num: '1', name: 'Ariel', ver: 'Sur des jambes humaines', nameEn: 'Ariel', verEn: 'On Human Legs', rar: 1 },
  { id: 2, set: '1', num: '2', name: 'Ariel', ver: 'Chanteuse ravissante', nameEn: 'Ariel', verEn: 'Spectacular Singer', rar: 4 },
  { id: 205, set: '1', num: '205', name: 'Hadès', ver: 'Roi de l\'Olympe', nameEn: 'Hades', verEn: 'King of Olympus', rar: 6 },
  { id: 9, set: '1', num: '9', name: 'Hadès', ver: 'Roi de l\'Olympe', nameEn: 'Hades', verEn: 'King of Olympus', rar: 4 },
  { id: 676, set: 'P1', num: '18', name: 'Mickey Mouse', ver: 'Visage amical', rar: 8 },
  { id: 914, set: 'Q1', num: '1', name: 'Anna', ver: 'Diplomate', rar: 8 },
  { id: 436, set: '3', num: '4a', name: 'Dalmatien', ver: 'Chiot', rar: 0 },
];
const ix = cardIndex(cards);

test('gabarit : carte centrée, proportions 63:88, dans le cadre', () => {
  for (const [w, h] of [[390, 520], [1280, 720], [300, 900]]) {
    const r = S.guideRect(w, h);
    assert.ok(Math.abs(r.w / r.h - 63 / 88) < 1e-9);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9);
    assert.ok(Math.abs(r.x * 2 + r.w - w) < 1e-9 && Math.abs(r.y * 2 + r.h - h) < 1e-9);
  }
});

test('object-fit cover : cadre → pixels de la vidéo', () => {
  // vidéo 1920 × 1080 dans un cadre 390 × 520 : hauteur ajustée (échelle 520/1080), largeur rognée des deux côtés
  const s = 520 / 1080, r = S.coverMap({ x: 0, y: 0, w: 390, h: 520 }, 390, 520, 1920, 1080);
  assert.ok(Math.abs(r.h - 1080) < 1e-6 && Math.abs(r.w - 390 / s) < 1e-6);
  assert.ok(Math.abs(r.x - (1920 - 390 / s) / 2) < 1e-6 && Math.abs(r.y) < 1e-6);
});

test('zones lues : bornées à l\'image, ligne du bas en bas à gauche', () => {
  const card = { x: 0, y: 0, w: 1468, h: 2048 }, f = S.subRect(card, S.FOOT_BOX, 1468, 2048);
  assert.ok(f.y > 0.92 * 2048 && f.y + f.h <= 2048 && f.x + f.w < 0.5 * 1468);
  const out = S.subRect({ x: -50, y: 10, w: 200, h: 300 }, { x: 0, y: 0.9, w: 1, h: 0.5 }, 100, 300);
  assert.ok(out.x === 0 && out.y + out.h <= 300 && out.w <= 100);
  assert.deepEqual(S.photoCard(1468, 2048), { x: 0, y: 0, w: 1468, h: 2048 });      // scan d'une carte : la carte entière
  assert.deepEqual(S.photoCard(488, 681), { x: 0, y: 0, w: 488, h: 681 });
  const p = S.photoCard(3000, 4000); assert.ok(p.x > 0 && Math.abs(p.w / p.h - 63 / 88) < 1e-9);      // photo : le gabarit
});

test('ligne du bas → carte (extensions, promos, quêtes, variantes, OCR approximatif)', () => {
  const hit = t => { const c = S.footCard(parseFootLine(t), ix); return c && c.id; };
  assert.equal(hit('1/204 • FR • 1'), 1);
  assert.equal(hit('205/204 . FR - 1'), 205);
  assert.equal(hit('l8/P1 • FR • 2'), 676);
  assert.equal(hit('1/31 • EN • Q1'), 914);
  assert.equal(hit('4a/204 • EN • 3'), 436);
  assert.equal(hit('2O5/2O4 FR 1'), 205);
  assert.equal(hit('999/204 • FR • 1'), null);
  assert.equal(S.footCard(null, ix), null);
});

test('nom lu → carte : version départage, impression de base d\'abord, seuil', () => {
  assert.equal(S.bestName('ARIEL\nSur des jambes humaines', cards).card.id, 1);
  assert.equal(S.bestName('ARIEL\nChanteuse ravisante', cards).card.id, 2);      // une faute d'OCR
  assert.equal(S.bestName('ARIEL\nSpectacular Singer', cards).card.id, 2);       // carte anglaise sur une appli française
  const h = S.bestName('HADES\nRoi de l\'Olympe', cards); assert.equal(h.card.id, 9); assert.ok(h.sim > 0.95);      // Enchantée (205) écartée à égalité
  assert.ok(S.bestName('zzqx vvbn', cards).sim < 0.75);
  assert.equal(S.bestName('', cards).card, null);
});

test('lot : regroupe même carte, finition, langue ; plus récente en haut', () => {
  const lot = [];
  S.lotPush(lot, { id: 1, lang: 'fr' }); S.lotPush(lot, { id: 2 }); S.lotPush(lot, { id: 1, lang: 'fr' }); S.lotPush(lot, { id: 1, foil: true, lang: 'fr' });
  assert.deepEqual(lot, [{ id: 1, foil: true, lang: 'fr', n: 1 }, { id: 1, foil: false, lang: 'fr', n: 2 }, { id: 2, foil: false, lang: '', n: 1 }]);
});

test('doublons : même carte en moins de 3 s ignorée', () => {
  assert.equal(S.isDupe(null, 1, 0), false);
  assert.equal(S.isDupe({ id: 1, t: 1000 }, 1, 3500), true);
  assert.equal(S.isDupe({ id: 1, t: 1000 }, 1, 4100), false);
  assert.equal(S.isDupe({ id: 1, t: 1000 }, 2, 1500), false);
});

test('pixels : gris, contraste étiré, texte clair sur fond sombre inversé', () => {
  const px = v => [v, v, v, 255];
  const dark = new Uint8ClampedArray([...px(10), ...px(20), ...px(30), ...px(200)]);
  assert.equal(S.prepPixels(dark), true);
  assert.equal(dark[0], 255); assert.equal(dark[12], 0);      // fond le plus sombre → blanc, texte clair → noir
  const light = new Uint8ClampedArray([...px(240), ...px(250), ...px(40)]);
  assert.equal(S.prepPixels(light), false);
  assert.equal(light[4], 255); assert.equal(light[8], 0);
});

test('ligne du bas mal lue : séparateurs, chiffres collés, impression du nom reconnu', () => {
  assert.equal(S.footCard(parseFootLine(S.footClean('205/204 « FR «1»')), ix).id, 205);
  assert.equal(S.footCard(parseFootLine(S.footClean('1/204 - FR + 1')), ix).id, 1);
  assert.deepEqual(S.footLoose('CJaDeeLe0\n205204FR-1'), { lang: 'fr', set: '1', digits: '205204' });
  assert.deepEqual(S.footLoose('V204-EN-1'), { lang: 'en', set: '1', digits: '204' });
  assert.equal(S.footLoose('rien').lang, '');
  assert.deepEqual(S.footLoose('l2I204 IT 3'), { lang: 'it', set: '3', digits: '121204' });
  const hades = cards.find(c => c.id === 9);
  assert.equal(S.namePrint(hades, S.footLoose('205204FR-1'), cards).id, 205);      // « 205204 » : la 205 (Enchantée), pas la 9
  assert.equal(S.namePrint(hades, S.footLoose('9204 FR 1'), cards).id, 9);
  assert.equal(S.namePrint(hades, { lang: '', set: '', digits: '' }, cards).id, 9);
});

test('nom lu avec des lignes en trop (illustration, classifications)', () => {
  assert.equal(S.bestName('~ ee\nARIEL\nSur des jambes humaines\nStoryborn Héros Princesse', cards).card.id, 1);
  assert.equal(S.bestName('RHINO\n', [{ id: 3, name: 'Rhino', ver: 'Orateur motivant', rar: 2 }]).sim < 0.95, true);      // nom seul : jamais une certitude
});

test('inversion imposée (nom blanc sur une illustration claire) ; barre lue V', () => {
  const px = v => [v, v, v, 255], d = new Uint8ClampedArray([...px(250), ...px(180), ...px(200)]);
  assert.equal(S.prepPixels(d, true), true); assert.equal(d[0], 0);
  assert.equal(S.footCard(parseFootLine(S.footClean('1V204.FR.7')), cardIndex([{ id: 1434, set: '7', num: '1', name: 'Rhino', ver: '' }])).id, 1434);
});
