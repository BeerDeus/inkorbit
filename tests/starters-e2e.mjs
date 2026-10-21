// Decks de démarrage dans Chrome (starters.js) : Decks › « À monter », decks du plus récent au plus ancien, filtre d'encre, tri « plus faciles »,
// détail d'un deck (cartes possédées, manquantes), manquantes vers les recherches (Annuler), copie dans « Mes decks » (éditeur ouvert).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serve } from '../serve.mjs';

const PORT = 18980, URL0 = `http://127.0.0.1:${PORT}/`;
const st = JSON.parse(readFileSync(new URL('../public/data/starters.json', import.meta.url), 'utf8'));
const s1 = st.decks.find(d => d.id === 'S1-1'), owned = Object.keys(s1.cards).slice(0, 3);
const srv = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, headless: true });
const errors = [];
let n = 0; const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); n++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await ctx.addInitScript(o => { if (!localStorage.getItem('inkorbit:coll')) localStorage.setItem('inkorbit:coll', JSON.stringify(Object.fromEntries(o.map(id => [id, 1])))); }, owned);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0 + '?open=decks'); await page.waitForFunction(() => CARDS.ready);
  await page.click('[data-dk-tab="build"]');
  await page.waitForSelector('.st-card');
  const cards = await page.locator('.st-card').count();
  ok(cards === st.decks.length, `À monter : ${cards} decks de démarrage`);
  const firstSet = await page.evaluate(() => ST.data.decks.find(d => d.id === document.querySelector('[data-st-open]').dataset.stOpen).set);
  ok(+firstSet === Math.max(...st.decks.map(d => +d.set)), 'le plus récent en premier');
  await page.click('.st-tools [data-st-ink="5"]');
  ok(await page.evaluate(() => [...document.querySelectorAll('[data-st-open]')].every(b => ST.data.decks.find(d => d.id === b.dataset.stOpen).inks.includes(5))), 'filtre Acier');
  await page.click('.st-tools [data-st-ink=""]');
  await page.click('[data-st-sort="easy"]');
  ok(await page.getAttribute('[data-st-open]', 'data-st-open') === 'S1-1', 'plus faciles à monter : le deck dont j\'ai des cartes en tête');

  await page.click('[data-st-open="S1-1"]');
  await page.waitForSelector('.st-sheet .dk-line');
  const own = owned.length;      // une de chaque carte possédée
  ok(new RegExp(`${own}/60`).test(await page.textContent('.st-sheet')), `détail : ${own}/60 dans ta collection`);
  ok(await page.locator('.st-sheet .dk-line.is-short').count() > 0, 'manquantes grisées');
  await page.click('.st-sheet [data-st-wants]');
  const wants = await page.evaluate(() => Object.keys(COLL.wants).length);
  const expect = Object.entries(s1.cards).filter(([id, q]) => q > (owned.includes(id) ? 1 : 0)).length;
  ok(wants === expect, `manquantes vers les recherches (${wants} cartes différentes)`);
  ok(await page.isDisabled('.st-sheet [data-st-wants]'), 'bouton « Déjà dans mes recherches »');

  await page.click('.st-sheet [data-st-copy]');
  await page.waitForSelector('.screen');
  const d = await page.evaluate(() => load('decks', [])[0]);
  ok(d && Object.values(d.cards).reduce((s, x) => s + x, 0) === 60 && d.name === s1.name.fr, 'copié dans Mes decks (60 cartes, nom français), éditeur ouvert');
  ok(!errors.length, 'aucune erreur de page ' + JSON.stringify(errors));
  console.log(`${n} vérifications`);
} finally { await browser.close(); srv.close(); }
