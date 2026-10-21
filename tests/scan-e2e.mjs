// Scan dans Chrome (playwright-core) avec le vrai Tesseract (servi depuis tests/node_modules, aucun réseau pendant la lecture) sur le banc de photos
// fabriquées (tools/make-scan-fixtures.mjs : vraies images de cartes, table, rotation, décalage, flou, reflet, foil ; photos sans carte) :
// taux minimal, aucune fausse carte, aucune carte lue sur une photo sans carte ; puis le parcours du champ « Photo » : carte dans le lot,
// lot gardé après rechargement, « Ajouter » → collection. Sources d'images absentes et pas de réseau : ignoré.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { download, openBench, photos, bench } from '../tools/make-scan-fixtures.mjs';

try { await download(); } catch (e) { console.log('ignoré : images du banc indisponibles (' + e.message + ')'); process.exit(0); }
const MIN = Number(process.env.SCAN_MIN) || 0.8;
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
const { page, close } = await openBench(chromium, 18960);
try {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Échantillon : chaque source nette, tournée et floue, plus les photos sans carte (le banc complet : node tools/make-scan-fixtures.mjs --bench).
  const list = photos().filter(p => ['net', 'tourne', 'flou', 'vide'].includes(p.defect));
  const b = await bench(page, list);
  for (const r of b.rows.filter(r => !r.ok)) console.log('   ', r.got ? `${r.name} → ${r.got} ${r.gotLang}` : `${r.name} : pas lue`);
  const cards = b.rows.filter(r => r.id), rate = cards.filter(r => r.ok).length / cards.length;
  ok(rate >= MIN, `banc : ${cards.filter(r => r.ok).length}/${cards.length} cartes reconnues avec leur langue (minimum ${Math.round(MIN * 100)} %), ${Math.round(b.ms)} ms en moyenne`);
  ok(b.wrong === 0, 'aucune fausse carte');
  ok(b.rows.filter(r => !r.id).every(r => !r.got), 'photos sans carte : rien de lu');
  const auto = await bench(page, list.filter(p => !p.id), 0);
  ok(auto.rows.every(r => !r.got && !r.choices), 'mode Auto (lecture rapide) sur les photos sans carte : rien de lu');

  // Parcours : champ « Photo » → lot → rechargement → Ajouter
  const jpg = Buffer.from(await page.evaluate(async () => { const img = await window.__gen('/__fixtures/1-fr.jpg', 'net', 9); const c = new OffscreenCanvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); const u = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).arrayBuffer()); let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); }), 'base64');
  await page.evaluate(() => { localStorage.removeItem('inkorbit:scanlot'); showView('scan'); });
  await page.setInputFiles('.sc-file input', { name: 'carte.jpg', mimeType: 'image/jpeg', buffer: jpg });
  await page.waitForSelector('.sc-item', { timeout: 30000 });
  ok(await page.evaluate(() => SC.lot.length === 1 && SC.lot[0].id === 1 && SC.lot[0].lang === 'fr'), 'photo : Ariel (FR) dans le lot');
  await page.reload(); await page.waitForFunction(() => CARDS.ready);
  await page.evaluate(() => showView('scan')); await page.waitForSelector('.sc-item');
  ok(await page.evaluate(() => SC.lot.length === 1 && SC.lot[0].id === 1), 'lot gardé après rechargement');
  await page.click('.sc-add');
  ok(await page.evaluate(() => COLL.map['1@fr'] === 1 && !SC.lot.length), '« Ajouter » : la carte est dans la collection, lot vidé');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await close(); }
