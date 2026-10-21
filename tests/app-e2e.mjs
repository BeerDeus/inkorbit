// Parcours de l'appli dans Chrome (playwright-core) : téléphone 390 × 844 puis ordinateur 1440 × 900, vrai catalogue de public/data,
// images et polices coupées (aucun réseau extérieur). Accueil, ajout d'une carte, collection, carte en grand, extension, échange (lien ?p= relu),
// decks (import d'une liste), compteur de lore, carte mystère, réglages (thème), mise en page ordinateur, aucune erreur dans la console.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { serve } from '../serve.mjs';

const PORT = 18910, URL0 = `http://127.0.0.1:${PORT}/`;
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|fetching the script/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => CARDS.ready, null, { timeout: 20000 });
  ok(await page.isVisible('#v-home .hm-orb'), 'accueil : orbe de la collection');
  ok(/0,00/.test(await page.textContent('.hm-val')), 'valeur à 0 sans carte');

  // Ajouter une carte (recherche, toucher)
  await page.click('[data-hm="add"]');
  await page.fill('.pick-sheet input[type=search]', 'elsa esprit hiver');
  await page.waitForSelector('.pick-sheet .card-thumb[data-card]');
  const id = +(await page.getAttribute('.pick-sheet .card-thumb[data-card]', 'data-card'));
  await page.click('.pick-sheet .card-thumb[data-card]'); await page.click('.pick-sheet .card-thumb[data-card]');
  ok(await page.evaluate(i => ownedOf(i), id) === 2, 'deux toucher = deux exemplaires');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });

  // Collection, carte en grand, foil
  await page.click('#nav [data-view="coll"]');
  await page.waitForSelector('.coll-grid .card-thumb');
  ok(/2 cartes/.test(await page.textContent('.coll-head')), 'collection : 2 cartes');
  await page.click('.coll-grid .card-thumb');
  await page.waitForSelector('.card-screen .cv-name');
  await page.click('.card-screen [data-own="1"] [data-d="1"]');
  ok(await page.evaluate(i => ownSplit(i).f, id) === 1, 'carte en grand : + foil');
  ok(/€/.test(await page.textContent('.cv-pxs')), 'prix en euros');
  await page.goBack();
  ok(await page.waitForSelector('.card-screen', { state: 'detached', timeout: 3000 }).then(() => true, () => false), 'Retour du téléphone ferme la carte');

  // Extension
  await page.click('.coll-head ~ .tabs [data-tab="sets"]');
  await page.click('.ms-list [data-set="1"]');
  await page.waitForSelector('.ms-screen .card-thumb.is-missing');
  ok(await page.locator('.ms-screen .card-thumb').count() > 200, 'extension 1 : toutes ses cartes');
  await page.click('.ms-screen [data-f="own"]');
  ok(await page.locator('.ms-screen .card-thumb').count() >= 1, 'filtre Possédées');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });

  // Échange : doublons au-delà de 1 exemplaire gardé, lien relu
  await page.click('#nav [data-view="trade"]');
  await page.click('[data-keep="1"]');
  ok(await page.locator('.trade-list .card-thumb').count() === 1, 'garder 1 : la carte en trop est à échanger');
  await page.click('[data-tab="share"]');
  await page.waitForSelector('.tr-qr svg');
  const link = await page.evaluate(() => tradeLink(myLists()));
  ok(link.startsWith(URL0 + '?p='), 'lien de partage : ' + link.length + ' caractères');
  await page.goto(link);
  await page.waitForSelector('.pub-screen .card-thumb');
  ok(await page.locator('.pub-screen .card-thumb').count() >= 1, 'page publique : la liste relue depuis le lien');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });

  // Decks : import d'une liste
  await page.click('#nav [data-view="decks"]');
  await page.waitForSelector('#v-decks .view-in *');
  const dn = await page.evaluate(async () => { const r = await dkParse('4 Elsa - Spirit of Winter\n4 Ariel - On Human Legs\n1 Pas - Une Carte'); return [r.cards.size, r.bad.length]; });
  ok(dn[0] === 2 && dn[1] === 1, 'decklist anglaise : 2 cartes reconnues, 1 ligne inconnue');

  // Compteur de lore, carte mystère
  await page.click('#nav [data-view="home"]');
  await page.click('[data-hm="lore"]');
  await page.waitForSelector('.lore-screen');
  ok(await page.isVisible('.lore-screen'), 'compteur de lore ouvert');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });
  await page.click('[data-hm="mystery"]');
  await page.waitForSelector('.mys-screen canvas', { timeout: 10000 });
  ok(true, 'carte mystère : image pixelisée');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });

  // Réglages : thème Parchemin
  await page.click('#btnSettings');
  await page.click('.settings-sheet [data-pref="theme"] [data-v="light"]');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'thème Parchemin');
  await page.keyboard.press('Escape'); await page.waitForSelector('#layer .ov', { state: 'detached' });
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'téléphone : aucun défilement horizontal');

  // Ordinateur
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = await page.evaluate(() => { const r = document.querySelector('#nav').getBoundingClientRect(); return [r.width, r.height]; });
  ok(nav[0] < 300 && nav[1] >= 900, 'ordinateur : navigation en colonne à gauche');
  ok(!(await page.isVisible('#bar')), 'ordinateur : en-tête du téléphone caché');
  ok(!errors.length, 'console sans erreur ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
