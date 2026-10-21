// Compte et synchro (src/cloud.js) avec les émulateurs Firebase (Auth + Firestore, vraies règles) et deux « appareils » (deux contextes Chrome) :
// création du compte par e-mail sur A (ses cartes partent dans le compte), connexion sur B qui avait déjà des cartes (fusion, rien de perdu),
// changements de B reçus par A en direct (ajout, retrait, deck), mauvais mot de passe, déconnexion (les cartes restent sur l'appareil).
// Lancer : firebase emulators:exec --only auth,firestore --project ink-orbit "node tests/sync-e2e.mjs" (sans émulateur : ignoré). SDK Firebase lu sur gstatic (réseau).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { serve } from '../serve.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.log('ignoré : pas d\'émulateurs Firebase'); process.exit(0); }
const PORT = 18930, URL0 = `http://127.0.0.1:${PORT}/`, MAIL = `t${Date.now()}@exemple.test`, PASS = 'motdepasse-test';
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
async function device(coll) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com)/, r => r.abort());
  await ctx.addInitScript(c => { if (!localStorage.getItem('inkorbit:emu')) { localStorage.setItem('inkorbit:emu', JSON.stringify('127.0.0.1')); localStorage.setItem('inkorbit:coll', JSON.stringify(c)); } }, coll);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0); await page.waitForFunction(() => CARDS.ready);
  return page;
}
const signIn = async (page, mode) => {
  await page.click('#btnSettings'); await page.click('[data-act="signin"]');
  if (mode === 'new') await page.click('.signin-sheet [data-mode="new"]');
  await page.fill('#siMail', MAIL); await page.fill('#siPass', PASS); await page.click('.signin-sheet [data-go]');
};
const synced = page => page.waitForFunction(() => CLOUD.user && CLOUD.state === 'ok' && !syncMeta().dirty, null, { timeout: 20000 });
try {
  const A = await device({ 42: 2, '1*': 1 });
  await signIn(A, 'new'); await synced(A);
  ok(await A.evaluate(() => !!CLOUD.user.email), 'A : compte créé par e-mail, connecté');
  ok(/Synchronisé/.test(await A.textContent('.acct-host')), 'A : Réglages › « Synchronisé »');

  const B = await device({ 700: 1, 42: 1 });
  await B.click('#btnSettings'); await B.click('[data-act="signin"]');
  await B.fill('#siMail', MAIL); await B.fill('#siPass', 'faux-mot-de-passe'); await B.click('.signin-sheet [data-go]');
  await B.waitForFunction(() => /incorrect/.test(document.querySelector('.signin-sheet [data-err]').textContent));
  ok(true, 'B : mauvais mot de passe → message clair');
  await B.fill('#siPass', PASS); await B.click('.signin-sheet [data-go]'); await synced(B);
  ok(await B.evaluate(() => JSON.stringify(COLL.map)) === JSON.stringify({ 42: 2, '1*': 1, 700: 1 }), 'B : fusion (quantité la plus haute, rien de perdu)');
  await A.waitForFunction(() => COLL.map[700] === 1, null, { timeout: 15000 });
  ok(true, 'A : reçoit les cartes de B en direct');

  await B.evaluate(() => { collAdd(COLL.map, '700', -1); collSave(); });
  await A.waitForFunction(() => !('700' in COLL.map), null, { timeout: 15000 });
  ok(true, 'A : un retrait sur B arrive aussi');
  await B.evaluate(() => { save('decks', [{ id: 'dk1', name: 'Ambre-Améthyste', cards: { 42: 4 }, at: Date.now() }]); });
  await A.waitForFunction(() => load('decks', []).some(d => d.id === 'dk1'), null, { timeout: 15000 });
  ok(true, 'A : deck créé sur B reçu');

  await B.keyboard.press('Escape');
  await B.evaluate(() => signOut());
  ok(await B.evaluate(() => !CLOUD.user && COLL.map[42] === 2), 'B : déconnecté, ses cartes restent sur l\'appareil');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
