// Decks de la communauté (src/pubdecks.js) avec les émulateurs Firebase (Auth + Firestore, vraies règles) et plusieurs comptes (contextes Chrome) :
// A publie un deck valide depuis son éditeur (puis 9 autres : le 11e est refusé), B le voit dans « À monter », l'ouvre et le copie dans ses decks,
// B le signale par l'interface, C et D aussi : au 3e signalement, il disparaît de la liste ; A retire un autre deck : il n'est plus proposé.
// Lancer : firebase emulators:exec --only auth,firestore --project ink-orbit "node tests/pubdecks-e2e.mjs" (sans émulateur : ignoré). SDK Firebase lu sur gstatic.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { serve } from '../serve.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.log('ignoré : pas d\'émulateurs Firebase'); process.exit(0); }
const PORT = 18990, URL0 = `http://127.0.0.1:${PORT}/`, T0 = Date.now(), PASS = 'motdepasse-test';
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
async function device() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com)/, r => r.abort());
  await ctx.addInitScript(() => { if (!localStorage.getItem('inkorbit:emu')) localStorage.setItem('inkorbit:emu', JSON.stringify('127.0.0.1')); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0); await page.waitForFunction(() => CARDS.ready);
  return page;
}
const closeAll = page => page.evaluate(() => { while (UI.stack.length) closeTop(); });
async function signUp(page, who) {
  await closeAll(page);
  await page.click('#btnSettings'); await page.click('[data-act="signin"]'); await page.click('.signin-sheet [data-mode="new"]');
  await page.fill('#siMail', `${who}${T0}@exemple.test`); await page.fill('#siPass', PASS); await page.click('.signin-sheet [data-go]');
  await page.waitForFunction(() => CLOUD.user && CLOUD.state === 'ok', null, { timeout: 20000 });
  await closeAll(page);
}
/** Deck valide (format Core) : 15 cartes Ambre différentes × 4. */
const makeDeck = (page, name) => page.evaluate(nm => {
  const pick = [], seen = new Set();
  for (const c of CARDS.list) { const k = c.name + '|' + c.ver; if (c.core && c.ink === 1 && c.rar < 5 && !seen.has(k)) { seen.add(k); pick.push(c); if (pick.length === 15) break; } }
  return dkCreate(nm, Object.fromEntries(pick.map(c => [c.id, 4]))).id;
}, name);
const openBuild = async page => {
  await closeAll(page);
  await page.click('#nav [data-view="decks"]'); await page.click('[data-dk-tab="build"]');
  await page.evaluate(() => { PUB.docs = []; PUB.last = null; PUB.end = false; return pubMore(); });
};
try {
  const A = await device();
  await signUp(A, 'a');
  const id1 = await makeDeck(A, 'Ambre tempo');
  await A.evaluate(i => dkOpen(i), id1);
  await A.click('.dk-screen [data-pub-publish]');
  await A.fill('#pubName', 'Ambre tempo'); await A.fill('#pubDesc', 'Des petits personnages, vite.');
  await A.click('.pub-sheet [data-go]');
  await A.waitForFunction(i => !!dkFind(i).pub, id1, { timeout: 15000 });
  const pubId = await A.evaluate(i => dkFind(i).pub, id1);
  ok(/^.{1,10}_/.test(pubId), 'A : deck publié depuis l\'éditeur (' + pubId + ')');
  ok(await A.isVisible('.dk-screen [data-pub-remove]'), 'A : l\'éditeur propose maintenant « Mettre à jour » et « Retirer »');
  await A.evaluate(async () => { for (let i = 2; i <= 10; i++) { const id = dkCreate('Deck ' + i, { ...dkFind(dkList()[dkList().length - 1].id).cards }).id; await pubPublish(dkFind(id), { name: 'Deck ' + i, author: 'Alice' }); } });
  const lim = await A.evaluate(async () => { const id = dkCreate('Deck 11', { ...dkList()[0].cards }).id; try { await pubPublish(dkFind(id), { name: 'Deck 11', author: 'Alice' }); return 'publié'; } catch (e) { return e.code; } });
  ok(lim === 'limit', 'A : 11e deck refusé (10 au plus)');
  const bad = await A.evaluate(async () => { try { await pubPublish(dkList()[0], { name: 'putain de deck', author: 'Alice' }); return 'publié'; } catch (e) { return e.code; } });
  ok(bad === 'words', 'A : nom grossier refusé');

  const B = await device();
  await signUp(B, 'b');
  await openBuild(B);
  await B.waitForSelector('[data-pub] .pub-card');
  ok(await B.locator('[data-pub] .pub-card').count() === 10, 'B : les 10 decks de A dans « À monter »');
  await B.click(`[data-pub-open="${pubId}"]`);
  await B.waitForSelector('.pub-detail [data-pa="copy"]');
  ok(/Des petits personnages/.test(await B.textContent('.pub-detail')), 'B : détail avec la description');
  await B.click('.pub-detail [data-pa="copy"]');
  await B.waitForFunction(() => dkList().some(d => d.name === 'Ambre tempo' && Object.keys(d.cards).length === 15));
  ok(true, 'B : deck copié dans ses decks (éditeur ouvert)');
  await closeAll(B);
  await openBuild(B);
  await B.click(`[data-pub-open="${pubId}"]`); await B.click('.pub-detail [data-pa="report"]'); await B.click('[data-why="spam"]');
  await B.waitForFunction(i => PUB.mine.has(i), pubId);
  ok(!(await B.evaluate(i => pubList().some(x => x.id === i), pubId)), 'B : deck signalé (masqué pour B)');
  const again = await B.evaluate(async i => { try { await pubReport(i, 'spam'); return 'ok'; } catch (e) { return 'refusé'; } }, pubId);
  ok(again === 'refusé', 'B : un second signalement est refusé');

  for (const who of ['c', 'd']) { const P = await device(); await signUp(P, who); await P.evaluate(i => pubReport(i, 'words'), pubId); await P.context().close(); }
  await openBuild(A);
  await A.waitForSelector('[data-pub] .pub-card');
  ok(!(await A.evaluate(i => pubList().some(x => x.id === i), pubId)) && await A.evaluate(() => pubList().length) === 9, 'A : 3 signalements → le deck disparaît de la liste (9 restants)');

  const id2 = await A.evaluate(() => dkList().find(d => d.name === 'Deck 2').id);
  await closeAll(A);
  await A.evaluate(i => dkOpen(i), id2);
  await A.click('.dk-screen [data-pub-remove]'); await A.click('.ask-sheet [data-yes]');
  await A.waitForFunction(i => !dkFind(i).pub, id2);
  await openBuild(B);
  await B.waitForSelector('[data-pub] .pub-card');
  ok(!(await B.evaluate(() => pubList().some(x => x.name === 'Deck 2'))), 'A retire « Deck 2 » : plus proposé chez B');

  const C = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await C.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com)/, r => r.abort());
  await C.addInitScript(() => localStorage.setItem('inkorbit:emu', JSON.stringify('127.0.0.1')));
  const anon = await C.newPage(); await anon.goto(URL0); await anon.waitForFunction(() => CARDS.ready);
  await openBuild(anon);
  await anon.waitForSelector('[data-pub] .pub-card');
  ok(await anon.evaluate(() => !CLOUD.user && pubList().length >= 7), 'sans compte : la liste se lit quand même');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
