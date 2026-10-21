// Compte et synchro (src/cloud.js) avec les émulateurs Firebase (Auth + Firestore, vraies règles) et trois « appareils » (contextes Chrome) :
// création du compte par e-mail sur A (ses cartes partent dans le compte), connexion sur B qui avait déjà des cartes (fusion, rien de perdu),
// changements de B reçus par A en direct (ajout, retrait, deck), mauvais mot de passe ; C dont l'horloge avance d'une heure (les changements
// passent dans les deux sens) ; changement de compte sur B (« Non » : cartes mises de côté puis récupérées ; « Ajouter » : fusion) ; déconnexion
// en gardant ou en effaçant les cartes ; suppression du compte (mot de passe redemandé, document effacé, les autres appareils déconnectés sans le recréer).
// Lancer : firebase emulators:exec --only auth,firestore --project ink-orbit "node tests/sync-e2e.mjs" (sans émulateur : ignoré). SDK Firebase lu sur gstatic (réseau).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { serve } from '../serve.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.log('ignoré : pas d\'émulateurs Firebase'); process.exit(0); }
const PORT = 18930, URL0 = `http://127.0.0.1:${PORT}/`, T0 = Date.now(), MAIL = `t${T0}@exemple.test`, MAIL2 = `u${T0}@exemple.test`, PASS = 'motdepasse-test';
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
async function device(coll, skew = 0) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com)/, r => r.abort());
  await ctx.addInitScript(([c, k]) => {
    if (k) { const now = Date.now.bind(Date); Date.now = () => now() + k; }      // horloge de l'appareil décalée (Date.now seulement : l'émulateur garde la vraie heure)
    if (!localStorage.getItem('inkorbit:emu')) { localStorage.setItem('inkorbit:emu', JSON.stringify('127.0.0.1')); localStorage.setItem('inkorbit:coll', JSON.stringify(c)); }
  }, [coll, skew]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0); await page.waitForFunction(() => CARDS.ready);
  return page;
}
const sheet = page => page.waitForSelector('#layer .ov:last-child .sheet');
const closeAll = page => page.evaluate(() => { while (UI.stack.length) closeTop(); });
async function signIn(page, mail, mode) {
  await closeAll(page);
  await page.click('#btnSettings'); await page.click('[data-act="signin"]');
  if (mode === 'new') await page.click('.signin-sheet [data-mode="new"]');
  await page.fill('#siMail', mail); await page.fill('#siPass', PASS); await page.click('.signin-sheet [data-go]');
}
async function signOutUi(page, choice) {
  await closeAll(page);
  await page.click('#btnSettings'); await page.click('[data-act="account"]');
  await page.click('[data-a="out"]'); await page.click(`.choice-sheet [data-c="${choice}"]`);
  await page.waitForFunction(() => !CLOUD.user);
}
const synced = page => page.waitForFunction(() => CLOUD.user && CLOUD.state === 'ok' && !syncMeta().dirty, null, { timeout: 20000 });
const coll = page => page.evaluate(() => JSON.stringify(COLL.map));
try {
  const A = await device({ 42: 2, '1*': 1 });
  await signIn(A, MAIL, 'new'); await synced(A);
  ok(await A.evaluate(() => !!CLOUD.user.email), 'A : compte créé par e-mail, connecté');
  await A.waitForFunction(() => /Synchronisé/.test(document.querySelector('.acct-host').textContent));      // Réglages encore ouverts sous la connexion
  ok(/Synchronisé/.test(await A.textContent('.acct-host')), 'A : Réglages › « Synchronisé »');
  await closeAll(A);

  const B = await device({ 700: 1, 42: 1 });
  await B.click('#btnSettings'); await B.click('[data-act="signin"]');
  await B.fill('#siMail', MAIL); await B.fill('#siPass', 'faux-mot-de-passe'); await B.click('.signin-sheet [data-go]');
  await B.waitForFunction(() => /incorrect/.test(document.querySelector('.signin-sheet [data-err]').textContent));
  ok(true, 'B : mauvais mot de passe → message clair');
  await B.fill('#siPass', PASS); await B.click('.signin-sheet [data-go]'); await synced(B);
  ok(await coll(B) === JSON.stringify({ 42: 2, '1*': 1, 700: 1 }), 'B : fusion (quantité la plus haute, rien de perdu)');
  await A.waitForFunction(() => COLL.map[700] === 1, null, { timeout: 15000 });
  ok(true, 'A : reçoit les cartes de B en direct');
  await B.evaluate(() => { collAdd(COLL.map, '700', -1); collSave(); });
  await A.waitForFunction(() => !('700' in COLL.map), null, { timeout: 15000 });
  ok(true, 'A : un retrait sur B arrive aussi');
  await B.evaluate(() => { save('decks', [{ id: 'dk1', name: 'Ambre-Améthyste', cards: { 42: 4 }, at: Date.now() }]); });
  await A.waitForFunction(() => load('decks', []).some(d => d.id === 'dk1'), null, { timeout: 15000 });
  ok(true, 'A : deck créé sur B reçu');

  // Horloge décalée : C avance d'une heure ; ses écritures portent une date « future », celles de A doivent quand même lui arriver.
  const C = await device({}, 3600e3);
  await signIn(C, MAIL); await synced(C);
  ok(await coll(C) === await coll(A), 'C (horloge +1 h) : reçoit le compte');
  await C.evaluate(() => { collAdd(COLL.map, '9', 3); collSave(); });
  await A.waitForFunction(() => COLL.map[9] === 3, null, { timeout: 15000 });
  ok(true, 'A : reçoit le changement de C (date dans le futur)');
  await A.evaluate(() => { collAdd(COLL.map, '12', 1); collSave(); });
  await C.waitForFunction(() => COLL.map[12] === 1, null, { timeout: 15000 });
  ok(true, 'C : reçoit le changement de A malgré son horloge en avance');

  // Changement de compte sur B : « Non », cartes mises de côté, puis récupérées.
  await signOutUi(B, 'keep');
  ok(await B.evaluate(() => COLL.map[42] === 2 && syncMeta().owner && !syncMeta().uid), 'B : déconnecté en gardant ses cartes (propriétaire retenu)');
  await signIn(B, MAIL2, 'new');
  await B.waitForSelector('.choice-sheet [data-c="no"]');
  ok(true, 'B : autre compte sur un appareil plein → « Ajouter les cartes de cet appareil à ce compte ? »');
  await B.click('.choice-sheet [data-c="no"]'); await synced(B);
  ok(await coll(B) === '{}' && await B.evaluate(() => !!load('aside', null)), 'B : « Non » → le nouveau compte part vide, les cartes sont mises de côté');
  await closeAll(B);
  await B.click('#btnSettings'); await B.click('[data-act="account"]'); await B.click('[data-a="aside"]'); await synced(B);
  ok(await B.evaluate(() => COLL.map[42] === 2 && !load('aside', null)), 'B : « Récupérer les cartes mises de côté » → dans le compte 2');
  await B.evaluate(() => { collAdd(COLL.map, '77', 1); collSave(); }); await synced(B);

  // Retour au compte 1 sur B : « Ajouter » → fusion, reçue par A.
  await signOutUi(B, 'keep');
  await signIn(B, MAIL);
  await B.waitForSelector('.choice-sheet [data-c="add"]'); await B.click('.choice-sheet [data-c="add"]'); await synced(B);
  await A.waitForFunction(() => COLL.map[77] === 1, null, { timeout: 15000 });
  ok(true, 'B : « Ajouter » → les cartes du compte 2 rejoignent le compte 1 (reçues par A)');

  // Déconnexion en effaçant l'appareil.
  await signOutUi(B, 'wipe');
  ok(await coll(B) === '{}' && await B.evaluate(() => load('decks', []).length === 0 && !syncMeta().owner), 'B : « Effacer de cet appareil » → cartes et decks effacés, sans propriétaire');
  await A.waitForTimeout(2500);
  ok(await A.evaluate(() => COLL.map[42] === 2), 'A : l\'effacement de B ne touche pas au compte');

  // Suppression du compte 1 depuis C : mot de passe redemandé, puis A est déconnecté sans recréer le document.
  await closeAll(C);
  await C.click('#btnSettings'); await C.click('[data-act="account"]'); await C.click('[data-a="del"]');
  await C.fill('#delPass', 'faux-mot-de-passe'); await C.click('.del-sheet [data-go]');
  await C.waitForFunction(() => /incorrect/.test(document.querySelector('.del-sheet [data-err]').textContent));
  ok(await C.evaluate(() => !!CLOUD.user), 'C : mauvais mot de passe → rien n\'est supprimé');
  await C.fill('#delPass', PASS); await C.click('.del-sheet [data-go]');
  await C.waitForFunction(() => !CLOUD.user, null, { timeout: 15000 });
  ok(await C.evaluate(() => COLL.map[42] === 2 && !syncMeta().owner), 'C : compte supprimé, cartes gardées sur l\'appareil');
  await A.waitForFunction(() => !CLOUD.user, null, { timeout: 15000 });
  ok(await A.evaluate(() => COLL.map[42] === 2), 'A : déconnecté (compte supprimé ailleurs), cartes gardées, document pas recréé');
  const again = await C.evaluate(async m => { try { await signEmail('in', m, 'motdepasse-test'); return 'connecté'; } catch (e) { return e.code; } }, MAIL);
  ok(again !== 'connecté', 'compte 1 supprimé : connexion refusée (' + again + ')');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
