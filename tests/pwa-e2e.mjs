// Appli installée (src/pwa.js, public/sw.js, manifeste, src/onboard.js) dans Chrome, sur une copie temporaire de public/ (port 18970) :
// service worker installé et en contrôle, page et données gardées, réouverture hors ligne (temps mesuré) et appli utilisable, bandeau « Hors ligne »,
// stockage mesuré (navigator.storage.estimate), nouvelle version → « Recharger » une seule fois (pas de boucle), manifeste complet (icônes,
// raccourcis, captures aux bonnes tailles), raccourci ?open=lore, partages reçus (lien d'échange, decklist), premier lancement une seule fois.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../serve.mjs';

const PORT = 18970, URL0 = `http://127.0.0.1:${PORT}/`;
const dir = mkdtempSync(join(tmpdir(), 'inkorbit-pwa-'));
cpSync(fileURLToPath(new URL('../public', import.meta.url)), dir, { recursive: true });
const srv = await serve(PORT, dir);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
const newPage = async ctx => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p; };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());      // aucun réseau extérieur (images, polices)
  const page = await newPage(ctx);
  await page.goto(URL0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller && CARDS.ready);
  ok(true, 'service worker installé, la page passe par lui');
  ok(!(await page.$('#splash')) || await page.evaluate(() => getComputedStyle(document.getElementById('splash')).display === 'none'), 'écran de lancement absent hors appli installée');
  const cached = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
  for (const f of ['/', '/data/cards.json', '/data/cards-fr.json', '/data/prices.json', '/manifest.webmanifest']) ok(cached.includes(f), 'gardé pour le hors ligne : ' + f);

  // Manifeste : chaque image existe et a la taille annoncée
  const man = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
  ok(man.id && man.start_url && man.scope && man.display === 'standalone' && man.share_target && man.launch_handler, 'manifeste : id, portée, affichage, partage, lancement');
  ok(man.shortcuts.length >= 4 && man.shortcuts.every(s => s.icons && s.icons[0].src.startsWith('icons/sc-')), 'manifeste : 4 raccourcis avec leur icône');
  ok(man.screenshots.some(s => s.form_factor === 'narrow') && man.screenshots.some(s => s.form_factor === 'wide'), 'manifeste : captures téléphone et ordinateur');
  const imgs = [...man.icons, ...man.shortcuts.flatMap(s => s.icons), ...man.screenshots].filter(i => i.type === 'image/png');
  const sizes = await page.evaluate(async list => Promise.all(list.map(async src => { const b = await (await fetch(src)).blob(); const bm = await createImageBitmap(b); return `${bm.width}x${bm.height}`; })), imgs.map(i => i.src));
  ok(imgs.every((im, k) => im.sizes === sizes[k]), 'manifeste : chaque image a la taille annoncée ' + JSON.stringify(sizes));

  // Hors ligne
  await page.evaluate(() => { collAdd(COLL.map, '42', 3); collSave(); });
  await ctx.setOffline(true);
  const t0 = Date.now();
  await page.reload(); await page.waitForFunction(() => CARDS.ready && CARDS.list.length > 3000);
  const tOff = Date.now() - t0;
  ok(true, `rouverte hors ligne, catalogue prêt en ${tOff} ms`);
  ok(await page.isVisible('#offline'), 'bandeau « Hors ligne »');
  await page.click('#nav [data-view="coll"]'); await page.waitForSelector('.coll-grid .card-thumb');
  ok(/3 cartes/.test(await page.textContent('.coll-head')), 'hors ligne : la collection s\'affiche');
  await page.evaluate(() => openLore()); await page.waitForSelector('.lore-screen');
  ok(true, 'hors ligne : compteur de lore'); await page.evaluate(() => closeTop());
  const est = await page.evaluate(async () => { const e = await navigator.storage.estimate(); return Math.round(e.usage / 1024 / 1024 * 10) / 10; });
  console.log(`  stockage du site : ${est} Mo`);
  await ctx.setOffline(false);
  ok(await page.waitForFunction(() => document.getElementById('offline').hidden).then(() => true), 'réseau revenu : bandeau retiré');

  // Nouvelle version : la page gardée est l'ancienne, le service worker apprend la nouvelle → toast, une fois
  const html = readFileSync(join(dir, 'index.html'), 'utf8'), old = /const IO_BUILD = '([\w-]+)'/.exec(html)[1];
  writeFileSync(join(dir, 'index.html'), html.replace(`const IO_BUILD = '${old}'`, "const IO_BUILD = 'ffff0000'"));
  await page.reload();
  ok(await page.evaluate(() => IO_BUILD) === old, 'ouverture immédiate sur la copie gardée');
  await page.waitForSelector('.toast:has-text("Nouvelle version")', { timeout: 15000 });
  ok(true, 'nouvelle version → toast « Recharger »');
  await page.click('.toast button');
  await page.waitForFunction(() => typeof IO_BUILD !== 'undefined' && IO_BUILD === 'ffff0000', null, { timeout: 15000 });
  await page.waitForTimeout(2500);
  ok(!(await page.$('.toast:has-text("Nouvelle version")')), 'après Recharger : nouvelle version, plus de toast (pas de boucle)');

  // Raccourci et partages reçus
  await page.goto(URL0 + '?open=lore'); await page.waitForSelector('.lore-screen');
  ok(!/open=/.test(page.url()), 'raccourci ?open=lore : compteur ouvert, adresse nettoyée');
  const link = await page.evaluate(() => tradeLink({ have: [{ id: 42, n: 1, foil: 0 }], want: [] }));
  await page.goto(URL0 + '?url=' + encodeURIComponent(link)); await page.waitForSelector('.pub-screen');
  ok(true, 'lien d\'échange partagé vers l\'appli → la liste');
  await page.goto(URL0 + '?text=' + encodeURIComponent('4 Elsa - Snow Queen\n4 Ariel - On Human Legs\n2 Stitch - Rock Star'));
  await page.waitForFunction(() => /Elsa/.test((document.getElementById('dkImpText') || {}).value || ''));
  ok(true, 'decklist partagée vers l\'appli → import de deck prérempli');

  // Premier lancement : une seule fois
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const p2 = await newPage(ctx2);
  await p2.goto(URL0 + '?onboarding'); await p2.waitForSelector('.ob .ob-s.on');
  ok(/Bienvenue/.test(await p2.textContent('.ob .ob-s.on')) && /non officielle/.test(await p2.textContent('.ob')), 'premier lancement : bienvenue et mention de fan');
  await p2.click('.ob .ob-s.on [data-ob="next"]'); await p2.click('.ob .ob-s.on [data-ob="next"]');
  await p2.click('.ob .ob-s.on [data-ob="done"]'); await p2.waitForSelector('.ob', { state: 'detached' });
  await p2.reload(); await p2.waitForFunction(() => CARDS.ready); await p2.waitForTimeout(800);
  ok(!(await p2.$('.ob')), 'premier lancement : plus jamais ensuite');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); rmSync(dir, { recursive: true, force: true }); }
