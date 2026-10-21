// Bouton Retour du téléphone et surcouches (ui.js : une seule entrée d'historique pour la pile) : fermer une fiche pour en ouvrir une autre
// (⋯ › Importer, Nouveau deck › éditeur) puis Retour ou Échap ne quitte jamais l'appli ; Retour ferme la surcouche du dessus, une à la fois ;
// fermer par l'appli ne laisse pas d'entrée en trop (Retour suivant : la page d'avant, comme une appli).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { serve } from '../serve.mjs';

const PORT = 18915, URL0 = `http://127.0.0.1:${PORT}/`;
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto('about:blank'); await page.goto(URL0 + '?open=coll');
  await page.waitForFunction(() => CARDS.ready);
  const ovs = () => page.evaluate(() => UI.stack.length);
  const settle = () => page.waitForTimeout(350);
  const onApp = async () => page.url().startsWith(URL0);

  // ⋯ › Importer (la fiche se ferme et une autre s'ouvre), puis Retour
  await page.waitForSelector('.coll-actions [data-more]'); await page.click('.coll-actions [data-more]'); await settle();
  await page.click('.sheet [data-a="import"]'); await settle();
  ok(await ovs() === 1 && await page.isVisible('.sheet [data-text]'), 'fiche Importer ouverte à la place du menu');
  await page.goBack(); await settle();
  ok(await onApp() && await ovs() === 0, 'Retour ferme la fiche, l\'appli reste ouverte');

  // Même chose, fermée par Échap, puis une nouvelle fiche et Retour
  await page.click('.coll-actions [data-more]'); await settle(); await page.click('.sheet [data-a="import"]'); await settle();
  await page.keyboard.press('Escape'); await settle();
  await page.click('.coll-actions [data-more]'); await settle();
  await page.goBack(); await settle();
  ok(await onApp() && await ovs() === 0, 'Échap puis nouvelle fiche puis Retour : toujours dans l\'appli');

  // Deux surcouches empilées : Retour ferme celle du dessus seulement
  await page.evaluate(() => { openScreen({ title: 'A', html: '<p>a</p>' }); openSheet({ title: 'B', html: '<p>b</p>' }); }); await settle();
  await page.goBack(); await settle();
  ok(await onApp() && await ovs() === 1, 'Retour ferme la surcouche du dessus seulement');
  await page.goBack(); await settle();
  ok(await onApp() && await ovs() === 0, 'second Retour : la suivante');

  // Decks : Nouveau deck › éditeur, Échap, puis Retour
  await page.click('#nav [data-view="decks"]'); await settle();
  const nd = page.locator('#v-decks button', { hasText: 'Nouveau deck' }).first();
  await nd.click(); await settle();
  const save = page.locator('.sheet button.btn-primary').last();
  if (await save.count()) { await save.click(); await settle(); }
  ok(await ovs() >= 1, 'éditeur du deck ouvert');
  await page.keyboard.press('Escape'); await settle();
  ok(await onApp(), 'Échap dans l\'éditeur : toujours dans l\'appli');
  await page.evaluate(() => openSheet({ title: 'C', html: '<p>c</p>' })); await settle();
  await page.goBack(); await settle();
  ok(await onApp() && await ovs() === 0, 'nouvelle fiche puis Retour : fermée, appli ouverte');

  // Aucune entrée en trop : le Retour suivant revient à la page d'avant l'appli
  await page.goBack(); await settle();
  ok(page.url() === 'about:blank', 'Retour sans surcouche : la page d\'avant (pas d\'entrée fantôme)');
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
